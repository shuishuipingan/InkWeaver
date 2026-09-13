# Contributing to InkWeaver

感谢你帮助 InkWeaver 变成更可靠、更容易上手的长篇小说创作工具。这里的贡献优先围绕四件事：连续写作体验、可追溯事实、作者明确确认和低门槛安装。

## 先阅读

- [项目文件指南](docs/PROJECT-FILE-GUIDE.md)：了解共享事实、Electron 副作用、Renderer 投影和 DSH 插件边界；
- [三分钟快速开始](docs/quickstart/README.md)：从样例项目走完第一章；
- [1.2.0 完整功能与验收图](docs/upgrade/INKWEAVER-1.2.0-FEATURE-AND-ACCEPTANCE-MAP.md)：查看路线图和回归门禁；
- [全局日志审计](docs/upgrade/GLOBAL-LOGGING-AUDIT-2026-09-13.md)：了解日志、脱敏、spool 和不可避免的崩溃边界。

## 开发环境

需要 Node.js 20+ 和 pnpm 11：

```sh
pnpm install
pnpm dev
```

提交前至少运行：

```sh
pnpm run typecheck
pnpm run check:i18n
pnpm run check:runtime-log-coverage
pnpm test
pnpm test:browser
pnpm build
node scripts/check-public-tree.mjs --json
```

如果修改 DSH 插件，再运行：

```sh
pnpm --dir plugins/inkweaver-dsh typecheck
pnpm --dir plugins/inkweaver-dsh build
pnpm --dir plugins/inkweaver-dsh exec vitest run --config vitest.config.ts
```

## 提交范围

- 不要提交 `.vitest-attachments/`、`__screenshots__/`、`.snapshot-test-*`、`.playwright-cli/`、`.dsh-upgrade-inspect/`、`.runtime/` 或 `_tmp_*`；`node scripts/check-public-tree.mjs --json` 必须返回空 violations。
- 不要把真实用户原稿、模型响应、API Key、token 或本机绝对路径写入测试、截图、Issue 或文档。
- 新的持久化事实先改 `src/shared` 契约，再同步 Repository、IPC、UI 和测试；模型候选不能绕过作者确认成为权威事实。
- 新的日志必须使用共享 RuntimeLogEvent 或现有 runtime logger，不能用未解释的应用级 stdout；日志默认只保存元数据并保持脱敏。
- DSH 包名固定为 `@shuishuipingan/inkweaver-dsh`。`@linxin666/dsh-web-all` 是外部宿主 companion，`@ethanyoq/dsh-ai-novel-writer` 是历史名称；本项目不发布 npm。

## Pull request checklist

- [ ] PR 说明包含用户场景、影响文件和恢复/失败行为；
- [ ] 新行为有先失败后通过的测试；
- [ ] 中英文可见文案已同步；
- [ ] 没有生成物、凭据或私人作品；
- [ ] 相关命令输出和已知限制已写明；
- [ ] 如果影响发布 profile、DSH preset 或安装包，已说明是否需要重新资格构建。

## 报告问题

优先使用 GitHub Issue 模板；安装/使用问题也可以使用 Discussions。日志只需提交事件 ID、错误类别和经过脱敏的必要片段，不需要上传完整项目。
