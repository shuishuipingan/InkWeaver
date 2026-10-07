# 1.3.27 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T07:02:36Z，本机核验时刻 2026-10-07T15:05 HKT）

这是 1.3.27 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前十版一致，并记录抖动修复后的第四次采样与**一条发布后立即发现的已知问题**（见`已知问题`）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `76b196ae61150ba0317923a03f7a24679b19040f` |
| 提交 | `e3db100 feat(agent): persist conversations in the project database`（10 files, +1225/−13） + `76b196a chore(release): prepare v1.3.27` |
| tag | `v1.3.27`（annotated）；tag 对象 `0661cf9b95f1853cf86f6c5b308ecf4f4b81a6c0`（type=tag，tagger `shuishuipingan`，2026-10-07T06:37:03Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.27` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-72 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-72 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

## 平台资格（全部绑定 SHA `76b196ae…`）

四个平台**全部 attempt 1 一次通过，零重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37582507530`，attempt 1 | `qualified-windows` = `11466152122` | success |
| macOS arm64 | run `37582514862`，attempt 1 | `qualified-macos-arm64` = `11465701184` | success |
| macOS x64 | run `37582521296`，attempt 1 | `qualified-macos-x64` = `11465686250` | success |
| Linux x64 | run `37582531950`，attempt 1 | `qualified-linux-x64` = `11465921638` | success |

四个 run 的 `head_sha` 均为 `76b196ae61…`。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`、无失败 step（本机回读确认）。

## macOS x64 runner 抖动：跨版本对照（第 10 次采样，修复后 4/4）

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
| 1.3.26 | run `37578067210` | success | — | 一次通过（修复后第 3 次） |
| **1.3.27** | run `37582521296`（head `76b196ae61`） | **success** | — | 一次通过（修复后第 4 次） |

**统计判读（严格按样本说话）**：十次采样中 7 次 attempt 1 通过、3 次抖动（116.7 / 116.7 / 116.6，上限 105），三次抖动全部发生在帧预算修复（`874dbad`，系数 1.25 → 1.5）之前。

**修复后的记录：4/4 通过。** 参照系：修复前 6 次采样中 3 次通过（3/6），且修复前的**最长连续通过为 2 次**（1.3.19 与 1.3.20）；修复后已连续 4 次通过，其中 3 次为 1.3.24–1.3.27 的连续四次。判读：这一序列已超过修复前的连续通过上界，属于**倾向于修复有效**的证据；但样本仍小（修复后 n=4），仍不排除低概率偶发，本收据继续只记录事实与参照，不宣布结论。

## 已知问题（发布后立即发现，本版引入）

**问题**：用户在本版发布后立即报告——**切换项目后，助手历史面板里显示的仍是上一个项目的会话**。用户原话："会话持久性不要跨项目，不要说，我都换项目了，记住的不是这个项目，还是上个项目。"

**根因（本机可核验）**：缺陷在**渲染层的内存合并逻辑**，不在库层。`src/stores/agent-store.ts:412-419` 的逻辑是：`restoredIds` 为库返回的会话 id 集合，然后
`const notPersisted = state.conversations.filter(c => !restoredIds.has(c.id) && c.messages.length > 0)`，
返回 `conversations: [...restored, ...notPersisted]`。这段的本意是"保留本进程刚建、尚未落库的会话"，但它的判据**无法区分"本项目尚未落库的会话"与"上一个项目的内存残留"**——会话对象本身不带项目标记，因此切换项目时上一个项目的会话被判为 `notPersisted` 而保留。本机 `git blame -L 412,419` 显示这 4 行由本版功能提交 `e3db100` 引入。

**影响范围**：
- 仅在**切换项目后**的助手历史面板可见；显示的是上一个项目的会话（元数据，选中后含正文）。
- 在这类残留会话上继续操作或删除，可能影响上一个项目的库记录——这是需要作者知悉的实际风险。
- **不影响**项目/稿件/知识库/其它面板；不含数据损坏路径（库层写操作仍按当前项目校验）。

**库层无责（判定依据）**：库侧六个通道（list / load / save / append / delete / clear）都走 `projectSession` + `expectedProjectPath` 校验，数据库内不会串项目；本次缺陷完全可由渲染层状态重置修复，本机核对 `agent-store.ts:412-419` 位于渲染层 `restoreConversations` 的合并分支。

**为什么四平台资格没拦住它**：本轮资格覆盖的是打包、安装、启动冒烟、native ABI、渲染进程浏览器套件等构建面（见`平台资格`）；"切换项目时内存状态是否重置"属于运行期交互路径，不在此类门禁的观测范围内。这一条写在这里，是为了让后续读者理解"资格全绿"与"存在该缺陷"并不矛盾。

**修复去向**：已开卡 `task-74`（星芒小酱，「修复 · 助手会话跨项目串台（切项目必须重置内存态）」），契约是项目路径变化时**先重置内存态再恢复**（新增 `resetAgentConversationsForProjectSwitch()` 一类动作，清空当前项目范围的助手内存态），并已在卡中固定触发点（`AgentConversation.tsx:23-26` 的 `projectPath` 依赖 effect）。**本收据不把该问题记为"已修复"**；修复效果需在下一版发布后由本机回读确认。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37584341816**`，attempt 1、success（本机独立交叉核对：该 run 位于 promotion workflow 最近运行列表首位，`head_sha` = `76b196ae61…`，与发布侧提供的一致）；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.27`（id `405473187`），非 draft、非 prerelease；`target_commitish` = `76b196ae61150ba0317923a03f7a24679b19040f`；发布时间 2026-10-07T07:02:36Z |
| Release body | 由 CHANGELOG 的 1.3.27 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.27` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续九次一次通过）

1.3.18 的 promotion 首次运行 `37214225255` 因取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics`）报 `qualification artifact name mismatch` 而失败；自 1.3.19 起按 `qualified-*` 名精确筛选，直到本轮共九次 attempt 1 success（37218555871 / 37397404495 / 37473937227 / 37565028245 / 37569607418 / 37573450129 / 37576477061 / 37579728622 / 37584341816）。

可核验的边界（沿用前八版收据的口径）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。九次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.27.exe` | 223,547,540 | `ba96474e73f2ede68376a3d1725addf3f2ba9521740d20fa69e07df1485cbc1c` |
| `inkweaver-setup-1.3.27.exe.blockmap` | 234,014 | `5dfb4c0fff9f301902c0e0791cee4cef6d6855d74143903d3eb4ec9710b43960` |
| `latest.yml` | 350 | `c5852ff02834246e512be2b003dd17c230b64f056b98e23c6c91e36b10de2475` |
| `inkweaver-mac-arm64-1.3.27-installer.dmg` | 302,022,428 | `0b1f4f20a0e201e5f8f2f8155e981ce8f7ff0564333a95592dd4e4dadd6ccc61` |
| `inkweaver-mac-arm64-1.3.27-installer.dmg.sha256` | 107 | `43724c15634632e7f1047ec6ae1a386f1cd121005ae55dc60b2a9c541e4ed7cc` |
| `inkweaver-mac-x64-1.3.27-installer.dmg` | 311,924,298 | `38960ee169b3ace3f1304b1660b02862b3c2fca730849130b5ff01e837ae9289` |
| `inkweaver-mac-x64-1.3.27-installer.dmg.sha256` | 105 | `27fe26138abe0d87ffa90baa42a9ed5adaf62686d463569ba0a6edac8e19ea72` |
| `inkweaver-linux-x64-1.3.27.AppImage` | 502,280,714 | `ee3aad1b124cf108e3eebcd69617cca4b424e8f239a00d2b1c66ca83da7badae` |
| `inkweaver-linux-x64-1.3.27.AppImage.sha256` | 102 | `c53c00a9932e1186b827f34c23fee9173f03527b0f4ab1a6a39e79e9f5ff6e64` |
| `inkweaver-linux-x64-1.3.27.deb` | 354,499,636 | `bcb1c0cacdd4e3d03f50fb783663d8b98e8bee86c6f2efcd5ad3c888e4d59bc8` |
| `inkweaver-linux-x64-1.3.27.deb.sha256` | 97 | `e098eb30c907279721c227cc328de450827528453099055b02873a1ff6ab102f` |
| `inkweaver-linux-x64-1.3.27.rpm` | 298,289,693 | `c7962d5f8b76316ce69ef9660cd41d15df796a45c4cb5190a22104225d30ba64` |
| `inkweaver-linux-x64-1.3.27.rpm.sha256` | 97 | `94b544ac9e81081b31fc870baa87f267c3748467247e9060f1b5b420f7b7b529` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.27`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.27 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 起连续十一次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `c5852ff02834246e512be2b003dd17c230b64f056b98e23c6c91e36b10de2475` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.27`、`path/url: inkweaver-setup-1.3.27.exe`、`size: 223547540`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-07T06:48:56.499Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.27.exe` 资产 size（223,547,540）数值一致。

**未验证项（残留风险，与前十版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮一条交付线：**助手会话按项目保存在本地数据库中，重开应用后仍在**（此前是纯内存态，关闭应用即全部丢失）。

- 会话与消息按项目保存在本地数据库；历史面板重开后保留会话，选中时才按需加载正文（列表只取元数据）。
- 面板顶部显示状态（已保存 / 读取中 / 最近一次保存失败），空状态有可读提示。
- 四条工程取舍：① **流式生成期间不写库**——只在用户消息发出时、以及助手一轮结束（正常完成 / 出错 / 被取消）时落库，避免流式输出产生成百上千次写入；② **保存失败不打断对话**——落库异常只记警告并在面板显示"最近一次保存失败"，对话继续、不弹错误；③ **删除与清空是永久操作**，界面文案已明确"同时删除本地项目库中的记录"；④ 单条消息超长会截断保存，单会话消息超过上限淘汰最旧的（助手本就有历史压缩，旧消息早已是占位符）。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 369 文件 / 2,822 用例，0 失败 |
| 浏览器套件 | 50 文件 / 278 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| 仓库层用例 | 10 条（含 2003 条 append 淘汰验证） |
| store 用例 | 4 条 |
| 浏览器用例 | 4 条 |

上表用于说明本轮交付线的验收覆盖面；它不构成对文学质量、第三方 provider 行为或真实模型输出质量的结论。**特别注意**：上表覆盖不到`已知问题`所述的切换项目场景——该场景的门禁缺口已在该节说明。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.26` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.26 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.26.md`：1.3.26 历史收据（33 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.26 残留。

## 已知限制

- **`已知问题`所述的"切换项目后助手历史面板串台"缺陷适用于 v1.3.27 及本版打包产物**；修复在 `task-74`，随下一版发布。
- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.26 收据中的扫描边界说明不适用于 1.3.27。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），九次连续成功仍依赖发布侧取值正确。
- macOS x64 runner 的渲染进程性能断言：十次采样中 3 次间歇失败（全部在帧预算修复之前），修复后 4/4 通过；仍不宣布"已修复"结论。

## 1.3.27 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.27 小节）

- 新增：助手会话按项目保存在本地数据库，重开应用后仍在（列表只取元数据、选中时按需加载正文；面板显示保存状态）。
- 两条可感知取舍：流式生成期间不写库（只在一轮结束时保存）；保存失败不打断对话（面板显示"最近一次保存失败"）。
- 删除与清空会话是永久操作，会同时删除本地项目库中的记录（界面已明确提示）。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.27`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.27`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.27` → `git/tags/0661cf9b…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run 与 macOS x64 历次 attempt）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/workflows` → promotion workflow → `/runs`（独立交叉核对本轮 promotion run）；
- `git blame -L 412,419 src/stores/agent-store.ts`（`已知问题`根因行的引入提交）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
