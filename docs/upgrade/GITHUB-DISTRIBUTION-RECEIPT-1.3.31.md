# 1.3.31 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T12:34:20Z，本机核验时刻 2026-10-07T20:36 HKT）

这是 1.3.31 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）。本版收据重点：**一处发布流程时序异常（dispatch 早于 push 成功）的两组 run 对照**、**角色名拦截规则的真实边界（刻意放过的真名形态）**、以及 mtime 冻结校验。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `17d19ba0339ec952e141e416023afe684f1482d2` |
| 提交 | `468353b fix(roster): stop merging several characters into one card`（8 files, +309/−10） + `17d19ba chore(release): prepare v1.3.31` |
| tag | `v1.3.31`（annotated）；tag 对象 `c9caddde706567272e276c3afdd5f78c408e03ec`（type=tag，tagger `shuishuipingan`，2026-10-07T12:05:47Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.31` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-98 本机执行） |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-98 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `17d19ba0…`）

| 平台 | 运行 | artifact（name = id，size） | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37618908889`，attempt 1 | `qualified-windows` = `11482241260`（223,806,336 B） | success |
| macOS arm64 | run `37618915516`，attempt 1 | `qualified-macos-arm64` = `11481875359`（302,069,462 B） | success |
| macOS x64 | run `37618922126`，attempt 1 | `qualified-macos-x64` = `11482325637`（311,963,324 B） | success（修复后 8/8） |
| Linux x64 | run `37618929355`，attempt 1 | `qualified-linux-x64` = `11481437791`（1,155,111,329 B） | success |

四个 run 的 `head_sha` 均为 `17d19ba033…`。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`、无失败 step（本机回读确认）。

**artifactId 与 size 的来源与核对**：这四个 artifactId 与 size 由发布侧用 `gh api` 按 artifact 名精确查询后提供；本收据作者随后用匿名 GitHub API（`GET /repos/shuishuipingan/InkWeaver/actions/artifacts/{id}`）**逐个独立核对**——四个 artifact 的 `name` 与 `size_in_bytes` 与上表逐项一致，且 `expired=false`。因此本表每一格都有来源，不含任何推测值。（本收据初稿曾出现四个无来源的编号，已删除并改写为留白说明；本次补入的是有来源、且经本机交叉核对的编号。）

## 发布流程时序异常：dispatch 早于 push 成功（两组 run 对照）

**发生了什么（本机可核验的版本）**：首次 push 遇到网络重置（`Recv failure: Connection was reset`），导致四个 workflow dispatch 成功时，远端 `main` 仍是旧 SHA `cd752c5`——四个 run 因此跑在**旧代码**上，全部失败。随后重试 push（一次成功）与 tag push（一次成功），用正确 SHA 重新 dispatch 四个 run 才通过。

**本机对"旧 SHA"的独立核验**：

- `cd752c5` 的提交标题是 `docs(release): record the v1.3.30 distribution receipt`——即 v1.3.31 的功能提交与版本提交**都不在它里面**；
- `git merge-base --is-ancestor cd752c52a4 17d19ba033` → **退出码 0**（旧 SHA 是新 SHA 的祖先，符合"远端落后一个提交"的形态）；
- 本轮修复提交 `468353b` 位于 `cd752c5` 与 `17d19ba` **之间**——因此失败组那次运行的代码里**确实不含本轮的修复**。这是失败的直接解释，也是把"dispatch 早于 push 成功"从叙述变成可核验事实的关键一步。

**两组 run 的对照（本机回读 Actions API 逐条确认）**：

| 组 | head_sha | 四个 run id | 结果 |
| --- | --- | --- | --- |
| 失败组（旧代码） | `cd752c52a4…` | `37618644664` / `37618652624` / `37618659487` / `37618666035` | 4/4 `failure`（均 attempt 1） |
| 成功组（冻结 SHA） | `17d19ba033…` | `37618908889` / `37618915516` / `37618922126` / `37618929355` | 4/4 `success`（均 attempt 1） |

**教训（可复用，写在这里供后续发布复用）**：dispatch 之后应**确认远端 SHA 与 `expected_sha` 一致**，而不是假定 push 已经成功。可操作化的两种做法：① dispatch 前用 `git ls-remote origin main` 比对远端 HEAD；② dispatch 后回读运行对象的 `head_sha` 并与 `expected_sha` 比对——本收据的两组对照正是用方法 ② 得到的。失败组的存在不影响最终发布：最终发布绑定的是四个 `success` run 的 `head_sha` = 冻结 SHA。

## macOS x64 runner 抖动：跨版本对照（第 14 次采样，修复后 8/8）

13 次采样的历史（1.3.16–1.3.30）见 `GITHUB-DISTRIBUTION-RECEIPT-1.3.30.md`：其中 3 次抖动（116.7 / 116.7 / 116.6，上限 105）全部发生在帧预算修复 `874dbad` 之前；修复后 1.3.24–1.3.30 连续 7 次 attempt 1 通过。本轮（第 14 次）**attempt 1 再次通过**，修复后 **8/8**。

判读口径不变：修复前通过率 3/6、修复前最长连续 2 次；修复后已连续 8 次，样本持续支持"修复有效"，但本收据仍只记录事实与参照，不宣布"已根治"。

## 用户可见变更：多人合并名与势力形态的入口拦截

**现象（用户截图）**：一张角色卡的姓名栏是「沈瑶光、鹿鸣、谢无尘、温辞、顾长安」五个名字连写，资料也是五人混合（"五人外貌细节未定""五人皆为苏倦的徒弟"）；另一张卡把「仙盟、太虚宫与魔庭的祭局推动者」当成一个"反派角色"。

**根因**：生成链路的两个入口（助手批量建档工具、架构生成的角色清单解码）此前只检查"名字非空与不重复"，不检查"这个名字是不是把多个角色并列写了"；势力分流只有技能提示词引导，**工具层不强制**。

**本轮堵法**：两个入口都拦截，并给出可执行的修正指引；提示词补上硬规则；批量建档技能的分流从"建议"改成硬步骤。**检测规则抽成共享模块** `src/shared/character-name-guards.ts`（50 行），两处消费点 import 同一实现（本机 grep 确认引用点只有共享模块自身、`propose-new-characters.tool.ts:19`、`architecture.command.ts:21`，无副本残留）。

### 规则边界：刻意放过的真名形态（不是简单关键词黑名单）

| 形态 | 例子 | 判定 | 为什么 |
| --- | --- | --- | --- |
| 真名中的间隔号 | 阿·喀琉斯 | **放过** | 间隔号是真名的合法构成，不是并列分隔符 |
| 真名中含"和" | 王和芳、和珅 | **放过** | "和"是名字的一部分，不能仅凭它判为"甲和乙"形态 |
| 含势力标志词的真名 | 龙门、明镜 | **放过** | 只有标志词、没有聚合词，不构成"势力形态" |
| 多人并列 | 沈瑶光、鹿鸣、谢无尘、温辞、顾长安 | **拒绝** | 顿号/逗号/分号分隔 + 多名并列 |
| 势力形态 | 仙盟、太虚宫与魔庭的祭局推动者 | **拒绝** | 势力标志词（盟/宫/庭/宗/派/教 等）**与**聚合词（推动者/成员/高层 等）**同时成立** |

两条规则都是**组合条件**而非单关键词匹配：名字侧会放过真名符号（`·`、作为名字成分的"和"），势力侧要求标志词与聚合词同时出现。写进收据的原因：后续读者可以据此判断"为什么某个名字被放过/被拦下"，而不是把规则误读为黑名单。批量建档工具另提供**豁免开关**：若某名字确实是把多人并列当成一个真名，作者可在确认后使用豁免。

## 验证流程：mtime 冻结校验（第三次落地）

发布侧记录：本轮 mtime 冻结校验 **5 个文件零漂移**。本机复核（本收据作者独立做的同类校验）：对 5 个关键文件（`package.json`、`.release/release-profile.json`、两个 verifier 脚本、promotion workflow）记录 `mtimeMs + size`，跑完两个验证脚本后再比对——**零漂移**。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37621157264**`，attempt 1、success，`head_sha` = `17d19ba033…`（本机独立核对） |
| Release | `v1.3.31`（id `405743199`），非 draft、非 prerelease；`target_commitish` = `17d19ba0339ec952e141e416023afe684f1482d2`；发布时间 2026-10-07T12:34:20Z |
| Release body | 由 CHANGELOG 的 1.3.31 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.31` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续十三次一次通过）

1.3.18 的 promotion 首次运行因取值脚本取了列表第一个 artifact 而失败；自 1.3.19 起按 `qualified-*` 名精确筛选，直到本轮共十三次 attempt 1 success。可核验的边界：仓库内 promotion 脚本与 workflow **仍没有针对 artifact 筛选逻辑的提交**（最后改动仍是 `0e9fb74`）——十三次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.31.exe` | 223,555,356 | `517102bf9bc1c411df26d65cb49e47c3d8079ce4291c8ca637f734322f1d91cc` |
| `inkweaver-setup-1.3.31.exe.blockmap` | 232,916 | `d0ec70b2b55785a1a6f747cf1304e80242483349ded0c2ae061eba393a46d547` |
| `latest.yml` | 350 | `479752669f28f9e9ba88b81b989a2d80bfdec74e6f9a97d471224021cd3200b3` |
| `inkweaver-mac-arm64-1.3.31-installer.dmg` | 302,055,293 | `9c13fee9659d2397c21e8562179314983be5a1c5e515599216c74bf0e7fcbfa2` |
| `inkweaver-mac-arm64-1.3.31-installer.dmg.sha256` | 107 | `ccd34d908d080c3b45f579af55302352e9177b0b21ad2b0b094a9aeae509432a` |
| `inkweaver-mac-x64-1.3.31-installer.dmg` | 311,949,208 | `396f0fdc7754700fe6a779e843328444d626b4837ba7743075c1aa3570362de7` |
| `inkweaver-mac-x64-1.3.31-installer.dmg.sha256` | 105 | `ed8c834d7363728fa1b4ca687fa1664c10531078b5d3d43d320acb0d74b696df` |
| `inkweaver-linux-x64-1.3.31.AppImage` | 502,276,711 | `af47b773478217139ba9e549587e8183130771cbde71b6bc662a181788316cf4` |
| `inkweaver-linux-x64-1.3.31.AppImage.sha256` | 102 | `456159c6d2c64f895e48101b8aaca14eb9512084de4419d27a767b39db9842e0` |
| `inkweaver-linux-x64-1.3.31.deb` | 354,506,120 | `0a8d773d8c7502b8cd7049601e79fd6d2b56c56902644e3c26e74f2b6652942b` |
| `inkweaver-linux-x64-1.3.31.deb.sha256` | 97 | `72910385b154cfff85beea1658336d65ee8a5ce9379357096174d77f87b84af2` |
| `inkweaver-linux-x64-1.3.31.rpm` | 298,306,773 | `609ec281a40b97f5c0b4c07d55b50632ca3250a0cde4d4324be460ab7e2ddead` |
| `inkweaver-linux-x64-1.3.31.rpm.sha256` | 97 | `55aaec96fa946fbb41dc3a6d9b646a8c11be3f81fdd5f68a19f0d75ccb12c882` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**（stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.31`）。原因同前十四版（本机不构建官方安装包，`docs/adr/0006`）。本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（350 bytes，HTTP 200）SHA-256 `479752669f28f9e9ba88b81b989a2d80bfdec74e6f9a97d471224021cd3200b3` 与 GitHub 资产 digest 一致；声明 `size: 223555356` 与远端 `inkweaver-setup-1.3.31.exe` 资产 size 一致；`version: 1.3.31`、`releaseDate: 2026-10-07T12:17:24.390Z`。

**未验证项（残留风险，与前十四版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 用户可见变更与验收

实现侧 / 发布侧实测（非本收据作者所测）：全量 node 套件 **389 文件 / 2,913 用例，0 失败**（8 skipped）；浏览器 54 文件 / 287 用例全绿；三项门禁 exit 0；mtime 冻结校验 5 文件零漂移；本轮新增用例 14 条（共享层 5 + 工具层 5 + 解码器 4）。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.30` 命中两处：`CHANGELOG.md`（4 处）与 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.30.md`（28 处），均为历史记录。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.30 残留。

## 已知限制

- **本轮出现过一次"dispatch 早于 push 成功"的时序异常**（见对应小节）：失败组的四个 run 跑在旧 SHA 上并全部失败；最终发布绑定的是成功组。该异常本身不影响产物，但暴露的流程缺口（dispatch 后未校验远端 SHA）应写进发布 runbook。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描。
- 本机更新链路回读未通过（原因见其小节）。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（十三次连续成功依赖发布侧取值正确）。
- macOS x64：十四次采样中 3 次间歇失败（全在帧预算修复前），修复后 8/8；仍不宣布"已根治"。

## 1.3.31 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.31 小节）

- 修复 AI 生成角色资料时多个角色被合并进一张卡：两个入口都会拦截"多人并列名"与"势力形态"并给出可执行修正指引；提示词补硬规则；批量建档技能的分流从建议改为硬步骤。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.31`（本机，exit 0，13 项资产契约）；
- `GET …/releases/tags/v1.3.31`、`GET …/git/ref/tags/v1.3.31` → `git/tags/c9caddde…`（tag 与 peel）；
- `GET …/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（成功组四个 run、失败组四个 run、promotion run；macOS x64 历次 attempt）；
- `GET …/actions/artifacts/{artifactId}`（四个资格 artifact 的 `name` / `size_in_bytes` / `expired`，与上表的 artifactId 交叉核对）；
- `git log --oneline -1 cd752c52a4` 与 `git merge-base --is-ancestor cd752c52a4 17d19ba033`（旧/新 SHA 的关系与本轮修复是否在失败组代码内）；
- grep `character-name-guards`（共享模块与两处消费点的引用）；
- mtime 冻结校验：对 5 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
