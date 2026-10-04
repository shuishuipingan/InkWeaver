# 1.3.17 GitHub 分发核验收据

核验日期：2026-10-04（Asia/Hong_Kong；Release 发布于 2026-10-04T14:28:09Z，本机核验时刻 22:29 HKT）

这是 1.3.17 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段与资产清单由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节，未通过即未通过。口径与 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.16.md` 一致。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `bbbdffa5ed62bea7773ac6f33c847736bd64de26` |
| 提交 | `d70c4b7 fix(kb): let the built-in local embedding model generate vectors` + `bbbdffa chore(release): prepare v1.3.17` |
| tag | `v1.3.17`（annotated）；tag 对象 `7b6c9530c4d525b41500216dcce8b3f023ec7bac`（type=tag，tagger `shuishuipingan`，2026-10-04T14:05:47Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.17` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-19 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-19 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论 |

## 平台资格（全部绑定 SHA `bbbdffa5…`）

本次四个平台**一次通过，无重派**。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37208009990`，attempt 1 | `qualified-windows` = `11304809383` | success |
| macOS arm64 | run `37208013281`，attempt 1 | `qualified-macos-arm64` = `11305039620` | success |
| macOS x64 | run `37208016867`，attempt 1 | `qualified-macos-x64` = `11305494263` | success |
| Linux x64 | run `37208022147`，attempt 1 | `qualified-linux-x64` = `11305464147` | success |

**与 1.3.16 的对照（如实记录）**：1.3.16 的 macOS x64 资格曾因 `RelationshipGraph.performance.browser.tsx` 的帧时间阈值在共享 runner 上抖动，两次 attempt 失败后重派一次才通过（见 `GITHUB-DISTRIBUTION-RECEIPT-1.3.16.md` 的`平台资格`一节）。本次同一用例一次通过，未发生重派，也不需要任何"runner 抖动"判定。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37209106281`，success；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.17`（id `403056228`），非 draft、非 prerelease；`target_commitish` = `bbbdffa5ed62bea7773ac6f33c847736bd64de26`；发布时间 2026-10-04T14:28:09Z |
| Release body | 由 CHANGELOG 的 1.3.17 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.17` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.17.exe` | 223,542,820 | `5dff76a220b8abc77f85beb99940aa3e0f2f5784b69b92f10edaa387cb01fa0a` |
| `inkweaver-setup-1.3.17.exe.blockmap` | 233,419 | `1aa1b3baa3672a4cbec99103d530d89c51c3e8ac2c469acc5d764dcd31620270` |
| `latest.yml` | 350 | `2ae52cb8ab4a4293d30846fee39602f6f9fc3cb72530f51e74a81a1bab4c08cd` |
| `inkweaver-mac-arm64-1.3.17-installer.dmg` | 302,023,598 | `454b5f90284cb6815a36afd2ab079d47530b5a1ac686a7ddad8a1ed31b5a4104` |
| `inkweaver-mac-arm64-1.3.17-installer.dmg.sha256` | 107 | `518020e66930c287c7ef4a9171b95dce3315b063b16dc0b6614ae3ad9c70da48` |
| `inkweaver-mac-x64-1.3.17-installer.dmg` | 311,878,651 | `ef6230f7cbb6b63acbd509bf0b063b416dcaae146141bc183946ff1ceb137b14` |
| `inkweaver-mac-x64-1.3.17-installer.dmg.sha256` | 105 | `a54687499eba16db638051b2a1814641b526468fa859144c7b89ca3469634cb5` |
| `inkweaver-linux-x64-1.3.17.AppImage` | 502,240,021 | `4b5283d44fe1e54245ec394f37e9f672223e78e3b131833a126aee2a0575bd50` |
| `inkweaver-linux-x64-1.3.17.AppImage.sha256` | 102 | `a89278058da08dbde9e932a6bbe3e11db6f7511adcd0f4baca69eae114da56cc` |
| `inkweaver-linux-x64-1.3.17.deb` | 354,468,664 | `f11f037bd189a6c8431f224fd78409762a95c00d7b0504b8695b2ef1439e5a5e` |
| `inkweaver-linux-x64-1.3.17.deb.sha256` | 97 | `06ab9d6bedcaff8822fd8101c78bd197f8d0e6a588416e31d518058dfec1ff75` |
| `inkweaver-linux-x64-1.3.17.rpm` | 298,310,157 | `c2a3ceb9910c1e64df167f3f1d23533c32d768344ed2469c41523356aa1cfa44` |
| `inkweaver-linux-x64-1.3.17.rpm.sha256` | 97 | `69c45cd3bff867926f5fdc786fa66182400998695d9ed17666d1ad4935a53dcf` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.17`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.17 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。故失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 时完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `2ae52cb8ab4a4293d30846fee39602f6f9fc3cb72530f51e74a81a1bab4c08cd` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.17`、`path/url: inkweaver-setup-1.3.17.exe`、`size: 223542820`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-04T14:16:39.340Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.17.exe` 资产 size（223,542,820）数值一致。

**未验证项（残留风险，与 1.3.16 相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.16` 命中仅剩两处历史文件，均为应保留的历史记录、非缺陷：

- `CHANGELOG.md`：1.3.16 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.16.md`：1.3.16 历史收据（31 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.16 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.16 收据中的扫描边界说明不适用于 1.3.17。
- 本机更新链路回读未通过，残留风险见上一节。

## 1.3.17 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.17 小节）

- 修复内置本地向量模型在导入知识库、检索资料与"检测并重建向量索引"时被误判为"未配置 Embedding 模型"：这三条链路沿用了 API 向量模型对凭据（Base URL 与 API Key）的要求，而本地模型没有凭据，导致导入不生成向量（静默退化为纯全文检索）、重建索引直接报错。修复后本地模型在三条链路正常生成向量，API 向量模型的行为与原有降级路径保持不变。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.17`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.17`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.17` → `git/tags/7b6c9530…`（annotated tag 对象与 peel 结果）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
