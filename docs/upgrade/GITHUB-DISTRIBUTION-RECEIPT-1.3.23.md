# 1.3.23 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T04:07:00Z，本机核验时刻 2026-10-07T12:10 HKT）

这是 1.3.23 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前七版一致（含 Actions 运行自证与失败 step 深读）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `26f495a0d0becd5780fc97fc6b5b7b2960573c78` |
| 提交 | `15ec5cb feat(agent): let the assistant propose draft revisions, and stop it from announcing without calling`（11 files, +896/−5） + `26f495a chore(release): prepare v1.3.23` |
| tag | `v1.3.23`（annotated）；tag 对象 `d7771bd5335541b1edb6c12e03e2c08845ac65b2`（type=tag，tagger `shuishuipingan`，2026-10-07T03:33:21Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.23` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-53 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-53 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

## 平台资格（全部绑定 SHA `26f495a0…`）

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37567300369`，attempt 1 | `qualified-windows` = `11460140604` | success |
| macOS arm64 | run `37567304470`，attempt 1 | `qualified-macos-arm64` = `11458998532` | success |
| macOS x64 | run `37567309253`，**attempt 2** | `qualified-macos-x64` = `11460156793` | success（attempt 1 失败后重跑，见下） |
| Linux x64 | run `37567313906`，attempt 1 | `qualified-linux-x64` = `11459367582` | success |

四个 run 的 `head_sha` 均为 `26f495a0d0…`（同一冻结提交，重跑未换代码）。本机回读确认 `37567309253` 的 attempt 1 结论为 `failure`、失败 step 为 job `package-and-qualify` 的 `Run renderer browser tests`，attempt 2 无失败 step。

## macOS x64 runner 抖动：跨版本对照（第 6 次采样）

| 版本 | 运行 | attempt 1 | attempt 2 | 最终结果 |
| --- | --- | --- | --- | --- |
| 1.3.16 | run `37140990679`（head `3a69421e5f`） | failure（`RelationshipGraph.performance.browser.tsx` 帧时间 p95 `116.7` / `133.3` 超预算） | **failure**（同一测试） | 该 run 报废，**重派新 run** `37142453767`（attempt 1）才通过 |
| 1.3.19 | run `37217338528` | success | — | 一次通过 |
| 1.3.20 | run `37395647387` | success | — | 一次通过 |
| 1.3.21 | run `37470488648`（head `58b27a83c4`） | failure（`AssertionError: expected 116.7 to be less than 105`） | success | attempt 2 通过 |
| 1.3.22 | run `37563552549`（head `f405b2e1e6`） | success | — | 一次通过（零重跑） |
| **1.3.23** | run `37567309253`（head `26f495a0d0`） | **failure**（`AssertionError: expected 116.6 to be less than 105`） | success | attempt 2 通过 |

统计与判读（只陈述可核验事实）：六次采样中 3 次 attempt 1 通过（1.3.19 / 1.3.20 / 1.3.22）、3 次抖动（1.3.16 / 1.3.21 / 1.3.23，即**第三次抖动**）。三次失败的失败 step 都是 `Run renderer browser tests`，失败数值分别是 `116.7` / `116.7` / `116.6`，断言上限 105。

**重跑代价（累计）**：按 attempt 计数，1.3.16 净增 3 次额外 attempt 运行（同一 run 的两个 attempt 都失败，再重派新 run 的 attempt 1 才通过）、1.3.21 净增 1 次、1.3.23 净增 1 次，合计 **5 次额外 attempt 运行**；每次 macOS x64 资格运行都包含完整打包与渲染进程浏览器套件，因此代价不只是排队时间。

### 根因与处置（截至本收据写作时，可核验）

本节只记录本机可直接核验的仓储事实，不预判修复效果。

- 根因定位（可核验来源：工作树中新增的 `src/components/editor/__tests__/relationship-graph-performance-budget.ts` 头部注释）：该用例的帧预算由"先测环境自身 rAF 时钟、再按比例给布局预算"推导；旧系数 `1.25` 在慢环境（环境帧 p95 ≈ 84ms，≈12fps）下只给出 `105ms`，而该 runner 上的布局实测为 `116.6~116.7ms`，三次失败的实测比率（布局 p95 ÷ 环境帧 p95）都约 **1.39** —— 线性系数在慢机上不够。
- 处置方向：把环境归一化系数由 `1.25` 调整为 `1.5`（`ENVIRONMENT_FRAME_BUDGET_FACTOR = 1.5`），33ms 下限保持不变；按该模块的注释，快机（环境帧 p95 ≈ 16ms）时预算本由 33ms 下限主导，系数调整对正常环境无影响。
- 判别力证据：同目录新增测试断言旧系数预算恰为 `105` 且小于 `116.7`，新预算大于 `116.7`（`relationship-graph-performance-budget.test.ts`）。
- 状态：相关改动在工作树中**尚未提交**（`git status`：`RelationshipGraph.performance.browser.tsx` 为已修改，两个 `relationship-graph-performance-budget*` 文件为未跟踪），因此**不属于 v1.3.23 的冻结内容**（本轮 `15ec5cb` 只改动 agent 相关的 11 个文件）。该处置的效果需要后续版本的采样来验证；本收据不把它计为已交付。

本地同套件（48 文件 / 271 用例）全绿。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37569607418`，attempt 1、success（本机回读 Actions API 确认），`head_sha` = `26f495a0d0…`；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.23`（id `405367091`），非 draft、非 prerelease；`target_commitish` = `26f495a0d0becd5780fc97fc6b5b7b2960573c78`；发布时间 2026-10-07T04:07:00Z |
| Release body | 由 CHANGELOG 的 1.3.23 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.23` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续五次一次通过）

| 版本 | promotion 结果 | 说明 |
| --- | --- | --- |
| 1.3.18 | 首次 run `37214225255` = failure（`qualification artifact name mismatch`），修正后 `37214508284` = success | 取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics` 而非 `qualified-windows`） |
| 1.3.19 | run `37218555871`，attempt 1 success | 发布侧改为按 `qualified-*` 名精确筛选 |
| 1.3.20 | run `37397404495`，attempt 1 success | 沿用同一取值方式 |
| 1.3.21 | run `37473937227`，attempt 1 success | 沿用同一取值方式 |
| 1.3.22 | run `37565028245`，attempt 1 success | 沿用同一取值方式 |
| 1.3.23 | run `37569607418`，attempt 1 success | 沿用同一取值方式 |

可核验的边界（沿用前四版收据的口径）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。五次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.23.exe` | 223,545,760 | `c396ab6a028da60aacd9724c9dee9915e334bd502964c4e4c11097dfb59251eb` |
| `inkweaver-setup-1.3.23.exe.blockmap` | 233,058 | `8df093949b2af6b98e547d40366152b8a8498ca40744de541dd0b8604a5e1523` |
| `latest.yml` | 350 | `37b176ab1ea0f007a556b1b94e7161604b66794b871c7bc7eaac80ce157e3883` |
| `inkweaver-mac-arm64-1.3.23-installer.dmg` | 302,027,144 | `d53ca789a88eeb46b73ba046fbc12c01736e47dd5c2515664e8530f433d44f38` |
| `inkweaver-mac-arm64-1.3.23-installer.dmg.sha256` | 107 | `6b21ae2be8febe74a1efc1cf4cc7f6dbc0edea09097f7fbfdb64ebe0e29b2afb` |
| `inkweaver-mac-x64-1.3.23-installer.dmg` | 311,908,223 | `70859e17597c504de71fd15674d7bc6782981f7978b50b2e6da7cf9f656db40b` |
| `inkweaver-mac-x64-1.3.23-installer.dmg.sha256` | 105 | `32b3a2a60c698d53291d2aac3184db3023f21d830035e8660a464f46ea33b859` |
| `inkweaver-linux-x64-1.3.23.AppImage` | 502,268,573 | `ffec426153925a0651af9d5874584e570f4e92d206248d0142f0d4a323df2e3c` |
| `inkweaver-linux-x64-1.3.23.AppImage.sha256` | 102 | `b32d7871b21188cd7d3f64b3814929189a2711d150d42a143ba45cbdf92c41c8` |
| `inkweaver-linux-x64-1.3.23.deb` | 354,487,912 | `0b4c611326795ddcbe3d68ac1862c3a31c8bda878856f309ecb74908548a677a` |
| `inkweaver-linux-x64-1.3.23.deb.sha256` | 97 | `4af768bb4910caed9eacbd2e66a5249e2e42c8cc2c2bf600e2b4403f3cdf247e` |
| `inkweaver-linux-x64-1.3.23.rpm` | 298,290,773 | `aa8bc4e41cda89664abc6a619680ba18140fbd8ec0e5afb1222b5dec94ebfe70` |
| `inkweaver-linux-x64-1.3.23.rpm.sha256` | 97 | `4e3841d1c48f8a3ed4fa18dacccbe04b0c95d4b42b565258885365a2c641a5a8` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.23`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.23 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 起连续七次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `37b176ab1ea0f007a556b1b94e7161604b66794b871c7bc7eaac80ce157e3883` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.23`、`path/url: inkweaver-setup-1.3.23.exe`、`size: 223545760`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-07T03:44:26.095Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.23.exe` 资产 size（223,545,760）数值一致。

**未验证项（残留风险，与前七版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮两条交付线：

- **A（新增）**：助手可提案修改正文（`propose_draft_revision`）。助手按作者要求给出修订后的完整正文并以**提案**提交（绑定基准正文指纹以防覆盖），确认卡片直接渲染**逐行差异**（新增/删除标记、未改动段折叠、字数前后对比与增减）；批准后仍由作者在既有修订界面完成合并，助手不直接改写或覆盖正文。此前作者说"帮我把这段改紧凑些"只能启动整套修稿工作流。
- **B（修复）**：助手"说了要改却什么都没发生"。根因不在界面（确认卡片只要被调用就必然出现），而在工具提示词从未说明"仅在正文里说明要做什么不会执行任何操作，只有真的写出调用标签才会运行"；现已补上该硬规则与正反示例，并要求宣布之后必须在同一条回复内给出调用标签，不再分两步。同一缺陷覆盖所有写入型工具。另补**工具调用台账**日志（记录本轮调用了哪些工具及各结果，只记参数名不记正文）。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 362 文件 / 2,771 用例，0 失败（8 skipped 为既有跳过项） |
| 浏览器套件 | 48 文件 / 271 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| 改稿能力单测 | 8 条（含"调用参数里 `baseContentHash === textFingerprint(...)` 且 `wordCount === countDraftUnits(...)`"的硬断言） |
| 改稿预览浏览器测试 | 4 条（增删标记 + 统计、相同内容提示、loading、stale） |
| 提示词契约 | 5 条（新规则语义、规则 8 收紧、正反示例、既有 7 条规则逐字仍在、工具清单标签仍在） |
| 调用台账 | 3 条（结束日志 `toolNames`/`toolOutcomes` 精确等于调用序列、被拒记为 failed、参数正文不入日志） |

上表用于说明两条交付线的验收覆盖面；它不构成对文学质量、检索精度、第三方 provider 行为或真实模型输出质量的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.22` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.22 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.22.md`：1.3.22 历史收据（33 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.22 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.22 收据中的扫描边界说明不适用于 1.3.23。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），五次连续成功仍依赖发布侧取值正确。
- macOS x64 runner 的渲染进程性能断言在六次采样中出现过三次间歇失败（见`macOS x64 runner 抖动`），累计净增 5 次额外 attempt；根因处置（系数 1.25 → 1.5）在工作树中尚未提交，效果待后续版本采样验证。

## 1.3.23 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.23 小节）

- 新增：助手可以提案修改正文（`propose_draft_revision`）——以提案形式提交修订后的完整正文，确认卡片直接给出逐行差异预览（新增/删除标记、未改动段折叠、字数前后对比与增减），提案绑定基准正文指纹防覆盖；批准后仍由作者在既有修订界面完成合并。
- 修复：助手"说了要改却什么都没发生"——补齐"仅说明不执行、必须写出调用标签"的硬规则与正反示例，并新增工具调用台账日志（只记参数名不记正文）。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.23`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.23`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.23` → `git/tags/d7771bd5…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run、promotion run，以及 macOS x64 的历次 attempt 对照）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `git show --stat 15ec5cb` 与 `src/components/editor/__tests__/relationship-graph-performance-budget.ts`（根因处置的可核验来源）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
