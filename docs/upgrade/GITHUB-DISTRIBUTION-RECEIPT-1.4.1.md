# 1.4.1 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-08T02:55:26Z，本机核验时刻 2026-10-08T12:51 HKT）

这是 1.4.1 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`可复现）。本版收据重点：**与 1.4.0 的 promotion 对照（一次通过 vs 外部故障）**、**流式异常恢复的四条语义**、**写成实测的判别力证据**，以及**那次失败未破坏数据的可核验依据**。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `90412270098727da5e6c003628f66f9cafbdcf9a` |
| 提交 | `73559be fix(blueprint): survive an unconfirmed stream instead of failing the whole run`（6 files, +248/−8） + `9041227 chore(release): prepare v1.4.1`（7 files） |
| tag | `v1.4.1`（annotated）；tag 对象 `1cd9b3c0398a3edae50c5d565fb25ed7d72512c6`（type=tag，tagger `shuishuipingan`，2026-10-08T02:31:17Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.1` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-110 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-110 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `90412270…`）

四个平台**全部 attempt 1 一次通过**；dispatch 前已核对远端 SHA 与 `expected_sha` 一致（1.3.31 教训的持续落实）。

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37718286570`，attempt 1 | success |
| macOS arm64 | run `37718290930`，attempt 1 | success |
| macOS x64 | run `37718296022`，attempt 1 | success（修复后 10/10） |
| Linux x64 | run `37718300820`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `9041227009…`。

## Promotion：与 1.4.0 的对照（本版一次通过，无外部故障）

**本版：run `37719783408`，创建于 2026-10-08T02:49:50Z，结论 success，job 列表 2 项**（`plan-and-verify = success`、`publish = success`，本机回读 `/jobs` 确认）——一次通过，**没有**外部故障介入。

**对照 1.4.0（见 `GITHUB-DISTRIBUTION-RECEIPT-1.4.0.md`）**：那次首次 dispatch 的 run `37642085741`（2026-10-07T15:05:05Z）结论 failure，**job 列表只有 1 项**（`plan-and-verify = success`，`publish` 未被调度），伴随 GitHub Actions 的 API 500 与状态页登记的 "Incident with Git Operations, Pull Requests and Actions"，重试 run `37642490935` 才成功。

| run | 创建时间 | 结论 | jobs |
| --- | --- | --- | --- |
| 1.4.1 本版 `37719783408` | 2026-10-08T02:49:50Z | success | **2**（plan-and-verify + publish 均 success） |
| 1.4.0 故障期间 `37642085741` | 2026-10-07T15:05:05Z | failure | **1**（仅 plan-and-verify，publish 未创建） |
| 1.4.0 恢复后 `37642490935` | 2026-10-07T15:17:00Z | success | **2** |

判读：本版的"两个 job 都跑到且成功"与 1.4.0 恢复后的形态一致，说明**发布链路本身没有遗留问题**；1.4.0 那次是一次性的外部平台故障（本文不重复其调查细节，只做对照）。

## macOS x64 runner 抖动：第 16 次采样（修复后 10/10）

历史（1.3.16–1.3.30）见 `GITHUB-DISTRIBUTION-RECEIPT-1.3.30.md`：3 次抖动（116.7 / 116.7 / 116.6，上限 105）全部在帧预算修复 `874dbad` 之前。修复后 1.3.24–1.4.0 连续 9 次 attempt 1 通过，本轮（第 16 次采样）**再次 attempt 1 通过 → 修复后 10/10**。判读口径不变（修复前 3/6、修复前最长连续 2 次），不宣布"已根治"。

## 用户可见变更：流式响应异常结束时不再打死整轮

**用户现场**：160 章蓝图跑到第 73 章（第 7 批）失败，提示"结构化生成未正常完成：unknown；已生成 72/160 章"。运行日志核实：**前 6 批每批首次调用即成功**；第 7 批 `finishReason=unknown`（输出 8,082 字符，与前几批同量级，**不是被截断**）——系统一次就放弃了整轮。

**两处根因（都不是模型的问题）**：

| # | 根因 | 本轮修法 |
| --- | --- | --- |
| ① | 执行器**早已内置**"流式响应异常结束"的恢复通道（单项重试 / 批次对半拆分），但**蓝图合同从未开启**（导入小说那条一直开着） | 通过共享具名常量把开关真的打开（见下一节的机械保证） |
| ② | 即便开启，**恢复额度按"整轮一次"计**——对 160–240 章、十几到二十批、半小时以上的长跑远远不够 | 改为**每个顶层批次各自有一次恢复机会**；拆分出的**子批不额外获得**（避免级联重试）；总量仍由绝对墙（512 次调用 / 120 分钟）兜底 |

**并明确一条语义**：**只接受完整且符合合同的响应**——不完整的输出绝不会被当成成功（对应测试用例"绝不把不完整输出当成功：单项批无法拆分时必须失败"）。

## 测试设计修正：从"测试自己补开关"到"命令与测试引用同一份"

**问题**：此前有 4 条用例在断言时**自己给合同补上开关**（`{ ...blueprintContract, recoverUnknownFinish: true }`），于是"机制被验证过、生产却没打开"这件事长期没被发现。

**修法**（本机读取源码确认）：

- 把恢复类开关提取为具名常量 `BLUEPRINT_BATCH_CONTRACT_FLAGS`（`src/services/workflows/blueprint-batch-policy.ts:83`，`Object.freeze`）；
- 两个生产命令都引用同一份：`directory.command.ts:43/337`、`import-novel.command.ts:23/866`；
- 新测试文件 `src/services/workflows/__tests__/structured-batch-unknown-finish-recovery.test.ts` 的契约同样 `...BLUEPRINT_BATCH_CONTRACT_FLAGS`（文件内注释写明"引用真实生产常量（测试不自己补开关）"）；
- **并且加了一层源码级护栏**：该文件的用例"两个生产命令的合同都必须引用该常量，而不是自己写开关"直接断言两个命令文件源码 `toContain('...BLUEPRINT_BATCH_CONTRACT_FLAGS')`。

### 判别力证据（实测红绿，非声称）

新文件 6 条用例的**判别力是实测出来的**（实现侧实跑，非纸面声称）：

| 变异 | 实测结果 |
| --- | --- |
| 去掉开关（把 `recoverUnknownFinish` 置 false） | **6 条里 4 条变红** |
| 把恢复额度回退成"整轮一次" | **恰好长跑那条用例变红**（用例名即写明"回退成整轮一次则此用例必红"） |

6 条用例：真实生产常量必须开启恢复 / 两个生产命令都必须引用该常量 / 用户场景（某批 unknown 且内容不完整走拆分恢复、整轮仍完成）/ 长跑（每顶层批次各一份额度）/ unknown 但内容完整时直接接受（不重试、不丢数据）/ 绝不把不完整输出当成功（单项批无法拆分时必须失败）。

## 数据完整性：那次失败没有破坏数据

- **发布侧记录**：蓝图提交是**全部批次跑完后统一执行**的，失败发生在提交之前；用户库文件时间停在 01:53（失败运行 01:54–02:02），**原有 160 章蓝图完好**。
- **本机可核验的机制依据**：`src/services/workflows/commands/directory.command.ts:517` 的 `commitDirectoryBlueprintRange(...)` 是在批次生成流程之后的一次性提交调用（提交后才进入角色同步，`:531/539`），因此中途失败不会产生部分写入；同文件 `:575/595` 的提示文案也印证隔离语义——角色补档失败时明确写 "the generated blueprints are unaffected"。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37719783408`，success（两个 job 均 success，见上节对照） |
| Release | `v1.4.1`（id `406360803`），非 draft、非 prerelease；`target_commitish` = `90412270098727da5e6c003628f66f9cafbdcf9a`；发布时间 2026-10-08T02:55:26Z |
| Release body | 由 CHANGELOG 的 1.4.1 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.1` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.1.exe` | 223,556,966 | `0a42686e5cd3ca7a14ca6a7e97492eae19dbd562c738ce0b13bf02d4e335a9fd` |
| `inkweaver-setup-1.4.1.exe.blockmap` | 233,515 | `8016b22ec8520db792d0d504e92338179e111cb8500e4f4b4229f71eacf58066` |
| `latest.yml` | 347 | `9935a078c67770516019917479c32e7bba489a6e7c855ed46adcc41fecabe62b` |
| `inkweaver-mac-arm64-1.4.1-installer.dmg` | 302,051,574 | `749b36a3559fe2a881ca3d28219312cd7fcf5625f9d75df81f9fa0df601a82cf` |
| `inkweaver-mac-arm64-1.4.1-installer.dmg.sha256` | 106 | `015dfd025be3fa3d7f04cb8aa0c1f3f59a291bd59a073274f6bc21485b544eea` |
| `inkweaver-mac-x64-1.4.1-installer.dmg` | 311,955,251 | `0c7b1ad746d16da29b9b9f1c4677a002618f4489f0cb33b4dc4936f91ed8b58b` |
| `inkweaver-mac-x64-1.4.1-installer.dmg.sha256` | 104 | `cfc1dda459c120b88ad5de2a75b8fa6ed6382802d6346547510a0208fb077d1c` |
| `inkweaver-linux-x64-1.4.1.AppImage` | 502,277,100 | `2bf855af86644134052881ba05d56ebaa416579d85c134f2005cd59ae9001df9` |
| `inkweaver-linux-x64-1.4.1.AppImage.sha256` | 101 | `0d77b88b96948def8f2bf7134744f677b023b983a0510162f0bae9119a7f221b` |
| `inkweaver-linux-x64-1.4.1.deb` | 354,508,272 | `f7193d7b5bfaf83b5032165763a172a865e9e879939635ba029751d6340960c0` |
| `inkweaver-linux-x64-1.4.1.deb.sha256` | 96 | `c0142841416aa73ba3e14dc429c012f5b3e6751ea2ffb48b12545d269d6ba6b3` |
| `inkweaver-linux-x64-1.4.1.rpm` | 298,291,597 | `7d13366d5ab94d8563e22f59fa60131bc51adf7f5962a92b2d787d41185494f1` |
| `inkweaver-linux-x64-1.4.1.rpm.sha256` | 96 | `64911cdbeb58fb648918ef805fcf41d825ab2aa9cdcd5f4f20586b050d23cb75` |

（sha256 边车文件与 `latest.yml` 的字节数与 1.4.0 相同：版本号同为 5 字符，见 1.4.0 收据的字节级差异说明。）

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**（stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.4.1`）。原因同前十六版（本机不构建官方安装包，`docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `9935a078c67770516019917479c32e7bba489a6e7c855ed46adcc41fecabe62b` 与 GitHub 资产 digest 一致；声明 `size: 223556966` 与远端 `inkweaver-setup-1.4.1.exe` 资产 size 一致；`version: 1.4.1`、`releaseDate: 2026-10-08T02:42:33.713Z`。

**未验证项（残留风险）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第五次落地）

发布侧记录与本机复核一致：本机对 8 个关键文件（`package.json`、`.release/release-profile.json`、两个 verifier、promotion workflow、quickstart、release-version 测试、`CHANGELOG.md`）取 `mtimeMs + size` 快照，跑完两个验证脚本后比对——**零漂移**。

## 用户可见变更与验收

实现侧 / 发布侧实测（非本收据作者所测）：全量 node 套件 **395 文件 / 2,950 用例，0 失败**（8 skipped）；浏览器 54 文件 / 287 用例全绿；三项门禁 exit 0；本轮新增恢复用例 6 条（含上表所列实测判别力）。

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.0.md` 内含 1.4.0 引用 29 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.0 小节 4 处（历史）。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.4.0 残留。另：两个 `pnpm-lock.yaml` 中的 `1.4.0` 全部是第三方依赖版本（`graphemer`、`natural-compare`、`once`、`expect-type`、`loose-envify`），与发布版本无关，**不应改动**（此项在 task-110 已核实并记录）。

## 已知限制

- 1.4.0 那次外部故障的官方根因未取得（状态页只到 investigating），本收据只做与本次的形态对照。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描。
- 本机更新链路回读未通过（原因见其小节）。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本。
- macOS x64：十六次采样中 3 次间歇失败（全在帧预算修复前），修复后 10/10；仍不宣布"已根治"。
- 全量 node 套件存在一个已知时序敏感用例（`release-win-verify`），其敏感性仍待治理。

## 1.4.1 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.1 小节）

- 修复：生成章节蓝图时若某一次模型响应异常结束，此前会直接失败整轮；现在每个批次各自有一次恢复机会（重试或对半拆分），子批不额外获得，绝对上限兜底，并且只接受完整且符合合同的响应。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.1`（本机，exit 0，13 项资产契约）；
- `GET …/releases/tags/v1.4.1`、`GET …/git/ref/tags/v1.4.1` → `git/tags/1cd9b3c0…`（tag 与 peel）；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion `37719783408` 与对照 `37642085741` / `37642490935` 的 job 数量与结论）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `src/services/workflows/blueprint-batch-policy.ts:83`（具名常量定义）、`directory.command.ts:43/337`、`import-novel.command.ts:23/866`（消费点）、`src/services/workflows/__tests__/structured-batch-unknown-finish-recovery.test.ts`（6 条用例与源码级护栏断言）；
- `src/services/workflows/commands/directory.command.ts:517`（提交时机，用于解释"失败未破坏数据"）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
