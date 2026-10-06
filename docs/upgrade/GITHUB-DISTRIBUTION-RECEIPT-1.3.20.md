# 1.3.20 GitHub 分发核验收据

核验日期：2026-10-06（Asia/Hong_Kong；Release 发布于 2026-10-06T01:09:27Z，本机核验时刻 2026-10-06T09:10 HKT）

这是 1.3.20 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前四版一致（含 Actions 运行自证）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `8eee0ebed08114d4a71abbbfe197810aa92d0ebf` |
| 提交 | `23f6045 fix(budget): size architecture and directory prompts by model context` + `8eee0eb chore(release): prepare v1.3.20` |
| tag | `v1.3.20`（annotated）；tag 对象 `394fed36f1124a15f5439e6c98013140b7a74a20`（type=tag，tagger `shuishuipingan`，2026-10-06T00:45:03Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.20` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-36 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-36 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

## 平台资格（全部绑定 SHA `8eee0ebe…`）

四个平台**全部 attempt 1 一次通过，无重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37395636964`，attempt 1 | `qualified-windows` = `11384000435` | success |
| macOS arm64 | run `37395642545`，attempt 1 | `qualified-macos-arm64` = `11382743265` | success |
| macOS x64 | run `37395647387`，attempt 1 | `qualified-macos-x64` = `11382354242` | success |
| Linux x64 | run `37395652139`，attempt 1 | `qualified-linux-x64` = `11384185326` | success |

四个 run 的 `head_sha` 均为 `8eee0ebed0…`（同一冻结提交）。与 1.3.16（macOS x64 抖动重派）、1.3.18（Windows attempt 1 崩在 `smoke:win-v025-upgrade` 的进程句柄保留、attempt 2 通过）相比，本轮与 1.3.19 一样零重跑。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37397404495`，attempt 1、success（本机回读 Actions API 确认），`head_sha` = `8eee0ebed0…`；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.20`（id `404210627`），非 draft、非 prerelease；`target_commitish` = `8eee0ebed08114d4a71abbbfe197810aa92d0ebf`；发布时间 2026-10-06T01:09:27Z |
| Release body | 由 CHANGELOG 的 1.3.20 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.20` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19/1.3.20 连续两次一次通过）

| 版本 | promotion 结果 | 说明 |
| --- | --- | --- |
| 1.3.18 | 首次 run `37214225255` = failure（`qualification artifact name mismatch`），修正后 `37214508284` = success | 取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics` 而非 `qualified-windows`） |
| 1.3.19 | run `37218555871`，attempt 1 success | 发布侧改为按 `qualified-*` 名精确筛选 |
| 1.3.20 | run `37397404495`，attempt 1 success | 沿用同一取值方式 |

可核验的边界（沿用 1.3.19 收据的口径，避免把"操作层的取值修正"误记成"仓库里的代码修复"）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。也就是说两次连续成功来自发布侧的取值方式，尚未固化进仓库代码；若要彻底消除该类人工取值，建议把"按 `qualified-*` 名筛选"写进脚本（或调用参数）并提交。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.20.exe` | 223,540,033 | `94cd07eba050d7d2ee4b289bead87ff755168cf801ae39c8ee43040a81f418a6` |
| `inkweaver-setup-1.3.20.exe.blockmap` | 233,188 | `caa9f95a7bc0076f1ef641c1eaaca7be87014aa6d26c4da9301fe0b321077de6` |
| `latest.yml` | 350 | `3f5868c6683939e572749c9bd5310ce48033d013dae099b2072b6486444ddbad` |
| `inkweaver-mac-arm64-1.3.20-installer.dmg` | 302,018,386 | `99c32baf10e24b4241044e4c03cd944e44b0448053b1cc3d2c8cfbc9a676a1e7` |
| `inkweaver-mac-arm64-1.3.20-installer.dmg.sha256` | 107 | `83a9eaf3e509ad394359d00ae4f56359ad4addb7b1da6bae8f97e4517933e23c` |
| `inkweaver-mac-x64-1.3.20-installer.dmg` | 311,884,988 | `2650845d97830960cbb5c45338af7b1e50a429e42baff5ce4fd05acb8b4d044b` |
| `inkweaver-mac-x64-1.3.20-installer.dmg.sha256` | 105 | `267b9efa2b6313e374bb1ef321c093cf4d7aafee26c3c32635c6f4f4eaac6497` |
| `inkweaver-linux-x64-1.3.20.AppImage` | 502,243,222 | `047c198e6b829db5ce97f65ff1bf0676efb9147b17198577e744ee970d690076` |
| `inkweaver-linux-x64-1.3.20.AppImage.sha256` | 102 | `d8c51cf4bc2e54348a8dfce7bf8b3ac19619368ce6c7130163cd47af165ccf10` |
| `inkweaver-linux-x64-1.3.20.deb` | 354,470,272 | `04d598cd8bac98d6c0654d1ca79a84e007a6ec8466aac286395fbf93ee4c8d0e` |
| `inkweaver-linux-x64-1.3.20.deb.sha256` | 97 | `4ed86b52699c5ae321091c10942469f7c2bbe763f3d4182e198e7afadc3ac28c` |
| `inkweaver-linux-x64-1.3.20.rpm` | 298,279,145 | `3dc40b80642d38c07eb7f41179afe51bb415077cad8967684f6838c903341b8a` |
| `inkweaver-linux-x64-1.3.20.rpm.sha256` | 97 | `7987b40247c476178ae3bdaa4dd58ed37a0948e6741d81e9c13c90b7eeb14267` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.20`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.20 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 / 1.3.17 / 1.3.18 / 1.3.19 四次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `3f5868c6683939e572749c9bd5310ce48033d013dae099b2072b6486444ddbad` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.20`、`path/url: inkweaver-setup-1.3.20.exe`、`size: 223540033`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-06T00:55:52.935Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.20.exe` 资产 size（223,540,033）数值一致。

**未验证项（残留风险，与前四版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮修复的是架构与目录两条生成链路的**固定提示词上限**：它们此前写死输入上限（架构 24,000 字节、目录 16,384 字节），完全不看所用模型的上下文能力，于是大上下文模型下，一份合理的世界观设定（全局指导 21,760 + 主角设定 15,434 + 故事前提 1,800 = 41,516 字节）被判超限并报 `PROMPT_BUDGET_EXHAUSTED`。现在两条链路与草稿链路一样按模型上下文动态计算（上下文未知时保守回退）。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 公式算例（`contextWindowTokens=1,000,000`、`reservedOutputTokens=32,768`、2 条消息） | `limitInputTokens=96,000`、`limitUtf8Bytes=191,934`（架构旧值 24,000 的 8.0 倍、目录旧值 16,384 的 11.7 倍） |
| 上下文未知时的保守回退 | 16,384 tokens / 32,702 字节 |
| 用户场景回归（精确 41,516 字节夹具） | 新实现：判定通过；旧实现（固定 24,000、无 adaptive）：必然 `PROMPT_BUDGET_EXHAUSTED` —— 两组结果相反，构成判别力 |
| 全量 node 套件 | 354 文件 / 2,664 用例，0 失败 |
| 浏览器套件 | 46 文件 / 264 用例，全绿 |

上表用于说明修复后大上下文模型下的输入上限与旧行为的差异；它不构成对文学质量、检索精度或第三方 provider 行为的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.19` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.19 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.19.md`：1.3.19 历史收据（30 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.19 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.19 收据中的扫描边界说明不适用于 1.3.20。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），连续两次成功仍依赖发布侧取值正确。

## 1.3.20 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.20 小节）

- 修复生成小说架构与目录时被固定提示词上限拦住（报"提示词预算不足"）：这两条链路此前使用写死的输入上限（架构 24,000 字节、目录 16,384 字节），完全不看所用模型的上下文能力；使用大上下文模型时，一份合理的世界观设定会被判超限而无法生成。现在它们与草稿链路一样按模型上下文动态计算输入上限（上下文未知时仍保守回退），同一份配置不再撞墙。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.20`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.20`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.20` → `git/tags/394fed36…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}`（四个资格 run 与 promotion run 的 attempt、conclusion、head_sha）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
