# 全局日志与长篇写作流程设计

日期：2026-09-13  
范围：InkWeaver 当前 1.1.0 代码线的日志基础设施、小说创作流程和并发/恢复/更新回归。

## 目标

把运行日志从“开发控制台输出 + 内存中的最近 500 条工作流消息”升级为一条持久、结构化、可检索、可诊断且不会静默丢失事件的运行证据链；同时完成用户列出的 1–12 项创作能力和 0–9 项回归检查。

本设计不把日志变成正文备份。默认只保留可审计元数据、字数、哈希、来源和错误链；模型 prompt/response 只有用户显式开启诊断模式后才可保存，且仍需脱敏、限期和可见的保留状态。

## 当前审计结论

当前代码已经有 `electron/services/runtime-logger.ts`、`src/services/runtime-log.ts`、`runtime:log` IPC 和工作流日志，但存在以下可复现的结构性缺口：

1. Renderer 队列上限为 200，满时丢弃最旧事件；IPC 上报失败只降级到控制台，无法保证日志落盘。
2. 主进程 `info` 级别以下的 `debug` 不写文件；同一 source/message 60 秒内会被限流，进程退出前可能没有补记摘要。
3. 日志滚动只维护当天文件和一个 `.old`，同日再次超限会覆盖旧归档；清理逻辑只统计 `.log`，不统计 `.old`。
4. 日志面板只读 `workflow-store.globalLogs` 的内存切片，重启后不可查询，也没有进程、run、项目会话、请求 ID 或日志完整性状态。
5. Renderer 只包装 `console.warn/error`，大量 `console.log/info/debug` 仍只进入 DevTools；主进程还有裸 `console.*` 和直接 `process.stdout/stderr.write`。
6. MCP 子进程、模型调用、更新器、文件/数据库边界和启动阶段的若干错误没有统一事件字段，调用方只能看到局部字符串。
7. 现有 `safeConsole` 与 `runtimeLogger` 有两套镜像路径，容易重复记录或在懒加载/测试环境中丢记录。

静态盘点基线：当前 `src`、`electron`、`scripts` 和 DSH 插件源码中有 51 个文件包含裸 `console.*`；工作流日志结构没有持久化 schema，也没有全局日志缺口检测收据。

## 日志事件合同

新增共享类型 `RuntimeLogEvent`，所有进程只发送 JSON-safe 字段：

```ts
type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type RuntimeProcess = 'main' | 'renderer' | 'worker' | 'mcp' | 'script'

interface RuntimeLogEvent {
  schemaVersion: 1
  eventId: string
  occurredAt: string       // UTC ISO-8601
  monotonicMs?: number     // 当前进程的相对时间
  sequence: number         // 进程序号；主进程接收后追加 serverSequence
  serverSequence?: number
  sessionId: string
  process: RuntimeProcess
  pid?: number
  level: RuntimeLogLevel
  source: string
  event: string
  message: string
  requestId?: string
  correlationId?: string
  runId?: string
  projectId?: string
  projectSessionId?: string
  chapterNumber?: number
  operation?: string
  outcome?: 'started' | 'succeeded' | 'failed' | 'cancelled' | 'rejected' | 'skipped'
  durationMs?: number
  details?: Record<string, unknown>
  error?: { name?: string; message: string; code?: string; stack?: string; cause?: string }
  redaction?: { applied: boolean; fields?: string[]; truncated?: boolean }
}
```

正文、提示词、模型返回文本、API Key、Token、密码和完整路径不是默认日志字段。若诊断模式打开，完整内容必须放在单独的受限诊断附件中，事件只引用附件哈希和过期时间。

## 采集与持久化

### 主进程

- `runtime-logger` 在任何控制器注册和其它业务 import 前初始化；保存原始 `console` 方法后统一包装 `log/info/warn/error/debug`，避免 `safeConsole` 和 `runtimeLogger` 重复写入。
- 捕获 `uncaughtException`、`unhandledRejection`、`warning`、Electron `render-process-gone/unresponsive/responsive`、窗口生命周期、更新器事件和 MCP 子进程 stdout/stderr。
- IPC wrapper 对每个 `handle` 记录开始、参数安全摘要、完成/失败、耗时和结果类别；流式 chunk 不逐字写入，但记录 chunk 数、字节数、首包/尾包和失败原因。
- 进程 stdout/stderr 的业务输出必须通过安全镜像入口；释放资格脚本的机器可读输出保留原协议，但同时写结构化事件。

### Renderer

- `src/main.tsx` 在 React 挂载前包装五个 console 方法和全局 error/unhandledrejection；每条消息通过单向批量通道发送，不绕过日志入口。
- Renderer 使用磁盘持久化前的“确认队列”：队列不丢弃事件；上报失败时保留未确认事件并重试，窗口关闭前执行同步/Beacon 式 flush。若宿主不可用，记录本地 emergency spool，并在恢复后补传。
- 测试环境通过注入的 logger sink 隔离，不通过生产代码的 `isTestEnv` 静默关闭日志。

### 文件格式和完整性

- 按 UTC 日期和大小滚动：`app-YYYY-MM-DD.NNN.jsonl`，归档不覆盖；每个 segment 带首尾 sequence、事件数、字节数和 SHA-256 sidecar。
- 保留策略按“最近 N 个 segment + 总字节上限”执行，`.old` 与当前文件统一计数；删除前写 `retention.pruned` 事件。
- 追加失败写入 emergency spool，并生成 `log.persistence.failed`；磁盘恢复后补偿上传，绝不把失败吞掉。
- 事件本身包含 `sequenceGap`、`queueDepth`、`retryCount` 和 `persistenceState`，日志面板能显示“完整/有待补传/发生不可恢复缺口”。

## 日志查询和诊断 UI

新增主进程只读 IPC：分页读取、计数、过滤、导出脱敏诊断包、读取持久化状态。过滤字段包括级别、时间范围、进程、source、event、runId、projectSessionId 和 correlationId。

日志面板保留工作流实时摘要，但数据源改为持久化分页游标；“清空”只清当前视图，不删除证据。删除/清理日志必须是单独的、明确确认的保留策略操作，并记录审计事件。导出包包括事件 JSONL、segment manifest、环境摘要、版本和日志缺口报告，不包括凭据和默认正文。

## 创作功能设计

1. Skill 安装：扩展 SKILL frontmatter 的 `stage: planning|drafting|review|polish`；增加用户/项目 Skill 的安全安装、校验、卸载 IPC 和 UI，按当前工作阶段过滤并记录安装/加载/拒绝原因。
2. 故事线视图：叙事线返回 planned/confirmed/overdue/dormant/next-target 进度，事件证据提供章节号、定稿 ID、内容哈希和“打开依据”动作；跳转必须重新验证当前项目会话。
3. 规划资料：增加项目内 planning-material 资产和导入收据；文件选择、哈希、预览、去重、冲突和来源章节全部可回读，蓝图/写作上下文只读取已确认资料。
4. 角色表：蓝图角色同步只有在作者明确确认后才能写入 roster；动态状态保存 `author|model|legacy-unknown` provenance、sourceFinalId、sourceContentHash 和 evidence range。
5. 中文长篇链：蓝图→候选草稿→审稿→修订→定稿使用同一项目会话、写作语言、模型 lease 和来源指纹；每一阶段的成功/失败/取消/恢复都进入工作流和运行日志。
6. 更新器：Windows 使用 NSIS/update metadata，macOS 同时提供 arm64/x64 的 `latest-mac.yml` 和可更新目标；平台判断、版本单调性、下载、排队、安装、回退都走同一 UpdateService 状态机。
7. 角色动态状态：模型提炼必须引用对应定稿的 sourceFinalId/contentHash/evidence；旧项目无法追溯的状态标 `legacy-unknown`，不得当作确定事实注入上下文。
8. 章节材料：上下文构建器输出作者任务、未来计划、定稿历史、候选稿四个有序层，并记录相邻段落的 source span、纳入/省略原因和覆盖缺口。
9. 连续草稿：批次上下文使用本次实际保存的 candidate draft ID/version/content snapshot；候选稿永不写入 finalized history，也不只截取上一章结尾。
10. 覆盖缺口：预算不足、可选来源缺失和不可解析资料输出 typed coverage gap；作者任务/硬性要求列为 mandatory，缺失时工作流失败或明确等待，不静默降级。
11. 审稿事件：逐项读取蓝图关键事件，输出 completed/prepared/deferred/not-found 状态、定稿证据和章节范围。
12. 待核实：证据不足统一为 `needs-verification`；修订入口只接受作者明确勾选的目标，不自动把模型判断变成修稿命令。

## 回归修复策略

- 多草稿保存：tabId + projectSessionId + draftId + editSequence 组成保存键；debounce、AbortController 和关闭 token 共同阻止旧页面写入。
- 旧请求：所有异步结果在 reducer、IPC handler 和 repository 写入前检查 requestId、sourceRevision、projectSessionId；不匹配只生成 rejected 事件。
- 恢复：checkpoint 保存完整来源指纹、阶段、候选稿 ID/version 和 lease；恢复前重新读取权威来源并 CAS 校验。
- 导出：只枚举 finalized authority，导出前再次验证 contentHash、章节标题/编号和有效期；split export 使用全新临时目录和原子 rename。
- Windows 进程：按进程身份、父子树、退出分类和目标进程白名单判断；辅助进程正常退出不能升级为产品失败。
- 更新排队：单飞检查 + generation token + 单调版本比较；已下载/已确认版本不能被旧队列结果清空，下载中不重复访问 provider。
- 工作流标题：保留完整 `definition.title`，所有通知和日志使用不截断字符串。
- 大纲/规划：范围批次 checkpoint 保存已确认前缀；格式损坏时同一 generation session 内递归拆小，耗尽预算后返回失败收据。
- 审稿：同一预算内最多一次结构化重建；重建仍无效则标记失败，不保存为有效 review，也不触发修订。

## 验收门槛

- 日志：主进程、Renderer、IPC、工作流、模型、更新器、MCP、导入导出和崩溃各有事件契约测试；队列、磁盘失败、重启补传、rotation、redaction 和查询导出有集成测试。
- 功能：每一项 1–12 至少有一个失败测试、一个成功测试和一条浏览器/端到端证据（适用时）。
- 回归：每一项 0–9 都有原始复现测试，且测试能证明旧行为确实失败过，再证明修复后的行为通过。
- 全量：`pnpm typecheck`、`pnpm test`、`pnpm test:browser`、Electron 主进程/Renderer 测试、Windows/macOS 更新合同和 DSH 插件测试全部通过；日志完整性报告没有未解释缺口。
