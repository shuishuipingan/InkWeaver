# InkWeaver 1.2.0 验收收据

状态：开发冻结候选，尚未在本收据中宣称正式发布。版本、源码、安装包、插件 tarball 和 GitHub Release 必须由同一最终 commit 重新绑定。

## 范围

本收据覆盖 1.2.0 全路线功能（Writing Skill、故事线进度/证据、规划资料、角色溯源、中文长篇链、跨平台更新、四层章节材料、连续草稿、覆盖缺口、证据化审稿、待核实和作者决策）、0–9 回归修复，以及全局日志完整性。外部文学评阅不在本轮门槛；npm 不发布。

详细依赖关系和文件地图见 [1.2.0 全路线功能与验收图](INKWEAVER-1.2.0-FEATURE-AND-ACCEPTANCE-MAP.md)。日志专门证据见 [全局日志验收收据](GLOBAL-LOGGING-ACCEPTANCE-RECEIPT-2026-09-13.md)。

## 当前工程证据

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| Root typecheck | 通过 | `pnpm run typecheck`；版本 bump、日志、MCP、工作流和 UI 类型均通过。 |
| i18n check | 通过 | `pnpm run check:i18n`。 |
| Log coverage | 通过 | `pnpm run check:runtime-log-coverage`；`uncovered=[]`。 |
| Root unit | 通过 | `pnpm test`：309 files / 2210 passed / 8 skipped（2218 total），版本 1.2.0 与日志、工作流、更新回归均在同一工作区重跑。 |
| Root browser | 通过 | `pnpm test:browser`：39 files / 228 passed；包含 runtime log、蓝图追加游标、连续草稿和 DSH 相关 renderer 回归。 |
| DSH plugin | 通过 | `@shuishuipingan/inkweaver-dsh@1.2.0`；官方 Harness `183f08e…`，40 files / 433 passed / 6 skipped；tarball 241,776 bytes / 41 entries，SHA-256 `0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`。 |
| Windows installer | 待最终 SHA 构建 | 目标 `inkweaver-setup-1.2.0.exe`、blockmap、`latest.yml`。 |
| macOS arm64/x64 | 待 GitHub macOS runners 构建 | 目标两份 DMG、各自 `.sha256`、mac 更新元数据。 |
| GitHub Release/topic | 待最终提交后回读 | Release 必须非 draft/non-prerelease/Latest；仓库 topics 必须包含 `dsh-plugin`。 |

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

## 冻结判定

只有在“当前工程证据”所有待重跑项都有命令输出、源码 SHA、资产 SHA-256、GitHub Release 回读和 `dsh-plugin` topic 回读后，才能把本文件状态改为“通过/已冻结”。若任一平台构建或外部 profile 环境失败，保留详细失败日志和 recovery 路径，不把局部测试写成正式发布。
