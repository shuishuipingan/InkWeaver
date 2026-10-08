# 1.4.5 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-08T10:25:12Z，本机核验时刻 2026-10-08T18:20 HKT）

这是 1.4.5 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（见「回读方法」）。本版收据的首节记一条**本轮最重要的工程教训**（一次「修好失败」如果语义不对，会把「安全失败」变成「危险成功」）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `f78c3ac5a5d462e0fc5ba51d37116c4c7082b24a` |
| 提交 | `762a815 fix(roster): merge the author edit onto the latest roster instead of resubmitting it`（5 files, +458/−37；**不含 scripts/**） + `f78c3ac5 chore(release): prepare v1.4.5`（7 files） |
| tag | `v1.4.5`（annotated）；tag 对象 `aee08699a22902bbe5ccc8ae91516d1de27d5b29`（tagger `shuishuipingan`，2026-10-08T09:59:33Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.5` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-129 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-129 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `f78c3ac5…`）

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37760475813`，attempt 1 | success |
| macOS arm64 | run `37760486854`，attempt 1 | success |
| macOS x64 | run `37760493705`，attempt 1 | success（修复后 14/14） |
| Linux x64 | run `37760501107`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `f78c3ac5a5…`。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37762649178`**，attempt 1、success；本机回读 `/jobs` 确认两个 job（`plan-and-verify`、`publish`）均 success |
| Release | `v1.4.5`（id `406699679`），非 draft、非 prerelease；`target_commitish` = `f78c3ac5a5d462e0fc5ba51d37116c4c7082b24a`；发布时间 2026-10-08T10:25:12Z |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.5` 返回 ok: true、missing: []、invalid: []（本机执行，exit 0） |
| Signing | 按 profile 的 `allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.5.exe` | 223,565,808 | `bcd179f6efe245300bebb0201927ec4d33e8518798a9a4af9ef37e89246fc5bd` |
| `inkweaver-setup-1.4.5.exe.blockmap` | 233,712 | `bfdb70ac9ef7cac5c0618fea9108e416c479bda28b7b719fdd1e2118c2514496` |
| `latest.yml` | 347 | `694a12be0cdf618e09e419ba7c6cb1d0d52f242704d0426eb9fcad3c3c8d9b9d` |
| `inkweaver-mac-arm64-1.4.5-installer.dmg` | 302,060,917 | `943716adf62b53dcffa40f88782a24ca9831c9bd9e2510f0e2ecf31d9529fbff` |
| `inkweaver-mac-arm64-1.4.5-installer.dmg.sha256` | 106 | `a3b8b81ad03743052cac9cd6377ff8ff168ea69ef7ab6d39bb308e402747477e` |
| `inkweaver-mac-x64-1.4.5-installer.dmg` | 311,959,727 | `dea94b77346922480f920b3f53a81527190f2487c36f8b78fd3944312c841fd0` |
| `inkweaver-mac-x64-1.4.5-installer.dmg.sha256` | 104 | `8f7806193437f099b0aaa63f91d975b733c7d2a34571dec742a02185c020572b` |
| `inkweaver-linux-x64-1.4.5.AppImage` | 502,280,746 | `f853db6058d9c5583a9d78fabe2d2b60e13eadf7eca8e85072b462a201bb1faf` |
| `inkweaver-linux-x64-1.4.5.AppImage.sha256` | 101 | `0a12213754e772b1b19a8f5058ba48f3d956ced8afa15c2e725e53ccdc92362b` |
| `inkweaver-linux-x64-1.4.5.deb` | 354,512,932 | `f8e090eb09bcb73d486d757199cdbbb372dd01e3c306c2f5fb40803fb97b9fae` |
| `inkweaver-linux-x64-1.4.5.deb.sha256` | 96 | `a27625c05ea82a7c9628b5b849808b5d533eda2374722855da32b9a3eb613e8d` |
| `inkweaver-linux-x64-1.4.5.rpm` | 298,288,225 | `66deb8adf5d82d9c5465466db2b46fe603b15aa5e4de1021598030562d367511` |
| `inkweaver-linux-x64-1.4.5.rpm.sha256` | 96 | `8318a0bd17e3cc0e6cca3726f580c4c13a9ad8b15417f2de3a7041bcdd7c6eb3` |

## 本轮最重要的记录：把「安全失败」改成「成功」之前，先问这个成功会把什么覆盖掉

**原始缺陷**：角色卡的保存与删除在名单被后台更新过之后 **100% 失败**，而且报错误导——用户连续 8 次保存/删除全部失败，界面只显示「角色删除失败：**项目可能已切换**，请刷新后重试」。真实原因是**版本号过期**：他打开角色页时名单是第 5 版，之后两次蓝图生成把名单推到第 7 版，页面仍用第 5 版提交，于是每一次都被拒。

**第一版修复的危险**：第一版实现是「**用同一份快照重试**」。那确实能让保存"成功"，但语义不对——它会**删掉后台新增的角色**（用户现场是 **48 张**）。

**风险是怎么被发现的（发布侧记录）**：Lead 在验收时从两处代码推断出该风险——`resolveManualEntries`（把请求里的 entries 当作**最终名册**）加 `saveAll`（提交**本地完整快照**）。两者相加意味着：重放旧快照 = 用旧名册覆盖新名册。要求改成**三方合并**后才通过。

**实现侧随后用判别力自证复现了后果**：实测红字为 `expected … to have a length of 56 but got 8`——即"旧快照重放"会把 56 张压回 8 张。

**本机可核验的实现与测试**（用于说明最终语义）：

- 实现：`src/stores/character-store.ts:182-218` 的 `mergeCharacterChangesOntoLatest()` —— 以**最新名册**为底座，只应用用户真正做过的增/改/删；`:166` 的注释写明是「三方合并：基线 / 用户当前 / 最新」，并注明「主进程 `resolveManualEntries` 就是这么用的。用户界面持有的是旧快照（例：8 张）」；`:297` 记录了「上次成功读取/保存时的名册快照」的用途正是算「用户到底改了什么」；`:598` 说明自愈统一在 `saveAll` 里处理；`:878` 再次强调「三方合并再提交：只把用户真正改过的三类改动应用到最新名册上」。
- 测试：`src/stores/__tests__/character-revision-conflict.test.ts`（+189 行）里有一条正对用户场景的用例——「**用户场景：工作流把名册从 8 张推到 56 张后，保存用户那张卡不得删掉新增的 48 张**」；同文件还有「冲突期间由工作流新增的条目在合并后必须仍然存在」「用户明确删除的只删那一张，不带走别人」「用户改的那张在最新名册里已不存在时不盲目提交」「删除同样自愈」「冲突仍然失败时按真实原因报错，不再说成项目切换」，以及一组「三类失败分别归类：版本冲突 ≠ 项目切换 ≠ 其它」。

**判据（本文记录）**：**把「安全失败」改成「成功」之前，先问这个成功会把什么覆盖掉。** 一个只报错、不改数据的失败是"安全失败"；把它改成"成功"时，如果写入语义是"用我这边的完整快照覆盖"，那修好的其实是一次**静默数据丢失**。配套的自检方式：找到写入路径的**权威版本来源**（这里是主进程的 `resolveManualEntries` 与 `saveAll`），确认新逻辑是"把改动合并到最新"而不是"把快照重放到最新"。

## 用户可见变更（2 修复 + 1 优化）

| # | 类型 | 内容 |
| --- | --- | --- |
| ① | 修复 | 角色卡保存/删除的版本过期失败：现在**自动读取最新名册、把用户的改动合并进去后重试一次**；后台新增的角色一个都不被带走；合并不安全时给准确提示并保留编辑内容；三类失败（版本过期 / 项目切换 / 其它）各有准确文案（不再把版本过期说成"项目可能已切换"） |
| ② | 修复 | 英文界面下角色身份清单提示词混入中文字符（顿号、全角分号）：原因是「英文模板不得含 CJK」的检查只覆盖了另外两处、**漏了这一处**（本轮新增 `manifest-role-vocabulary.test.ts`，+45 行） |
| ③ | 优化 | 架构生成的角色图谱不再把敌对方一律塞进「配角/龙套」：用户现场 56 个角色里 **0 反派**（16 配角 + 39 龙套），而故事里仙盟 / 太虚宫 / 魔庭三方及渊天魔尊、幽煞等明确敌对方全被归成配角或龙套。现在要求：有明确对立面的故事必须把敌对方核心人物标为反派（通常 1–3 人，多个敌对势力各给一个代表），不用「龙套」兜底所有非主要角色 |

## macOS x64 runner 抖动：第 20 次采样（修复后 14/14）

历史与判读口径见此前收据（3 次抖动全部在帧预算修复 `874dbad` 之前；修复前通过率 3/6、最长连续 2 次）。本轮 attempt 1 通过 → **修复后 14/14**。仍只记录事实与参照，不宣布「已根治」。

## 更新链路回读

`pnpm run verify:github-update-release` → **exit 1**（stderr 为「Release directory does not exist: …release\1.4.5」，原因同前二十版：本机不构建官方安装包，见 `docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `694a12be0cdf618e09e419ba7c6cb1d0d52f242704d0426eb9fcad3c3c8d9b9d` 与 GitHub 资产 digest 一致；声明 `size: 223565808` 与远端安装包资产 size 一致；`releaseDate: 2026-10-08T10:08:17.656Z`。

**未验证项（残留风险）**：安装包 SHA-512 未在本机重算，该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第九次落地）

本机对 8 个关键文件取 `mtimeMs + size` 快照，跑完两个验证脚本后比对：**零漂移**。

## 用户可见变更与验收（如实记录，不压缩为「0 失败」）

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | **397 通过 / 8 失败**——失败**全部**是 `scripts/` 下的 Windows 时序敏感用例（`release-win-verify` + `smoke-win-installer`） |
| 该失败的归因依据 | 本轮修改 5 个文件、**未改 `scripts/`**；且该测试只依赖 Node 内置模块与 `scripts/` 自身脚本，**不引用 `src/` 或 `electron/`**；单独复跑 `smoke-win-installer` → **61/61 全过** |
| 浏览器套件 | 54 文件 / 287 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |

说明：本节刻意**不写成「0 失败」**——8 条失败是真实存在的观测，只是其归因（环境时序敏感、与本轮改动无交集）有成对的证据支撑（改动范围 + 依赖范围 + 隔离复跑）。

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.4.md` 内含 1.4.4 引用 26 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.4 小节 4 处。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.4.4 残留。

## 已知限制

- 冲突自愈只重试**一次**；若合并后再次遇到版本变化，会给出准确提示并要求刷新（不无限重试）。
- 「按用户改动合并」依赖"上次成功读取/保存时的名册快照"作为基线（`character-store.ts:297`）；该基线只存在于当前会话内存中，重启应用后无法为旧编辑做三方合并——此时会走"提示刷新"路径而非猜测。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布；macOS 资产不参与应用内更新（见 `docs/adr/0006:5`）。
- 本轮未执行新的静态安全扫描；本机更新链路回读未通过（原因见其小节）。
- `scripts/` 下 8 条 Windows 时序敏感用例仍待治理（本轮以改动范围与隔离复跑佐证其与本轮无关）。
- macOS x64：采样 20 次中 3 次间歇失败（全在帧预算修复前），修复后 14/14。

## 1.4.5 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.5 小节）

- 修复：角色卡保存/删除遇到版本过期时，现在自动读取最新名册并**按用户改动合并后重试**（后台新增的角色不被带走）；三类失败各有准确文案。
- 修复：英文界面下角色清单提示词不再混入中文字符。
- 优化：架构生成的角色图谱会标出反派（有明确对立面时通常 1–3 人，多个敌对势力各给代表），不再把敌对方一律归成配角/龙套。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.5`（本机，exit 0）；
- `GET …/releases/tags/v1.4.5`、`GET …/git/ref/tags/v1.4.5` → `git/tags/aee08699…`；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion `37762649178` 的 job 列表）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `src/stores/character-store.ts:166-218/297/598/878`（三方合并的实现与注释）；
- `src/stores/__tests__/character-revision-conflict.test.ts`（含「8 张 → 56 张不得删掉新增的 48 张」用例与三类失败分类）；
- `git show --stat 762a815`（改动 5 文件、不含 `scripts/`）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见「更新链路回读」）。
