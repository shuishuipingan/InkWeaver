# 1.4.8 GitHub 分发核验收据

核验日期：2026-10-09（Asia/Hong_Kong；Release 发布于 2026-10-08T17:07:38Z，本机核验时刻 2026-10-09T01:09 HKT）

这是 1.4.8 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（见「回读方法」）。本版收据按发布侧要求写清三件事：**一条可复用的判据**、**一处取舍**（单列一节）、以及**全量套件的精确口径**（不写成「最终代码上跑了全量」）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `4f39bc623ad4b5203563a90352cde87ad63a87ab` |
| 提交 | `209abc4 fix(preflight): stop asking about characters that have never appeared`（4 files, +96/−16） + `4f39bc6 chore(release): prepare v1.4.8`（7 files） |
| tag | `v1.4.8`（annotated）；tag 对象 `b3476820482031d730d870f26df5855c9ee42d70`（tagger `shuishuipingan`，2026-10-08T16:41:17Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.8` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-142 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-142 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `4f39bc62…`）

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37810757045`，attempt 1 | success |
| macOS arm64 | run `37810764792`，attempt 1 | success |
| macOS x64 | run `37810773661`，attempt 1 | success（修复后 17/17） |
| Linux x64 | run `37810783403`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `4f39bc623a…`。**本版四平台全部 attempt 1 通过、无重跑**（不同于 1.4.7 的 Linux 重跑）。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37813372054`**，attempt 1、success；本机回读 `/jobs` 确认两个 job（`plan-and-verify`、`publish`）均 success |
| Release | `v1.4.8`（id `407075021`），非 draft、非 prerelease；`target_commitish` = `4f39bc623ad4b5203563a90352cde87ad63a87ab`；发布时间 2026-10-08T17:07:38Z |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.8` 返回 ok: true、missing: []、invalid: []（本机执行，exit 0） |
| Signing | 按 profile 的 `allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.8.exe` | 223,565,657 | `691ef7ec98074c4ce45fc9e5fd5460f02eb2cde45f8645ba315eb5e9324e65be` |
| `inkweaver-setup-1.4.8.exe.blockmap` | 233,216 | `fd0eac8e47f8d891ebaf6573258e5f6bb64a774fe1f6b869d530118c66d5cd3e` |
| `latest.yml` | 347 | `2185b3694e099e575a95dc5be04b7bcf3bab9a7a5030e6ee574e0340d42b695c` |
| `inkweaver-mac-arm64-1.4.8-installer.dmg` | 302,052,036 | `2d5681e52356bed8e4f8acfc359ac6147ebbbcfeab861e1045cfa5d1309118c9` |
| `inkweaver-mac-arm64-1.4.8-installer.dmg.sha256` | 106 | `cab9cb6ee41847c7ccc973bde1848dc06747ca4ff3ea2201bc3021f8c3e192cd` |
| `inkweaver-mac-x64-1.4.8-installer.dmg` | 311,962,902 | `061d2f7265612181ef9333f9e7771c66794e61efaa3e96b07b1a6f7a6dd4b541` |
| `inkweaver-mac-x64-1.4.8-installer.dmg.sha256` | 104 | `c7f4326caf5976fcd062bf34b3e8394698ac3fc1ce0e3eccd7a56f39c55e78b3` |
| `inkweaver-linux-x64-1.4.8.AppImage` | 502,279,747 | `7b6ba1857ab9b918bb234c9d48d2d368f4f543f6dcf6b538610e5d1ff6265c65` |
| `inkweaver-linux-x64-1.4.8.AppImage.sha256` | 101 | `d7e8c8fc140fb4de56ef08b8440cae701ced12f614f2af1a404b6fa6f909551a` |
| `inkweaver-linux-x64-1.4.8.deb` | 354,513,244 | `b880899d50b6b39a8162706f7462b2b5ab503bab45029ba32dc5cf35ab95394c` |
| `inkweaver-linux-x64-1.4.8.deb.sha256` | 96 | `a4c09e50be339e4133fcee84f434d83019f67c20875c3dfd9558e927974ce260` |
| `inkweaver-linux-x64-1.4.8.rpm` | 298,319,277 | `99faa7affe61eefe1ca423c12c0dad228f2d3d632e8c333448860c8ccdb21abe` |
| `inkweaver-linux-x64-1.4.8.rpm.sha256` | 96 | `6f30c8c766b0b397786823ddd0079447324ac263ee6d28f542b5b9ed076b0779` |

## 判据：一条检查如果对它自己文案里明确允许的情况也报，那它报的就只是噪音

**用户现场**：用户只写到第 1 章，批量创作第 2–5 章时，第 3、4 章各弹出一条「蓝图安排"赵阔"出场，但已定稿连续性事实中没有…」。他的疑问是「我这个才第一章哎，为啥会出现这个」。

**根因**：这条检查**自己的文案就已经承认「首次出场」是合法情况**——本机读取源码原文（`src/shared/consistency-preflight.ts:348`）：

> 蓝图安排"`character`"出场，但已定稿连续性事实中没有该角色在当前章节有效的状态记录；**需要补充状态或说明这是首次出场**。

（建议文案同义：`补充角色当前地点/伤势/知识等状态事实，或明确这是首次出场。` ——中英双语各一条。）

它一边说「首次出场」可以，一边**仍要求作者逐条手动确认**。于是任何新角色第一次登场都必然产生一条只要求「确认它是新的」的提示——这正是用户看到的噪音。

**判据（实现侧把它写进了代码注释，本机读取 `:333` 原文）**：

> 首次登场不报：这条检查的文案自己就写着「…或说明这是首次出场」，**对自己明确允许的情况也报，报的就只是噪音**。只有"本应有记录却没有"才值得提醒。

**修法**：新增「此前是否出场过」判据——只在**更早的已定稿章节里出场过、本章却没有适用状态记录**时才报。

## 取舍（单列一节，如实记录）

这条判据要回答「此前出场过吗」，就有数据源选择问题。本轮的选择与代价（同样写在代码注释里，本机读取 `:333` 附近原文）：

> 「此前是否出场过」：**只认更早的已定稿章节**里的实体。数据源选**函数已有的 finalized 投影**，理由：它天然只包含"已经写下的章节"，**不需要跨层去读** `character_state_history` 或计划中的蓝图；**同批次里还没写的下一章也不算**。

| 维度 | 选择 |
| --- | --- |
| 数据源 | 该函数**已有的已定稿投影**（`finalized` projections）——**零跨层耦合**（不读 `character_state_history`、不读计划中的蓝图） |
| 章节范围 | 只认**已经写下的章节**；同批次里还没写的下一章不算 |
| 代价 | 「**有草稿但尚未定稿的章节**」不被纳入判断 |
| 倾向 | **偏保守、宁可少报**（少报一条噪音 vs 多报一条真问题，本轮选前者） |

写进收据的原因是：这是一处**有意的取舍**而不是遗漏——如果将来有人想改成"更灵敏"，需要先解决的是数据源（草稿章节的可得性），而不是直接放宽判据。

## 判别力：实测红绿

| 变异 | 实测结果（发布侧所测） |
| --- | --- |
| 去掉新判据 | `× stays silent for a character whose first appearance is this chapter`，报 `expected true to be false`（噪音回来）；恢复后 **21 passed** |

- 用户场景（仅第 1 章定稿、赵阔在第 3/4 章）：两条**都不再产生**；
- 反向用例（第 1 章出场过、第 3 章无状态）：**仍然报**（判据没有把真问题一起吞掉）。

**本机复跑核验**：`pnpm exec vitest run src/shared/__tests__/consistency-preflight.test.ts` → **21 passed（exit 0）**。

## 夹具连带调整（如实记录）

新判据让「此前没出场过」的角色不再产生线索，因此**既有测试的夹具需要补上"更早已定稿章节"**：7 条单元测试与 2 条 browser 用例的夹具被调整（**用例语义未变**，只是让被测角色在更早的章节里出现过，从而仍能触发原断言）。这部分改动落在 `209abc4` 的 4 个文件里（`consistency-preflight.ts` +16、其测试 +61、两个 browser 用例 +10/+25）。

## 验收数据（含精确口径）

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | **399 文件 / 2,988 用例，0 失败**（8 skipped） |
| 浏览器套件 | 55 文件 / 289 用例全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |

**口径说明（不写成「最终代码上跑了全量」）**：上面那一行全量是**在注释归位之前**跑的代码上得到的。所谓「注释归位」是一次**纯注释移动**、**无行为变化**（本机核对：`git show 209abc4 -- src/shared/consistency-preflight.ts` 中该处改动即把一条注释的表述由「键里必须带章节」调整为「**豁免键**必须带章节」，不触及任何执行语句）。归位**之后**，在最终代码上复跑通过的是：`typecheck` 与 `consistency` 套件（**21 passed**，本收据已复现）。因此准确表述是：「全量覆盖归位前的代码 + 归位后子集复跑」，而不是「全量覆盖最终代码」。

## macOS x64 runner 抖动：第 23 次采样（修复后 17/17）

历史与判读口径见此前收据（3 次抖动全部在帧预算修复 `874dbad` 之前；修复前通过率 3/6、最长连续 2 次）。本轮 attempt 1 通过 → **修复后 17/17**。仍只记录事实与参照，不宣布「已根治」。

## 更新链路回读

`pnpm run verify:github-update-release` → **exit 1**（stderr 为「Release directory does not exist: …release\1.4.8」，原因同前二十三版：本机不构建官方安装包，见 `docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `2185b3694e099e575a95dc5be04b7bcf3bab9a7a5030e6ee574e0340d42b695c` 与 GitHub 资产 digest 一致；声明 `size: 223565657` 与远端安装包资产 size 一致；`releaseDate: 2026-10-08T16:51:30.953Z`。

**未验证项（残留风险）**：安装包 SHA-512 未在本机重算，该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第十二次落地）

本机对 8 个关键文件取 `mtimeMs + size` 快照，跑完两个验证脚本后比对：**零漂移**。

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.7.md` 内含 1.4.7 引用 25 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.7 小节 4 处。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.4.7 残留。

## 已知限制

- 判据的取舍见上：**有草稿但未定稿的章节**不纳入判断，因此"角色在草稿里已出场、本章状态缺失"这种情形**不会被提示**（偏保守、宁可少报）。
- 反向仍会报：角色在更早已定稿章节出场过、本章却无状态记录时照常提示。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布；macOS 资产不参与应用内更新（见 `docs/adr/0006:5`）。
- 本轮未执行新的静态安全扫描；本机更新链路回读未通过（原因见其小节）。
- `scripts/` 下 Windows 时序敏感用例本轮未复现，但未被治理。
- macOS x64：采样 23 次中 3 次间歇失败（全在帧预算修复前），修复后 17/17。

## 1.4.8 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.8 小节）

- 修复：写稿前的「缺少当前状态证据」不再对首次登场的角色报（只在更早的已定稿章节里出场过、本章却无适用状态记录时才提示）。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.8`（本机，exit 0）；
- `GET …/releases/tags/v1.4.8`、`GET …/git/ref/tags/v1.4.8` → `git/tags/b3476820…`；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion `37813372054` 的 job 列表）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `src/shared/consistency-preflight.ts:333` 与 `:348/352`（判据与取舍的代码注释原文；文案原文）；
- `git show 209abc4 -- src/shared/consistency-preflight.ts`（新增判据与「注释归位」的实际内容）；
- `pnpm exec vitest run src/shared/__tests__/consistency-preflight.test.ts`（本机复跑 21 passed）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见「更新链路回读」）。
