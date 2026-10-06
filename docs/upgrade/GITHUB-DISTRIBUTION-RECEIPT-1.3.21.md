# 1.3.21 GitHub 分发核验收据

核验日期：2026-10-06（Asia/Hong_Kong；Release 发布于 2026-10-06T13:53:57Z，本机核验时刻 2026-10-06T21:55 HKT）

这是 1.3.21 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前五版一致（含 Actions 运行自证）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `58b27a83c45d0e7b9169d195a8e76eec8d17d816` |
| 提交 | `42dfd49 fix(workflows): diagnose structured decode failures and infer reasoning family`（12 files, +1168/−169） + `58b27a8 chore(release): prepare v1.3.21` |
| tag | `v1.3.21`（annotated）；tag 对象 `78c9ccd4e29e89056ac658bb43a924e235de4e7c`（type=tag，tagger `shuishuipingan`，2026-10-06T13:23:42Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.21` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-43 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-43 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

## 平台资格（全部绑定 SHA `58b27a83…`）

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37470467088`，attempt 1 | `qualified-windows` = `11417124919` | success |
| macOS arm64 | run `37470480703`，attempt 1 | `qualified-macos-arm64` = `11416522025` | success |
| macOS x64 | run `37470488648`，**attempt 2** | `qualified-macos-x64` = `11418420301` | success（attempt 1 失败后重跑，见下） |
| Linux x64 | run `37470499948`，attempt 1 | `qualified-linux-x64` = `11417203889` | success |

四个 run 的 `head_sha` 均为 `58b27a83c4…`（同一冻结提交，重跑未换代码）。

## macOS x64 runner 抖动：跨版本并列对照

macOS x64 的渲染进程浏览器测试在共享 runner 上反复出现同一处性能断言失败。本节把可核验的三条证据并列，供后续判断"是否需要改测试阈值或更换 runner"。

| 版本 | 运行 | attempt 1 | attempt 2 | 最终结果 |
| --- | --- | --- | --- | --- |
| 1.3.16 | run `37140990679`（head `3a69421e5f`） | failure（`RelationshipGraph.performance.browser.tsx` 帧时间 p95 `116.7` / `133.3` 超预算） | **failure**（同一测试） | 该 run 报废，**重派新 run** `37142453767`（attempt 1）才通过 |
| 1.3.19 | run `37217338528` | success | — | 一次通过 |
| 1.3.20 | run `37395647387` | success | — | 一次通过 |
| 1.3.21 | run `37470488648`（head `58b27a83c4`） | failure（`AssertionError: expected 116.7 to be less than 105`） | success | attempt 2 通过 |

可核验细节（本机回读 Actions API 得到）：1.3.16 与 1.3.21 两次失败都落在同一个 job `package-and-qualify` 的同一个 step `Run renderer browser tests`；两次 attempt 1 的失败数值都是 **116.7**，而断言上限是 105。同一数值在两次不同版本、不同提交上复现，支持"该 macOS x64 runner 的性能特征"这一判断，而不是某次改动的回归；1.3.19 与 1.3.20 的同一套件在同一类 runner 上通过，也说明它不是确定性失败。本地同套件（46 文件 / 264 用例）全绿。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37473937227`，attempt 1、success（本机回读 Actions API 确认），`head_sha` = `58b27a83c4…`；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.21`（id `404784483`），非 draft、非 prerelease；`target_commitish` = `58b27a83c45d0e7b9169d195a8e76eec8d17d816`；发布时间 2026-10-06T13:53:57Z |
| Release body | 由 CHANGELOG 的 1.3.21 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.21` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19/1.3.20/1.3.21 连续三次一次通过）

| 版本 | promotion 结果 | 说明 |
| --- | --- | --- |
| 1.3.18 | 首次 run `37214225255` = failure（`qualification artifact name mismatch`），修正后 `37214508284` = success | 取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics` 而非 `qualified-windows`） |
| 1.3.19 | run `37218555871`，attempt 1 success | 发布侧改为按 `qualified-*` 名精确筛选 |
| 1.3.20 | run `37397404495`，attempt 1 success | 沿用同一取值方式 |
| 1.3.21 | run `37473937227`，attempt 1 success | 沿用同一取值方式 |

可核验的边界（沿用前两版收据的口径，避免把"操作层的取值修正"误记成"仓库里的代码修复"）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。三次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.21.exe` | 223,542,773 | `4d945fa401d84160f74b3f52c6f2e3702f9f7fdf33b74efe79b72f3cbe6bb012` |
| `inkweaver-setup-1.3.21.exe.blockmap` | 234,149 | `7625a3e9546f7086230e12ba0c6ce026b69fc922f04a1d91d253a0e3a13406d2` |
| `latest.yml` | 350 | `1263f66b29dd6d2ba436f8d31c6b936683a9002e0f5547285e98f0a6300237c1` |
| `inkweaver-mac-arm64-1.3.21-installer.dmg` | 302,009,123 | `d2a1eb7c3903ad886d2d6c8148d42b7f05c6dcc600bd088c529f7dc385603d3a` |
| `inkweaver-mac-arm64-1.3.21-installer.dmg.sha256` | 107 | `ea49f3b7104bc70236781bebceb05a5382e3eb6da14c4034f5428c56a359df15` |
| `inkweaver-mac-x64-1.3.21-installer.dmg` | 311,882,788 | `1c7b6fc261e45957eff23b799353a2b0bd0059d7bbff7fb8b8715c6c59eb176b` |
| `inkweaver-mac-x64-1.3.21-installer.dmg.sha256` | 105 | `b7e03e4cb89c8aefc26b46a6ceb0e3a9d4767ac34dd714189318b0cca8c32f25` |
| `inkweaver-linux-x64-1.3.21.AppImage` | 502,239,494 | `e7745dcdcdcdea151d9cdb5708f4aa929aa38fbc64577882ed32013d5da5e859` |
| `inkweaver-linux-x64-1.3.21.AppImage.sha256` | 102 | `abaa32f33b35043154966854e5a90bb8c1cf7c6fa51dcd48094736f998b3afb2` |
| `inkweaver-linux-x64-1.3.21.deb` | 354,470,052 | `865f04ed25727cfbd6264a2818048c777a242c99a2e0fd5174e44afb46aa6153` |
| `inkweaver-linux-x64-1.3.21.deb.sha256` | 97 | `dff2ce54f2334cad2d008147aaa3c8f91e7a9c2ea92b690c63d7e6348987f18f` |
| `inkweaver-linux-x64-1.3.21.rpm` | 298,292,901 | `6be0997ddd1ce21439a574232e89c3860b75941c44bdb197af45fc7d702c8f45` |
| `inkweaver-linux-x64-1.3.21.rpm.sha256` | 97 | `6dc46ed11fddda2e80a87d9d599796a4cc3cbc81724ef197412949d9b9ffde0a` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.21`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.21 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 / 1.3.17 / 1.3.18 / 1.3.19 / 1.3.20 五次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `1263f66b29dd6d2ba436f8d31c6b936683a9002e0f5547285e98f0a6300237c1` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.21`、`path/url: inkweaver-setup-1.3.21.exe`、`size: 223542773`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-06T13:35:18.949Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.21.exe` 资产 size（223,542,773）数值一致。

**未验证项（残留风险，与前五版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮两条交付线：

- **A（新增）**：推理强度自动适配新模型。此前每个模型都要在内置目录逐个登记，未登记者在设置里显示"—(不支持/不发送参数)"；现在未登记模型按厂商与家族自动匹配（8 个家族：openai gpt-5+/o3+、xai grok-4+、moonshot kimi-k2+、gemini 2.5+、deepseek v4+、qwen3+、bigmodel glm-4.5+/5+、anthropic claude-3+），并复用同类已验证条目的参数取值；确定不支持的家族（mistral、moonshot-v1、deepseek-r、o1/o2、claude-2）与网关型 provider（ollama / siliconflow / novelai）保持不发送。推理字段按模型能力走，不受网关地址约束。
- **B（修复）**：结构化输出解码失败现在给出可定位的错误码与 JSON 路径（例如 `slots[3].narrativeDuty`），不再只有一句"结构化输出无法按合同解码"；模型输出含多个 JSON 对象时逐个按合同择优；未闭合片段不再误杀整次扫描。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 358 文件 / 2,740 用例，0 失败 |
| 浏览器套件 | 46 文件 / 264 用例，全绿 |
| 三项门禁 | `typecheck` / `i18n` / 运行时日志覆盖，exit 0 |
| 推理链端到端护栏（新增 10 条） | 直接断言"策略 → provider 真实请求体"：4 个 adapter 逐条落体（`body.reasoning_effort` / `body.thinking` / `generationConfig.thinkingConfig.thinkingBudget`），含 NovelAI 守卫与"不支持时请求体不含任何推理字段"的反证 |
| 用户 6 个模型 | 含网关下的 `gpt-6.1-sol` 与 custom 下的 `claude-opus-5-5`，逐条断言结果非 `unsupported` |
| 既有 64 条内置条目 | 解析结果零回归（逐字比对 adapter + supportedEfforts + providerValues） |

上表用于说明两条交付线的验收覆盖面；它不构成对文学质量、第三方 provider 行为或真实模型输出质量的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.20` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.20 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.20.md`：1.3.20 历史收据（32 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.20 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.20 收据中的扫描边界说明不适用于 1.3.21。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），三次连续成功仍依赖发布侧取值正确。
- macOS x64 runner 的渲染进程性能断言已三次出现同类失败（见`macOS x64 runner 抖动`）；本轮通过 attempt 2 自愈，但仍消耗一次重跑额度。

## 1.3.21 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.21 小节）

- 新增：推理强度自动适配新模型——未登记模型按厂商与模型家族自动匹配（覆盖 GPT-5 及以上与 o 系、Grok-4 及以上、Kimi K2 及以上、Gemini 2.5 及以上、DeepSeek V4 及以上、Qwen3 及以上、GLM-4.5/5 及以上、Claude 3 及以上），复用同类已验证模型的参数取值；确定不支持的家族与网关型供应商保持不发送。
- 修复：结构化解码失败无法定位——现在给出错误码与具体路径；多个 JSON 对象逐个按合同尝试并取可用的那个；未闭合片段不再让整次扫描失败。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.21`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.21`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.21` → `git/tags/78c9ccd4…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run、promotion run，以及 1.3.16 的 `37140990679` 与本轮的 `37470488648` 失败 step 对照）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
