# 1.1.0 GitHub / 分发核验收据（开发线）

核验日期：2026-09-12（Asia/Hong_Kong）

这不是正式 Release 收据。它记录当前开发线已经完成的远端同步与发现性检查，避免把开发分支、npm 兼容性或 GitHub topic 元数据误写成 1.1.0 正式发布。

## 源码同步

| 项目 | 当前证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| GitHub About Homepage | `https://github.com/shuishuipingan/InkWeaver#readme`（已回读；不指向未发布 Release） |
| 开发分支 | `1.1.0-development` |
| 功能源码 SHA | 当前开发分支远端回读为 `eab212d`（完整 SHA 需以 `git ls-remote --heads origin 1.1.0-development` 为准）；macOS 双架构 runtime qualification 使用同一冻结候选树 `b9f713b5`。每次后续推送仍需重新回读本地/远端 SHA，本收据不把旧父提交冒充为永久当前 SHA。 |
| 远端主线 | `main` 保持既有 v1.0.0 线，未被开发分支推送覆盖 |
| 开发 PR | GitHub 为该分支提供 `https://github.com/shuishuipingan/InkWeaver/pull/new/1.1.0-development` |

开发线每次新增提交后必须重新回读本地 SHA 与远端 branch SHA；正式 tag、Release 和安装包必须在所有路线需求通过后另行创建。

## GitHub topic

2026-09-12 通过 GitHub API 再次回读，仓库 topic 仍包含：

`cordis-plugin`、`deepseek-harness`、`dsh`、`dsh-plugin`、`novel-writing`、
`web-novel`、`writing-assistant`、`writing-assistant-ai`、`ai-writing`、
`creative-writing`、`creative-writing-ai`、`electron`、`fiction-writing`、
`local-first`、`local-first-ai`、`long-form-fiction`、`novel-writing-windows`、
`ollama`、`rag`、`worldbuilding`。

公开主题页：[github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin)。本次 API 搜索 `topic:dsh-plugin user:shuishuipingan` 返回 `shuishuipingan/InkWeaver`（total_count=1），证明仓库已经被 GitHub topic 搜索索引；正式发布后仍需按同一链接复核公开主题页首屏展示状态。因此当前结论是“topic 元数据与 API 索引均可见，正式发布后的主题页展示仍需回读”，不是把 topic 当作 npm/Release 已发布证据。

## 正式发布前必须补的证据

- [ ] 所有 38 项需求和 12 条端到端旅程通过。
- [ ] 源码、桌面版本、插件版本统一冻结到 1.1.0，并记录不可变 SHA。
- [ ] Windows x64、macOS ARM64、macOS x64 资格资产来自同一 SHA，并回读原始哈希。
- [ ] 插件 1.1.0 tarball/npm 分发、隔离 profile roster/mount、Proposal 同页应用和重启读回通过。
- [ ] 创建正式 tag/Release 后，重新回读下载链接、资产哈希和 `dsh-plugin` 主题页；若 GitHub 尚未索引，必须在更新日志中明确说明。
