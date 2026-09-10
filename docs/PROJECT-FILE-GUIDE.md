# InkWeaver 项目文件指南

这份文件是 1.1.0 开发线的接手入口。它按“谁拥有事实、谁负责副作用、谁只负责展示”的原则解释仓库文件；生成目录、缓存、快照和用户作品不属于源码交付物。

## 先看哪些文件

| 顺序 | 文件 | 用途 |
| --- | --- | --- |
| 1 | `README.md` / `README_en.md` | 产品定位、开发线状态、用户安装与限制；中英文内容必须保持实现一致。 |
| 2 | `docs/upgrade/INKWEAVER-1.1.0-FULL-FEATURE-MAP.md` | 全路线功能图、依赖关系、技术分层、验收旅程与发布门禁。 |
| 3 | `docs/upgrade/INKWEAVER-1.1.0-DELIVERY-TRACKER.md` | 38 项需求的唯一逐项证据表；状态不能只用“代码已合并”代替验收。 |
| 4 | `docs/upgrade/INKWEAVER-1.1.0-BASELINE.md` | 开发基线、用户保留修改、DSH 版本查询与初始验证结果。 |
| 5 | `plugins/inkweaver-dsh/docs/v2-development-gates.md` | DSH V2 的 tarball、roster、mount、Proposal 同页应用和重启回读门禁。 |
| 6 | `package.json`、`electron-builder.json5`、`.release/release-profile.json` | 桌面版本、构建目标、资产合同和云端资格构建配置。 |

## 根目录文件

| 路径 | 作用 |
| --- | --- |
| `package.json` | Electron/Vite/TypeScript 依赖与桌面开发、测试、资格构建命令；正式冻结前才改为 `1.1.0`。 |
| `pnpm-lock.yaml` | 根项目依赖锁文件；依赖升级必须和测试一起提交。 |
| `vite.config.ts` | Renderer 的 Vite 入口、Electron 集成和资源处理。 |
| `vitest.config.ts` | Node/主进程/共享模块测试环境。 |
| `vitest.browser.config.ts` | Playwright 浏览器级 React 回归测试环境。 |
| `tsconfig.json` | 根 TypeScript 编译边界；不改变事实源，只影响类型检查。 |
| `electron-builder.json5` | Windows NSIS、macOS DMG、资源解包和安装包命名。 |
| `.release/release-profile.json` | Windows、macOS ARM64/x64 资格工作流、资产名称、哈希和签名披露合同。 |
| `.github/workflows/` | 云端构建、安装/升级/启动资格和跨平台资产提升；工作流输出是发布证据，不是本地猜测。 |
| `.gitignore` | 排除 `dist`、`release`、数据库、快照、浏览器截图和本地凭据。 |

## `src/`：Renderer、共享契约和工作流

### 共享领域契约：`src/shared/`

这些文件定义跨 Renderer、主进程、插件或持久化层使用的 DTO。它们不应该读取 SQLite 或调用 Electron API。

| 文件 | 作用 |
| --- | --- |
| `ipc-channels.ts` | 所有 IPC channel 的参数和返回类型；新增 channel 必须同时实现主进程 handler 和测试。 |
| `project-session-context.ts` | 项目 ID、lease、规范化路径的会话所有权；防止异步结果写入错项目。 |
| `project-snapshot.ts` | 快照 manifest、校验、隔离恢复和保留清理的跨进程契约。 |
| `character-roster.ts` | 稳定人物 ID、角色卡、结构化关系和 roster revision 合同。 |
| `character-extraction.ts` | 全文/分块人物候选解析、证据绑定、别名合并和同名歧义检测。 |
| `relationship-presentation.ts` | 旧自由文本与结构化关系的解析、方向、来源章节、证据、短标签和关系类型。 |
| `finalized-continuity.ts` | 定稿连续性事实、有效章节范围和历史状态过滤。 |
| `chapter-handoff.ts` | 章节交接候选的来源正文哈希、场景、情绪、未完成动作、转场和证据。 |
| `knowledge-event.ts` | 角色知情事件、事实/信念/传闻/误信、有效范围和确认状态。 |
| `story-continuity.ts` | 场景因果链、卷级贡献、人物情绪、读者期待和视角线程工作单。 |
| `adjacent-continuity.ts` | 相邻章节低成本衔接检查和带基准正文指纹的局部修稿 Proposal。 |
| `consistency-preflight.ts` | 确定性地点、物品、时间和知情范围冲突预检。 |
| `context-receipt.ts` | 分层上下文预算选择和 privacy-safe 纳入/省略收据；不保存正文。 |
| `generation-receipt.ts` | 模型 ID、尝试次数、请求输出预算和 provider usage 的安全收据。 |
| `workflow-recovery.ts` | 工作流取消、暂停、失败和完成边界的本地恢复检查点。 |
| `draft-units.ts` | 正文字数/可见单位计算算法，导入、定稿和导出必须共用。 |
| `narrative-thread.ts` | 伏笔/叙事线计划和定稿证据。 |
| `structured-contract-diagnostic.ts` | 模型结构化输出的稳定错误代码和路径。 |

### 状态与窗口：`src/stores/`、`src/components/`

| 路径 | 作用 |
| --- | --- |
| `stores/project-store.ts` | 当前项目打开/关闭、项目 session 和生命周期；不保存主进程事实副本。 |
| `stores/editor-store.ts` | 编辑器 tab、dirty 状态和保存竞态保护。 |
| `stores/workflow-store.ts` | 工作流运行、步骤、取消/暂停/恢复和安全收据。 |
| `stores/character-store.ts` | Renderer 侧 roster 投影、revision 校验和手工编辑草稿。 |
| `stores/locale-store.ts` | UI 语言与中英文文本入口。 |
| `components/layout/TitleBar.tsx` | 项目切换、快照创建/隔离恢复、导入、导出、主题和缩放入口。 |
| `components/editor/DraftEditor.tsx` | 正文编辑、定稿、审稿、人物候选审核和连续性面板装配。 |
| `components/editor/ContinuousReader.tsx` | 只读定稿连续阅读、章节边界、搜索、位置保存、导航和重复提示。 |
| `components/editor/StoryContinuityPanel.tsx` | 场景、卷级推进、情绪、期待、视角及已确认知情范围工作单。 |
| `components/editor/RelationshipGraph.tsx` | Canvas 图谱、搜索/过滤/二跳聚焦、方向/证据提示、键盘列表和项目级布局。 |
| `components/editor/CharacterExtractionCandidatesPanel.tsx` | 证据预览、字段勾选、接受/拒绝和作者确认后的合并入口。 |
| `components/editor/ChapterHandoffPanel.tsx` | 章节交接候选的证据查看、确认和过期提示。 |
| `components/editor/ContinuityImpactPanel.tsx` | 历史正文修改对连续性投影、交接和叙事线的影响清单。 |
| `components/panels/AIOutputPanel.tsx` | AI 输出、上下文收据、模型 usage 未知状态和工作流失败信息。 |
| `components/dialogs/ExportDialog.tsx` | 受限目录授权后的 Markdown/TXT 导出。 |
| `components/dialogs/ImportNovelDialog.tsx` | 长篇导入、分块解析、人物同步和可恢复运行入口。 |
| `components/ui/` | Button、Confirm、Toast、Markdown、错误边界等可访问基础控件。 |
| `i18n/messages/zh-CN.ts` / `en-US.ts` | 所有新增界面、错误、恢复和发布提示的双语文案。 |

### 工作流和服务：`src/services/`

| 路径 | 作用 |
| --- | --- |
| `services/ipc-client.ts` | Renderer 到主进程的类型化调用和 project-session gate。 |
| `services/export-service.ts` | 以 finalized authority 枚举章节、校验顺序/标题/字数/正文，写出受限导出文件及不含正文的 authority/hash manifest。 |
| `services/character-extraction-merge.ts` | 只合并已接受且非 ambiguous 的人物候选，保留字段级选择。 |
| `services/continuity-impact.ts` | 将历史改稿映射为可选影响项。 |
| `services/generation/` | Provider 调用、预算、重试、usage 和取消边界。 |
| `services/workflows/commands/` | 单个写作/架构/定稿/审稿/导入命令；命令只编排，不绕过 repository。 |
| `services/workflows/import-*` | 长篇导入的分批执行、效果收据和可恢复检查点。 |
| `services/prompts/` | Prompt 模板、语言分支、版本与模型输出合同。 |

## `electron/`：主进程、SQLite 和外部副作用

主进程是 SQLite 权威事实和文件/模型副作用的所有者；Renderer 只能通过 IPC 访问它。

| 路径 | 作用 |
| --- | --- |
| `electron/main.ts` | Electron 主窗口、生命周期、打包 smoke 入口和安全启动门。 |
| `electron/database.ts` | 项目数据库连接、schema 初始化/迁移和旧项目兼容。 |
| `electron/controllers/db-controller.ts` | DB repository 的 IPC 门面、项目路径校验和 session 边界。 |
| `electron/controllers/project-controller.ts` | 打开/关闭/恢复项目和可信回滚边界。 |
| `electron/repositories/` | 每个领域事实的 SQLite repository：draft、finalization、blueprint、roster、handoff、knowledge、continuity、review、revision、thread 和 import run。 |
| `electron/services/project-snapshot-service.ts` | SQLite backup API、manifest/hash、逐文件验证、源项目外隔离恢复和保留清理。 |
| `electron/services/finalization-service.ts` | 定稿 outbox 事务和实体 manuscript 投影发布/重试。 |
| `electron/services/external-file-grant-service.ts` | 导入/导出目录 capability；绝不把绝对路径交给 Renderer。 |
| `electron/services/manuscript-publisher.ts` | 定稿正文实体文件的安全、幂等发布。 |
| `electron/llm/` | OpenAI-compatible、Gemini 和其他 provider 适配、usage 归一化和连接冻结。 |
| `electron/security/` | Windows/macOS 安全文件系统辅助程序和原生 ABI 入口。 |
| `electron/vector-store.ts` / `electron/knowledge-base.ts` | 知识库索引、迁移和检索；向量是可重建投影，原始正文不以它为唯一事实源。 |

## DSH 插件：`plugins/inkweaver-dsh/`

这是独立的 npm 包，不读取桌面版 `.vela` 数据库；它有自己的 `.ai-novel/novel.db` V2 store。

| 路径 | 作用 |
| --- | --- |
| `package.json` / `pnpm-lock.yaml` | 插件版本、DSH peer pin、build/test/qualification 命令和打包文件清单。 |
| `src/index.ts` | DSH Host 入口、loopback `/inkweaver` RPC 装配和工作区路由。 |
| `src/agent.ts` | V1 文件资产工具、persona、native approval 入口。 |
| `src/agent-v2.ts` | V2 `novel_read` / `novel_propose_change`、严格 Proposal 合同和 session 装配。 |
| `src/novel-store.ts` | V2 SQLite 权威 store、ChangeSet、Proposal inbox、artifact 链、schema 迁移和 schema 5 handoff/knowledge。 |
| `src/command-rpc.ts` | Host-side typed read/proposal/list/apply/retry/discard/recovery RPC。 |
| `src/context-window.ts` / `src/context-types.ts` | V1 文件资产的有界读取与浏览器安全 DTO。 |
| `src/client/` | 设置卡、侧栏工作台、V2 authoring、Proposal 审核和 context DTO 校验。 |
| `presets/` | V1/V2 的 persona 与工具挂载配置；不能用系统 preset 覆盖用户 preset。 |
| `scripts/` | 构建产物校验、tarball/profile qualification 和无密钥浏览器后端。 |
| `tests/` | store/repository 迁移、typed RPC、Proposal、浏览器、snapshot、tarball qualification。 |
| `docs/dsh-0.1.5-rc.1-compatibility.md` | 官方 DSH 版本、精确依赖 pin、0.1.5 API 迁移、schema 5 和当前资格证据。 |
| `docs/v2-development-gates.md` | 实际 roster/mount/Proposal 同页应用/重启读回的门禁。 |

## 测试、脚本和生成物

| 路径 | 作用 |
| --- | --- |
| `src/**/__tests__/`、`electron/**/__tests__/` | 共享、Renderer、主进程和 repository 单元/集成测试。 |
| `src/components/**/__tests__/*.browser.tsx` | 真实浏览器交互和截图回归；截图只作本地证据，不提交私人内容。 |
| `scripts/check-i18n-coverage.mjs` | 检查新增 Renderer/Main-boundary 文案是否有双语覆盖。 |
| `scripts/release-*.mjs` | Windows/macOS/更新元数据/原生 ABI/资产合同验证；不要绕过 gate。 |
| `scripts/verify-built.mjs`（插件目录） | 检查 emitted DSH Host/Agent/Client、preset 和包清单。 |
| `dist/`、`dist-electron/`、`release/`、插件 `lib/` | 构建输出；可删除、不可当作源码编辑，发布前必须从同一源码 SHA 重建。 |
| `.runtime/.cache/`、`.vitest-attachments/` | 本机测试/资格日志和截图；不提交、不作为产品数据。 |
| `.vela/`、`.ai-novel/`、`.dsh-upgrade-inspect/` | 用户项目、插件测试或临时检查数据；不进入源码提交。 |

## 修改边界速查

1. 修改事实结构：先改 `src/shared` 契约，再改 `electron/repositories`、SQLite migration、IPC、UI 和测试。
2. 修改 UI：使用现有 store/IPC，不在组件里直接读取 SQLite、绝对路径或模型密钥。
3. 修改插件：先更新 V2 gate 对应的 typed DTO，再 `typecheck → build → tarball → isolated profile → roster/mount → browser → restart`。
4. 修改版本或发布：先把 tracker 38 项逐一换成真实证据；没有同 SHA 的 Windows/macOS 资格资产时，不把开发线写成正式 1.1.0。
5. 看到 `.gitignore` 中的用户/构建文件时不要清理；它们可能是用户已有数据或当前资格证据。
