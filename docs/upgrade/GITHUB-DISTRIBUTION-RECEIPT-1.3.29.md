# 1.3.29 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T09:45:54Z，本机核验时刻约 2026-10-07T18:00 HKT）

这是 1.3.29 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。本版收据重点：**四重上限的完整数字对照**、**backlog 两条（本轮未做）**、以及**首次落进验证流程的 mtime 冻结校验**。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `9541ed789f528b5bb8730064ac280f8d062a6f93` |
| 提交 | `adb54d5 fix(workflows): let the whole outline generate in one run, and give relationships depth`（15 files, +1095/−86） + `9541ed7 chore(release): prepare v1.3.29` |
| tag | `v1.3.29`（annotated）；tag 对象 `1373a4aae4604ebfe05431f3495b1c2dffaae23c`（type=tag，tagger `shuishuipingan`，2026-10-07T09:22:02Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.29` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-87 本机执行；本版为首跑即全绿） |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-87 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `9541ed78…`）

四个平台**全部 attempt 1 一次通过，零重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37600125938`，attempt 1 | `qualified-windows` = `11473511562` | success |
| macOS arm64 | run `37600133611`，attempt 1 | `qualified-macos-arm64` = `11473135041` | success |
| macOS x64 | run `37600140773`，attempt 1 | `qualified-macos-x64` = `11473266005` | success |
| Linux x64 | run `37600148609`，attempt 1 | `qualified-linux-x64` = `11472778179` | success |

四个 run 的 `head_sha` 均为 `9541ed789f…`。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`、无失败 step（本机回读确认）。

## macOS x64 runner 抖动：跨版本对照（第 12 次采样，修复后 6/6）

| 版本 | attempt 1 | 最终结果 |
| --- | --- | --- |
| 1.3.16 | failure（p95 `116.7` / `133.3`） | 该 run 报废，重派新 run `37142453767` 才通过 |
| 1.3.19 | success | 一次通过 |
| 1.3.20 | success | 一次通过 |
| 1.3.21 | failure（`expected 116.7 < 105`） | attempt 2 通过 |
| 1.3.22 | success | 一次通过 |
| 1.3.23 | failure（`expected 116.6 < 105`） | attempt 2 通过 |
| 1.3.24 | success | 一次通过（修复后第 1 次） |
| 1.3.25 | success | 一次通过（修复后第 2 次） |
| 1.3.26 | success | 一次通过（修复后第 3 次） |
| 1.3.27 | success | 一次通过（修复后第 4 次） |
| 1.3.28 | success | 一次通过（修复后第 5 次） |
| **1.3.29** | **success**（run `37600140773`） | 一次通过（修复后第 6 次） |

十二次采样：9 次 attempt 1 通过、3 次抖动（116.7 / 116.7 / 116.6，上限 105），三次抖动全部在帧预算修复（`874dbad`）之前。修复后连续 **6/6** 通过；参照系仍为修复前 3/6 且最长连续 2 次。本收据继续只记录事实与参照，不宣布结论。

## 章节目录生成：四重上限的完整数字对照

用户报告的"一次生成全部章节失败"是**四重保守上限叠加**的结果，每一重都有独立数字；本轮全部拆除。

| # | 上限 | 旧值 | 新值 | 对 180 章的含义 |
| --- | --- | --- | --- | --- |
| ① | 每语义批次章数 | 5 章 | **12 章** | 语义批次 36 → 15 |
| ② | 单次请求输出预算 | 固定 16,384 tokens | **按批次推导 max(n×1200, 8192)**（12 章 = 14,400） | 不再"固定预算 + 模型提前停笔就原样重发直至耗尽" |
| ③ | 会话窗口 | **MIN = MAX = 10 分钟**（钉死） | **批数 × 2 × 150s，上限 90 分钟** | 180 章 = 75 分钟（旧值下即使全速也要 36 分钟，必然超时） |
| ④ | 应用级绝对墙 | **maxAttempts 32 / deadlineMs 60 分钟** | **maxAttempts 512 / deadlineMs 120 分钟** | 旧值下**连 50 章的单任务都会被 `createRuntime` 拒绝** |
| — | 单任务章数范围 | 50 章 | **240 章** | 180 章可一次生成；超过 240 章开工前给分次引导 |
| — | 物理调用上限（完整拆分树） | 32 | **376** | 见下方 backlog ① 的优化空间 |

**第四重是本轮新发现的夹点**，它的意义不只是数字：用户日志里那串"32 次尝试"有一部分**根本不是生成策略（policy）的问题**，而是被应用级绝对墙在运行时挡下——这条写在这里，供后续排查同类问题时先看绝对墙而不是先怀疑模型或提示词。此外，失败信息现在带章节进度（"已生成 X/Y 章，剩余 Z 章"），不再只有一句"超过会话截止时间"。

## 角色关系图谱：多面关系与势力维度

| 维度 | 旧行为 | 新行为 |
| --- | --- | --- |
| 每对角色 | 只有**一条** relation 字符串 | **2–4 条**不同维度关系（stance / emotion / dependency / knowledge / history），角色卡逐条可见、编辑保存往返不丢 |
| 势力 | 势力不进角色关系 | 每角色 **0–3 条**势力立场（`factionEdges`，带依据） |
| 校验 | 无 | 解析层强制查重（同 target / 同 kind 均拒绝且 path 精确到出错项）；生成时要求每条有依据、编不出就省略 |
| 旧数据 | — | **完全兼容**（有专门测试守护） |

## 验证流程新增：mtime 冻结校验

本轮全量验证首次加入 **mtime 冻结校验**（做法由墨斗提出）：跑前对关键文件做快照，跑后比对，确认结果基于**冻结快照**而不是并发修改的中间态——这在多人共用同一工作树的并行发布流程里，防的是"基于并发修改快照的假绿/假红"。

- 发布侧记录：7 个关键文件跑前快照、跑后**零漂移**。
- 本机复核（本收据作者独立做的同类校验）：对 7 个与本领域相关的文件——`package.json`、`.release/release-profile.json`、`scripts/verify-github-release-assets.mjs`、`scripts/verify-github-update-release.mjs`、`.github/workflows/cross-platform-runtime-artifact-promotion.yml`、`docs/quickstart/README.md`、`scripts/__tests__/release-version.test.ts`——记录 `mtimeMs + size`，随后跑两个验证脚本，再比对：**零漂移**。因此`更新链路回读`与资产回读的结论确实来自冻结快照。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37602285378**`，attempt 1、success（本机独立交叉核对：位于 promotion workflow 最近运行列表首位，`head_sha` = `9541ed789f…`，与发布侧提供的一致） |
| Release | `v1.3.29`（id `405608728`），非 draft、非 prerelease；`target_commitish` = `9541ed789f528b5bb8730064ac280f8d062a6f93`；发布时间 2026-10-07T09:45:54Z |
| Release body | 由 CHANGELOG 的 1.3.29 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.29` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续十一次一次通过）

1.3.18 的 promotion 首次运行因取值脚本取了列表第一个 artifact 而报 `qualification artifact name mismatch`；自 1.3.19 起按 `qualified-*` 名精确筛选，直到本轮共十一次 attempt 1 success（37218555871 / 37397404495 / 37473937227 / 37565028245 / 37569607418 / 37573450129 / 37576477061 / 37579728622 / 37584341816 / 37590448119 / 37602285378）。

可核验的边界：仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（最后改动仍是 `0e9fb74`）。十一次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.29.exe` | 223,555,523 | `67cc9c211492dab2eef45e1bf7f52b6c1fb42649a0abea3727b685e5dd54a5c2` |
| `inkweaver-setup-1.3.29.exe.blockmap` | 233,708 | `049b0c06754519298f0cdad549dca2692aaaab27d16e63885f50f36c6ee09f86` |
| `latest.yml` | 350 | `b629c102a1b33bd6c24c2e2c2c679a7c5d67600a8d0261da342079f1308e2ab1` |
| `inkweaver-mac-arm64-1.3.29-installer.dmg` | 302,044,112 | `a5c1f92300104341678264824cd9816a8354f3911a4eff5006f7bb049c23f1e6` |
| `inkweaver-mac-arm64-1.3.29-installer.dmg.sha256` | 107 | `b6df11eec475a8162fb1bfff6b667c68e7c4ba42dfbbf273d1de8dbdd40bf44e` |
| `inkweaver-mac-x64-1.3.29-installer.dmg` | 311,958,610 | `73c206a7eff47351d76319db3761ec513cf7f9343b910bea87a440bf4552bdbb` |
| `inkweaver-mac-x64-1.3.29-installer.dmg.sha256` | 105 | `125e138026d010d03ecbe7577fddb63deeff57c2432c2629f0dd0c2cdb9f5451` |
| `inkweaver-linux-x64-1.3.29.AppImage` | 502,284,994 | `87721f5f5f1f64c6879ec0dca9c3a539cecd248e78f27a153d97b484ed4e8389` |
| `inkweaver-linux-x64-1.3.29.AppImage.sha256` | 102 | `71d84daf354539de8cb187465c086e3b57513c3ac4237c0be72aae732a2a9f51` |
| `inkweaver-linux-x64-1.3.29.deb` | 354,504,928 | `720af0aab8a197c7e0a319fac59f9cb0bd8620b6076f2a85e04f4548bda8064c` |
| `inkweaver-linux-x64-1.3.29.deb.sha256` | 97 | `528ac44dbca3fe12f350b95bffe1e3be4d7b910dedfe86c14f12c4a129e168c7` |
| `inkweaver-linux-x64-1.3.29.rpm` | 298,303,641 | `490760a99deccc2cad79278bfd7f71cd291b02e6ccfd028e09bbd6f201c74683` |
| `inkweaver-linux-x64-1.3.29.rpm.sha256` | 97 | `5ebdabf6236e882b294a561b053d404d6835082b57c91663dc18bc2e6f96ca07` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.29`
- 原因同前十二版：该脚本需要本机已验证的 Windows 构建产物作为比对基准，而本机不构建官方安装包（`docs/adr/0006`）。失败点是"本地产物缺失"，未进入网络比对阶段。
- 本节的结论已通过上述 **mtime 冻结校验**（跑前跑后零漂移）。

代偿回读（本机执行）：远端 `latest.yml`（350 bytes，HTTP 200）SHA-256 `b629c102a1b33bd6c24c2e2c2c679a7c5d67600a8d0261da342079f1308e2ab1` 与 GitHub 资产 digest 完全一致；其声明的 `size: 223555523` 与远端 `inkweaver-setup-1.3.29.exe` 资产 size 一致；`version: 1.3.29`、`releaseDate: 2026-10-07T09:33:28.012Z`。

**未验证项（残留风险，与前十二版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），该比对目前在 CI 的 `windows-in-app-update-e2e` 中执行。

## 用户可见变更与验收

两条修复线见前两节。以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 381 文件 / 2,876 用例；其中 **3 个失败为已知 flaky（`smoke-win-verify` + `smoke-win-installer`）**，隔离复跑 86/86 全绿，证明与本轮改动无关 |
| 浏览器套件 | 53 文件 / 283 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| mtime 冻结校验 | 7 个关键文件跑前快照、跑后零漂移（见`验证流程新增`） |

上表用于说明本轮修复的验收覆盖面；它不构成对文学质量、第三方 provider 行为或真实模型输出质量的结论。注意第一行是"381 文件 / 2,876 用例、其中 3 个失败为已知 flaky"，不是"0 失败"——本收据不做这种压缩。

## backlog（本轮未做，如实记录）

1. **缺失清单续写**：executor 在遇到缺项时，先在同一批内续写、再决定是否拆分——这是效率优化，能把 180 章的物理调用从约 376 次降到约 30 次；因为需要改 executor 的判定顺序，**本轮未做**，另开卡处理。
2. **`factionEdges` 的 UI 展示**：势力立场数据已生成并写入，但界面尚未展示它；因为需要改 electron 仓库的形状（数据结构），**本轮未做**。

两条都不是缺陷隐瞒：它们是从本轮工作中发现的后续机会，记录在此以免被当作已完成。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.28` 命中两处，均为历史记录：`CHANGELOG.md`（4 处）与 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.28.md`（30 处）。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.28 残留。

## 已知限制

- backlog 两条（缺失清单续写、`factionEdges` UI）**本轮未做**，见上节。
- DSH 插件沿用 `1.2.0`，不随本轮发布。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描。
- 本机更新链路回读未通过（原因见其小节），残留风险同上。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（十一次连续成功依赖发布侧取值正确）。
- macOS x64 runner：十二次采样中 3 次间歇失败（全在帧预算修复前），修复后 6/6；仍不宣布"已修复"结论。
- 全量 node 套件存在 3 个已知 flaky 用例（`smoke-win-verify` / `smoke-win-installer`），本轮以隔离复跑 86/86 全绿佐证其与本轮无关；该 flaky 本身仍待治理。

## 1.3.29 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.29 小节）

- 章节目录生成一次可覆盖全书：每批 12 章、输出预算按批次推导、会话窗口按批数伸缩、应用级上限提升到 512 次调用与 240 章单任务；180 章可一次生成，超过 240 章开工前给分次引导；失败信息带章节进度。
- 角色关系图谱支持多面关系（每对角色 2–4 条维度）与势力立场（每角色 0–3 条，带依据）；解析层强制查重；旧项目数据完全兼容。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.29`（本机，exit 0，13 项资产契约）；
- `GET …/releases/tags/v1.3.29`、`GET …/git/ref/tags/v1.3.29` → `git/tags/1373a4aa…`（tag 与 peel）；
- `GET …/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run 与 macOS x64 历次 attempt）；
- `GET …/actions/workflows` → promotion workflow → `/runs`（本轮 promotion 独立交叉核对）；
- mtime 冻结校验：对 7 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对（本机零漂移）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
