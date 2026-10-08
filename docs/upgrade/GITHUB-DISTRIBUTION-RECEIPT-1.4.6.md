# 1.4.6 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-08T12:34:50Z，本机核验时刻 2026-10-08T20:37 HKT）

这是 1.4.6 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（见「回读方法」）。本版收据重点记一种**反复出现的形状**：同一套语义在多处实现、其中一处漏了参数。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `c75bf246aae0e9ae57232642c4a2bc101969c2eb` |
| 提交 | `0590d97 fix(preflight): honour saved arrangements for the missing-state rule`（6 files, +120/−6） + `c75bf246 chore(release): prepare v1.4.6`（7 files） |
| tag | `v1.4.6`（annotated）；tag 对象 `a131adc6910c0a194b689d0a1ab68923056c3f55`（tagger `shuishuipingan`，2026-10-08T12:11:57Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.6` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-133 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-133 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `c75bf246…`）

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37775201588`，attempt 1 | success |
| macOS arm64 | run `37775210741`，attempt 1 | success |
| macOS x64 | run `37775216933`，attempt 1 | success（修复后 15/15） |
| Linux x64 | run `37775224946`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `c75bf246aa…`。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37777424982`**，attempt 1、success；本机回读 `/jobs` 确认两个 job（`plan-and-verify`、`publish`）均 success |
| Release | `v1.4.6`（id `406808582`），非 draft、非 prerelease；`target_commitish` = `c75bf246aae0e9ae57232642c4a2bc101969c2eb`；发布时间 2026-10-08T12:34:50Z |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.6` 返回 ok: true、missing: []、invalid: []（本机执行，exit 0） |
| Signing | 按 profile 的 `allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.6.exe` | 223,566,475 | `6323fa5cf331833580b257923401ddd8d70ad601082b83290e87e15ddd263085` |
| `inkweaver-setup-1.4.6.exe.blockmap` | 233,515 | `ec5f91fbbbcfbe7d4f0f0e2127b2930f736c5cf4895d1d13593c5358a71296cb` |
| `latest.yml` | 347 | `11cbb00f7bb8d9890cbf3445099ce59cb6a13272617c1359c4755ae847db4a75` |
| `inkweaver-mac-arm64-1.4.6-installer.dmg` | 302,050,303 | `7ad52e877ef8c2ed2d1eb3a386f62fb76b009e7c9bb9bb075a364179eecbb6ba` |
| `inkweaver-mac-arm64-1.4.6-installer.dmg.sha256` | 106 | `a700b4fa7e448f471a6c53b8c0a6254b3bfa21db4186e51adf9ac0d8de6ee4ac` |
| `inkweaver-mac-x64-1.4.6-installer.dmg` | 311,962,607 | `2f83965b235ad86b0ece86fee13a7bec535b8b9634d61d0a3cdc9bdbacd0b214` |
| `inkweaver-mac-x64-1.4.6-installer.dmg.sha256` | 104 | `e698b00639e6e198a2db1876362795f206c2b6a0878e4e04c1a66ff2cc8cf8c4` |
| `inkweaver-linux-x64-1.4.6.AppImage` | 502,280,025 | `e40fe2fcee768c5b013695c713ea6bec911f161493bed649091a1fe4cc9d223e` |
| `inkweaver-linux-x64-1.4.6.AppImage.sha256` | 101 | `b33739ea16107b102da25eac3fc63d9d1ad7e3831d1184e908d1b196b6faf268` |
| `inkweaver-linux-x64-1.4.6.deb` | 354,511,680 | `bcf99c2089dec5adce0425b5b856699d18c84ccd0102ce170c473f44820727e0` |
| `inkweaver-linux-x64-1.4.6.deb.sha256` | 96 | `11047796887cd58eb33cec2749d909013d8749095c772decc51752ef0dd19f0f` |
| `inkweaver-linux-x64-1.4.6.rpm` | 298,298,265 | `8dc7d9461404a38ca60a9e3fe517ff75ddb23b3c72e7af7abc91aa8d6469beb9` |
| `inkweaver-linux-x64-1.4.6.rpm.sha256` | 96 | `a652b921407f5bb683a2a7c8e5061bbb2751b4169718d625ba03fc709f0c9aa5` |

## 本轮形状：同一套语义两处实现，其中一处漏了参数

**用户现场**：写稿前的确认框里出现两条一致性提示（「[信息不足] 缺少当前状态证据」，角色为苏倦与明镜）；用户逐条填写「首次出场」并点了「保存安排」，面板显示「已保存安排（2）」——**但点「开始创作」没有任何反应**。

**根因（同一概念的两处实现，输入不一致）**：

| 实现 | 修复前的签名 | 是否读作者保存的安排 |
| --- | --- | --- |
| `findBlueprintContinuityRisks`（`src/shared/consistency-preflight.ts:125-131`） | `(projections, blueprint, exemptions)` | **会**——内部 `exemptions.filter(e => !e.revoked).map(e => e.stableFactKey)` |
| `findMissingCharacterStateFindings`（同文件 `:299`，产出「缺少当前状态证据」的那处） | `(projections, blueprint)` —— **签名里根本没有豁免参数** | **不会** |

于是「保存安排」确实写进了数据库（界面也如实显示「已保存安排（2）」），但重检时那两条「缺少当前状态证据」被**原样重算出来**；而「开始创作」的判据是「只要还有未处理提示就不开始」——于是界面毫无变化，用户只能得出「点了没反应」的结论。

**修复的一手证据（本机 `git show 0590d97` 的两处调用与签名）**：

- 调用点：`- …findMissingCharacterStateFindings(projections, blueprint),` → `+ …findMissingCharacterStateFindings(projections, blueprint, exemptions),`
- 签名：`+ exemptions: readonly ConsistencyExemption[] = [],`，并附注释 `+ // 与 findBlueprintContinuityRisks 同一语义：只认未撤销的豁免。`
- 过滤：内部新建 `activeExemptions` 集合并 `.filter(character => !activeExemptions.has("missing:state:" + character))`

**值得单独指出的一点**：新增的第三个参数带**默认值 `= []`**。这正是这类缺陷能静默存在的原因——调用方**漏传也能编译通过、测试也能跑**，运行时只是"不过滤"而已（不会抛错、不会报警）。默认值让"漏传"从编译错误降级成了**静默的语义降级**。若该参数是必填，这次缺陷会在编写时就被挡住。

**判据（本文记录）**：**当一个概念有两处实现时，先问它们接收的输入是否一致。** 具体做法：把同名语义的诸实现并列，逐项比对**参数表**（尤其是有默认值的可选参数——它们最容易让"漏传"静默通过）；这条与本轮之前几轮出现的「逐字段白名单丢点」同源：都不是"逻辑写错"，而是**同一件事在不同位置被实现成了不同的形状**。

## 用户可见变更（一条修复线）

| # | 修法 | 说明 |
| --- | --- | --- |
| ① | 该类提示也尊重作者保存的安排 | 只认**未撤销**的豁免（撤销后提示重新出现），与 `findBlueprintContinuityRisks` 语义对齐 |
| ② | **因仍有未处理提示而没开始时，界面明确写出原因** | 文案形如「仍有 N 条一致性线索未处理…」，并把提示区**滚入视野**——不再出现「点了没反应」这种无法判断的情况；同一路径上的「修改后重检」一并如此 |

配套测试：`src/shared/__tests__/consistency-preflight.test.ts` 既有 `reports information-insufficient state for a blueprint character without finalized facts`（`:311`），本轮新增/接线的 `suppresses the missing-state finding once an active exemption covers its stable key`（`:328`）；另有一条 browser 用例（浏览器套件从 287 → **288**）。

## 判别力：实测红绿

| 变异 | 实测结果（发布侧所测） |
| --- | --- |
| 去掉调用点的 `exemptions` | **唯一变红的正是那条接线用例**，输出里能看到线索又冒出来：`expected [ 'missing:state:林岚', …(1) ] to deeply equal [ 'missing:state:林岚' ]` |

即：把豁免重新漏掉之后，"已被安排覆盖的那条线索"会**再次出现在结果里**——这正是用户现场的现象在测试里的复现。

## macOS x64 runner 抖动：第 21 次采样（修复后 15/15）

历史与判读口径见此前收据（3 次抖动全部在帧预算修复 `874dbad` 之前；修复前通过率 3/6、最长连续 2 次）。本轮 attempt 1 通过 → **修复后 15/15**。仍只记录事实与参照，不宣布「已根治」。

## 更新链路回读

`pnpm run verify:github-update-release` → **exit 1**（stderr 为「Release directory does not exist: …release\1.4.6」，原因同前二十一版：本机不构建官方安装包，见 `docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `11cbb00f7bb8d9890cbf3445099ce59cb6a13272617c1359c4755ae847db4a75` 与 GitHub 资产 digest 一致；声明 `size: 223566475` 与远端安装包资产 size 一致；`releaseDate: 2026-10-08T12:23:31.448Z`。

**未验证项（残留风险）**：安装包 SHA-512 未在本机重算，该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第十次落地）

本机对 8 个关键文件取 `mtimeMs + size` 快照，跑完两个验证脚本后比对：**零漂移**。

## 用户可见变更与验收

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | **399 文件 / 2,983 用例，0 失败**（8 skipped） |
| 浏览器套件 | 54 文件 / **288** 用例（比上一版 +1，即本轮新增的 browser 用例）全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |

对照说明：上一版（1.4.5）的全量口径是「397 通过 / 8 失败」，那 8 条是 `scripts/` 下的 Windows 时序敏感用例；**本版这些用例没有复现**，因此本轮可以按 0 失败记录——这与上一版"不压缩为 0 失败"的记录并不矛盾，两次都是如实记录当期观测。

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.5.md` 内含 1.4.5 引用 24 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.5 小节 4 处；`pnpm-lock.yaml` 中的 `1.4.5` 是第三方依赖 `end-of-stream`（不应改动）。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.4.5 残留。

## 已知限制

- 本轮修的是「提示被正确过滤」与「未开始时给出原因」；**一致性提示本身的判定质量**（哪些算"缺少当前状态证据"）不在本轮范围。
- 豁免按 `stableFactKey` 匹配（如 `missing:state:角色名`）；角色改名后旧豁免是否仍命中，取决于键的生成方式，本轮未改动该部分。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布；macOS 资产不参与应用内更新（见 `docs/adr/0006:5`）。
- 本轮未执行新的静态安全扫描；本机更新链路回读未通过（原因见其小节）。
- `scripts/` 下 Windows 时序敏感用例本轮未复现，但未被治理（上一版曾观测到 8 条）。
- macOS x64：采样 21 次中 3 次间歇失败（全在帧预算修复前），修复后 15/15。

## 1.4.6 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.6 小节）

- 修复：写稿确认框的「保存安排」现在对「缺少当前状态证据」类提示同样生效（未撤销才生效，撤销后提示重现）；因仍有未处理提示而没开始时，界面会明确写出原因并把提示区滚入视野。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.6`（本机，exit 0）；
- `GET …/releases/tags/v1.4.6`、`GET …/git/ref/tags/v1.4.6` → `git/tags/a131adc6…`；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion `37777424982` 的 job 列表）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `git show 0590d97 -- src/shared/consistency-preflight.ts src/services/consistency-preflight.ts`（两处调用与签名的前后对照）；
- `src/shared/consistency-preflight.ts:125-131` 与 `:299-307`（两处实现的参数表与"只认未撤销豁免"的注释）；
- `src/shared/__tests__/consistency-preflight.test.ts:311/328`（缺状态用例与豁免抑制用例）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见「更新链路回读」）。
