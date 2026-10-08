# 1.4.3 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-08T07:29:01Z，本机核验时刻 2026-10-08T15:30 HKT）

这是 1.4.3 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（见「回读方法」）。本版仅一条优化线，收据另记一条**提示词工程判据**（由实现侧主动提出，并在本轮被修复与之对应的实例）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `c29538299620bcedf0eab7a82bfcb43ec905c10c` |
| 提交 | `bf6d01d feat(world): give the architecture a named power system to write against`（3 files, +92/−2） + `c295382 chore(release): prepare v1.4.3`（7 files） |
| tag | `v1.4.3`（annotated）；tag 对象 `db4c277e8278ff149bdb58e8b0e5d99d877ff5b5`（tagger `shuishuipingan`，2026-10-08T07:04:01Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.3` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-119 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-119 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `c2953829…`）

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37741183892`，attempt 1 | success |
| macOS arm64 | run `37741189631`，attempt 1 | success |
| macOS x64 | run `37741195027`，attempt 1 | success（修复后 12/12） |
| Linux x64 | run `37741202227`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `c295382996…`。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37743092569`**，attempt 1、success；本机回读 `/jobs` 确认两个 job（`plan-and-verify`、`publish`）均 success |
| Release | `v1.4.3`（id `406542147`），非 draft、非 prerelease；`target_commitish` = `c29538299620bcedf0eab7a82bfcb43ec905c10c`；发布时间 2026-10-08T07:29:01Z |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.3` 返回 ok: true、missing: []、invalid: []（本机执行，exit 0） |
| Signing | 按 profile 的 `allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.3.exe` | 223,563,536 | `1d8b0884d413d85f2a849042aae395a6994b4213be4504735ec9cee35d2f2f4b` |
| `inkweaver-setup-1.4.3.exe.blockmap` | 233,334 | `3a3c1ba746f56a0058a4ae5556541c16a7ae389b07c07f9b2e59fb5a77cbe260` |
| `latest.yml` | 347 | `5c20d384d31bcf7cea548f187542571c0699587f303828527962a44b26a09fd5` |
| `inkweaver-mac-arm64-1.4.3-installer.dmg` | 302,073,327 | `bc12775af26b0991be0432357952081007eb68f14e73f9e3b07d44972af4f856` |
| `inkweaver-mac-arm64-1.4.3-installer.dmg.sha256` | 106 | `7ae14ef09f8622b24738a0f941f85a44e368b2b4b1adea830f649d18d1c5a3f2` |
| `inkweaver-mac-x64-1.4.3-installer.dmg` | 311,952,746 | `5ff04a588e9ab4e7ea761753183772f05d47fb95e325ca74c78bcbad3e8c07d0` |
| `inkweaver-mac-x64-1.4.3-installer.dmg.sha256` | 104 | `ecd2c97ae14827905a435481417dea53fbe4c77cd8bfc5b13ab85db7c96bfcbc` |
| `inkweaver-linux-x64-1.4.3.AppImage` | 502,272,043 | `a009c561bef8fbb376a573a662b53473b3621fb3374121d70e9e954f723b566a` |
| `inkweaver-linux-x64-1.4.3.AppImage.sha256` | 101 | `dbdf131b7493dde6c19350b94cc0340241f9697c61717200f94c6d7c8543fa3c` |
| `inkweaver-linux-x64-1.4.3.deb` | 354,510,560 | `d76528c452584edf1f20b2f1da45a04501ab14ad0441b5c9d795dde07e65bccd` |
| `inkweaver-linux-x64-1.4.3.deb.sha256` | 96 | `5f765a9842da0685ebb2fa177b53180614d1cee894f78be93a8ada76011f5794` |
| `inkweaver-linux-x64-1.4.3.rpm` | 298,302,993 | `0a4cf0589f30604066189e4dcfdeafb32de13a008eed475c0cf150d570beb85b` |
| `inkweaver-linux-x64-1.4.3.rpm.sha256` | 96 | `f74badf22eb8309edd6cabee1543acc333751cc46164c5539b8fa36e7137e84d` |

## 用户可见变更：架构阶段产出具名力量体系

起因（用户现场）：现成架构的**规则层其实很丰富**（灵脉回流、因果成线、裂隙法则、代偿闭环、金手指机制都写清了），但**没有「名录」**——除主角那一级没有境界阶梯，也没有任何具名的功法/招式/法宝/丹药/阵法。于是下游只能泛泛而谈：角色**能力**写成「精通剑道、阵法、封印」这类无专名表述，章节战斗只剩「一剑断因」这类笼统动作。

现在（题材涉及修炼、异能、灵异规则或战斗体系时，世界观构建额外产出）：

| 产出 | 要求 |
| --- | --- |
| **等级阶梯** | 5–9 级**有序**的等级名称，每级一句定位；**不允许只写主角那一级** |
| **具名条目** | 功法、招式、法宝、丹药、阵法（或该题材对应物）各给具体名称，并标注**归属**：哪个势力 / 哪类修士 / 什么用途 |
| **命名风格** | 写明这套体系如何命名，供后续章节沿用 |
| **下游引用声明** | 明确写入「这些名字会被角色档案与后续每一章直接引用」，要求自洽、具体、可复述 |
| 非超常题材 | 都市 / 悬疑 / 现实改用该题材自己的分级与专名（职称序列、装备型号、机构层级等），**不强加仙侠词汇** |
| 角色档案「能力」字段 | 要求写出体系内的具体名称（主修功法 / 所属等级 / 擅长招式或法器）；**以作者已给的名字为准**，体系里没有对应条目时**不临时编造**与体系风格不符的名字 |

## 提示词工程判据：指令层的自相矛盾会被优先执行

本轮修掉了一个正是这一类错误的实例（由实现侧主动提出）：

| | 文本 |
| --- | --- |
| 修复前 | `Build three connected dimensions, each with a concrete source of conflict:` ——但列表里**跟着第 4 条**（本轮新增的"具名体系"维度），于是"三个"与"四条"**自相矛盾** |
| 修复后 | `Build the dimensions below, each with a concrete source of conflict — the first three apply to every genre, and dimension 4 only when the genre involves cultivation, powers, supernatural rules, or a combat system:` |

本机核验（锚定**英文原句**这一唯一标识后查证）：

- `git show bf6d01d` 的 diff 里可见上述替换（`-Build three connected dimensions…` → `+Build the dimensions below…`）；
- 当前源码里 `three connected dimensions` **只剩测试断言**：`src/services/__tests__/world-building-named-system.test.ts:34` 的 `expect(content).not.toContain('three connected dimensions')` —— 即生产提示词已无该表述，**并被测试锁住防回归**。

**判据（本文记录）**：**指令层的自相矛盾会被模型优先执行**——它比"缺一条规则"更糟，因为模型会照着矛盾的字面（这里是"三个"）行事，即使列表里明明白白有四条。这与此前"提示词里写着不要列龙套、却在别处指望放开"属于**同一类错误**：不是规则缺失，而是规则之间相互打架。可操作的检查方式是：**给提示词新增条目时，回头核对同一段落里所有计数词、范围词与枚举式表述**（"three/三个"、"two kinds"、"仅/只"），并把它们改成可扩展的表述（"the dimensions below…"）。

该修复配套 4 条契约测试（`src/services/__tests__/world-building-named-system.test.ts`，74 行）：中英各要求四点齐备（等级阶梯 / 具名条目 / 命名风格 / 下游引用）、**既有三维度与变量契约逐字未变**、英文模板不含 CJK、能力字段中英各要求引用具体名称。

## macOS x64 runner 抖动：第 18 次采样（修复后 12/12）

历史与判读口径见此前收据（3 次抖动全部在帧预算修复 `874dbad` 之前；修复前通过率 3/6、最长连续 2 次）。本轮 attempt 1 通过 → **修复后 12/12**。仍只记录事实与参照，不宣布"已根治"。

## 更新链路回读

`pnpm run verify:github-update-release` → **exit 1**（stderr 为「Release directory does not exist: …release\1.4.3」，原因同前十八版：本机不构建官方安装包，见 `docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `5c20d384d31bcf7cea548f187542571c0699587f303828527962a44b26a09fd5` 与 GitHub 资产 digest 一致；声明 `size: 223563536` 与远端安装包资产 size 一致；`releaseDate: 2026-10-08T07:15:38.132Z`。

**未验证项（残留风险）**：安装包 SHA-512 未在本机重算，该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第七次落地）

本机对 8 个关键文件取 `mtimeMs + size` 快照，跑完两个验证脚本后比对：**零漂移**。

## 用户可见变更与验收

实现侧 / 发布侧实测（非本收据作者所测）：全量 node 套件 **397 文件 / 2,966 用例，0 失败**（8 skipped）；浏览器 54 文件 / 287 用例全绿；三项门禁 exit 0；本轮新增 4 条契约测试（见上文）。

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.2.md` 内含 1.4.2 引用 25 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.2 小节 4 处。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.4.2 残留。

## 已知限制

- 具名体系的**等级数量**（5–9 级）与条目构成是提示词约定，不是强制校验；模型仍可能给得偏少或命名词汇化。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布；macOS 资产不参与应用内更新（见 `docs/adr/0006:5`）。
- 本轮未执行新的静态安全扫描；本机更新链路回读未通过（原因见其小节）。
- promotion 的「按 qualified-* 名筛选」仍未固化进仓库脚本。
- macOS x64：采样 18 次中 3 次间歇失败（全在帧预算修复前），修复后 12/12。

## 1.4.3 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.3 小节）

- 优化：架构阶段产出具名力量体系——等级阶梯（5–9 级有序）、具名的功法/招式/法宝/丹药/阵法（含归属）、命名风格约定，并声明这些名字会被角色档案与后续每章直接引用；角色能力字段要求引用体系内具体名称；非超常题材走该题材自己的专名。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.3`（本机，exit 0）；
- `GET …/releases/tags/v1.4.3`、`GET …/git/ref/tags/v1.4.3` → `git/tags/db4c277e…`；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion `37743092569` 的 job 列表）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `git show bf6d01d` 与 `grep "three connected dimensions"`（提示词矛盾修复的前后文本与测试锁定）；
- `src/services/__tests__/world-building-named-system.test.ts`（4 条契约测试）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见「更新链路回读」）。
