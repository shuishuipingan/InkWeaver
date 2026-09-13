# InkWeaver 1.2.0 全局日志验收收据

状态：已冻结并发布。日志边界证据、最终 SHA 根测试、三平台安装包、GitHub Release 和版本 tag 已完成回读；发布源码 SHA 为 `2bcff9b9eca7c5eb142aa5293acad5aac78c0728`。

## 目标和隐私边界

目标是让主进程、Renderer、IPC、工作流、模型、更新器、MCP 子进程、导入/导出和崩溃路径都进入同一条 append-only 事件链，任何失败都必须表现为可查询的 pending、emergency-spool 或 degraded 状态，不能只在 DevTools 中出现后消失。

默认日志不是正文备份。事件保存审计元数据、来源、长度、hash、序号、耗时、结果和错误类型；message 上限 2048 字符，details 有深度/字节上限；绝对路径、URL 基本认证、Bearer、API key/token 和常见 key 前缀都会脱敏。LLM prompt/response、MCP JSON-RPC 响应和完整正文不进入默认日志。若未来提供显式诊断附件，必须另设授权、保留期和清理收据。

## 事件合同

`src/shared/runtime-log.ts` 定义 schemaVersion=1 的 `RuntimeLogEvent`：

- 必填：`eventId`、UTC `occurredAt`、进程序号 `sequence`、`sessionId`、`process`、`level`、`source`、`event`、`message`。
- 过程关联：`serverSequence`、`pid`、`requestId`、`correlationId`、`runId`、`projectId`、`projectSessionId`、`chapterNumber`。
- 结果信息：`operation`、`outcome`、`durationMs`、结构化 `details`、结构化 `error`、`redaction`。
- 进程值：`main`、`renderer`、`worker`、`mcp`、`script`；级别：`debug`、`info`、`warn`、`error`、`fatal`。

主进程 writer 为事件分配单调 `serverSequence`，启动时扫描历史段并恢复 eventId 索引，重启回放不会产生物理重复。manifest 记录 `bytes`、`eventCount`、`firstSequence`、`lastSequence`、全段 SHA-256 和当前最大 serverSequence。

## 已验证边界

| 边界 | 当前实现 | 验收重点 |
| --- | --- | --- |
| Main console/异常 | `electron/services/runtime-log-capture.ts`、`runtime-logger.ts`、`electron/main.ts` | 五级 console、uncaughtException、unhandledRejection、warning、窗口/渲染进程生命周期、before-quit flush。 |
| Renderer console/关闭 | `src/services/runtime-log.ts`、`src/main.tsx` | 无固定 200 上限；批量 IPC、重试、失败 gap event、beforeunload 单向 flush；短消息保留、长消息摘要。 |
| IPC | `traceIPC` + `src/services/ipc-client.ts` | handle 起止/失败、requestId/correlationId、耗时；runtime transport 跳过追踪避免递归。 |
| Workflow/UI | `workflow-store.ts` | 全局 UI log 同步写入 runtime 事件，返回 eventId 供面板去重；run/project session 关联。 |
| LLM | `llm-controller.ts`、generation harness | 请求数/字符数/finish reason/usage/cache 统计，不逐 chunk 保存正文。 |
| MCP child | `installChildProcessCapture` + `mcp-manager.ts` | stdout/stderr 字节/行数、stderr 受限预览、PID、exit/close/error；协议响应不复制。 |
| Durable writer | `runtime-log-writer.ts` | 日期/大小轮转、manifest、retention、primary failure spool、spool replay、restart dedupe、manifest-only degradation。 |
| Query/UI | `runtime:log-page`、`BottomPanel.tsx` | persisted paging、level/source/process/correlation filters、pending/degraded 状态、memory mirror 去重、清空不删除证据。 |
| Export | `runtime:log-export`、writer bundle | 主进程目录选择、唯一子目录、全部段/manifest/spool、`bundle-manifest.json` 和 metadata-only 声明。 |
| Static coverage | `scripts/runtime-log-coverage.mjs` | 扫描 `src`/`electron`/`scripts`，机器可读协议必须有 allowlist reason，uncovered 必须为空。 |

## 已运行证据

以下数字来自本轮实际命令输出，不把方案文件当作通过：

```text
pnpm run typecheck                         exit 0
pnpm run check:i18n                        exit 0
pnpm run check:runtime-log-coverage       exit 0; uncovered=[]
runtime-log-writer.test.ts                 12/12
runtime-log-capture.test.ts                5/5
src/services/runtime-log.test.ts           7/7
src/shared/runtime-log.test.ts             5/5
runtime-logs.browser.tsx                   1/1
workflow-launch-dialogs.browser.tsx        7/7
batch-chapter-completion-mode.browser.tsx  8/8
full unit (1.2.0 final SHA)                 309 files; 2210 passed; 8 skipped
full browser (1.2.0 final SHA)             39 files; 228 passed
```

1.2.0 DSH qualification 已在最终源码 SHA、官方 Harness commit
`183f08e9c6dde7e36cd2318eaee70b0da08fb35e` 完整通过：插件 40 文件/433
passed/6 skipped，tarball 241,776 bytes / 41 entries，SHA-256
`0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`；profile
add/remove/reinstall、`inkweaver-v2` mount、工具隔离、Chrome 三次 journey
和 schema-5 持久化读回均通过。旧 1.1.0 收据仅作为历史对照，不作为本版本
资产证据。最终资格机器收据的 `source.commit` 为
`2bcff9b9eca7c5eb142aa5293acad5aac78c0728`，tarball SHA-256 为
`0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`。

## 已知限制与冻结说明

- writer 默认保留最近 30 个 segment；这是明确的 retention 策略，不是静默丢弃。删除/降级应在状态和后续收据中可见。
- 两级磁盘都不可写时，事件暂留内存并显示 `degraded`；进程被强制终止前无法凭空制造第三份介质，因此必须向用户显示不完整状态。
- smoke/qualification 脚本的 stdout/stderr 仍保留机器可读协议，coverage 报告逐项列出理由。
- 1.2.0 冻结门禁已全部完成：桌面 build、Windows/macOS 三架构真实资产、GitHub Release 资产回读、`dsh-plugin` topic 回读、提交 SHA 一致性、root 全量 unit/browser 与 DSH 隔离资格均已记录。日志系统的 retention、双磁盘不可写和机器协议 allowlist 限制仍按上文披露。

## 最终分发绑定

| 项目 | 回读 |
| --- | --- |
| GitHub Release | [v1.2.0](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.0)，非 draft、非 prerelease、Latest |
| 源码 | `2bcff9b9eca7c5eb142aa5293acad5aac78c0728` |
| Windows | run `34756541922` / artifact `10317388925` |
| macOS arm64 | run `34756544323` / artifact `10317223323` |
| macOS x64 | run `34757014312` / artifact `10317123040` |
| 插件 | `shuishuipingan-inkweaver-dsh-1.2.0.tgz`，241,776 bytes，SHA-256 `0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66` |
| Topic | topics API 含 `dsh-plugin`；搜索 `topic:dsh-plugin user:shuishuipingan` 返回 `shuishuipingan/InkWeaver` |
