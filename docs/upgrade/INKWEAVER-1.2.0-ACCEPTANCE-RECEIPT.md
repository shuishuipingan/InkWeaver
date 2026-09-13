# InkWeaver 1.2.0 验收收据

状态：已冻结并发布（v1.2.0）。桌面版本、插件 tarball、三平台资格资产和 GitHub Release 均绑定源码提交 `2bcff9b9eca7c5eb142aa5293acad5aac78c0728`；后续文档审计提交不改变该发布源码树。

## 范围

本收据覆盖 1.2.0 全路线功能（Writing Skill、故事线进度/证据、规划资料、角色溯源、中文长篇链、跨平台更新、四层章节材料、连续草稿、覆盖缺口、证据化审稿、待核实和作者决策）、0–9 回归修复，以及全局日志完整性。外部文学评阅不在本轮门槛；npm 不发布。

详细依赖关系和文件地图见 [1.2.0 全路线功能与验收图](INKWEAVER-1.2.0-FEATURE-AND-ACCEPTANCE-MAP.md)。日志专门证据见 [全局日志验收收据](GLOBAL-LOGGING-ACCEPTANCE-RECEIPT-2026-09-13.md)。

## 当前工程证据

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| Root typecheck | 通过 | `pnpm run typecheck`；最终源码 SHA `2bcff9b9eca7c5eb142aa5293acad5aac78c0728`。 |
| i18n check | 通过 | `pnpm run check:i18n`。 |
| Log coverage | 通过 | `pnpm run check:runtime-log-coverage`；`uncovered=[]`。 |
| Root unit | 通过 | 最终 SHA 上 `pnpm test`：309 files / 2210 passed / 8 skipped（2218 total）。 |
| Root browser | 通过 | 最终 SHA 上 `pnpm test:browser`：39 files / 228 passed；包含日志、蓝图游标、连续草稿和 DSH renderer 回归。 |
| DSH plugin | 通过 | `@shuishuipingan/inkweaver-dsh@1.2.0`；官方 Harness `183f08e…`，40 files / 433 passed / 6 skipped；tarball 241,776 bytes / 41 entries，SHA-256 `0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`，机器收据 source commit 为最终 SHA。 |
| Windows installer | 通过 | run `34756541922` / attempt `1` / artifact `10317388925`；head SHA 为最终 SHA，安装、升级数据、原生 ABI、静默窗口和资产 manifest 全部通过。 |
| macOS arm64 | 通过 | run `34756544323` / attempt `1` / artifact `10317223323`；DMG mount、打包 smoke、签名披露和资产 manifest 全部通过。 |
| macOS x64 | 通过 | 重试 run `34757014312` / attempt `1` / artifact `10317123040`；完整测试、Intel LanceDB binding、DMG mount、打包 smoke 和资产 manifest 全部通过；早期性能抖动失败 run `34756546507` 已保留但未用于发布。 |
| GitHub Release/topic | 通过 | [v1.2.0 Release](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.0) 非 draft、非 prerelease、Latest；`verify-github-release-assets.mjs --version 1.2.0` 返回 `ok: true`；topics API 与 `topic:dsh-plugin user:shuishuipingan` 搜索均返回本仓库。 |

## 版本和分发约束

- 桌面 `package.json` 与 `plugins/inkweaver-dsh/package.json` 均为 `1.2.0`，插件名固定为 `@shuishuipingan/inkweaver-dsh`。
- DSH 兼容基线为当前官方默认发布渠道 `@deepseek-ai/dsh@0.1.5-rc.1`；该版本仍是 RC，不能写成稳定版。`@linxin666/dsh-web-all` 是外部宿主 companion，历史 `@ethanyoq/dsh-ai-novel-writer` 不是安装目标。
- npm publish 永不执行；交付方式为 GitHub Release tarball + 本地 `dsh plugin --profile web add`。
- Windows 安装包和 macOS DMG 未签名/未公证时，Release 和主页必须明确披露，不得暗示已通过平台信任认证。

## 1.2.0 DSH 资格证据

资格脚本：

```text
node plugins/inkweaver-dsh/scripts/qualify-release.mjs --harness-root C:\\Users\\shuishui\\AppData\\Local\\Temp\\deepseek-harness-0.1.5-rc.1-183f08e
```

结果：`status=passed`，ticket `128`，Harness commit
`183f08e9c6dde7e36cd2318eaee70b0da08fb35e`。机器可读收据为
`.runtime/.cache/dsh-ai-novel-qualification-128/latest-receipt.json`，本次
保留 run 为
`latest-receipt.json` 中的 `artifact.path` 指向本次保留 run 的
`qualification-receipt.json`，避免文档在重复验收时固化为过期时间戳。
收据覆盖 tarball 内容回读（241,776 bytes，SHA-256 `0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`）、profile add/remove/reinstall、`inkweaver-v2`
挂载、模型工具集合、三次 Chrome 旅程、Proposal 生命周期和 schema-5
重启/重装持久化读回。

本次最终资格收据的 `source.commit` 为
`2bcff9b9eca7c5eb142aa5293acad5aac78c0728`，`stagedDiffSha256` 为
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
（空暂存差异的明确指纹）。最终 tarball 路径来自
`latest-receipt.json` 的 `artifact.path`，不得改用早期候选 run。

## 最终发布资产回读

| 资产 | 字节数 | GitHub SHA-256 |
| --- | ---: | --- |
| `inkweaver-setup-1.2.0.exe` | 196,462,292 | `026d56a5da1f5a93bd0068f452ac39594236c6b5a640b07cc188ea374b0a02a9` |
| `inkweaver-setup-1.2.0.exe.blockmap` | 206,772 | `f4a531ba8d1673cdc87b4764bdb39d69c10c0568281ee23f2c1fdc6aab95d26c` |
| `latest.yml` | 347 | `677526ab7c3b711f0114a142cf627374b7ac1d874de0277dd6b33433df7f58ac` |
| `inkweaver-mac-arm64-1.2.0-installer.dmg` | 236,610,658 | `0c2bb2bc219c7482bb8ec2100ecf124b70de1d4c780e2ad0be0fbfcbe3a02da1` |
| `inkweaver-mac-arm64-1.2.0-installer.dmg.sha256` | 106 | `c7c8e9be430964e1db083209919b23f0ad218516bccc86ea7e57350dab4652e4` |
| `inkweaver-mac-x64-1.2.0-installer.dmg` | 245,409,541 | `3a94e6afdce12e71a5214b2cb01e54ecb87aeb17ea73a79ef0b7a62fc596c258` |
| `inkweaver-mac-x64-1.2.0-installer.dmg.sha256` | 104 | `f86be77d3e1846829e0d5521256bbebd4df02efc52235ed2461e37afebdf1380` |
| `shuishuipingan-inkweaver-dsh-1.2.0.tgz` | 241,776 | `0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66` |

Release 的 `targetCommitish` 和 tag `v1.2.0` 均回读为
`2bcff9b9eca7c5eb142aa5293acad5aac78c0728`。签名披露为 Windows
unsigned、macOS unsigned/not notarized；这是真实限制，不是失败隐藏。

## 冻结判定

冻结判定：通过。当前工程证据、最终 SHA 根测试、DSH 隔离资格、Windows/macOS 三架构资产、GitHub Release 七项桌面资产 + 插件 tarball、topic API/搜索回读均已完成。macOS x64 的第一次性能采样失败已作为恢复记录保留，重试在同一 SHA 全部通过；外部文学评阅仍按用户决议不作为门槛，npm 未发布。
