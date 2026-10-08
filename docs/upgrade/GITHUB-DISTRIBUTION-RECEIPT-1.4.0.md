# 1.4.0 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-07T15:25:20Z，本机核验时刻 2026-10-08T09:49 HKT）

这是 1.4.0 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）。**这是首个 1.4.x 版本**（用户明确指令"下次版本从 1.4 开始"，属 minor 升级而非 patch）。本版收据重点：**一次外部（GitHub 侧）故障的两次 run 对照**、以及**一条自主防护（运行时入口契约护栏）上线首日即抓到第二个同型违规者**。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `1b843974f9afd2bdc10345157f5f94767058236a` |
| 提交 | `c2857ef feat(blueprint): let new characters appear in outlines and get profiles automatically`（15 files, +1459/−76） + `1b84397 chore(release): prepare v1.4.0`（7 files） |
| tag | `v1.4.0`（annotated）；tag 对象 `ff87ae4cb48bea54f894d114965d57fae8531eee`（type=tag，tagger `shuishuipingan`，2026-10-07T14:44:58Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.0` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-104 本机执行，首跑即全绿） |
| 类型检查 | `pnpm run typecheck` 在 task-104 冻结前本机 exit 0 |
| 版本形态的兼容性 | 1.4.0 为三段式；发布侧脚本的版本正则（`github-desktop-promotion.mjs:79`、`release-version-sync.mjs:7` 的 FINAL_SEMVER、`clean-build-output.mjs:9`、`release-evidence-v2.mjs:227/290`、`monitor-win-release-gate.ps1:1152/2449`）均接受三段式；`verify-github-release-assets.mjs:19-21` 的 Linux 包门限 `major > 1 \\|\\| (major === 1 && (minor > 3 ...))` 对 1.4.0 判定为 true，故 13 项资产契约仍含 Linux 包；本机以 `expectedReleaseAssetNames("1.4.0")` 实际调用确认返回 13 项 |

## 平台资格（全部绑定 SHA `1b843974…`）

四个平台**全部 attempt 1 一次通过**；本机回读 Actions API 逐条确认。**dispatch 前已核对远端 SHA 与 `expected_sha` 一致**——这是 1.3.31 那次"dispatch 早于 push 成功"教训的落实。

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37639353598`，attempt 1 | success |
| macOS arm64 | run `37639366957`，attempt 1 | success |
| macOS x64 | run `37639379728`，attempt 1 | success（修复后 9/9） |
| Linux x64 | run `37639397813`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `1b843974f9…`。

## Promotion：一次外部故障与重试（两次 run 对照）

**本节把"外部故障"与"我们的产物/workflow 无问题"分开陈述。**

### 外部故障（GitHub 侧）

- 首次 promotion dispatch（run **`37642085741`**，创建于 2026-10-07T15:05:05Z）：`plan-and-verify` job **成功**（产物校验通过），但 **`publish` job 从未被创建**，run 于 15:08:58 被判 `failure`。
- 随后 `gh workflow run` 与 `gh run rerun` **两个端点均稳定返回 HTTP 500**。
- GitHub 状态页当时存在事故：**"Incident with Git Operations, Pull Requests and Actions"，investigating，登记时间 2026-10-07 15:14:45**。注意：**故障实际早于登记时间**——失败 run 在 15:08 就已失败，说明状态页的登记滞后于实际影响。

### 我们这一侧无问题的证据（本机独立回读）

| run | 创建时间 | run 结论 | job 列表（本机回读 `/jobs`） |
| --- | --- | --- | --- |
| `37642085741`（故障期间） | 15:05:05Z | failure | **1 个 job**：`plan-and-verify = success`（`publish` 未创建） |
| `37642490935`（恢复后） | 15:17:00Z | success | **2 个 job**：`plan-and-verify = success`、`publish = success` |
| 对照：1.3.31 的 `37621157264` | 12:27:48Z | success | **2 个 job**：`plan-and-verify = success`、`publish = success` |

判读：同一个 workflow 文件、同一份 `.release/release-profile.json`，在 1.3.31 与 1.4.0 恢复后都得到"2 个 job 均成功"；故障期间那次的不同点是 **`publish` job 根本没被调度**（job 列表里只有 1 项），而 `plan-and-verify` 本身是**成功**的——也就是说**产物校验通过了，缺的是调度**。这属于 GitHub Actions 调度器侧行为，不是 workflow 定义或我们产物的问题。恢复后重试一次成功，进一步支持该归因。

## macOS x64 runner 抖动：第 15 次采样（修复后 9/9）

历史（1.3.16–1.3.30）见 `GITHUB-DISTRIBUTION-RECEIPT-1.3.30.md`：3 次抖动（116.7 / 116.7 / 116.6，上限 105）全部在帧预算修复 `874dbad` 之前。修复后 1.3.24–1.3.31 连续 8 次 attempt 1 通过，本轮（第 15 次采样）**再次 attempt 1 通过 → 修复后 9/9**。判读口径不变（修复前 3/6、修复前最长连续 2 次），不宣布"已根治"。

## 用户可见变更：蓝图自动建档

用户现场：160 章蓝图里只出现 9 个角色名（8 个是已有角色），模型基本不创造配角；唯一引入的新角色「太虚宫主」拿到一张八个字段全空的卡。本轮从两头修：

| # | 变更 | 关键约束 |
| --- | --- | --- |
| ① | 蓝图提示词放开（中英两侧共六处模板）：允许配角、反派、阶段性对手、功能性小人物首次登场 | 要求**真实姓名**（不用「路人甲」这类占位；真正无名的背景人物不入列）、必须在本章有实际作用、并告知模型系统会自动建档 |
| ② | 新角色自动进入角色名单，**定位按出场章节数推导**（≥3 章 = 配角 / 1–2 章 = 次要角色） | — |
| ③ | 由模型依据蓝图上下文**自动补齐**外貌/性格/背景/能力/动机/弧光 | **只填空字段、绝不覆盖作者已写内容** |
| ④ | 补档失败不影响已生成的蓝图 | 失败被隔离 |
| ⑤ | 历史遗留空卡会在下次生成蓝图时补全；多人合并名与势力形态名不再被误建为角色卡 | 复用 `inspectCharacterName` 名字守卫（见 `blueprint-character-sync.ts:168` 的注释：v1.3.31 在架构解码与 agent 工具拦过的同类问题，蓝图这条路径当时没覆盖） |

## 自主防护：运行时入口契约护栏（上线首日即抓到第二个违规者）

**触发这次加固的缺陷**：补档的 LLM 调用在原生产路径上**必然失败**——`directory` 命令是全仓**唯一**不进入 `GenerationRuntime` 的生成命令，其 `callLLM*` 因此必然抛出，而异常被 `catch` 吞成一条日志；组件级测试因为直接注入 deps 而**全绿**，是端到端测试把它揪出来的。

**加固**（本机读取源码确认）：新增源码级契约测试 `src/services/workflows/commands/__tests__/generation-runtime-entry-contract.test.ts`（55 行）：

- 判定逻辑：命令目录下任何文件，**调用了 `this.callLLM` 却不含 `executeWithGenerationRuntime` 即为违规**；
- 例外清单 `KNOWN_RUNTIME_ENTRY_EXCEPTIONS` 当前为**空数组**，注释写明"终局必须是空的——要么合规，要么根本不存在"；
- 含**判别力自证**：把 `executeWithGenerationRuntime` 抽掉后，同一判定必须报违规（negative control）。

**上线首日擒获第二个同型违规者**：`chapter-handoff.command.ts` 里的 `GenerateChapterHandoffCommand`（含 `GenerateChapterHandoffParams` 接口）——它调 `this.callLLM` 却不进入 runtime，与 directory 同型。该提交（`c2857ef`）已删除这个死类，文件内留有说明注释（"被 task-106 的运行时入口契约抓到……在 task-107 直接删除"）；本机 `git show c2857ef -- …chapter-handoff.command.ts` 可见 `-export class GenerateChapterHandoffCommand` 与 `-const raw = await this.callLLM(` 的删除行。

这条值得单独写进收据的原因：它不是"修一个 bug"，而是把一类缺陷（"调用 LLM 但不进运行时"）从"靠人记得每个命令都走 runtime"变成**机械保证**——而且证明它有效的方式，正是它当天就抓住了同型的第二个。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37642490935`**，success（`plan-and-verify` + `publish` 两个 job 均 success）；故障期间的 `37642085741` 见上一节 |
| Release | `v1.4.0`（id `405898014`），非 draft、非 prerelease；`target_commitish` = `1b843974f9afd2bdc10345157f5f94767058236a`；发布时间 2026-10-07T15:25:20Z |
| Release body | 由 CHANGELOG 的 1.4.0 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.0` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续十三次一次通过）

1.3.18 的 promotion 首次运行因取值脚本取了列表第一个 artifact 而失败；自 1.3.19 起按 `qualified-*` 名精确筛选——本轮因外部故障额外消耗一次 dispatch，恢复后的成功 run 仍是一次通过。可核验的边界：仓库内 promotion 脚本与 workflow **仍没有针对 artifact 筛选逻辑的提交**（最后改动仍是 `0e9fb74`）。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.0.exe` | 223,557,325 | `8399ee42beedba4fe664a5b6ae0bcaa67ed6dddeee2b4032716f8a76731c046c` |
| `inkweaver-setup-1.4.0.exe.blockmap` | 232,651 | `399b18cc1c063797d5994abcb35c97eba93346099933b72e9abb9b42ac0f5630` |
| `latest.yml` | 347 | `30981c54b9fcabe69ea1f2668f0673804c1a18601f42fe1d7aa924b153912a48` |
| `inkweaver-mac-arm64-1.4.0-installer.dmg` | 302,048,702 | `78a57dfffd33ca97d860f0d62914b9e13e03629112f4c04c282297b327fcf900` |
| `inkweaver-mac-arm64-1.4.0-installer.dmg.sha256` | 106 | `71218e15e6325e56d310fe8c7a45b3a1a101f62cb48ce8985f14195a43ddada4` |
| `inkweaver-mac-x64-1.4.0-installer.dmg` | 311,953,008 | `f6b13e1225630fc546d91b870e4ca440631da449555fd1b7834a81976827761a` |
| `inkweaver-mac-x64-1.4.0-installer.dmg.sha256` | 104 | `30286073b36c9d469839179b73de3b4df4dfdce7c499262ed6c799df66aebf08` |
| `inkweaver-linux-x64-1.4.0.AppImage` | 502,272,381 | `2f1d55008e16ddcd26f3d84f87039abb4763212ab2cbd7a51acfac298c514791` |
| `inkweaver-linux-x64-1.4.0.AppImage.sha256` | 101 | `b98e482679b1bd33be668ad3d120d00325aa29bcd8166d60af5ad8544c500010` |
| `inkweaver-linux-x64-1.4.0.deb` | 354,508,780 | `47a36b1cc6a4902ad5835b41c51b53889ce4b284ee9868e45b603fac43956b17` |
| `inkweaver-linux-x64-1.4.0.deb.sha256` | 96 | `232d4d9b12e3edf7eeb30ce9e77c87a49f43152ac65d8693a333863135fb2e61` |
| `inkweaver-linux-x64-1.4.0.rpm` | 298,329,729 | `23443744764f99dfc1221e012353e26417d5e6682ecf68658c1a0f3ac7858708` |
| `inkweaver-linux-x64-1.4.0.rpm.sha256` | 96 | `c14f2206a4072915c7757cc5bc2ab422d04d2980da8743e29c36bf29449f618a` |

**关于 1.4.0 的字节级差异（不是异常，说明如下）**：sha256 边车文件从 1.3.x 的 102/97/107/105 B 变为 **101/96/106/104 B**，`latest.yml` 从 350 B 变为 **347 B**——原因是版本号从 `1.3.31`（6 字符）缩短为 `1.4.0`（5 字符），每处少 1 字节（latest.yml 少 3 处引用）。本机下载 `inkweaver-linux-x64-1.4.0.AppImage.sha256` 实际内容确认：`2f1d55008e16ddcd26f3d84f87039abb4763212ab2cbd7a51acfac298c514791  inkweaver-linux-x64-1.4.0.AppImage`，其哈希与上表 AppImage 的 digest **一致**。

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**（stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.4.0`）。原因同前十五版（本机不构建官方安装包，`docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `30981c54b9fcabe69ea1f2668f0673804c1a18601f42fe1d7aa924b153912a48` 与 GitHub 资产 digest 一致；声明 `size: 223557325` 与远端 `inkweaver-setup-1.4.0.exe` 资产 size 一致；`version: 1.4.0`、`releaseDate: 2026-10-07T14:57:10.742Z`。

**未验证项（残留风险）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第四次落地）

发布侧记录本轮为 **8 个文件零漂移**；本机复核采用 8 个关键文件（`package.json`、`.release/release-profile.json`、两个 verifier 脚本、promotion workflow、`docs/quickstart/README.md`、release-version 测试、`CHANGELOG.md`），跑完两个验证脚本后比对——**零漂移**。

## 用户可见变更与验收

实现侧 / 发布侧实测（非本收据作者所测）：全量 node 套件 **394 文件 / 2,943 通过、0 失败**（8 skipped；全量里唯一失败是已知时序敏感用例 `release-win-verify`，**隔离复跑 25/25 通过**）；浏览器 54 文件 / 287 用例全绿；三项门禁 exit 0；mtime 冻结校验 8 文件零漂移。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.31` 命中三处：`CHANGELOG.md`（4 处，历史小节）、`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.31.md`（27 处）、`src/services/workflows/blueprint-character-sync.ts:168`（注释里的历史说明，属正当引用）。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.31 残留。

## 已知限制

- **本轮 promotion 出现一次 GitHub 侧故障**（Actions 调度异常 + API 500），已恢复并重试成功；归因依据见对应小节（未取得 GitHub 官方根因说明，状态页只到"investigating"）。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描。
- 本机更新链路回读未通过（原因见其小节）。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本。
- macOS x64：十五次采样中 3 次间歇失败（全在帧预算修复前），修复后 9/9；仍不宣布"已根治"。
- 全量 node 套件存在一个已知时序敏感用例（`release-win-verify`），本轮以隔离复跑 25/25 通过佐证其与本轮无关；该敏感性本身仍待治理。

## 1.4.0 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.0 小节）

- 新增：生成蓝图时可以引入新角色，系统会自动为它们建立角色档案（按出场章节数区分定位、依据蓝图上下文自动补齐资料、只填空字段绝不覆盖作者内容、补档失败不影响蓝图）；历史遗留空卡会在下次生成蓝图时补全；多人合并名与势力形态名不再被误建为角色卡。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.0`（本机，exit 0，13 项资产契约）；
- `GET …/releases/tags/v1.4.0`、`GET …/git/ref/tags/v1.4.0` → `git/tags/ff87ae4c…`（tag 与 peel）；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion 的 `37642085741` / `37642490935` / 对照 `37621157264` 的 job 数量与结论）；
- `GET <…AppImage.sha256 的下载地址>`（确认边车文件内容与其哈希）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `git show c2857ef` 与 `git show c2857ef -- …/chapter-handoff.command.ts`（死类删除的一手记录）；
- `src/services/workflows/commands/__tests__/generation-runtime-entry-contract.test.ts`（护栏判定逻辑、空例外清单与判别力自证）；
- mtime 冻结校验：对 8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
