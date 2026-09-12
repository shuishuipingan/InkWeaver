# 全局日志与长篇写作流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立不静默丢失的结构化全局日志，并补齐用户列出的写作功能与并发/恢复/导出/更新回归。

**Architecture:** 先建立共享 `RuntimeLogEvent` 合同和可注入持久化 writer，再把主进程、Renderer、IPC、工作流和子进程收口到同一个 sink。创作功能按 Skill/资料与上下文/角色与叙事/工作流与审稿四组实现；每组先写失败测试，再改动业务实现，最后用跨模块回归验证来源指纹和项目会话不会漂移。

**Tech Stack:** TypeScript、Electron IPC、React/Zustand、SQLite/better-sqlite3、Vitest、Vitest Browser/Playwright、electron-updater、pnpm 11。

**Spec:** `docs/superpowers/specs/2026-09-13-global-logging-and-writing-flow-design.md`

## Global Constraints

- 默认日志只记录可审计元数据；prompt/response/正文只有显式诊断模式才可进入受限附件。
- 日志事件 schemaVersion 固定为 `1`；主进程给 Renderer 事件追加 serverSequence，不依赖时间排序。
- 队列、轮转、磁盘失败、重试和 redaction 都必须有可检索事件；禁止静默丢弃。
- 所有项目写入必须检查 `projectSessionId`、来源 revision/contentHash 和 request/run identity。
- 所有新功能必须同时提供中英文 UI 文案、错误态、取消/恢复路径和测试。
- 不改变人工确认才成为权威事实的边界；候选稿、候选人物、候选事件不得冒充定稿。

## File Map

- Create `src/shared/runtime-log.ts`: `RuntimeLogEvent`、level/process/outcome 类型、JSON-safe 校验和 redaction metadata。
- Create `electron/services/runtime-log-writer.ts`: segment writer、持久化 spool、retry、rotation、manifest 和 retention。
- Modify `electron/services/runtime-logger.ts`: 统一 console/process/IPC capture、redaction、writer 状态和主进程事件。
- Modify `electron/main.ts`: 最早安装 capture、窗口/更新/MCP/异常生命周期事件。
- Modify `src/services/runtime-log.ts` and `src/main.tsx`: Renderer 全量 console/error capture、确认队列和 shutdown flush。
- Modify `src/shared/ipc-channels.ts`, `electron/preload.ts`, `electron/controllers/app-data-controller.ts`: 日志 query/status/export IPC。
- Modify `src/components/panels/BottomPanel.tsx` and `src/stores/workflow-store.ts`: 持久化分页日志视图、缺口状态和工作流关联。
- Modify `src/services/agent/skill-registry.ts`, `src/components/panels/agent/AgentHeader.tsx`, app-data controller: stage-aware Skill install/list/remove。
- Modify `src/shared/narrative-thread.ts`, `electron/repositories/narrative-thread-repository.ts`, `src/components/editor/NarrativeThreadEditor.tsx`: progress projection and evidence jump。
- Create `electron/repositories/planning-material-repository.ts`, `src/shared/planning-material.ts`; modify import controller/dialog/context builders。
- Modify character roster repository/types and `src/components/editor/CharacterExtractionCandidatesPanel.tsx`: provenance/state history and blueprint confirmation。
- Modify context builders, batch/chapter/review commands and receipts for four-layer materials, coverage gaps and source fingerprints。
- Modify `electron/services/update-runtime.ts`, `electron/services/electron-updater-adapter.ts`, `electron-builder.json5`, update types/UI and update tests for macOS。
- Modify editor stores, workflow reducers, export service and split export path for bug fixes 0–9。
- Create focused unit/browser/integration tests beside every changed boundary and `docs/upgrade/GLOBAL-LOGGING-ACCEPTANCE-RECEIPT-2026-09-13.md` after all gates pass。

### Task 1: Define the log event contract (TDD)

**Files:** Create `src/shared/runtime-log.ts`; test `src/shared/__tests__/runtime-log.test.ts`.

- [ ] Write tests for required fields, valid levels/outcomes, JSON-safe details, sequence gaps and redaction metadata.
- [ ] Run `pnpm exec vitest run src/shared/__tests__/runtime-log.test.ts --maxWorkers=1`; expect failure because the contract module does not exist.
- [ ] Implement `RuntimeLogEvent`, `RuntimeLogInput`, `isRuntimeLogEvent`, `normalizeRuntimeLogDetails` and `redactRuntimeLogValue` with depth/size limits and explicit `truncated` markers.
- [ ] Re-run the focused test and commit `feat: define structured runtime log contract`.

### Task 2: Implement durable segment writer

**Files:** Create `electron/services/runtime-log-writer.ts`; test `electron/services/__tests__/runtime-log-writer.test.ts`.

- [ ] Write failing tests for append order, retry spool, size/day rotation without overwrite, retention counting `.jsonl` segments, manifest SHA and disk-write failure events.
- [ ] Run the focused test and verify failures describe missing writer behavior.
- [ ] Implement an injected filesystem/clock writer with append-only JSONL, numbered segments, sidecar manifest, retry queue and emergency spool; never drop an event.
- [ ] Add `flush()`, `status()`, `readPage(cursor, filters)` and `exportBundle(destination)` interfaces; verify all focused tests pass.
- [ ] Commit `feat: add durable structured runtime log writer`.

### Task 3: Capture every main-process source

**Files:** Modify `electron/services/runtime-logger.ts`, `electron/main.ts`, `electron/mcp/mcp-manager.ts`, `electron/mcp/mcp-ipc-bridge.ts`, `electron/database.ts`, `electron/utils/safe-console.ts`; tests `electron/services/__tests__/runtime-logger.test.ts`, `electron/__tests__/main-runtime-logging.test.ts`.

- [ ] Add failing tests proving `console.log/info/warn/error/debug`, `process warning`, uncaught exception, rejection, IPC handler start/finish/failure, child stdout/stderr and window lifecycle all become events with correlation fields.
- [ ] Run focused tests and record the expected missing-capture failures.
- [ ] Replace duplicate safeConsole paths with one preserved-native-console wrapper; install it before controller imports; route direct process writes through a capture-safe adapter while preserving machine-readable smoke output.
- [ ] Add IPC event/query/status/export handlers and verify sensitive args are redacted without losing error code/stack metadata.
- [ ] Run focused tests, then `pnpm run typecheck`; commit `feat: capture main process runtime events`.

### Task 4: Capture Renderer and persist UI logs

**Files:** Modify `src/services/runtime-log.ts`, `src/main.tsx`, `src/shared/ipc-channels.ts`, `electron/preload.ts`, `src/stores/workflow-store.ts`, `src/components/panels/BottomPanel.tsx`; tests `src/services/__tests__/runtime-log.test.ts`, `src/components/panels/__tests__/runtime-logs.browser.tsx`.

- [ ] Write failing tests for all five console methods, queue retry/no-drop, shutdown flush, persistent paging, filters, gap status and “clear view does not delete evidence”.
- [ ] Run focused tests and verify the old `QUEUE_LIMIT=200` behavior fails the no-drop assertion.
- [ ] Implement confirmation queue with retry/emergency spool, renderer event identity, query cursor and LogsView filters for level/process/source/run/project/correlation.
- [ ] Add redacted diagnostic bundle export and visible persistence status; verify browser interactions in Chinese and English.
- [ ] Run focused tests and commit `feat: persist and query renderer runtime logs`.

### Task 5: Produce a logging coverage report

**Files:** Create `scripts/runtime-log-coverage.mjs`, test `scripts/__tests__/runtime-log-coverage.test.ts`, docs `docs/upgrade/GLOBAL-LOGGING-ACCEPTANCE-RECEIPT-2026-09-13.md`.

- [ ] Write a failing fixture test that detects a new裸 `console.*` or uncaptured process boundary unless explicitly allowlisted.
- [ ] Implement AST/text coverage checks for main/renderer/workflow/update/MCP/import/export and output JSON with allowlist, captured boundaries and uncovered files.
- [ ] Run the checker against the repository; every remaining allowlist entry must state why it preserves a machine-readable protocol.
- [ ] Commit `test: enforce runtime log coverage contract`.

### Task 6: Stage-aware independent Skills

**Files:** Modify `src/services/agent/skill-registry.ts`, `src/components/panels/agent/AgentHeader.tsx`, `electron/controllers/app-data-controller.ts`, `src/shared/ipc-channels.ts`; tests `src/services/agent/__tests__/skill-registry-stage.test.ts`, `src/components/panels/agent/__tests__/skills-install.browser.tsx`.

- [ ] Write failing tests for safe install/list/remove, frontmatter `stage`, stage filtering for planning/drafting/review/polish, invalid package rejection and project-session isolation.
- [ ] Implement manifest validation, copy-to-user/project directory through main-process app-data APIs, stage-aware registry and UI install/remove controls.
- [ ] Add log events for install, parse, filter, invocation and rejection; run focused tests and commit `feat: add independent stage-aware writing skills`.

### Task 7: Narrative progress and evidence jump

**Files:** Modify `src/shared/narrative-thread.ts`, `electron/repositories/narrative-thread-repository.ts`, `src/components/editor/NarrativeThreadEditor.tsx`; tests `electron/repositories/__tests__/narrative-thread-repository.test.ts`, `src/components/editor/__tests__/NarrativeThreadEditor.browser.tsx`.

- [ ] Write failing tests for main/sub-thread progress, next target, dormant/overdue status, evidence content hash and session-safe open-chapter action.
- [ ] Implement progress projection and an evidence action that opens the exact finalized chapter/paragraph only after current session validation.
- [ ] Log candidate/confirm/jump outcomes; run unit/browser tests and commit `feat: add narrative progress evidence navigation`.

### Task 8: Planning-material import

**Files:** Create `src/shared/planning-material.ts`, `electron/repositories/planning-material-repository.ts`; modify `electron/controllers/import-controller.ts`, `src/components/dialogs/ImportNovelDialog.tsx`, context builders and IPC types; tests under `electron/repositories/__tests__`, `electron/controllers/__tests__`, `src/components/dialogs/__tests__`.

- [ ] Write failing tests for planning-material selection, hash idempotency, preview/confirm, conflict, missing source and context inclusion only after confirmation.
- [ ] Implement project-owned material metadata/content storage, source fingerprint, explicit author confirmation and safe context layer.
- [ ] Emit import/coverage/commit/reject logs; run focused tests and commit `feat: import planning materials into projects`.

### Task 9: Character provenance and blueprint-only roster writes

**Files:** Modify character roster shared types/repository/schema, `src/services/workflows/blueprint-character-sync.ts`, `src/components/editor/CharacterExtractionCandidatesPanel.tsx`; tests for repository, workflow and browser UI.

- [ ] Write failing tests proving unconfirmed blueprint names never enter roster and model/author/legacy states keep source final ID/hash/evidence.
- [ ] Implement confirmation-only commit and append-only character state history with provenance; context builder accepts model state only when source final still matches.
- [ ] Add explicit unknown-source UI and logs; run focused tests and commit `feat: track character state provenance`.

### Task 10: Four-layer chapter materials and coverage gaps

**Files:** Modify `src/services/agent/context-builder.ts`, chapter/batch/review commands, `src/shared/context-receipt.ts`, `src/services/generation/generation-harness.ts`; tests for context receipt, batch and review.

- [ ] Write failing tests for author task preservation, future-plan separation, finalized-history/candidate separation, adjacent paragraph spans and mandatory coverage gaps.
- [ ] Implement typed layers, source spans, omission reasons and mandatory-task failure behavior; log each selected/omitted layer.
- [ ] Run focused tests and commit `feat: make chapter materials and coverage explicit`.

### Task 11: Continuous draft and Chinese flow correctness

**Files:** Modify `src/services/workflows/batch-chapter-workflow.ts`, `src/services/workflows/chapter-workflow.ts`, `src/stores/workflow-store.ts`, `src/services/workflows/commands/generate-draft.command.ts`; tests for batch/chapter workflow and browser completion mode.

- [ ] Write failing tests for candidate version/content reuse, no finalized-history pollution, Chinese writing language freeze and complete workflow title notification.
- [ ] Implement batch candidate ledger and full title propagation; preserve explicit author confirmation boundaries.
- [ ] Run focused tests and commit `fix: preserve candidate draft lineage through batch writing`.

### Task 12: Review event status and bounded repair

**Files:** Modify `src/services/workflows/commands/review-chapter.command.ts`, `src/services/workflows/structured-batch-executor.ts`, review contracts/UI; tests for review status, malformed repair and needs-verification browser flow.

- [ ] Write failing tests for completed/prepared/deferred/not-found event rows, needs-verification status, one same-session repair, and no invalid review persistence after a second failure.
- [ ] Implement typed review output, evidence links, author decision records and one bounded repair without increasing budget.
- [ ] Run focused tests and commit `feat: add evidence-aware review decisions`.

### Task 13: Fix multi-draft and stale-result races

**Files:** Modify editor stores, `src/services/ipc-client.ts`, workflow reducers and repositories; tests `src/stores/__tests__/editor-store-save-settle.test.ts`, new stale-result tests.

- [ ] Reproduce with two tabs, delayed saves, close/reopen and delayed blueprint/draft/review/revision responses; assert old results are rejected.
- [ ] Add tab/draft/request sequence keys, AbortController close tokens, CAS source revision and session checks at reducer/IPC/repository boundaries.
- [ ] Run race tests and commit `fix: fence stale editor and workflow results`.

### Task 14: Fix recovery, export and split-directory contamination

**Files:** Modify workflow recovery metadata/checkpoints, `src/services/export-service.ts`, split Markdown exporter and recovery UI; tests for J08/J12 and new fingerprint cases.

- [ ] Write failing tests for expired draft recovery, wrong candidate source, non-final export, stale/expired chapter, mismatched title/hash and reused split directory.
- [ ] Implement source fingerprints and CAS recovery, finalized-authority-only export, unique temporary split directory and atomic destination swap.
- [ ] Run focused tests and commit `fix: fence recovery and export source identity`.

### Task 15: Cross-platform UpdateService and queued checks

**Files:** Modify `electron/services/update-runtime.ts`, `electron/services/electron-updater-adapter.ts`, `electron-builder.json5`, update types/UI; tests for runtime, adapter, queue and browser UI.

- [ ] Write failing tests for macOS arm64/x64 enablement, stable platform asset selection, downloaded-version monotonicity, queued check single-flight and no stale overwrite.
- [ ] Implement platform-aware backend/config, `latest-mac.yml` targets, generation token and monotonic state reducer; log check/download/install lifecycle.
- [ ] Run update unit/browser tests and commit `feat: enable platform-aware in-app updates`.

### Task 16: Windows process classification regression

**Files:** Modify `scripts/monitor-win-release-gate.ps1`, `scripts/release-win-verify.mjs`, `scripts/smoke-win-installer.ps1`; tests `scripts/__tests__/release-win-verify.test.ts`, `scripts/__tests__/smoke-win-installer.test.ts`.

- [ ] Reproduce normal helper exit and assert it currently fails; add process identity/exit-classification regression tests.
- [ ] Implement exact process-tree classification so helper exit is expected while product failure remains fatal; preserve evidence events.
- [ ] Run Windows-focused tests and commit `fix: classify expected Windows helper exits`.

### Task 17: Full acceptance and documentation

**Files:** Modify `docs/upgrade/INKWEAVER-1.1.0-DELIVERY-TRACKER.md`, `CHANGELOG.md`, README files; create `docs/upgrade/GLOBAL-LOGGING-ACCEPTANCE-RECEIPT-2026-09-13.md`.

- [ ] Run `pnpm typecheck`, `pnpm test`, `pnpm test:browser`, all Electron suites, DSH tests and logging coverage checker.
- [ ] Run targeted workflow journeys for 1–12 and 0–9; record command, exit code, source hash, logs manifest and screenshots where applicable.
- [ ] Review every tracker row against evidence; update docs only after commands pass, explicitly record known privacy/signing/platform limits.
- [ ] Commit `docs: record global logging and writing-flow acceptance`.
