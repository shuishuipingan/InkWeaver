# 1.3.22 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T03:08:17Z，本机核验时刻 2026-10-07T11:10 HKT）

这是 1.3.22 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前六版一致（含 Actions 运行自证与失败 step 深读）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `f405b2e1e64b28c0772fbc26aeba66683579f671` |
| 提交 | `68b2aff fix(agent): make confirmations honest about their state, and let the assistant read creation state`（13 files, +1413/−31） + `f405b2e chore(release): prepare v1.3.22` |
| tag | `v1.3.22`（annotated）；tag 对象 `31fcf068a77ae9fbe5559c8d5f15b6fa8477737c`（type=tag，tagger `shuishuipingan`，2026-10-07T02:45:47Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.22` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-48 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-48 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

## 平台资格（全部绑定 SHA `f405b2e1…`）

四个平台**全部 attempt 1 一次通过，零重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37563544415`，attempt 1 | `qualified-windows` = `11458567507` | success |
| macOS arm64 | run `37563548179`，attempt 1 | `qualified-macos-arm64` = `11458121789` | success |
| macOS x64 | run `37563552549`，attempt 1 | `qualified-macos-x64` = `11458715045` | success |
| Linux x64 | run `37563557214`，attempt 1 | `qualified-linux-x64` = `11457644135` | success |

四个 run 的 `head_sha` 均为 `f405b2e1e6…`（同一冻结提交）。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`（本机回读确认，不是"跳过"或"重跑后成功"）。

## macOS x64 runner 抖动：跨版本对照（第 5 次采样）

macOS x64 的渲染进程浏览器测试在共享 runner 上出现过同一处性能断言失败。下表把目前可核验的五次采样并列；本轮是**干净通过**，但历史抖动同样保留，两者并列才足以支撑后续判断。

| 版本 | 运行 | attempt 1 | attempt 2 | 最终结果 |
| --- | --- | --- | --- | --- |
| 1.3.16 | run `37140990679`（head `3a69421e5f`） | failure（`RelationshipGraph.performance.browser.tsx` 帧时间 p95 `116.7` / `133.3` 超预算） | **failure**（同一测试） | 该 run 报废，**重派新 run** `37142453767`（attempt 1）才通过 |
| 1.3.19 | run `37217338528` | success | — | 一次通过 |
| 1.3.20 | run `37395647387` | success | — | 一次通过 |
| 1.3.21 | run `37470488648`（head `58b27a83c4`） | failure（`AssertionError: expected 116.7 to be less than 105`） | success | attempt 2 通过 |
| **1.3.22** | run `37563552549`（head `f405b2e1e6`） | **success** | — | 一次通过（零重跑） |

统计与判读（只陈述可核验事实）：五次采样中 3 次 attempt 1 通过（1.3.19 / 1.3.20 / 1.3.22）、2 次抖动（1.3.16 / 1.3.21），两次失败的失败 step 都是 `Run renderer browser tests`，失败数值都是 `116.7`（断言上限 105）。样本量只有 5，且抖动是间歇性的，**不足以判定"已稳定"或"必然复发"**；本轮干净通过是一个新数据点，不推翻此前两次失败的记录，也不构成对阈值或 runner 的处置结论。本地同套件（47 文件 / 267 用例）全绿。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37565028245`，attempt 1、success（本机回读 Actions API 确认），`head_sha` = `f405b2e1e6…`；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.22`（id `405335377`），非 draft、非 prerelease；`target_commitish` = `f405b2e1e64b28c0772fbc26aeba66683579f671`；发布时间 2026-10-07T03:08:17Z |
| Release body | 由 CHANGELOG 的 1.3.22 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.22` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续四次一次通过）

| 版本 | promotion 结果 | 说明 |
| --- | --- | --- |
| 1.3.18 | 首次 run `37214225255` = failure（`qualification artifact name mismatch`），修正后 `37214508284` = success | 取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics` 而非 `qualified-windows`） |
| 1.3.19 | run `37218555871`，attempt 1 success | 发布侧改为按 `qualified-*` 名精确筛选 |
| 1.3.20 | run `37397404495`，attempt 1 success | 沿用同一取值方式 |
| 1.3.21 | run `37473937227`，attempt 1 success | 沿用同一取值方式 |
| 1.3.22 | run `37565028245`，attempt 1 success | 沿用同一取值方式 |

可核验的边界（沿用前三版收据的口径，避免把"操作层的取值修正"误记成"仓库里的代码修复"）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。四次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.22.exe` | 223,543,724 | `a4868b1af892b25657fbce5a72bd473ef9e8af726e75d00a1091b075edf88279` |
| `inkweaver-setup-1.3.22.exe.blockmap` | 232,802 | `8783b8bae0d394fc47a6646c028fde7d2139740811cd3891ec68976e7f8819bc` |
| `latest.yml` | 350 | `5bf086a0010caafdae1d8c0fccc871119750e97b84937492974535fd237fa3e8` |
| `inkweaver-mac-arm64-1.3.22-installer.dmg` | 302,002,506 | `aa25ac66e7127f75beeacb310f5058b2a10e98db3427b5fb7d77129d8e9515a5` |
| `inkweaver-mac-arm64-1.3.22-installer.dmg.sha256` | 107 | `179c55cb2e3a5cc810dc7637cb8f6a882ed5667e644c61d615fcc409b91f0cb9` |
| `inkweaver-mac-x64-1.3.22-installer.dmg` | 311,903,398 | `25e2a80cce34fa34da5d32d853195a359911b5039c5fc583de9a0bf3fbae8cb3` |
| `inkweaver-mac-x64-1.3.22-installer.dmg.sha256` | 105 | `a43cf5a73880809cb36c813d80495ce2111de125928f870d428ef50adbff9043` |
| `inkweaver-linux-x64-1.3.22.AppImage` | 502,242,509 | `d11f84a7c93cb8a49be6d0fc7f61c80046d77373b0c7befde6e2aabb42d45852` |
| `inkweaver-linux-x64-1.3.22.AppImage.sha256` | 102 | `41a12335a7bdfb85496f34745cc20b65d59e489059f034d92d6f89cd245514b7` |
| `inkweaver-linux-x64-1.3.22.deb` | 354,479,208 | `817773d5d8fda96e79c09ae7a7022f54cdf45db9ec9a8f6b510f4ec044c7007e` |
| `inkweaver-linux-x64-1.3.22.deb.sha256` | 97 | `a508888bbb2c014441c41613690867c2b349832303d5d274e3faefdf7400d442` |
| `inkweaver-linux-x64-1.3.22.rpm` | 298,319,353 | `3a820212c01ebda3a6883ec2e1bf8e7f8a42f69cd87eb4e49bdce21c8a3ad053` |
| `inkweaver-linux-x64-1.3.22.rpm.sha256` | 97 | `7b73df9e18fed7c62de7aac2ee8583d807ad3ebfc59149ec14a06399d449aa33` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.22`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.22 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 / 1.3.17 / 1.3.18 / 1.3.19 / 1.3.20 / 1.3.21 六次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `5bf086a0010caafdae1d8c0fccc871119750e97b84937492974535fd237fa3e8` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.22`、`path/url: inkweaver-setup-1.3.22.exe`、`size: 223543724`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-07T02:56:20.600Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.22.exe` 资产 size（223,543,724）数值一致。

**未验证项（残留风险，与前六版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮两条交付线：

- **A（修复）**：助手确认卡片不再"点了没反应"。此前有两种哑状态——变更计划校验未通过时「批准执行」被静默禁用（无任何解释）；确认已失效（生成超时或被取消后等待回调已被清理）时卡片仍留在界面上、三个按钮点击毫无反应。现在：卡片区分"正在校验"与"校验未通过（附具体原因）"；失效时整张卡显示为过期态、按钮禁用并说明原因；校验未通过时另提供「请助手修正此计划」，先按拒绝结算悬挂 Promise，等循环空闲后把错误回注为新回合供助手重新提交。
- **B（新增）**：助手可读取创作状态（此前只能读设定）。新增 6 个只读工具：`read_reviews`（审稿意见）、`read_narrative_threads`（叙事线索与伏笔）、`read_chapter_handoff`（章节交接）、`read_knowledge_events`（知情边界）、`read_story_continuity`（连续性工作单）、`read_revision_proposals`（修订提案）。默认只返回作者已确认的记录（候选需显式请求、逐条标注且不混排）；长列表截断并给出余量；空项目返回可读空状态。只读工具 11 → 17（工具总数 23）。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 359 文件 / 2,755 用例，0 失败（8 skipped 为既有跳过项） |
| 浏览器套件 | 47 文件 / 267 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| 确认卡片浏览器用例 | 新增 3 条（校验失败→批准禁用且可见原因；pending 清空→过期态 + 三按钮禁用；点「请助手修正此计划」→会话收到含具体错误与 `propose_change_plan` 的用户消息），既有 6 条按新语义调整后共 9 条通过 |
| 只读工具用例 | 新增 15 条（注册 + 6 个空项目参数化 + 2 个枚举校验 + 6 个正常路径） |
| agent / store 域回归 | 16 文件 / 102 通过 |

上表用于说明两条交付线的验收覆盖面；它不构成对文学质量、检索精度或第三方 provider 行为的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.21` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.21 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.21.md`：1.3.21 历史收据（34 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.21 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.21 收据中的扫描边界说明不适用于 1.3.22。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），四次连续成功仍依赖发布侧取值正确。
- macOS x64 runner 的渲染进程性能断言在五次采样中出现过两次间歇失败（见`macOS x64 runner 抖动`）；本轮干净通过，但样本不足以判定趋势。

## 1.3.22 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.22 小节）

- 新增：AI 写作助手现在能读取创作状态（审稿意见、叙事线索与伏笔、章节交接、知情边界、连续性工作单、修订提案共 6 个只读工具），默认只返回作者已确认的记录，候选需显式要求并逐条标注；只读工具总数由 11 增至 17。
- 修复：助手确认卡片的两种哑状态——校验未通过时给出具体原因，确认失效时整张卡显示为已失效并禁用按钮；校验未通过时另提供「请助手修正此计划」，把错误回注给同一会话。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.22`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.22`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.22` → `git/tags/31fcf068…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run、promotion run，以及 macOS x64 的历次 attempt 对照）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
