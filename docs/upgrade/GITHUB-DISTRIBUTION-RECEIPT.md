# 1.2.0 GitHub / 分发核验收据（正式 Release）

核验日期：2026-09-13（Asia/Hong_Kong）

这是 1.2.0 正式 Release 的远端 authoritative readback。npm 不在本轮发布范围；插件通过同一 Release 的 tarball 交付，外部文学评阅不作为工程门槛。

## 1.2.0 源码与资格绑定

| 项目 | 当前证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `2bcff9b9eca7c5eb142aa5293acad5aac78c0728` |
| tag | `v1.2.0`，解析到上述 SHA |
| 桌面版本 | `package.json` = `1.2.0` |
| 插件版本 | `@shuishuipingan/inkweaver-dsh` = `1.2.0` |
| DSH 基线 | `@deepseek-ai/dsh@0.1.5-rc.1`，Harness `183f08e9c6dde7e36cd2318eaee70b0da08fb35e` |
| DSH 资格 | ticket `128`；40 files / 433 passed / 6 skipped；profile add/remove/reinstall、V2 mount、三次 Chrome journey、schema-5 persistence 通过 |
| 插件 tarball | `shuishuipingan-inkweaver-dsh-1.2.0.tgz`，241,776 bytes，SHA-256 `0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66` |

## 1.2.0 平台资格

| 平台 | GitHub Actions run / artifact | 结果 |
| --- | --- | --- |
| Windows x64 | run `34756541922` / artifact `10317388925` | success，attempt 1，旧版升级/安装/启动/卸载/native ABI/quiet-window 证据通过 |
| macOS arm64 | run `34756544323` / artifact `10317223323` | success，attempt 1，DMG mount/packaged smoke/signing disclosure 通过 |
| macOS x64 | run `34757014312` / artifact `10317123040` | success，attempt 1，Intel LanceDB/native helper/DMG smoke 通过；早期性能抖动 run `34756546507` 不纳入发布 |

## 1.2.0 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Release | [v1.2.0](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.0)，非 draft、非 prerelease、Latest；`targetCommitish` = `2bcff9b9eca7c5eb142aa5293acad5aac78c0728` |
| Desktop assets | 七项资产完整；`scripts/verify-github-release-assets.mjs --version 1.2.0` 返回 `ok: true`、`missing: []`、`invalid: []` |
| Plugin asset | `shuishuipingan-inkweaver-dsh-1.2.0.tgz` 已上传同一 Release，GitHub digest `sha256:0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`；本地安装，不发布 npm |
| Signing | Windows unsigned；macOS unsigned/not notarized；Release body 已披露 SmartScreen/Gatekeeper 影响 |

## 1.2.0 GitHub topic

topics API 回读包含 `dsh-plugin`；搜索 `topic:dsh-plugin user:shuishuipingan` 返回 `shuishuipingan/InkWeaver`（`total_count=1`）。公开主题页：[github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin)。

以下为 1.1.0 历史收据，保留用于升级对照，不与 1.2.0 资产混用。

---

# 1.1.0 GitHub / 分发核验收据（历史正式 Release）

核验日期：2026-09-12（Asia/Hong_Kong）

这是正式 Release 的远端回读收据。npm 不在本轮发布范围；topic 证据、平台资产、插件 tarball 和源码来源分别记录，避免把某一项证据误写成另一项。

## 源码同步

| 项目 | 当前证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| GitHub About Homepage | `https://github.com/shuishuipingan/InkWeaver#readme` |
| 开发分支 | `1.1.0-development` |
| 功能源码 SHA | `b40cd124525fd7805cdf1c35f07eeee187d394eb`；Windows/macOS 三次 runtime qualification 和正式 Release 均绑定此 SHA |
| 远端主线 | `main` 通过合并提交接入冻结树；正式 tag `v1.1.0` 指向上述 SHA |
| 开发 PR | GitHub 为该分支提供 `https://github.com/shuishuipingan/InkWeaver/pull/new/1.1.0-development` |

开发线后续若继续提交，必须重新回读本地 SHA 与远端 branch SHA；本收据中的正式 tag、Release 和安装包已经绑定冻结 SHA，不因后续开发提交而漂移。

## GitHub topic

2026-09-12 通过 GitHub API 再次回读，仓库 topic 仍包含：

`cordis-plugin`、`deepseek-harness`、`dsh`、`dsh-plugin`、`novel-writing`、
`web-novel`、`writing-assistant`、`writing-assistant-ai`、`ai-writing`、
`creative-writing`、`creative-writing-ai`、`electron`、`fiction-writing`、
`local-first`、`local-first-ai`、`long-form-fiction`、`novel-writing-windows`、
`ollama`、`rag`、`worldbuilding`。

公开主题页：[github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin)。API 搜索 `topic:dsh-plugin user:shuishuipingan` 返回 `shuishuipingan/InkWeaver`（total_count=1），仓库 topics 元数据和实际索引均可见；这项证据独立于 npm 和 Release 资产。

## 正式 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Release | [v1.1.0](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.1.0)，非 draft、非 prerelease、Latest |
| Desktop qualification | Windows run `34670948171` / artifact `10290679866`；macOS ARM64 run `34670949545` / artifact `10291050076`；macOS x64 run `34670951472` / artifact `10291115154`；三者均 success、attempt 1、head SHA `b40cd124...` |
| Plugin qualification | DSH ticket `128`，Harness `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`，tarball `241389` bytes、41 entries、SHA-256 `35dd442171a426bcbea214b595f52ca7edcd20531567e3bdbc3b11e7bceb6dba` |
| Desktop assets | 七项资产完整，`scripts/verify-github-release-assets.mjs --version 1.1.0` 返回 `ok: true`、`missing: []`、`invalid: []` |
| Plugin asset | `shuishuipingan-inkweaver-dsh-1.1.0.tgz` 已上传到同一 Release；安装方式为本地 tarball，不发布 npm |
