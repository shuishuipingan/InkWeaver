# 1.3.19 GitHub 分发核验收据

核验日期：2026-10-05（Asia/Hong_Kong；Release 发布于 2026-10-04T17:01:00Z，本机核验时刻 2026-10-05T01:02 HKT）

这是 1.3.19 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前三版一致。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `81fc57a38ae87560663289185facc40b26d7ba7b` |
| 提交 | `8b2570d fix(embedding): point inference at the configured model cache` + `81fc57a chore(release): prepare v1.3.19` |
| tag | `v1.3.19`（annotated）；tag 对象 `ff562c3003b9c3d364659819d1a6fd0b2822a333`（type=tag，tagger `shuishuipingan`，2026-10-04T16:35:21Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.19` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-30 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-30 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论 |

## 平台资格（全部绑定 SHA `81fc57a3…`）

四个平台**全部 attempt 1 一次通过，无重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37217329821`，attempt 1 | `qualified-windows` = `11308284606` | success |
| macOS arm64 | run `37217334354`，attempt 1 | `qualified-macos-arm64` = `11308858663` | success |
| macOS x64 | run `37217338528`，attempt 1 | `qualified-macos-x64` = `11309072237` | success |
| Linux x64 | run `37217342339`，attempt 1 | `qualified-linux-x64` = `11309810170` | success |

四个 run 的 `head_sha` 均为 `81fc57a38a…`（同一冻结提交）。与 1.3.16（macOS x64 抖动重派）和 1.3.18（Windows attempt 1 崩在 `smoke:win-v025-upgrade` 的进程句柄保留、attempt 2 才通过）相比，本轮无任何重跑。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37218555871`，attempt 1、success（本机回读 Actions API 确认），`head_sha` = `81fc57a38a…`；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.19`（id `403117412`），非 draft、非 prerelease；`target_commitish` = `81fc57a38ae87560663289185facc40b26d7ba7b`；发布时间 2026-10-04T17:01:00Z |
| Release body | 由 CHANGELOG 的 1.3.19 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.19` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（针对 1.3.18 的 promotion 失败）

1.3.18 的 promotion 首次运行 `37214225255` 因取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics` 而非 `qualified-windows`）报 `qualification artifact name mismatch` 而失败（见 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.18.md`）。本轮发布侧把取值改为**按 `qualified-*` 精确匹配**，promotion 一次通过。

可核验的边界（避免把"操作层的取值修正"误记成"仓库里的代码修复"）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **均没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动是 `0e9fb74`，"add qualified Linux packages for v1.3.6"），工作树也干净。也就是说本次改进落在发布侧的取值方式上，尚未固化为仓库代码；若要彻底消除该类人工取值，建议把"按 `qualified-*` 名筛选"写进脚本（或调用参数）并提交。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.19.exe` | 223,541,639 | `423f4590491f50633ba50a20abc0c1ef6b116032729ad9ff0f19be5698cb7c40` |
| `inkweaver-setup-1.3.19.exe.blockmap` | 233,224 | `e6fc9c4fb65480e57154d7a3201ff1e425f5fe5ea513f996614e8b859c490c24` |
| `latest.yml` | 350 | `816105c90e9dc9711cb73257f8d6f579a462e5b54ab64422cbd181a7f82d6e85` |
| `inkweaver-mac-arm64-1.3.19-installer.dmg` | 302,018,696 | `a12bdb8c470ff011d0d716ba5f1e422668db128a4b4c1c707ecba06ec0d9800b` |
| `inkweaver-mac-arm64-1.3.19-installer.dmg.sha256` | 107 | `d436d100fa0c7aafbc0318aa36c64e14676c574a66fffca41b0ab7313aceb6b5` |
| `inkweaver-mac-x64-1.3.19-installer.dmg` | 311,881,104 | `2ca08981da313c232d8624b4ce93536778a9b9e63485b81fe8374b08f1dfe226` |
| `inkweaver-mac-x64-1.3.19-installer.dmg.sha256` | 105 | `081a8712339ca9081776f02e80fa86705eeefab55569d3339210b7fc1af8a48c` |
| `inkweaver-linux-x64-1.3.19.AppImage` | 502,243,725 | `905090a26fa91cd422ac76161467dc5ae889bcd13b47a5e6980e61e7055a5f27` |
| `inkweaver-linux-x64-1.3.19.AppImage.sha256` | 102 | `2722933d4ec2815b14f5f6a404c35359ef439727a1b4008b620d91ddadfdf288` |
| `inkweaver-linux-x64-1.3.19.deb` | 354,470,272 | `5aef6a0547ca459a813e83d853ed8f5444e3505f04440a6605cd478c04d7a037` |
| `inkweaver-linux-x64-1.3.19.deb.sha256` | 97 | `0c2692d75fe3972c582da0fa1ac572621f75e16ae2b89ef397324509756196d7` |
| `inkweaver-linux-x64-1.3.19.rpm` | 298,304,021 | `dff1e6b6c9a8c0c0d399df8a61160e7f8f8471b59f0733d4e652432bba2967b5` |
| `inkweaver-linux-x64-1.3.19.rpm.sha256` | 97 | `dcef8fc07aa989c48f16edfe005a4ffcd54b3b3cd36535c7eae14cc15a4cd425` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.19`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.19 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 / 1.3.17 / 1.3.18 三次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `816105c90e9dc9711cb73257f8d6f579a462e5b54ab64422cbd181a7f82d6e85` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.19`、`path/url: inkweaver-setup-1.3.19.exe`、`size: 223541639`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-04T16:46:22.243Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.19.exe` 资产 size（223,541,639）数值一致。

**未验证项（残留风险，与前三版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮修复的是打包版上"检测并重建向量索引"报 `ENOTDIR, not a directory`：本地推理路径从未把模型目录告知推理组件，于是它沿用组件内置的缓存位置——打包后该位置落在只读的应用归档内部，写入必然失败，也找不到 `<userData>/models/embedding` 下已下载的权重。修复后推理与下载共用同一份缓存设置。

发布侧与实现侧的实测证据（来源：发布侧 / 实现侧实测，非本收据作者所测）：

| 验收项 | 实测结果 |
| --- | --- |
| 真实 Electron 主进程 + 生产构建产物：调用前后 `env.cacheDir` | 调用前指向组件包内目录 → 调用后变为配置的 userData 模型目录 |
| 返回值 | 512 维归一化向量 |
| 组件包内缓存目录 | 清空后**未被重建**（证明不再写入应用包内部） |
| 真实 transformers + 用户模型、`allowRemoteModels=false` | 加载成功，512 维、模长 1.000000 |
| 反例（`cacheDir` 指向空目录 + 禁网） | 失败（证明该验证确实经过缓存目录，而非偶然命中） |

上表用于说明修复后推理链路在打包形态下可用；它不构成对文学质量、检索精度或第三方 provider 行为的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.18` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.18 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.18.md`：1.3.18 历史收据（30 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.18 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.18 收据中的扫描边界说明不适用于 1.3.19。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"尚未固化进仓库脚本（见`取值改进`），仍依赖发布侧取值正确。

## 1.3.19 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.19 小节）

- 修复打包版上"检测并重建向量索引"报 `ENOTDIR`（不是目录）：本地推理此前没有把自己的模型目录告知推理组件，而是沿用组件内置缓存位置；打包后该位置在只读应用归档内部，写入必然失败，也找不到已下载的模型。现在推理与下载使用同一个模型目录，已下载模型被直接使用，不再尝试写入应用包内部。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.19`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.19`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.19` → `git/tags/ff562c30…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}`（四个资格 run 与 promotion run 的 attempt、conclusion、head_sha）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
