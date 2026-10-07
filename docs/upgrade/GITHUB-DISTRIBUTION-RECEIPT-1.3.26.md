# 1.3.26 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T06:10:44Z，本机核验时刻 2026-10-07T14:12 HKT）

这是 1.3.26 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前十版一致（含 Actions 运行自证与失败 step 深读），并记录抖动修复后的第三次采样。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `3fe019da3af2a96cb7aa83219a66387ee6fb3de1` |
| 提交 | `062fa21 docs(release): record the v1.3.25 distribution receipt` + `7e955b3 feat(agent): let the assistant create characters in bulk`（11 files, +810/−8） + `3fe019d chore(release): prepare v1.3.26` |
| tag | `v1.3.26`（annotated）；tag 对象 `29df89c8cc0aa5bf3c36d9e49890058a8248a787`（type=tag，tagger `shuishuipingan`，2026-10-07T05:47:12Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.26` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-67 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-67 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

**关于 1.3.25 收据的提交**：上一版的 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.25.md`（156 行）由 `062fa21` 随本轮功能与版本一起推送；本机核对 `git show --stat 062fa21` 为 1 file changed（+156），且它位于 `15bc011`（v1.3.25 版本提交）之后、`7e955b3` 之前，即 v1.3.26 冻结 SHA 的祖先链上。因此 v1.3.26 的代码线同时包含 1.3.25 的收据与 1.3.26 的功能提交。

## 平台资格（全部绑定 SHA `3fe019da…`）

四个平台**全部 attempt 1 一次通过，零重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37578055877`，attempt 1 | `qualified-windows` = `11463573930` | success |
| macOS arm64 | run `37578061370`，attempt 1 | `qualified-macos-arm64` = `11463567401` | success |
| macOS x64 | run `37578067210`，attempt 1 | `qualified-macos-x64` = `11464006319` | success |
| Linux x64 | run `37578074475`，attempt 1 | `qualified-linux-x64` = `11463634105` | success |

四个 run 的 `head_sha` 均为 `3fe019da3a…`。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`、无失败 step（本机回读确认）。

## macOS x64 runner 抖动：跨版本对照（第 9 次采样，修复后 3/3）

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
| **1.3.26** | run `37578067210`（head `3fe019da3a`） | **success** | — | 一次通过（修复后第 3 次） |

**统计判读（严格按样本说话）**：九次采样中 6 次 attempt 1 通过、3 次抖动（116.7 / 116.7 / 116.6，上限 105），三次抖动全部发生在帧预算修复（`874dbad`，系数 1.25 → 1.5）之前。

**修复后的记录：3/3 通过（1.3.24 / 1.3.25 / 1.3.26）。** 仍不足以判定修复生效——但参照系比上一版更有意义了：

- 修复前：6 次采样中 3 次通过（1.3.19 / 1.3.20 / 1.3.22），通过率 3/6；两次连续通过出现过（1.3.19 与 1.3.20），**连续三次通过从未出现**。
- 修复后：3 次连续通过，且三次都是 attempt 1。
- 判读：本次的 3/3 恰好等于"修复前出现过的连续通过长度的上界（2 次）之外"的第一次观测，因此它是**倾向于修复有效**的新证据，但在只有 3 个样本时仍不能排除偶发；本收据记录事实与参照，不宣布结论。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37579728622**`，attempt 1、success（本机独立核对：该 run 在 promotion workflow 最近运行列表中，`head_sha` = `3fe019da3a…`，与发布侧提供的一致）；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.26`（id `405434624`），非 draft、非 prerelease；`target_commitish` = `3fe019da3af2a96cb7aa83219a66387ee6fb3de1`；发布时间 2026-10-07T06:10:44Z |
| Release body | 由 CHANGELOG 的 1.3.26 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.26` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续八次一次通过）

1.3.18 的 promotion 首次运行 `37214225255` 因取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics`）报 `qualification artifact name mismatch` 而失败；自 1.3.19 起按 `qualified-*` 名精确筛选，直到本轮共八次 attempt 1 success（37218555871 / 37397404495 / 37473937227 / 37565028245 / 37569607418 / 37573450129 / 37576477061 / 37579728622）。

可核验的边界（沿用前七版收据的口径）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。八次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.26.exe` | 223,548,781 | `7f32ad58f8fc49336ab2af198cd8c3d3aa8ce9bf59620be391c0146311cc5223` |
| `inkweaver-setup-1.3.26.exe.blockmap` | 233,832 | `4cc1524959777ed4bf708e31974abf40d5c5638587a6d4f63513c1571722f866` |
| `latest.yml` | 350 | `2620ada3a381ecadfeb2d811315e2551e83013a82f07b3c975b8896f88040ca3` |
| `inkweaver-mac-arm64-1.3.26-installer.dmg` | 302,024,269 | `eb14ece082d5d5af203e5160e307db66945e453d4aa8d3d8f59a86ba6e1aa6e7` |
| `inkweaver-mac-arm64-1.3.26-installer.dmg.sha256` | 107 | `3b9a1121c5c6b1b4aa883ec594597218989c82d5d506438fee416600265eb61f` |
| `inkweaver-mac-x64-1.3.26-installer.dmg` | 311,931,971 | `e75f354aa4c62e63f1bc654abd7144297d5f9006ad9d3aab88db7b50a9f69b02` |
| `inkweaver-mac-x64-1.3.26-installer.dmg.sha256` | 105 | `d383e0121bccad882b8daa645215a7e34593b5c39f6ff16f73ac8bdbf4743e45` |
| `inkweaver-linux-x64-1.3.26.AppImage` | 502,259,133 | `d3dfc9cf302cfcd96d07e7b7c0a8a453467b51034032d8129d6b6c1cb8a12a74` |
| `inkweaver-linux-x64-1.3.26.AppImage.sha256` | 102 | `4dfee95b65b2da5a67e5c5e33534fa043530a7625bb44a46f1cf6a3e25163206` |
| `inkweaver-linux-x64-1.3.26.deb` | 354,496,852 | `3d9a83ededb1304e809544558f863a6a23675320c3f9b066ed210d904375297c` |
| `inkweaver-linux-x64-1.3.26.deb.sha256` | 97 | `0dc12f7bc062c54ea1621d8351faa3e28a7f7fb223451a2e44391476f0da8306` |
| `inkweaver-linux-x64-1.3.26.rpm` | 298,269,953 | `2dd47466b019a7955dc1ba39568283a37164b3a95145445bdf2d40680fac5520` |
| `inkweaver-linux-x64-1.3.26.rpm.sha256` | 97 | `6f57ac5343d8ff4c17701677a62d64fec24897ef360b51966012583d0b57d61e` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.26`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.26 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 起连续十次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `2620ada3a381ecadfeb2d811315e2551e83013a82f07b3c975b8896f88040ca3` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.26`、`path/url: inkweaver-setup-1.3.26.exe`、`size: 223548781`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-07T05:57:29.670Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.26.exe` 资产 size（223,548,781）数值一致。

**未验证项（残留风险，与前十版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮一条交付线：**助手可以批量创建角色档案**（此前只能修改已有角色，没有新增通道；用户"一次性给出一批角色设定让助手建档"的诉求一直无法完成），同时新增 `/cast-setup` 技能（内置技能 11 → 12）。

- 助手用 `propose_new_characters` 一次提交一批新角色（姓名 / 定位 / 别名 / 外貌 / 性格 / 背景 / 能力 / 动机 / 弧光 / 关系等；作者只给一句话的其余按已有架构补全）；确认卡片逐个列出将新增的角色与"当前 N 人 → 提交后 M 人"，作者批准后写入。
- 三条安全边界：① **绝不臆造角色的当前状态**（位置、境界、身心状态、随身物品一律留空待作者填）；② **重名检测**（与现有姓名或别名冲突时指名报错且不提交）；③ **不覆盖他人在改的内容**（名单在提案期间被改动时如实报版本冲突并请作者重新发起，不自动重试覆盖）。
- **势力分流**：项目里"势力/组织/阵营"没有独立实体（角色卡只有"当前位置/阵营"字段），新技能明确规定角色走角色表、**势力/组织写进架构的世界观正文**；一批里同时有角色和势力时分批提交。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 367 文件 / 2,808 用例，0 失败 |
| 浏览器套件 | 49 文件 / 274 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| 工具用例 | 5 条（含完整快照顺序、`intent`/`expectedRevision`/`schemaVersion` 断言、冲突不重试） |
| 预览用例 | 3 条 |
| 技能用例 | 8 条 |

上表用于说明本轮交付线的验收覆盖面；它不构成对文学质量、第三方 provider 行为或真实模型输出质量的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.25` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.25 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.25.md`：1.3.25 历史收据（33 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.25 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.25 收据中的扫描边界说明不适用于 1.3.26。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），八次连续成功仍依赖发布侧取值正确。
- macOS x64 runner 的渲染进程性能断言在九次采样中出现过三次间歇失败（全部在帧预算修复之前）；修复后为 3/3 通过，**仍不足以下"已修复"的结论**（见`macOS x64 runner 抖动`的参照系）。

## 1.3.26 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.26 小节）

- 新增：助手可以批量创建角色档案（一次提交一批新角色，作者只给一句话的其余按已有架构补全，确认卡片列出新增角色与人数变化）；三条边界为"不臆造角色当前状态、重名指名报错且不提交、名单被改动时如实报冲突而不自动覆盖"；新增「批量建档」技能并规定势力/组织/阵营写进架构世界观正文而非角色表（内置技能 11 → 12）。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.26`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.26`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.26` → `git/tags/29df89c8…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run 与 macOS x64 历次 attempt）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/workflows` → promotion workflow → `/runs`（独立交叉核对本轮 promotion run）；
- `git show --stat 062fa21`（1.3.25 收据的提交范围）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
