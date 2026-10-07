# 1.3.24 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T04:57:30Z，本机核验时刻 2026-10-07T12:58 HKT）

这是 1.3.24 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前八版一致（含 Actions 运行自证与失败 step 深读），并额外记录抖动修复后的首次采样。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `668fa8612323e630ef61866c21bf955baa48f876` |
| 提交 | `135daee feat(agent): search the project prose, not just the reference library`（9 files, +657/−4） + `668fa86 chore(release): prepare v1.3.24` |
| tag | `v1.3.24`（annotated）；tag 对象 `699ea50cef7256a64dd20dbdbe0e78f9eeb4848b`（type=tag，tagger `shuishuipingan`，2026-10-07T04:32:11Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.24` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-59 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-59 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

## 平台资格（全部绑定 SHA `668fa861…`）

四个平台**全部 attempt 1 一次通过，零重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37571938425`，attempt 1 | `qualified-windows` = `11461573158` | success |
| macOS arm64 | run `37571943495`，attempt 1 | `qualified-macos-arm64` = `11461745866` | success |
| macOS x64 | run `37571952992`，attempt 1 | `qualified-macos-x64` = `11461487287` | success |
| Linux x64 | run `37571961370`，attempt 1 | `qualified-linux-x64` = `11461319270` | success |

四个 run 的 `head_sha` 均为 `668fa86123…`（同一冻结提交）。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`、无失败 step（本机回读确认，不是"重跑后成功"）。

## macOS x64 runner 抖动：跨版本对照（第 7 次采样，含修复后首次采样）

| 版本 | 运行 | attempt 1 | attempt 2 | 最终结果 |
| --- | --- | --- | --- | --- |
| 1.3.16 | run `37140990679`（head `3a69421e5f`） | failure（`RelationshipGraph.performance.browser.tsx` 帧时间 p95 `116.7` / `133.3` 超预算） | **failure**（同一测试） | 该 run 报废，**重派新 run** `37142453767`（attempt 1）才通过 |
| 1.3.19 | run `37217338528` | success | — | 一次通过 |
| 1.3.20 | run `37395647387` | success | — | 一次通过 |
| 1.3.21 | run `37470488648`（head `58b27a83c4`） | failure（`expected 116.7 to be less than 105`） | success | attempt 2 通过 |
| 1.3.22 | run `37563552549`（head `f405b2e1e6`） | success | — | 一次通过（零重跑） |
| 1.3.23 | run `37567309253`（head `26f495a0d0`） | failure（`expected 116.6 to be less than 105`） | success | attempt 2 通过 |
| **1.3.24** | run `37571952992`（head `668fa86123`） | **success** | — | 一次通过（零重跑）—— **修复后首次采样** |

**统计判读（严格按样本说话）**：七次采样中 4 次 attempt 1 通过（1.3.19 / 1.3.20 / 1.3.22 / 1.3.24）、3 次抖动（1.3.16 / 1.3.21 / 1.3.23，失败数值 116.7 / 116.7 / 116.6，上限 105）。三次失败全部发生在帧预算修复（见下）之前。

**修复后首次采样结论：本轮通过，但样本量为 1，不足以判定修复生效。** 理由是修复前同样存在连续通过的情形（1.3.19 与 1.3.20 连续两次通过、1.3.22 通过），因此"1.3.24 通过"这一观测与"未修复时也会通过"无法区分。要判定修复是否改变通过率，需要在修复后的代码线上继续累积采样；本收据不写"问题已解决"，也不撤回此前三次失败的记录。

### 帧预算修复的落地状态（可核验）

- 提交：`874dbad test(editor): scale the graph frame budget by a slower runner`，含 3 个文件（`RelationshipGraph.performance.browser.tsx` 改、`relationship-graph-performance-budget.ts` 新增、`relationship-graph-performance-budget.test.ts` 新增，+85/−12）。
- 是否在 v1.3.24 冻结内容内：**是**。本机以 `git merge-base --is-ancestor 874dbad 668fa8612323e630ef61866c21bf955baa48f876` 验证，退出码 `0`（该提交是 v1.3.24 冻结 SHA 的祖先）。¹
- 修复内容（依据该模块注释与测试）：环境归一化系数 `1.25` → `1.5`；三次失败的实测比率（布局 p95 ÷ 环境帧 p95）都约 `1.39`（环境帧 p95 ≈ 84ms × 1.25 = 105ms，装不下 116.6~116.7ms）；33ms 下限不变，快机（环境帧 p95 ≈ 16ms）时预算本由下限主导，故系数调整对正常环境无影响。判别力测试断言旧预算恰为 `105`、新预算大于 `116.7`。

¹ 1.3.23 收据把该修复记为"工作树中尚未提交"，那是当时工作树的真实状态（`git status` 显示 M/??）；该提交随后落地，本条予以更新，不修改历史收据。

本地同套件（48 文件 / 271 用例）全绿。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37573450129`，attempt 1、success（本机回读 Actions API 确认），`head_sha` = `668fa86123…`；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.24`（id `405392339`），非 draft、非 prerelease；`target_commitish` = `668fa8612323e630ef61866c21bf955baa48f876`；发布时间 2026-10-07T04:57:30Z |
| Release body | 由 CHANGELOG 的 1.3.24 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.24` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续六次一次通过）

| 版本 | promotion 结果 | 说明 |
| --- | --- | --- |
| 1.3.18 | 首次 run `37214225255` = failure（`qualification artifact name mismatch`），修正后 `37214508284` = success | 取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics` 而非 `qualified-windows`） |
| 1.3.19 | run `37218555871`，attempt 1 success | 发布侧改为按 `qualified-*` 名精确筛选 |
| 1.3.20 | run `37397404495`，attempt 1 success | 沿用同一取值方式 |
| 1.3.21 | run `37473937227`，attempt 1 success | 沿用同一取值方式 |
| 1.3.22 | run `37565028245`，attempt 1 success | 沿用同一取值方式 |
| 1.3.23 | run `37569607418`，attempt 1 success | 沿用同一取值方式 |
| 1.3.24 | run `37573450129`，attempt 1 success | 沿用同一取值方式 |

可核验的边界（沿用前五版收据的口径）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。六次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.24.exe` | 223,547,506 | `babec52e26c9b45e98715f1466b1e312b65ddb99bbb14e455348c44d96ce7cae` |
| `inkweaver-setup-1.3.24.exe.blockmap` | 233,760 | `6ae76bef28486b61dba09c2e2686749bb34fac0663986b4cfe6c523e427beabb` |
| `latest.yml` | 350 | `46e2eae5ac569e9db82deaafd2d35297bf0a3325bb6e407fdb11c6f63bbfc24a` |
| `inkweaver-mac-arm64-1.3.24-installer.dmg` | 302,021,550 | `d6c43f31bb79bbf78031d33a163e68b6b64b28be8055babadd77a7d213fbe94c` |
| `inkweaver-mac-arm64-1.3.24-installer.dmg.sha256` | 107 | `c2b4e406318c6bb44f1bf5b523f430ac1556f2fcbad6ba4a1fc86dba492b034b` |
| `inkweaver-mac-x64-1.3.24-installer.dmg` | 311,901,728 | `a082c44046039b3400a2e4d14cfb62c39967227846863cc5abb295f266450a4f` |
| `inkweaver-mac-x64-1.3.24-installer.dmg.sha256` | 105 | `c3b62e80cc3383ee86dc8e2da9e67f6589ebd3dba4bfd529b8d746176c3fddd1` |
| `inkweaver-linux-x64-1.3.24.AppImage` | 502,264,149 | `7d3f5fe37a2f9e0a944085bbea8a37ac59854e3e924e95c42d73b8e78c1b28c4` |
| `inkweaver-linux-x64-1.3.24.AppImage.sha256` | 102 | `8a3a9c03d93f4be41ee5f623095cb4493cdec2d512a6e88f9d0e56b8261c03cd` |
| `inkweaver-linux-x64-1.3.24.deb` | 354,489,492 | `69553a5211f166bf0bd21b0c7948d3ff5f1f4ba5f68bdb4ba206dddc539d5b9d` |
| `inkweaver-linux-x64-1.3.24.deb.sha256` | 97 | `4bc92ec8d8cb60b66d4dcde7c9cec8894feaf2d672ece3238e937b0ee6ff70df` |
| `inkweaver-linux-x64-1.3.24.rpm` | 298,324,049 | `41a3b15b11b88c059047ee5b9f5c02c9d19fc5b48ce266142f6cb77471c00f4c` |
| `inkweaver-linux-x64-1.3.24.rpm.sha256` | 97 | `c19ef916c519404eaa9a14defccb6a80701fe5202d9c2f307d5ba393774b3660` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.24`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.24 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 起连续八次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `46e2eae5ac569e9db82deaafd2d35297bf0a3325bb6e407fdb11c6f63bbfc24a` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.24`、`path/url: inkweaver-setup-1.3.24.exe`、`size: 223547506`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-07T04:43:13.525Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.24.exe` 资产 size（223,547,506）数值一致。

**未验证项（残留风险，与前八版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮一条交付线：

- **A（新增）**：助手可检索**自己作品的正文**（`search_project`）。此前助手只有"知识库检索"（搜作者导入的参考资料），项目正文（定稿与各版草稿）没有检索入口，"某件信物/某句设定在第几章出现过"实际答不了。现在按关键词检索正文，结果按章分组，给出匹配点前后约 60 字的片段、命中字标记、每版命中次数（多处时说明列出前 K 处）与总量统计，并保留章节号 / 版本 / 字数等完整出处；可限定只搜定稿或只搜草稿。**不返回整章正文，只返回片段**。实现走新增的主进程通道 `db:content-search`（参数化 LIKE + 通配符转义，无 FTS、无新依赖）。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 365 文件 / 2,795 用例，0 失败（8 skipped 为既有跳过项） |
| 浏览器套件 | 48 文件 / 271 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| 主进程通道新用例 | 10 条（真实 SQLite 内存库：契约六条 + 片段半径 + excerpts 上限 + 同章多版本排序；含"搜 `%` 只命中真正含 `%` 的章节"的通配符转义验证）；回归 32 文件 / 267 通过 |
| 助手工具新用例 | 9 条（注册与只读组计数、空/超长 query 不触达通道、scope 枚举拦截、透传与 limit 夹取、matchCount 与"前 K 处"并列、空结果可读、畸形命中不崩、highlight 边界）；agent 域回归 19 文件 / 126 通过 |
| 助手内置工具数 | 25 个（18 只读 + 7 需确认） |

上表用于说明本轮交付线的验收覆盖面；它不构成对文学质量、检索精度、第三方 provider 行为或真实模型输出质量的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.23` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.23 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.23.md`：1.3.23 历史收据（35 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.23 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.23 收据中的扫描边界说明不适用于 1.3.24。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），六次连续成功仍依赖发布侧取值正确。
- macOS x64 runner 的渲染进程性能断言在七次采样中出现过三次间歇失败（全部在帧预算修复之前）；修复后仅有一次采样且通过，**不足以判定修复生效**，需继续累积。

## 1.3.24 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.24 小节）

- 新增：助手可以检索自己作品的正文（`search_project`）——按关键词在正文里检索，结果按章节分组，逐条给出"第 N 章（定稿 / v3 草稿）＋ 匹配点前后约 60 字的片段"、命中字标记、每版命中总次数与总量统计，并保留章节号 / 版本 / 字数等出处；可限定只搜定稿或只搜草稿；只返回片段、不返回整章正文。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.24`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.24`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.24` → `git/tags/699ea50c…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run、promotion run，以及 macOS x64 的历次 attempt 对照）；
- `git merge-base --is-ancestor 874dbad 668fa861…`（修复是否在冻结内容内）；`git show --stat 874dbad`；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
