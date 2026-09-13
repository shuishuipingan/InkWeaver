# InkWeaver 1.2.0 全路线功能与验收图

> 目标版本：`1.2.0`。本文件是 1.1.0 正式 Release 之后的开发与冻结依据；历史 1.1.0 功能图和 Release 收据保留不改写。

## 1. 版本目标

1.2.0 的核心不是再增加一个“生成按钮”，而是把长篇小说当作持续演进的事实系统：作者任务先被明确记录，模型只能读取已授权且仍有效的材料；候选稿、候选人物、候选交接和审稿建议都不能越过人工确认边界；定稿才会成为下一章的权威历史。每一个异步边界都要能回答“谁在什么项目会话中、基于哪个版本、执行了什么、结果是否落盘”。

本轮发布约束：

- 桌面应用和 DSH 插件同步为 `1.2.0`，最终冻结必须使用同一源码 commit。
- Windows x64、macOS arm64、macOS x64 都必须有相应安装包、校验文件和应用内更新元数据。
- DSH 插件使用仓库 `plugins/inkweaver-dsh`、包名 `@shuishuipingan/inkweaver-dsh`；`@ethanyoq/dsh-ai-novel-writer` 仅为迁移历史名，`@linxin666/dsh-web-all` 仅为外部宿主 companion，二者都不是本项目交付物。
- npm 不发布；插件通过 GitHub Release tarball 和本地 `dsh plugin add` 安装。
- 外部文学质量评阅不作为本轮工程冻结门槛；工程测试不宣称文学质量保证。

## 2. 功能地图

| 编号 | 作者可见能力 | 权威事实/实现位置 | 必须证明的验收结果 |
| --- | --- | --- | --- |
| 1 | 独立 Writing Skill，按规划/正文/审稿/润色使用 | `src/services/agent/skill-registry.ts`、`electron/controllers/app-data-controller.ts`、`AgentHeader.tsx` | 合法 Skill 可安装、列出、按 stage 筛选、卸载；非法 frontmatter、路径穿越、符号链接和超大文件被拒绝；项目 Skill 失效会话不能执行。 |
| 2 | 主线/支线故事线进度和证据跳转 | `src/shared/narrative-thread.ts`、`electron/repositories/narrative-thread-repository.ts`、`NarrativeThreadEditor.tsx` | 主/支线返回进度、下一目标、事件数和 dormant/overdue 语义；证据行带 draft ID/content hash；切换项目后跳转被拒绝。 |
| 3 | 规划资料导入与确认 | `src/shared/planning-material.ts`、`PlanningMaterialRepository`、`ImportNovelDialog.tsx` | Markdown/TXT 预览、SHA-256 幂等、candidate/confirmed/rejected 状态可回读；只有 confirmed 资料进入蓝图和写稿上下文。 |
| 4 | 角色表只接收明确确认的新增人物 | `character-extraction-*`、`CharacterRosterRepository`、`character_state_history` | 模型新人物只进候选队列；未确认名称不能进入 roster；作者确认的蓝图/候选才可提交，状态变化追加来源与证据。 |
| 5 | 中文长篇链：蓝图→草稿→审稿→修订→定稿 | `batch-chapter-workflow.ts`、`chapter-workflow.ts`、各 command | 每阶段冻结 project session、写作语言、UI locale、model lease 和来源指纹；取消、失败、恢复和成功都有工作流记录与日志。 |
| 6 | Windows/macOS 应用内更新 | `update-runtime.ts`、`update-service.ts`、`electron-updater-adapter.ts`、`electron-builder.json5` | packaged Windows/macOS 可启用，开发环境关闭；检查/下载/安装单飞，已下载版本不会被旧响应清空；macOS 两架构元数据和目标存在。 |
| 7 | 角色动态状态溯源 | `character-roster.ts`、`character_state_history`、`CharacterRosterRepository` | `author`、`model`、`legacy-unknown` 可区分；模型状态必须引用仍存在且 hash 相同的 finalized draft 与证据区间，过期状态不会注入后续上下文。 |
| 8 | 章节材料四层分离 | `context-receipt.ts`、`generate-draft.command.ts` | author-task、future-plan、finalized-history、unfinished-candidate、adjacent-prose 分层；相邻正文保留 source span；每项有 included/omitted reason。 |
| 9 | 连续草稿使用实际候选版本 | `batch-chapter-workflow.ts`、`generate-draft.command.ts`、draft repository | 下一章读取实际保存候选的 ID/version/full content；候选不进入 finalized history，也不退化成只有上一章尾部；关闭/重启后仍可恢复。 |
| 10 | 预算和来源缺口透明 | `ContextReceipt`、generation receipts、结构化 batch executor | mandatory 作者任务缺失时失败或明确等待；可选资料缺失、预算不足、解析失败均生成 typed coverage gap，不静默丢弃。 |
| 11 | 审稿逐项映射蓝图事件 | `review-event-coverage.ts`、`review-chapter.command.ts`、`ReviewReport.tsx` | 每个关键事件显示 completed/prepared/deferred/not-found/needs-verification、证据和章节；报告格式无效不会写入有效 review。 |
| 12 | 待核实与作者决策 | `review-chapter.command.ts`、人工确认快照、修订 command | 证据不足统一为 needs-verification；模型不能自动触发修订；修订只接受作者明确确认的目标，旧来源 hash 不匹配时拒绝。 |

## 3. 回归地图

| 编号 | 风险 | 保护措施 | 验收证据 |
| --- | --- | --- | --- |
| 0 | 多草稿保存错页/关闭后写入 | `EditorTab.instanceId`、save settle fence、关闭 token | 两标签延迟保存、关闭重开和旧 callback 测试；旧实例永不覆盖新实例。 |
| 1 | 旧蓝图/草稿/审稿/修订响应覆盖新结果 | project session、request/run identity、CAS source hash、reducer fence | 延迟响应顺序测试；旧结果变为 rejected 事件，不发生项目写入。 |
| 2 | 恢复使用过期或错误正文 | checkpoint draftContentHash、恢复前重新读权威来源 | 原文变化、draft ID 不匹配、lease 过期都在恢复前失败。 |
| 3 | 导出混入非定稿/过期/不匹配章节 | finalized authority 枚举、manifest、回读 hash、项目会话校验 | 缺章、重复、越界、标题漂移、正文 hash 不一致导出失败。 |
| 4 | Windows 辅助进程正常退出被判失败 | 进程身份、父子树、退出码/信号分类 | 正常 helper exit 测试通过，产品进程异常仍为 fatal。 |
| 5 | 更新排队覆盖新版本/重复请求 | `checkQueue` 单飞、downloadedVersion guard、版本单调比较 | 自动+手动并发只访问一次；旧版本响应不能清掉新 available/downloaded。 |
| 6 | split Markdown 复用旧目录 | 时间戳+随机后缀的唯一 split 目录、manifest 路径绑定 | 连续两次导出互不读取残留文件，目标目录回读一致。 |
| 7 | 完成通知截断标题 | 保留完整 `definition.title` | 含空格/中文空格的工作流标题完整出现在通知。 |
| 8 | 大纲范围批处理/中断恢复覆盖确认章节 | contiguous range、replace-range、authoritative next cursor、恢复 metadata | 指定范围有序分批；恢复从未完成范围继续；已有蓝图不被默认重生成。 |
| 9 | 规划/审稿结构化输出损坏 | 同一 GenerationSession 预算内缩小 batch；审稿只重建一次 | malformed/truncated 多项输出按更小批次重试；第二次 review 仍无效则不保存。 |

## 4. 全局日志地图

### 4.1 事件链

```text
Renderer console/error/unhandledrejection
        │  batched one-way IPC + retry queue
        ▼
Main runtime logger ── IPC handle start/end/failure ── workflow/model/update/MCP adapters
        │
        ▼
append-only app-YYYY-MM-DD.NNN.jsonl
        ├─ per-segment manifest (bytes/eventCount/firstSequence/lastSequence/SHA-256)
        ├─ emergency-spool.jsonl (primary disk failure)
        └─ bundle-manifest.json (export status/privacy/gap state)
```

### 4.2 事件合同

每个 `RuntimeLogEvent` 至少包含 schemaVersion=1、eventId、UTC occurredAt、process/PID、进程序号、sessionId、level、source、event、message；可选携带 serverSequence、requestId、correlationId、runId、projectId、projectSessionId、chapterNumber、operation、outcome、durationMs、details、error 和 redaction。主进程分配单调 serverSequence，不能依赖时间排序。

默认日志是元数据模式：长 message 限制为 2048 字符；details 深度、字节数和字符串有上限；绝对路径、URL 基本认证、Bearer/API key/token 等会被替换并在 `redaction.fields` 中标记。模型 prompt、response 和完整正文不进入默认日志；若未来增加显式诊断附件，必须有单独授权、保留期和脱敏收据。

### 4.3 覆盖边界

- 主进程入口最早安装五级 console capture，并监听 `uncaughtException`、`unhandledRejection`、`warning`。
- Electron 窗口记录创建/关闭、渲染进程退出、unresponsive/responsive 和退出 flush。
- `ipcMain.handle` 注册统一包装调用开始、成功/失败、耗时和安全参数摘要；日志传输自身跳过 wrapper 防止递归。
- LLM 流式调用只记录请求/完成/失败、finish reason、字符数、usage 和 cache 元数据，不逐 chunk 复制正文。
- MCP 子进程记录 stdout/stderr 字节/行数、受限 stderr preview、exit/close/error；JSON-RPC 响应正文不复制进日志。
- Renderer 的 `console.log/info/warn/error/debug`、全局错误和关闭前 flush 通过确认队列送主进程；失败包原样保留并生成 `log.transport.failed`。
- `scripts/runtime-log-coverage.mjs` 扫描 `src/`、`electron/`、`scripts/` 的运行边界；只有机器可读 smoke/qualification 协议可以带理由 allowlist，`uncovered` 必须为空。

## 5. 验收顺序

1. 共享合同、writer、capture 和 UI 日志测试；检查 redaction、轮转、manifest、spool、重启去重、manifest 失败降级和 bundle 导出。
2. Skill、规划资料、角色溯源、叙事线、上下文/审稿聚焦测试与浏览器旅程。
3. 并发/恢复/导出/更新/Windows helper 回归。
4. `pnpm run typecheck`、`pnpm run check:i18n`、`pnpm run check:runtime-log-coverage`。
5. `pnpm test`、`pnpm test:browser`、插件 typecheck/build/test/verify-built。
6. DSH 官方 Harness 固定 commit 的隔离 profile qualification；不把外部 web companion 当作本项目包。
7. 版本同步、三平台构建/签名限制说明、GitHub Release 资产与 `dsh-plugin` topic 回读。

任何一步没有可回读命令、输出计数、源码 SHA 或资产 hash，都只能标记为“待验收”，不能写成冻结完成。

## 6. 发布与回滚

冻结前将桌面 `package.json`、插件 `package.json`、Release profile 和资产命名同步到 `1.2.0`，生成同一 SHA 的 Windows x64、macOS arm64、macOS x64 包与插件 tarball。GitHub Release 必须为非 draft、非 prerelease、Latest，并包含七项桌面资产和插件 tarball；npm 不执行发布。若任何平台资产、签名/公证披露、DSH mount 或 topic 回读失败，保持开发线可用但不得创建正式冻结声明。

回滚只允许指向已验证的旧 tag/Release；不得用旧候选的日志、manifest 或插件 tarball 冒充 1.2.0 资产。项目数据升级前先创建快照，日志 bundle 作为诊断证据单独保存。
