# 1.4.4 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-08T09:13:14Z，本机核验时刻 2026-10-08T17:14 HKT）

这是 1.4.4 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（见「回读方法」）。本版收据另记一条**工程判据**（同类缺陷第三次出现后得出的修法原则）与两条**实测判别力**。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `1e26afd6157f8fb099c391327cc15d6272ce546d` |
| 提交 | `5234c4e fix(budget): size the input limit from the model instead of a fixed ceiling`（14 files, +166/−35） + `1e26afd chore(release): prepare v1.4.4`（7 files） |
| tag | `v1.4.4`（annotated）；tag 对象 `6876dbba7803db25713ee6c039516500c077496a`（tagger `shuishuipingan`，2026-10-08T08:43:00Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.4` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-124 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-124 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `1e26afd6…`）

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37751699023`，attempt 1 | success |
| macOS arm64 | run `37751704949`，attempt 1 | success |
| macOS x64 | run `37751711930`，attempt 1 | success（修复后 13/13） |
| Linux x64 | run `37751718258`，attempt 1 | success |

四个 run 的 `head_sha` 均为 `1e26afd615…`。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37753905775`**，attempt 1、success；本机回读 `/jobs` 确认两个 job（`plan-and-verify`、`publish`）均 success |
| Release | `v1.4.4`（id `406640488`），非 draft、非 prerelease；`target_commitish` = `1e26afd6157f8fb099c391327cc15d6272ce546d`；发布时间 2026-10-08T09:13:14Z |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.4` 返回 ok: true、missing: []、invalid: []（本机执行，exit 0） |
| Signing | 按 profile 的 `allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.4.exe` | 223,563,419 | `b127a366dc94a601db377b2e1a2653a1d6f3329efc0de775ce984433af6d7dd7` |
| `inkweaver-setup-1.4.4.exe.blockmap` | 233,585 | `d5a8082ca3de11fc54ba34f0be66386ec8f24156d98ca073079231fd4c4c20f8` |
| `latest.yml` | 347 | `dec0084c9d23b87c20ba3c7d12c8e6538090c10f70d7a0eb5eec3ed7c185aaae` |
| `inkweaver-mac-arm64-1.4.4-installer.dmg` | 302,071,074 | `494f05c2ba5056f3c0687003090e192959001b53b0e84708bf97e953fd953d62` |
| `inkweaver-mac-arm64-1.4.4-installer.dmg.sha256` | 106 | `9dde6edafd0c62c280e58e0c00f76425539889283bb68ad2bfc648600752660b` |
| `inkweaver-mac-x64-1.4.4-installer.dmg` | 311,955,092 | `16c4ef1518c8beee7ac19ddfe7d05543f4a38d4e7371ece9c7d86ef1ef56aa02` |
| `inkweaver-mac-x64-1.4.4-installer.dmg.sha256` | 104 | `b88bd00e1278c8573dccd722c71b9556111dda9a672f6572613bf6dcc6f3ccae` |
| `inkweaver-linux-x64-1.4.4.AppImage` | 502,276,651 | `5a51246e637a7c0a7c4db2d21bcd9ab8baa18d7d18a27dee02419ad64915d144` |
| `inkweaver-linux-x64-1.4.4.AppImage.sha256` | 101 | `f0c13c7a27c876556adf713674314c3927ac835ee5bdbeedc8748423997b9b63` |
| `inkweaver-linux-x64-1.4.4.deb` | 354,511,488 | `4feffdaedd3620a7af671fb5aaefc596f24c83755ce141f22b58520a2bd055a1` |
| `inkweaver-linux-x64-1.4.4.deb.sha256` | 96 | `586c0f1046febdfb7f007ecb0bbc982b86e7a2aa3782177bd4b784c71248c4b0` |
| `inkweaver-linux-x64-1.4.4.rpm` | 298,320,713 | `8b1bb31399822cbdfd417b395e61ee05eae1be47eceea9a3c16218916bd68f3c` |
| `inkweaver-linux-x64-1.4.4.rpm.sha256` | 96 | `5899d8f9d41fa1cb393ca6f8fe48f846152cc93062283218ce3cfef65226a724` |

## 用户可见变更（1 修复 + 1 优化）

### 修复：大上下文模型被固定输入上限拦住

用户现场：模型上下文 **1,000,000**，但写前预算显示「估算输入 121,749 / 96,000 Tokens」并阻止请求，还建议他「使用已确认的大容量模型」——而他用的就是大容量模型。根因是应用内一个**固定天花板** `DRAFT_CONTEXT_INPUT_LIMIT = 96_000`（三个命令共用，校验层还把它当硬上限）。

| | 修复前 | 修复后 |
| --- | --- | --- |
| 单次可用输入 | 固定 **96,000**（无论模型多大） | `模型上下文 − 输出预留 − 协议余量`（本机读取 `src/shared/adaptive-prompt-budget.ts:18-20` 确认函数体就是这三项相减） |
| 同一现场数字 | 96,000（被挡，估算输入 121,749） | **966,720**（121,749 可正常发送） |
| 容量未知的模型 | — | 回退 `UNKNOWN_CONTEXT_INPUT_LIMIT = 16_384`（保守） |
| 小窗口模型 | 可能把输出空间挤没 | 32,768 窗口 + 16,384 预留 → **15,872**（输出空间保住） |
| 绝对上限 | 96,000（且被当硬上限） | **刻意不设**（见下一节） |
| 提示文案 | 一律建议换模型 | 区分「被**应用侧预算**挡住」（说明换模型不会改善）与「真被**模型容量**挡住」 |

### 优化：运行期间周期性复查更新

用户实际遭遇：装了 1.4.1 之后，**1.4.2 与 1.4.3 都没被发现**（发布侧日志证据：07:40 只有 `update:get-state`、没有 `update:check`），只能在旧版本上反复撞已经修好的问题。

| | 修复前 | 修复后 |
| --- | --- | --- |
| 检查时机 | **只在启动时** | 启动 + **运行期间周期复查**（本机 `update-startup.test.ts:77` 有用例「启动后注册周期性复查，并在清理时取消定时器」） |
| 节流粒度 | 每**自然日**最多一次 | **4 小时间隔**节流 |
| 既有语义 | 串行队列、失败降级、发现后由用户决定、不自动下载安装 | **全部保留** |

## 工程判据：再设一个绝对上限就是第四次换个更大的魔数

本轮的修复方式本身就是一条判据（实现侧提出，并且**写进了代码注释**）：

> 历史教训（同一类缺陷第三次出现）：v1.3.20 把硬编码的 24,000/16,384 字节上限改成「自适应」，但天花板换成了一个固定数字（96,000 tokens），于是 1M 上下文的模型也只能发 96k。只要上限还是常量，换多大的模型都会被挡。
> 依据：可用输入 = **窗口 − 输出预留 − 协议余量**。有界性由窗口本身保证，因此这里刻意**不再设任何绝对上限**——再设一个数就是又一次「换个更大的魔数」。
> （本机读取 `src/shared/adaptive-prompt-budget.ts:7-17` 原文）

同类缺陷的三次记录：

| # | 版本 | 被当成天花板的常数 | 表象 |
| --- | --- | --- | --- |
| 1 | v1.3.20 | 架构 24,000 / 目录 16,384 **字节** | 大上下文模型写不出完整架构 |
| 2 | 1.4.2 之前 | 「恢复额度按整轮一次」计 | 160 章蓝图跑到第 7 批就整轮失败 |
| 3 | **v1.4.4** | 96,000 **tokens**（三命令共用） | 1M 上下文模型仍被挡在 96k |

**判据（本文记录）**：这类缺陷的修法**不是把常数调大，而是取消常数、让有界性由真实约束保证**（这里是模型窗口本身）。验证方式是问一句「如果模型/数据再大一个数量级，这个数会不会又变成天花板？」——会，就说明它是魔数而不是约束。

同一次修复里还有一处配套改动，也属于同一思路：`resolveAdaptivePromptBudget` 的校验**不再把某个固定数字当硬上限**（否则「想放宽策略的调用方会直接被判参数无效」——本机读取 `:43-44` 的注释原文）；`policy.adaptive.maxInputTokens` 仍是合法的可选字段，但语义是「策略声明」而非「代码常数」。

## 判别力：两条都是实测红绿

| 变异 | 实测结果（发布侧所测） |
| --- | --- |
| 把上限**夹回 96,000** | 用户场景用例变红：`expected 96000 to be 966720` |
| **恢复日界短路**（回到「每自然日一次」） | 周期复查用例变红：`expected 1 to be 2` |

另有一条**源码级护栏**：`src/services/workflows/commands/__tests__/architecture-prompt-budget-adaptive.test.ts:36` 断言命令源码 `not.toContain('DRAFT_CONTEXT_INPUT_LIMIT')`——即那个常数**一旦被写回生产代码就会被测试拦住**（本机读取确认）；同文件还有一条「判别力自证：抹掉两处 adaptive 后，上面的契约断言必然失败」（`:47`）。`generate-draft.command.test.ts:423` 也留有说明：「不再有固定的意图上限（96_000 那个天花板已删除），输入上限由模型上下文推导。」

本轮修复文件共 14 个（`5234c4e`，+166/−35），覆盖预算模块、三个命令、提示失败文案与更新链路（`update-service.ts` / `update-startup.ts`）。

## macOS x64 runner 抖动：第 19 次采样（修复后 13/13）

历史与判读口径见此前收据（3 次抖动全部在帧预算修复 `874dbad` 之前；修复前通过率 3/6、最长连续 2 次）。本轮 attempt 1 通过 → **修复后 13/13**。仍只记录事实与参照，不宣布「已根治」。

## 更新链路回读

`pnpm run verify:github-update-release` → **exit 1**（stderr 为「Release directory does not exist: …release\1.4.4」，原因同前十九版：本机不构建官方安装包，见 `docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `dec0084c9d23b87c20ba3c7d12c8e6538090c10f70d7a0eb5eec3ed7c185aaae` 与 GitHub 资产 digest 一致；声明 `size: 223563419` 与远端安装包资产 size 一致；`releaseDate: 2026-10-08T08:54:27.923Z`。

**未验证项（残留风险）**：安装包 SHA-512 未在本机重算，该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第八次落地）

本机对 8 个关键文件取 `mtimeMs + size` 快照，跑完两个验证脚本后比对：**零漂移**。

## 用户可见变更与验收

实现侧 / 发布侧实测（非本收据作者所测）：全量 node 套件 **397 文件 / 2,969 用例，0 失败**（8 skipped）；浏览器 54 文件 / 287 用例全绿；三项门禁 exit 0；本轮修改 14 文件（预算 1 + 命令 3 + 更新链路 2 + 测试与文案其余）。

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.3.md` 内含 1.4.3 引用 24 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.3 小节与 `README.md` / `README_en.md` 里各有对 1.4.3 的**叙述性引用**（1.4.4 的变更说明中叙述「1.4.2 与 1.4.3 都没被发现」这段因果，属正当引用）。`docs/quickstart/README.md` 无 1.4.3 残留。

## 已知限制

- 「模型上下文」来自模型档案声明；档案里的窗口若本身填错，推导出的预算也会跟着偏（本轮未改动档案来源）。
- 更新检查为 4 小时间隔节流，**不是**实时推送；发布后最快仍需等待一个间隔窗口。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布；macOS 资产不参与应用内更新（见 `docs/adr/0006:5`）。
- 本轮未执行新的静态安全扫描；本机更新链路回读未通过（原因见其小节）。
- promotion 的「按 qualified-* 名筛选」仍未固化进仓库脚本。
- macOS x64：采样 19 次中 3 次间歇失败（全在帧预算修复前），修复后 13/13。

## 1.4.4 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.4 小节）

- 修复：删除固定的 96,000 输入上限，改为按模型推导（窗口 − 输出预留 − 协议余量），不设绝对上限；同一现场下限额从 96,000 变为 966,720；容量未知回退 16,384；提示文案区分应用侧预算与模型容量。
- 优化：更新检查从「每自然日一次且只在启动时」改为 4 小时间隔节流 + 运行期间周期复查；串行队列、失败降级、发现后由用户决定、不自动下载安装等语义保留。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.4`（本机，exit 0）；
- `GET …/releases/tags/v1.4.4`、`GET …/git/ref/tags/v1.4.4` → `git/tags/6876dbba…`；
- `GET …/actions/runs/{runId}` 与 `/jobs`（四个资格 run；promotion `37753905775` 的 job 列表）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `src/shared/adaptive-prompt-budget.ts:7-20`（判据原文与三项目相减的实现）；
- `src/services/workflows/commands/__tests__/architecture-prompt-budget-adaptive.test.ts:36/47`（源码级护栏与判别力自证）；
- `electron/services/__tests__/update-startup.test.ts:77`（周期性复查用例）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见「更新链路回读」）。
