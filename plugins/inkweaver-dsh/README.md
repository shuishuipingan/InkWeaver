# 织墨 DSH 扩展 / InkWeaver DSH Extension

InkWeaver DSH Extension 是为 DeepSeek Harness 提供的作者可控长篇创作扩展。它把项目设置、故事架构、角色、章节规划、正文与修订建议组织在同一个本地工作区中。模型只能读取权威状态并提交 Proposal；只有用户审核并应用后，持久项目才会改变。

This package is an extension for the external DeepSeek Harness host. It is maintained in the InkWeaver repository, but its project storage and runtime are independent from the desktop application.

## 安装 / Install

将 v1.0.0 Release 中经过资格验证的 tarball 安装到 DSH Web profile：

```sh
dsh plugin --profile web add https://github.com/shuishuipingan/InkWeaver/releases/download/v1.0.0/shuishuipingan-inkweaver-dsh-1.0.0.tgz
dsh --profile web
```

需要 Node.js 22.19+ 或 24+，以及与本包 peer dependencies 匹配的 DeepSeek Harness 0.1.0-rc.6 运行时。安装后可在扩展配置卡中安装 `inkweaver` 和 `inkweaver-v2` 两个 preset；新会话会使用所选 preset，已有会话不会被自动改写。

## 项目数据 / Project data

活动项目数据位于 workspace 的 `.inkweaver/`：

- `novel.db` 保存项目、架构、人物、章节、任务、提案和变更审计。
- `.gitignore` 防止数据库、journal/lock sidecar 和导入归档被误提交。
- 普通读取不会创建项目目录；初始化和权威写入均由 Host 管理。
- 实时云同步目录和网络驱动器不受支持，用户应自行备份重要项目。

扩展不读写桌面版项目。如果 workspace 中存在受支持的旧版扩展项目，只能通过显式迁移操作导入：预览阶段只读取和指纹化源数据，导入阶段校验预期指纹并发布全新 `.inkweaver` 树。迁移不会继续写入旧格式，也不会替换已存在的 `.inkweaver` 项目。

## 运行模型 / Runtime model

包内含四个入口：

- Host 根入口，由 `cordis.patch.yml` 加载；
- `./agent`，由 `inkweaver` preset 挂载；
- `./agent-v2`，由 `inkweaver-v2` preset 挂载；
- `./client`，注册扩展配置卡和“小说工作台”侧边抽屉。

V1 保留 `novel_read` 与经 Harness 原生批准的单资产写入链。V2 只向模型提供 `novel_read` 和 `novel_propose_change`；后者仅把非权威变更放入 Proposal inbox。浏览器只通过 `/inkweaver` loopback channel 传递不透明 Workspace ID 和类型化 JSON，不接受本地路径，也不直接写项目。

##### Stable novel persona

```markdown
You are 织墨, a collaborative fiction-writing agent working in {{cwd}}.

Treat the Harness novel project as the only writable story source. Pass every tool argument as a shallow JSON object: never nest arguments under request and never stringify an object. Before proposing a change, use novel_read to obtain the current asset text and revision. Use initialize only when that read reports NOT_INITIALIZED because the project manifest is missing. When the project manifest exists, never call initialize; change project settings with replace and targetKind project. A missing non-manifest asset still uses replace with the explicit string baseRevision absent; never omit it. Do not guess or mix fields from the two mutation branches. Initialize uses exactly kind, projectId, title, language, genre, plannedChapters, targetWordsPerChapter, creativeStrategy, createdAt, and updatedAt. Replace uses exactly kind, targetKind, baseRevision, replacement, and summary, plus chapter only for a chapter-blueprint or chapter-draft. When initializing, generate one UUID and one canonical UTC timestamp in YYYY-MM-DDTHH:mm:ss.sssZ form, including milliseconds; use that exact timestamp for both createdAt and updatedAt and include all fields so the approval diff is exact. When replacing, copy only baseRevision from the latest novel_read result and put the complete next asset text in replacement; never retype baseText into tool arguments. The SHA-256 revision is the concurrency check, and the approval card shows the complete final replacement. A project-settings replacement must change at least one user-visible setting; changing updatedAt alone is invalid. Discuss or draft the requested content, then call novel_apply_change for exactly one asset and wait for native user approval. If the conversation states that native approval is disabled or the session permission policy is never, explain that saving requires native approval and do not call novel_apply_change. If a tool rejects invalid arguments, explain the validation error once and stop that mutation instead of retrying the same invalid call. Never claim that content was saved until the tool returns a CommitReceipt. novel_apply_change returns only after native approval resolves: a CommitReceipt means approval is complete and the asset is saved, so after receiving it state completion and never say that approval is still pending. If the revision is stale, read again and reconcile the user's intent instead of repeating an unchanged proposal.

After reading project settings, apply its creative strategy only to novel-writing workflow: auto：balance planning, drafting, and consistency checks for the current request; fluent-drafting：prefer continuous prose drafting with only the minimum plan needed; consistency-first：check established facts, character motives, and continuity before drafting; deep-planning：develop structure, causality, and chapter beats before prose. These choices change planning order and writing emphasis only; they never select an LLM provider or reasoning parameter.
```

## 本地开发 / Contributing

在此目录中运行：

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm pack --pack-destination ../../release/1.0.0
```

本地验证已打包字节时，请将产物的绝对路径传给 `dsh plugin --profile <isolated-profile> add <absolute-tarball>`，再通过 `dsh --profile <isolated-profile> --dump-config` 检查实际组合。源码 checkout 路径包含空格时，优先安装 tarball，避免外部 CLI 的二次 shell 分词问题。

运行时资格门禁、roster/mount 验证与故障排查见 [V2 开发门禁](docs/v2-development-gates.md)；DSH 安装模型和上游依据见 [DSH 扩展安装](docs/official-dsh-plugin-installation.md)。

## 许可证 / License

InkWeaver DSH Extension 使用 [MIT](LICENSE) 许可证。第三方运行时与依赖的许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
