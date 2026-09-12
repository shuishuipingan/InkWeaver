# 全局日志功能审计（2026-09-13）

## 审计范围

检查了 Electron 主进程、Renderer、IPC、工作流/任务状态、模型调用、更新器、MCP、数据库/文件系统边界、导入导出、错误边界、DSH 插件和日志面板。

## 当前状态

| 区域 | 当前实现 | 风险 |
| --- | --- | --- |
| 主进程文件日志 | `electron/services/runtime-logger.ts` 按天写文本日志 | debug 被过滤；轮转归档可能覆盖；写入失败被吞掉 |
| Renderer 上报 | `src/services/runtime-log.ts` 有界队列批量 IPC | 队列满丢日志；IPC 失败只回退 console；关闭时无可靠 flush |
| 裸 console | `safeConsole` 已在部分主进程模块使用 | 仍有 51 个源码文件使用裸 `console.*`；Renderer 只转发 warn/error |
| IPC 追踪 | `installIPCGlobalTracing` 包装 `ipcMain.handle` | 不是所有 send/event/子进程边界都有统一关联字段 |
| 工作流日志 | `workflow-store.globalLogs` 和每步骤 `logs` | 只保留内存最近 500 条，重启不可查；字段只有 time/level/message |
| 日志 UI | BottomPanel 的 LogsView | 不能分页查持久化日志、按 run/project/request 关联或显示缺口 |
| 崩溃/异常 | main 与 Renderer 有基本 error/rejection 上报 | 启动早期、stdout/stderr、MCP、第三方事件仍可能绕过统一 sink |
| 隐私 | 部分 API key/path 脱敏 | 规则分散，未形成版本化 schema 和 redaction 结果记录 |

## 必须修复的日志缺口

1. 移除会丢事件的固定队列上限和静默 rate-limit；改为持久化 spool、重试和明确缺口事件。
2. 将日志级别阈值改为只控制展示，不控制文件证据；debug 仍写文件，console/UI 可按级别过滤。
3. 用编号 segment + manifest 替代 `.old` 覆盖式轮转，并同时统计归档文件。
4. 统一主进程与 Renderer 的事件 schema、session/sequence/correlation/run/project 字段。
5. 在应用启动最早阶段捕获 console、process warning、stdout/stderr、Electron 生命周期和子进程输出。
6. 让日志查询、导出、缺口状态和保留策略进入 UI，并把清空视图与删除证据分离。
7. 为每个工作流阶段补“开始/输入快照摘要/模型请求/解析/持久化/通知/完成或失败/恢复”事件。

## 推荐的完整日志字段

时间、进程、PID、版本、操作系统、事件级别、source/event、序列号、sessionId、requestId、correlationId、runId、projectId、projectSessionId、章节号、操作名、结果、耗时、重试次数、队列深度、来源指纹、错误链、脱敏字段、截断状态和持久化状态。

完整 prompt/response 不默认写入；若用户开启诊断模式，应使用受限附件、哈希、过期时间和显式 UI 状态，避免运行日志变成隐私泄露渠道。

## 与用户功能清单的关系

日志不是独立旁路，而是 1–12 项功能和 0–9 项回归的共同证据层。每个功能必须在日志中留下可关联的 `runId`、项目会话、来源版本和结果；每个拒绝、过期、缺口、恢复和作者选择都必须是明确事件，不能只显示 Toast 或控制台字符串。

详细数据流、文件边界和测试门槛见[全局日志与长篇写作流程设计](../superpowers/specs/2026-09-13-global-logging-and-writing-flow-design.md)。
