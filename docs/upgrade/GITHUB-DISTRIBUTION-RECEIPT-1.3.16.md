# 1.3.16 GitHub 分发核验收据

核验日期：2026-10-04（Asia/Hong_Kong；Release 发布于 2026-10-03T18:15:22Z，与 CHANGELOG 的 1.3.16 段落日期一致）

这是 1.3.16 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段与资产清单由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节，未通过即未通过。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `3a69421e5fb1dc3ecf83c6294deb722bc61a6fbd` |
| 提交 | `d9906ae fix(embedding): resolve built-in model readiness against the real Hub layout` + `3a69421 chore(release): prepare v1.3.16` |
| tag | `v1.3.16`（annotated）；tag 对象 `dacbd606d50de700aef40bf61a95b3cf470987ef`（type=tag，tagger `shuishuipingan`，2026-10-03T17:33:53Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.16` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（1.3.15 版的用例数不可沿用）。发布流程记录：本地全量浏览器套件 264 用例全绿（作为下述 macOS x64 抖动的判定依据） |

## 平台资格（全部绑定 SHA `3a69421e…`）

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37140981872`，attempt 1 | `qualified-windows` = `11280054842` | success |
| macOS arm64 | run `37140985968`，attempt 1 | `qualified-macos-arm64` = `11280556984` | success |
| macOS x64 | run `37142453767`，attempt 1 | `qualified-macos-x64` = `11281071776` | success（含重派，见下） |
| Linux x64 | run `37140995397`，attempt 1 | `qualified-linux-x64` = `11281215108` | success |

**macOS x64 重派说明（如实记录，不美化）**：首次 run `37140990679` 的两次 attempt 均失败，失败点为 `RelationshipGraph.performance.browser.tsx` 的 202 节点帧时间 p95 `116.7` / `133.3`，超出该用例预算；同一源码在本机跑全量浏览器套件 264 用例全绿，因此判定为共享 runner 的性能抖动而非代码缺陷，未改动任何代码，按 `.release/release-profile.json` 的重试策略重新派发 run `37142453767`（attempt 1）后通过。该抖动是重复现象：1.3.15 的 macOS x64 资格亦曾因同一用例的帧时间阈值在共享 runner 上抖动而重派（见 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.15.md:24`）。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37143240393`，success；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.16`（id `402633181`），非 draft、非 prerelease；`target_commitish` = `3a69421e5fb1dc3ecf83c6294deb722bc61a6fbd`；发布时间 2026-10-03T18:15:22Z |
| Release body | 由 CHANGELOG 的 1.3.16 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.16` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.16.exe` | 223,542,178 | `ff1e000e29e0dc51fc0baed7817120cdf4612f59d340e4d499f928d6e908c999` |
| `inkweaver-setup-1.3.16.exe.blockmap` | 232,642 | `e154a33fb017cb7e41fe19e7f1b26b4c9cc3c465171141515401596fc1c005c8` |
| `latest.yml` | 350 | `0260d4755ea8ea3b1521f1da6262bc32359408a34787bd97c347e05562b03d06` |
| `inkweaver-mac-arm64-1.3.16-installer.dmg` | 302,023,123 | `6c1ce36b9ff4041e7d59c4155a67052f8892fbfec9faf0242d603a076e21fafb` |
| `inkweaver-mac-arm64-1.3.16-installer.dmg.sha256` | 107 | `c50077fd714a262abd253ce6e741556e1c8ff7359ecd96065528de2d602cac5d` |
| `inkweaver-mac-x64-1.3.16-installer.dmg` | 311,880,759 | `34f059fe7e76b9c2d2f8eb2c4a1f292f878d8e63ae0a0b2cca07b6702a9669a8` |
| `inkweaver-mac-x64-1.3.16-installer.dmg.sha256` | 105 | `f3524903683d5e068bf9b39f96cd46d53572e044bfbb1b7af5a3fb8ad2e33ad4` |
| `inkweaver-linux-x64-1.3.16.AppImage` | 502,240,308 | `52c5c6cc6babb06a62b78cfb75fb3468704fd787c5b8953627c1ada557028dfe` |
| `inkweaver-linux-x64-1.3.16.AppImage.sha256` | 102 | `5ff73a6bf3a6f1b95f1d6320de219da8f7eec4b3b02d848d33175bd95b33771c` |
| `inkweaver-linux-x64-1.3.16.deb` | 354,467,716 | `64677b70012b7b0d9537247dec62f6d824d9937dfdfb24e53a6cd7c68baed698` |
| `inkweaver-linux-x64-1.3.16.deb.sha256` | 97 | `bc60461e72b514fcccc577fc1ea246c1e34dba7ec7fc7a081f83f7eade426de7` |
| `inkweaver-linux-x64-1.3.16.rpm` | 298,302,565 | `4a47d3ed182108db7d0357cc27c586e3e1f263792e7b1ee7c564e490cbce7cf4` |
| `inkweaver-linux-x64-1.3.16.rpm.sha256` | 97 | `bd3e69bfbfc521a950a4a2fd1425c4c51c8b3978f4fc9bb66b5c11db420a52a2` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.16`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.16 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。故失败点是"本地产物缺失"，脚本未进入网络比对阶段。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `0260d475…b03d06` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.16`、`path/url: inkweaver-setup-1.3.16.exe`、`size: 223542178`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-03T17:44:51.804Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.16.exe` 资产 size（223,542,178）数值一致。

**未验证项（残留风险）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。建议把 `verify:github-update-release` 在本机的"产物缺失失败"明确写进发布 runbook，避免每次发布都以一个已知必然失败的门禁收尾。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.15` 命中仅剩两处历史文件，均为应保留的历史记录、非缺陷：

- `CHANGELOG.md`：1.3.15 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.15.md`：1.3.15 历史收据（9 处）。

`README.md` / `README_en.md` / `docs/quickstart/README.md` 无 1.3.15 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.15 收据中的扫描边界说明不适用于 1.3.16。
- 本机更新链路回读未通过，残留风险见上一节。

## 1.3.16 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.16 小节）

- 修复"已下载并选中的内置向量模型被误判为未配置向量模型"：下载落点与就绪判定统一为同一份路径约定，旧版本留下的另一种落点目录继续被识别。
- 修复同一模型仓库的不同量化档位互相冒充已下载：只有该档位自己的权重文件存在才算已下载。
- 修复删除内置向量模型时旧落点目录残留。
- 设置里的"已选中"不再等同于"可用"：仅在模型真正下载完成后显示就绪。
- 内置向量模型的来源选项说明改为中英文双语。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.16`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.16`（tag / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.16` → `git/tags/dacbd606…`（annotated tag 对象与 peel 结果）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
