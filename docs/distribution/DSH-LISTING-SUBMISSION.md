# DSH 精选列表提交材料

目标列表：[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

目标 topic：[dsh-plugin](https://github.com/topics/dsh-plugin)

## 建议条目

### InkWeaver — reviewed long-form fiction workspace

InkWeaver 是一个本地优先的长篇小说创作工作台，把故事设定、角色状态、章节蓝图、候选草稿、证据化审稿和作者定稿连接成持续发展的写作链。它提供 Windows x64、macOS arm64 和 macOS x64 桌面安装包，并提供独立的 DeepSeek Harness 插件。

- Repository: <https://github.com/shuishuipingan/InkWeaver>
- Release: <https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.0>
- Plugin: `@shuishuipingan/inkweaver-dsh@1.2.0`
- DSH baseline: official `@deepseek-ai/dsh@0.1.5-rc.1`
- Install locally from the Release tarball (npm publication is intentionally disabled):

```sh
dsh plugin --profile web add '<path-to-shuishuipingan-inkweaver-dsh-1.2.0.tgz>'
dsh --profile web
```

## 关键边界

- V2 uses `novel_read` and `novel_propose_change`; a proposal is not authoritative until the author applies it.
- Chapter handoffs and knowledge events keep source chapter, finalized draft identity, evidence and validity boundaries.
- The desktop `.vela` project and DSH `.ai-novel` project are independent formats.
- `@linxin666/dsh-web-all` is an external host companion, not an InkWeaver package. `@ethanyoq/dsh-ai-novel-writer` is a historical package name and is not an installation target.
- The archive is MIT-licensed and contains no user novel, secret, or development `node_modules`.

## 预期读者

适合需要长篇章节连续性、角色状态和人工审核边界的作者，也适合想研究 DSH structured proposal workflow 的开发者。它不是在线小说社区，也不自带模型账号或云端额度。
