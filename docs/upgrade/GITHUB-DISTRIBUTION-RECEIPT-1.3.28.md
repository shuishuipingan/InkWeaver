# 1.3.28 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T08:00:35Z，本机核验时刻 2026-10-07T16:02 HKT）

这是 1.3.28 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。本版为纯修复版，收据的重点是`1.3.27 已知问题的闭环`——严格区分代码级、测试级与仍缺运行期证据的部分。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `73de989b8b051a955d6460a8f5eb210afe162df8` |
| 提交 | `5679325 docs(release): record the v1.3.27 distribution receipt` + `8a5a73e fix(main): keep every project-scoped surface on the current project`（21 files, +1288/−20） + `73de989 chore(release): prepare v1.3.28` |
| tag | `v1.3.28`（annotated）；tag 对象 `bbbb7287303825af26a35f7d4fdffcf0301c52d1`（type=tag，tagger `shuishuipingan`，2026-10-07T07:38:20Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.28` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-81 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-81 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

**1.3.27 收据的提交**：`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.27.md`（178 行）由 `5679325` 随本轮推送，本机核对 `git show --stat 5679325` 为 1 file changed（+178）。

## 平台资格（全部绑定 SHA `73de989b…`）

四个平台**全部 attempt 1 一次通过，零重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37588571202`，attempt 1 | `qualified-windows` = `11468112859` | success |
| macOS arm64 | run `37588578077`，attempt 1 | `qualified-macos-arm64` = `11467074081` | success |
| macOS x64 | run `37588584100`，attempt 1 | `qualified-macos-x64` = `11468081608` | success |
| Linux x64 | run `37588590817`，attempt 1 | `qualified-linux-x64` = `11468430864` | success |

四个 run 的 `head_sha` 均为 `73de989b8b…`。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`、无失败 step（本机回读确认）。

## macOS x64 runner 抖动：跨版本对照（第 11 次采样，修复后 5/5）

| 版本 | 运行 | attempt 1 | attempt 2 | 最终结果 |
| --- | --- | --- | --- | --- |
| 1.3.16 | run `37140990679` | failure（p95 `116.7` / `133.3` 超预算） | **failure** | 该 run 报废，**重派新 run** `37142453767` 才通过 |
| 1.3.19 | run `37217338528` | success | — | 一次通过 |
| 1.3.20 | run `37395647387` | success | — | 一次通过 |
| 1.3.21 | run `37470488648` | failure（`expected 116.7 < 105`） | success | attempt 2 通过 |
| 1.3.22 | run `37563552549` | success | — | 一次通过 |
| 1.3.23 | run `37567309253` | failure（`expected 116.6 < 105`） | success | attempt 2 通过 |
| 1.3.24 | run `37571952992` | success | — | 一次通过（修复后第 1 次） |
| 1.3.25 | run `37574978141` | success | — | 一次通过（修复后第 2 次） |
| 1.3.26 | run `37578067210` | success | — | 一次通过（修复后第 3 次） |
| 1.3.27 | run `37582521296` | success | — | 一次通过（修复后第 4 次） |
| **1.3.28** | run `37588584100`（head `73de989b8b`） | **success** | — | 一次通过（修复后第 5 次） |

**统计判读（严格按样本说话）**：十一次采样中 8 次 attempt 1 通过、3 次抖动（116.7 / 116.7 / 116.6，上限 105），三次抖动全部发生在帧预算修复（`874dbad`，系数 1.25 → 1.5）之前。修复后连续 **5/5** 通过；参照系为修复前 3/6 且最长连续 2 次。样本已连续超过修复前的上界，但修复后 n=5 仍不算大样本，本收据继续只记录事实与参照，不宣布结论。

## 1.3.27 已知问题的闭环

1.3.27 收据的`已知问题`节记录过：切换项目后助手历史面板仍显示上一个项目的会话，库层无责（渲染层内存合并逻辑），并写明"**本收据不把该问题记为已修复；修复效果需在下一版发布后由本机回读确认**"。本节给出闭环，并按证据层级分开陈述。

### 一、代码级确认（修复确实随 v1.3.28 冻结）

- 修复提交：`8a5a73e fix(main): keep every project-scoped surface on the current project`，21 个文件（+1288/−20）。
- **祖先性**：本机执行 `git merge-base --is-ancestor 8a5a73e 73de989b8b051a955d6460a8f5eb210afe162df8`，**退出码 0** —— 修复提交是 v1.3.28 冻结 SHA 的祖先，即确实包含在本版打包的代码线内。
- 会话重置/恢复路径的实际改动（本机读取当前源码确认，不是转述）：
  - 新增 `resetAgentConversationsForProjectSwitch()`（`src/stores/agent-store.ts:395-415`）：结算悬挂确认为拒绝（`clearPendingConfirmations()`）、中止在途生成且**不写**"已停止生成"文案、递增 `conversationRestoreSequence` 让在途恢复立即过期、清空 `conversations`/`activeConversationId`/`historyHydrated`/`generating`/`activeRequestId`。
  - `restoreConversations` 增加**代次校验**与**项目一致性校验**（`:417-432`）：`const sequence = ++conversationRestoreSequence`；返回后 `if (sequence !== conversationRestoreSequence) return`、`if (activeProjectSession()?.projectPath !== requestedProjectPath) return`；未打开项目时直接清空列表（不再展示上一个项目内容）。
  - 1.3.27 的缺陷行（旧 `:412-419`"库里没有但内存里有消息的会话一律保留"）不再无条件保留：合并只在前述代次与项目校验通过后发生。
- 其它面（同一提交）：`workflow-store.ts`（任务历史按当前项目过滤、内存按项目分别保留）、`BottomPanel.tsx`（日志带项目归属，只显示应用级 + 当前项目）、`project-service.ts`（把"项目切换时重置助手状态"放进统一的项目打开/关闭入口）、`project-clear-repository.ts`（清空范围补全）、`knowledge-base.ts`（迁移检查按项目实例而非路径）。

### 二、测试级确认（新增隔离测试各自钉住哪条不变量）

| 测试文件 | 用例 | 钉住的不变量 |
| --- | --- | --- |
| `src/stores/__tests__/agent-project-switch.test.ts` | 6 | 不把上个项目的会话带入新项目；reset 清空会话与 hydration 标志；悬挂确认在切换时按拒绝结算；**快速连切时丢弃过期恢复结果**；同项目未落库的会话仍保留；未打开项目时不显示任何会话 |
| `src/stores/__tests__/agent-project-entry.test.ts` | 4 | 统一项目入口在**无任何组件挂载**时也能重置并恢复；统一入口结算悬挂确认；项目关闭时清空；组件内不再存在第二条重置路径 |
| `src/stores/__tests__/agent-conversation-project-isolation.test.ts` | 4 | 两个真实临时库互不可见且切回后数据仍在；**判别力自证**（不切库时同一查询仍返回 A 的数据，证明前一条确在测库边界）；渲染层切走不显示、切回仍在；**判别力自证**（若切换时不重置，激活指针会留在旧项目会话上 —— 即回退修复会让断言失败） |
| `src/components/panels/agent/__tests__/agent-history-project-switch.browser.tsx` | 1 | 历史面板只显示新项目会话、绝不显示上一个项目的会话 |
| `src/components/panels/__tests__/bottom-panel-project-isolation.browser.tsx` | 2 | 任务历史只显示当前项目且切回后保留；隐藏别项目日志但保留应用级日志 |
| `electron/repositories/__tests__/project-clear-scope-isolation.test.ts` | 2 | 清空生成内容后助手会话记录完整保留；`creativeFields` 的 DELETE 列表包含文风档案历史 |
| `electron/__tests__/knowledge-base-migration-instance.test.ts` | 2 | 同一项目实例只迁移一次、原路径重建的新实例会重新检查；缓存键按实例、取不到实例时退回路径 |
| `electron/controllers/__tests__/llm-stream-project-switch.test.ts` | 2 | 在途流式请求在切换时被中止且入口可重复调用；无在途流时返回 0 |
| `electron/__tests__/ipc-channel-session-arity.test.ts` | 3 | 类型级：每个 `db:*` 通道末参为 `string`（`== expectedProjectPath`）；源码级：每个 `db:*` handler 形参声明了 `expectedProjectPath`；包装器确实以 `args.at(-1)` 判定会话 |
| `src/components/dialogs/__tests__/clear-project-data-dialog-copy.test.ts` | 3 | 对话框明示"助手会话不受影响"并指明清空对话入口；同时列出会被清掉的生成内容；中英文说明成对存在 |

（另有 `electron/repositories/__tests__/project-clear-repositories.test.ts` 追加 7 行，属既有文件的补充断言。）

其中 3 条是**判别力自证（negative control）**：它们断言"若回退修复或去掉项目边界，断言必须失败"，用来证明同组其它断言真的在测边界，而不是在测巧合。

### 三、仍缺运行期证据的部分（如实写明，不夸大）

- **用户实机双项目切换未由我们复现验证**：本轮全部证据来自源码读取、单元/浏览器测试与 CI 构建面；没有在真实安装版上按用户原始操作序列（切换 A → 切到 B → 观察助手历史/任务历史/日志面板）做端到端复现。
- 上述隔离测试是**在测试环境内构造**的项目切换（两个临时库、挂载的组件、替代的 IPC 边界），不等于用户实机的完整路径（真实磁盘路径、真实 IPC 时序、真实持久化状态）。
- 同样地，"清空定稿正文已清干净"与"删后重建会重新检查迁移"两条库层修复也只有测试级证据；没有（也不应在）用户真实项目库上做破坏性演练。
- 因此本收据的准确结论是：**修复已随 v1.3.28 的代码线冻结，并在测试覆盖的范围内钉住了相应不变量**；**用户场景是否彻底消失，仍需用户侧确认**（建议在下一轮用户反馈中核对）。`本收据不写"用户场景已验证"`。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37590448119**`，attempt 1、success（本机独立交叉核对：位于 promotion workflow 最近运行列表首位，`head_sha` = `73de989b8b…`，与发布侧提供的一致） |
| Release | `v1.3.28`（id `405519321`），非 draft、非 prerelease；`target_commitish` = `73de989b8b051a955d6460a8f5eb210afe162df8`；发布时间 2026-10-07T08:00:35Z |
| Release body | 由 CHANGELOG 的 1.3.28 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.28` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续十次一次通过）

1.3.18 的 promotion 首次运行 `37214225255` 因取值脚本取了列表第一个 artifact 而报 `qualification artifact name mismatch`；自 1.3.19 起按 `qualified-*` 名精确筛选，直到本轮共十次 attempt 1 success（37218555871 / 37397404495 / 37473937227 / 37565028245 / 37569607418 / 37573450129 / 37576477061 / 37579728622 / 37584341816 / 37590448119）。

可核验的边界（沿用前九版收据的口径）：仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（最后改动仍是 `0e9fb74`）。十次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.28.exe` | 223,552,344 | `8aac673dfcbb74dce4695030283f539e0d13679ddb0a916d3eeb7b56e9cf6b90` |
| `inkweaver-setup-1.3.28.exe.blockmap` | 233,666 | `e6f2dc4e6171dcad4cfb791b8a7c196b7b89a2a55d7c6698e5db892a46fdc298` |
| `latest.yml` | 350 | `565fb1b571df4304e39e4f5e225ecf523018051f2f79ef085f387dcebcef7221` |
| `inkweaver-mac-arm64-1.3.28-installer.dmg` | 302,029,194 | `0d6083b27a201a24d4f1655c339c14dd99dca443f389e92e877b3921ba0df78c` |
| `inkweaver-mac-arm64-1.3.28-installer.dmg.sha256` | 107 | `5f632d3f0c52acb38d9a142b2326b523ce1345d793407ff3eeb67494215cc226` |
| `inkweaver-mac-x64-1.3.28-installer.dmg` | 311,952,361 | `5118e1dd9a6a59d4751ab02b1c7502849b37d3bed6b6571ba1ff29f0186f5b92` |
| `inkweaver-mac-x64-1.3.28-installer.dmg.sha256` | 105 | `f35fa9b1758ae971944b2d06d050524ac1ea11b72477401c363e632637d15c5e` |
| `inkweaver-linux-x64-1.3.28.AppImage` | 502,289,286 | `25daf6401a3649dafb07752408bfde57b36bfae83687cb91074bd662b64a6f01` |
| `inkweaver-linux-x64-1.3.28.AppImage.sha256` | 102 | `06f73d10eaa5b72262b2706019ce321f9961c871a4ad166fba534a7b55015f10` |
| `inkweaver-linux-x64-1.3.28.deb` | 354,502,088 | `d7eb238f6b85f15caf826ea62334846d2ff50b410883f691a576568bab01e183` |
| `inkweaver-linux-x64-1.3.28.deb.sha256` | 97 | `f49332658660565d1968ee088d1c01510eb6c8781a1cb1b5c7d25285b5b5a496` |
| `inkweaver-linux-x64-1.3.28.rpm` | 298,291,629 | `9d4431ee4608d81a340346f5c4e7d197330d66af39b1a7d6512322466ac705d0` |
| `inkweaver-linux-x64-1.3.28.rpm.sha256` | 97 | `258a0c4249a950228f34f5d3e5c93baae008b7c9e8a86738e7ecd1622c8b813a` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.28`
- 原因同前十一版：该脚本需要本机已验证的 Windows 构建产物作为比对基准，而本机不构建官方安装包（`docs/adr/0006`）。失败点是"本地产物缺失"，未进入网络比对阶段。

代偿回读（本机执行）：远端 `latest.yml`（350 bytes，HTTP 200）SHA-256 `565fb1b571df4304e39e4f5e225ecf523018051f2f79ef085f387dcebcef7221` 与 GitHub 资产 digest 完全一致；其声明的 `size: 223552344` 与远端 `inkweaver-setup-1.3.28.exe` 资产 size 一致；`version: 1.3.28`、`releaseDate: 2026-10-07T07:47:42.201Z`。

**未验证项（残留风险，与前十一版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），该比对目前在 CI 的 `windows-in-app-update-e2e` 中执行，结果不属于本收据记录范围。

## 用户可见变更与验收

本版为纯修复版，覆盖整个"项目隔离"面：

- 助手会话：切项目时先清空内存态再恢复，并加异步代次校验（快速连续切换时先返回的旧项目结果被丢弃）。
- 工作流任务历史（排查新发现、可复现）：按当前项目过滤，内存按项目分别保留（切回不被挤掉）。
- 运行日志：带项目归属，只显示"应用级日志 + 当前项目日志"。
- 架构：把"项目切换时重置助手状态"从组件挪到统一的项目打开/关闭入口。
- 库层三处：清空定稿正文过去没清干净（定稿全文快照未纳入，并补两张漏清表）；一张懒建表会让整个清空失败；删后重建跳过知识库迁移检查（改为按项目实例识别）。
- 清空范围讲清楚：对话框明示"助手会话记录不受影响"并列出会清什么；判据一句话——**清空生成数据清的是稿子，不是规划与决定**。

实现侧 / 发布侧实测（非本收据作者所测）：全量 node 套件 377 文件 / 2,848 用例 0 失败；浏览器 52 文件 / 281 用例全绿；`typecheck` / `check:i18n` / `check:runtime-log-coverage` 三项 exit 0。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.27` 命中两处，均为历史记录：`CHANGELOG.md`（1.3.27 小节，4 处）与 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.27.md`（33 处）。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.27 残留。

## 已知限制

- **`1.3.27 已知问题的闭环`第三层所列的运行期证据缺口仍然存在**（用户实机双项目切换未复现）。
- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（十次连续成功依赖发布侧取值正确）。
- macOS x64 runner：十一次采样中 3 次间歇失败（全在帧预算修复前），修复后 5/5；仍不宣布"已修复"结论。

## 1.3.28 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.28 小节）

- 修复切换项目后不再看到上一个项目的内容：助手会话、工作流任务历史、运行日志三处按项目隔离；助手状态重置迁到统一的项目打开/关闭入口。
- 库层修复：清空定稿正文现在清干净（含定稿全文快照与两张漏清表）；懒建表不再让整个清空失败；删后重建会重新检查知识库迁移。
- 清空对话框明示范围与"助手会话记录不受影响"。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.28`（本机，exit 0，13 项资产契约）；
- `GET …/releases/tags/v1.3.28`、`GET …/git/ref/tags/v1.3.28` → `git/tags/bbbb7287…`（tag 与 peel）；
- `GET …/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run 与 macOS x64 历次 attempt）；
- `GET …/actions/workflows` → promotion workflow → `/runs`（本轮 promotion 独立交叉核对）；
- `git merge-base --is-ancestor 8a5a73e 73de989b…`（修复是否随本版冻结）、`git show --stat 8a5a73e`（修复范围）、`git show --stat 5679325`（1.3.27 收据提交）；
- `src/stores/agent-store.ts:395-432`（重置与恢复路径的当前实现）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
