# 1.4.2 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-08T06:45:30Z，本机核验时刻 2026-10-08T14:47 HKT）

这是 1.4.2 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（见「回读方法」一节）。本版收据重点：**补档 100% 失败的完整根因链**、**真端到端用例这一覆盖面**、以及**既有护栏抓住新引入回归的实例**。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `c540cc8fc1d651fa1860723d5386ef2f2f05b6ff` |
| 提交 | `269b7f0 fix(blueprint): run character-profile enrichment inside a live generation window`（10 files, +347/−51） + `c540cc8 chore(release): prepare v1.4.2`（7 files） |
| tag | `v1.4.2`（annotated）；tag 对象 `f919ea295daeb145c2120812c8ec948b8e07c5fd`（tagger `shuishuipingan`，2026-10-08T06:20:49Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.2` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-115 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-115 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `c540cc8f…`）

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37737106736`，attempt 1 | success |
| macOS arm64 | run `37737112852`，attempt 1 | success |
| macOS x64 | run `37737118097`，attempt 1 | success（修复后 11/11） |
| Linux x64 | run `37737123177`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `c540cc8fc1…`（与 `expected_sha` 逐个核对一致）。

## 根因链：自动建档角色的资料此前 100% 没被填充

用户现场：重新生成 160 章蓝图后系统自动建了 **57 张新角色卡**（这部分正常），但每张卡的外貌/性格/背景/能力/动机/弧光**八个字段全空**。

完整根因链（四步，缺一步都不会是这个现象）：

| 步 | 环节 | 证据 |
| --- | --- | --- |
| ① | **补档调用写在生成窗口之外** | 修复前版本中 `GenerateDirectoryCommand.execute` 的 `runtime.execute` 回调在其主体之后闭合，角色补档调用排在该窗口之后（发布侧记录：回调闭合于 `:488`、补档在 `:551`） |
| ② | **因此使用了已被释放的生成会话** | 修复后的代码留下了对这个机制的直白注释（`directory.command.ts:550-551`，本机读取原文）：补档需要**自己的生成窗口**——因为 `runtime.execute` 是一次性的，上一个窗口的回调一返回，generation-runtime 就 `close()` 并释放租约，拿那个 session 发调用会在本地被立刻拒绝 |
| ③ | **6 毫秒必失败** | 调用在本地即被拒绝（不是网络或模型问题）；用户运行日志显示补档步骤在 6ms 内失败 |
| ④ | **又被「不影响蓝图」的兜底静默** | 补档失败只记一条 info 日志、不改变命令结果——设计本意是「补档不该毁掉已生成的蓝图」，副作用是**用户完全看不到**；用户唯一能感知的就是「卡是空的」 |

值得记下的教训：①②③ 是「调用时机」问题，④ 是「错误可见性」问题——**单独修哪一半都不够**：只修时机则失败仍会静默，只修可见性则用户会看到 57 次失败提示而功能仍不工作。本轮两半都修了。

## 修法四条 + 两条优化

| # | 修法 | 说明 |
| --- | --- | --- |
| ① | 补档运行在**自己的生成窗口** | 独立 runtime 与独立预算（`directory.command.ts:553` 的 `createRuntime` 调用即本条的落地） |
| ② | **一轮内循环分批** | 每批 12 名、单轮上限 **60** 名（覆盖该用户的 57 张积压，不必反复重新生成）；每批独立上下文、独立提交，**失败不回滚已成功批次** |
| ③ | 失败**可察觉** | 给出明确提示并说明「再次生成会自动重试」 |
| ④ | 诊断改用**稳定错误码** | 不再把 provider 的原始消息带进错误对象（见后文：这是被既有护栏当场拦下的） |

两条优化：

- **章节名可读性优先**：此前产出「星枷守炉」「裂炉碎妄」这类四字文言压缩短语（像对联或词牌，读不出「这章发生了什么」）；现在要求一眼看懂核心事件/冲突/爽点，口语化、动作化、悬念式皆可，并**明写不要**堆生僻字、强凑对仗或用典。
- **题材专属的「设定物」体系**：修仙/玄幻等题材要主动创造并命名功法、招式、法宝、丹药、阵法，**在实战中写清谁用了什么、结果或代价**，并**沿用既有名称**（不每章换同义词）；都市/悬疑/现实题材改用该题材自己的专名，不强加武侠词汇。

## 真端到端用例：覆盖「注入替身掩盖真实路径」的盲区

同类缺陷此前**已经两次溜到生产**（一次是「走不通的调用链」，一次是「已释放的会话」），共同点是：**组件级测试注入替身，掩盖了真实路径**。

覆盖面（**本轮新增**）：`src/services/workflows/commands/__tests__/directory.command.test.ts` 里的用例 `it('补档走真实生成运行时：会话有效、内容真的到达提供方（一次性租约语义）', …)` —— 它用**真实**的 `createGenerationRuntime`（只替换 environment，不跳过 runtime 与租约路径）跑**完整的 `GenerateDirectoryCommand`，断言补档请求真的到达提供方、且内容真的被提交。

**归属（本轮新增；已按文件路径与用例名锚定后复核）**：

- 文件路径：`src/services/workflows/commands/__tests__/directory.command.test.ts`（**不是** `directory-character-enrichment-e2e.test.ts`——两条路径都在跑测试，但「本轮新增的真端到端用例」指的是前者）；用例名如上一段所引。
- 本机 `git show --stat 269b7f0 -- <该文件>` → **117 行变更（+115/−2）**，且该提交里新增的 `it(` 只有上面这一条。
- 本机 `git log --oneline -- <该文件>` → **7 个提交**（269b7f0、adb54d5、474ef5e、0cb08eb、051b5cb、1b84a0f、97c1f8e），即该文件在多个版本轮里持续演进。
- 1.4.0 那轮**没有**这条用例：本机 `git show c2857ef:<该文件> | Select-String "真实生成运行时"` → **零命中**。

**勘误**：本收据初稿曾把这条覆盖面写成「1.4.0 建立、本轮仅守护」——那是**查错了文件路径**（把 `directory-character-enrichment-e2e.test.ts` 的提交历史当成了它的）。上列四条已锚定路径与用例名重新复核，归属结论以本节为准。

另一条相关但**不同**的覆盖面：`directory-character-enrichment-e2e.test.ts`（1.4.0 那轮建立，+507 行；本机实测 6 tests / 6 passed）——两条文件都在跑完整命令，区别在于本轮新增的那条专门断言**一次性租约语义**（补档必须在自己的窗口内、会话必须在有效期内）。

本机实测（本收据作者跑的）：`pnpm exec vitest run …/directory.command.test.ts` → **30 tests / 30 passed（exit 0）**——这也正是发布侧所说「恢复后 30/30 绿」的那个集合，两条来源因此相互印证。

**判别力的强度**：发布侧记录了实测红绿——**临时关闭补档的窗口 → 该用例红；恢复后 30/30 绿**。这条用例之所以是本节的重点，是因为它守的正是那个盲区：**只看组件测试，task-106 与 task-113 这类缺陷都会再次溜过去**。

## 既有护栏抓住新引入的回归（错误码改造的由来）

实现者第一版把 **provider 的原始错误消息**带进了错误对象。这会被既有测试当场拦下：`src/services/generation/__tests__/generation-harness.test.ts` 里有一条用例用假 key `test-only-key` 构造 provider 失败（`:1197`），并断言 `expect(String(failure)).not.toContain('test-only-key')`（`:1234`）与 `expect(JSON.stringify(recovered.receipt)).not.toContain('test-only-key')`（`:1243`）——因为**原始消息可能内嵌接口密钥**，不能进日志或错误对象。

最终实现改用**稳定错误码**。这是「既有护栏抓住新引入回归」的又一个实例，与本轮的真端到端用例互补：一个防「路径被替身掩盖」，一个防「诊断信息把密钥带出去」。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37738767100`**，success；本机回读 `/jobs` 确认两个 job（`plan-and-verify`、`publish`）均 success（无 1.4.0 那种 publish 未被调度的形态） |
| Release | `v1.4.2`（id `406502790`），非 draft、非 prerelease；`target_commitish` = `c540cc8fc1d651fa1860723d5386ef2f2f05b6ff`；发布时间 2026-10-08T06:45:30Z |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.2` 返回 ok: true、missing: []、invalid: []（本机执行，exit 0） |
| Signing | 按 profile 的 `allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.2.exe` | 223,561,118 | `a78c3cf317105da195265b069bd10201496b1213e4c142d2818a1a1f83c3bc4d` |
| `inkweaver-setup-1.4.2.exe.blockmap` | 233,365 | `eb93f46d6fbeace4e650cafa2c84847eecb995087c63d924423f604dec4b7127` |
| `latest.yml` | 347 | `30fa37c3a0db7cca0cc2d26962296b845225e1273996a61a9f9bd6cc1729ebcc` |
| `inkweaver-mac-arm64-1.4.2-installer.dmg` | 302,090,208 | `6fd0ca411a24163611dd2412c7aebf77955060474f381bd254d0e42b5d832b12` |
| `inkweaver-mac-arm64-1.4.2-installer.dmg.sha256` | 106 | `b60db6806e074f34f90449d758084346916b439b1288660c875ef2889f78ea17` |
| `inkweaver-mac-x64-1.4.2-installer.dmg` | 311,951,695 | `664c63bc1e2122ae3523ea546c25ee3dd343a62a61ac5f343a15b3c710cb5335` |
| `inkweaver-mac-x64-1.4.2-installer.dmg.sha256` | 104 | `9cbf9f70cf7d77cb7ffef66662aba36ba6689ce5edcdc7882221d51306c8617a` |
| `inkweaver-linux-x64-1.4.2.AppImage` | 502,276,649 | `03cea64292be6b5c65c9b513b2fe4663800b993e2129dade89f61f57fc1b271f` |
| `inkweaver-linux-x64-1.4.2.AppImage.sha256` | 101 | `6ee9b484ccada1dce8af879dfc8d1d28426d456b2b886f66cf6c369d9bc00396` |
| `inkweaver-linux-x64-1.4.2.deb` | 354,510,348 | `c1abec11d2c4d068af1c8c210599948c079f734a77ca6c3fafd3e58b56d07a8f` |
| `inkweaver-linux-x64-1.4.2.deb.sha256` | 96 | `876a0b20143bd83917d4ed4c0135983b4aed7f39b8d3f3f50aad0c02584f3b6d` |
| `inkweaver-linux-x64-1.4.2.rpm` | 298,307,753 | `6f20c07c9ecbeda30d4bb185f679cdbc492c77b7180d4e516990814948d20bb8` |
| `inkweaver-linux-x64-1.4.2.rpm.sha256` | 96 | `19dc62ea90f4cc211a3e4c2bbe138cb95d7bb6223d3e624786454247486af194` |

## 更新链路回读

`pnpm run verify:github-update-release` → **exit 1**（stderr 为「Release directory does not exist: …release\1.4.2」，原因同前十七版：本机不构建官方安装包，见 `docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `30fa37c3a0db7cca0cc2d26962296b845225e1273996a61a9f9bd6cc1729ebcc` 与 GitHub 资产 digest 一致；声明 `size: 223561118` 与远端 `inkweaver-setup-1.4.2.exe` 资产 size 一致；`releaseDate: 2026-10-08T06:32:09.428Z`。

**未验证项（残留风险）**：安装包 SHA-512 未在本机重算，该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第六次落地）

本机对 8 个关键文件取 `mtimeMs + size` 快照，跑完两个验证脚本后比对：**零漂移**。

## 用户可见变更与验收

实现侧 / 发布侧实测（非本收据作者所测，除注明「本机实测」者）：全量 node 套件 **396 文件 / 2,962 用例，0 失败**（8 skipped）；浏览器 54 文件 / 287 用例全绿；三项门禁 exit 0；**本轮新增真端到端用例所在文件本机实测 30/30 通过**，另一条相关覆盖面（e2e 文件）本机实测 6/6 通过（均见「真端到端用例」一节）。

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.1.md` 内含 1.4.1 引用 27 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.1 小节 4 处。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.4.1 残留。`pnpm-lock.yaml` 中的 `1.4.1` 是第三方依赖 `extsprintf@1.4.1`（不应改动）。

## 已知限制

- 修法②的「单轮上限 60 名」是**本轮定的部署参数**；超过 60 名的积压需要再跑一轮（提示里已说明「再次生成会自动重试」）。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布。
- macOS 资产不参与应用内更新（见 `docs/adr/0006:5`）。
- 本轮未执行新的静态安全扫描。
- 本机更新链路回读未通过（原因见其小节）。
- promotion 的「按 qualified-* 名筛选」仍未固化进仓库脚本。
- macOS x64：十七次采样中 3 次间歇失败（全在帧预算修复前），修复后 11/11；仍不宣布「已根治」。

## 1.4.2 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.2 小节）

- 修复：自动建档角色的资料此前 100% 没有被填充（补档在已释放的生成会话上必然失败、且被兜底静默）；现在补档有自己的生成窗口、一轮内循环分批（每批 12 名、上限 60）、失败可察觉、诊断使用稳定错误码。
- 优化：章节名改为可读性优先；修仙/玄幻等题材主动创造成体系的功法/招式/法宝/丹药/阵法并在实战中写清用法与代价，且沿用既有名称。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.2`（本机，exit 0）；
- `GET …/releases/tags/v1.4.2`、`GET …/git/ref/tags/v1.4.2` → `git/tags/f919ea29…`；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion `37738767100` 的 job 列表）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `src/services/workflows/commands/directory.command.ts:550-553`（修复后对根因的注释与独立窗口的实现）；
- `pnpm exec vitest run src/services/workflows/commands/__tests__/directory.command.test.ts`（本机实测 30/30，含本轮新增的「补档走真实生成运行时」用例）与 `…/directory-character-enrichment-e2e.test.ts`（本机实测 6/6，另一条覆盖面）；
- `git show --stat 269b7f0 -- <directory.command.test.ts>` 与 `git show c2857ef:<同文件> | Select-String "真实生成运行时"`（本轮新增用例的归属复核：+115/−2、旧版本零命中）；
- `src/services/generation/__tests__/generation-harness.test.ts:1234/1243`（密钥不外泄的既有护栏）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见「更新链路回读」）。

