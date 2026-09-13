# InkWeaver 全局日志功能审计（1.2.0）

审计日期：2026-09-13（Asia/Hong_Kong）

审计源码：`2bcff9b9eca7c5eb142aa5293acad5aac78c0728`

结论：通过。应用内日志已统一进入结构化、可关联、可回读的 append-only 事件链；无法持久化时不会静默丢弃，而会保留 pending/emergency-spool/degraded 状态。

## 审计范围与方法

审计覆盖 Electron 主进程、Renderer、IPC handle、工作流/任务状态、LLM 调用、更新器、MCP 子进程、数据库/文件系统、导入/导出、窗口与崩溃边界，以及日志查询和诊断 bundle。静态扫描命令为：

```text
pnpm run check:runtime-log-coverage
```

最终扫描了 `src`、`electron`、`scripts` 下 459 个运行文件，识别 85 个带理由的机器协议输出，`uncovered=[]`，退出码 0。应用 console 的统一入口由 `electron/services/runtime-logger.ts`、`electron/services/runtime-log-capture.ts`、`src/services/runtime-log.ts` 和 `src/main.tsx` 覆盖；发布 smoke/qualification 的 stdout/stderr 被明确隔离为协议输出，不冒充应用日志。

## 覆盖矩阵

| 边界 | 记录内容 | 完整性保证 |
| --- | --- | --- |
| Main console | `log/info/warn/error/debug`、EPIPE、未捕获异常、未处理拒绝、Node warning | 原生 console 先执行，结构化事件无条件写入；EPIPE 不递归崩溃 |
| Renderer console | 五级 console、`window.error`、`unhandledrejection`、关闭前 flush | 批量队列无固定丢弃上限；IPC 失败保留原事件并指数退避重试，关闭时走单向批次 |
| IPC | handle 开始/成功/失败、耗时、request/correlation、项目会话、参数安全摘要 | 所有 controller 在注册前由 `installIPCGlobalTracing` 包装；日志传输通道显式跳过，避免递归 |
| Workflow/UI | 工作流阶段、取消、失败、恢复、作者决策、覆盖缺口、实时 UI 日志 | 使用 run/project session 和来源指纹；UI 是投影，不是事实源 |
| LLM | 请求/完成/失败、模型租约、字符数、finish reason、usage/cache、预算 | 不逐 chunk 复制 prompt/response/正文；usage 缺失保持 unknown |
| MCP | 子进程 stdout/stderr 字节与行数、受限 stderr preview、PID、exit/close/error | JSON-RPC 正文不写入日志；协议输出只保留元数据和安全预览 |
| 文件/数据库/导入导出 | 读写、迁移、快照、导出回读、来源 hash、权限/路径失败 | IPC 失败与工作流失败同时留下 error 事件；路径和凭据由共享规则脱敏 |
| 更新器 | 检查、排队、下载、安装、版本单调性、失败降级 | 单飞队列和已下载版本保护；开发环境禁用，打包环境按平台启用 |
| Window/Crash | 创建、关闭、render-process-gone、unresponsive/responsive、退出 flush | 主进程最早安装 capture；正常退出等待 writer flush |
| 查询/导出 | 分页、级别/source/process/correlation/run 过滤、bundle 状态 | persisted、pending、spool 和 memory mirror 去重；bundle 含 manifest 和 complete 状态 |

## 事件合同

`src/shared/runtime-log.ts` 定义 `schemaVersion=1` 的 `RuntimeLogEvent`。必填字段为 `eventId`、UTC `occurredAt`、进程序号 `sequence`、`sessionId`、`process`、`level`、`source`、`event`、`message`；可选字段提供 PID、serverSequence、request/correlation/run/project/session/chapter、operation、outcome、duration、结构化 details、error 和 redaction。

主进程 writer 为所有跨进程事件分配单调 `serverSequence`，并在启动时扫描历史 segment 恢复 eventId 索引。segment 使用 `app-YYYY-MM-DD.NNN.jsonl`，旁边保存 bytes、eventCount、first/last sequence 和 SHA-256 manifest；达到大小上限时编号轮转，不覆盖同日旧文件。

## 失败与恢复审计

- 主磁盘 append 失败：事件进入内存 pending 队列，同时尝试写 `emergency-spool.jsonl`；两者都失败时状态为 `degraded`，查询仍显示事件且 `complete=false`。
- IPC 传输失败：Renderer 将整个未确认批次放回队首，记录 `log.transport.failed`，按退避时间重试；关闭时再次发送未确认批次。
- 重启补传：writer 读取 segment 和 spool 的 eventId，回放后清空已成功补传的 spool，避免物理重复。
- manifest 失败：已追加的 JSONL 不会被重写或重复追加，但状态标为 `degraded`，保留可审计的完整性缺口。
- 查询/导出失败：返回明确错误和状态，不把空列表或局部文件伪装成完整历史。

## 隐私与可诊断性边界

默认日志是诊断元数据，不是小说正文备份。消息上限 2,048 字符，details 有深度、字节和字符串上限；绝对路径、URL 基本认证、Bearer、API key、token、密码和常见 secret key 会被替换，并在 `redaction.fields` 中留下脱敏线索。完整 prompt、模型 response、MCP JSON-RPC 正文和完整章节正文不进入默认日志。若未来增加显式诊断附件，必须同时具备单独授权、附件 hash、过期时间、清理收据和 UI 可见状态。

## 历史缺口与本轮修复

本轮前审计识别的固定 200 条 Renderer 队列、debug 被过滤、`.old` 覆盖式轮转、只读内存日志面板、无 session/correlation、MCP 无统一事件和脱敏规则分散等问题均已修复。对应 writer、capture、renderer queue、runtime event contract、日志面板和覆盖扫描测试全部通过；根测试为 309 files / 2210 passed / 8 skipped，浏览器测试为 39 files / 228 passed。

## 仍然存在的明确限制与后续建议

这些是边界条件，不应被写成“日志永不丢失”的绝对承诺：

1. 操作系统强制终止、断电或内核崩溃发生在最后一次 flush 之前时，任何用户态程序都无法制造第三份介质；下次启动会显示 pending/degraded 状态，而不是伪造完整。
2. 默认保留最近 30 个 segment，旧文件会按 retention 策略清理；需要长期审计时应由用户定期导出 bundle，并保存其 manifest/hash。
3. 默认不保留正文和模型原文，这是隐私和磁盘安全取舍；需要复现内容时应使用明确授权、限时、加密的诊断附件，而不是放宽默认日志。
4. 当前事件使用本地 UTC 时间和进程内单调时间；跨设备集中分析时应增加时钟偏差、安装实例 ID 和服务端接收时间字段。
5. 后续可以增加 OpenTelemetry/NDJSON 兼容导出、按项目的可选加密、retention 变更审计事件、日志完整性签名链和脱敏规则版本号，但必须保持现有 metadata-only 默认边界。

## 结论

当前 1.2.0 已覆盖应用运行时的主要日志边界，所有可观测失败都有持久化、重试或明确降级路径；静态覆盖无未解释缺口，日志测试和三平台发布资格均已通过。上述限制和后续建议已公开记录，不能用“全部日志都会记录”掩盖强制终止、保留策略或隐私选择等真实边界。
