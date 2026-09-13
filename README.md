[English](README_en.md) | **中文**

# 织墨 / InkWeaver

织墨 InkWeaver 是一款面向长篇小说创作的本地优先桌面工作台。它把项目设定、角色、世界观、章节蓝图、正文、审稿、修订与定稿组织成可追溯的创作链，让作者在保留最终决定权的前提下使用自己选择的 AI 模型。

当前版本：**v1.2.0（已发布）**

> 1.2.0 在 1.1.0 正式版本基础上补齐全局结构化日志、持续写作上下文、规划资料、阶段 Skill、证据化审稿和并发/恢复回归；Windows/macOS 三架构安装包与 DSH 插件 tarball 已由同一源码提交生成并完成回读。本轮不发布 npm，外部文学质量评阅不作为工程门槛。

接手开发时先看[项目文件指南](docs/PROJECT-FILE-GUIDE.md)，再看[1.2.0 完整功能与验收图](docs/upgrade/INKWEAVER-1.2.0-FEATURE-AND-ACCEPTANCE-MAP.md)、[全局日志验收收据](docs/upgrade/GLOBAL-LOGGING-ACCEPTANCE-RECEIPT-2026-09-13.md)和历史 [1.1.0 功能图](docs/upgrade/INKWEAVER-1.1.0-FULL-FEATURE-MAP.md)。文件指南按事实源、主进程副作用、Renderer 投影、DSH 插件和发布生成物解释每个目录的职责。

冻结源码、GitHub topic、平台资格和 Release 回读见[GitHub/分发核验收据](docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md)。

逐项用户可见更新见[更新日志](CHANGELOG.md)；工程收据、限制和每项命令证据见 [1.2.0 验收收据](docs/upgrade/INKWEAVER-1.2.0-ACCEPTANCE-RECEIPT.md)。

[下载 v1.2.0 Windows / macOS 桌面版](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.0) · [查看源代码](https://github.com/shuishuipingan/InkWeaver/tree/main) · [DSH 插件说明](plugins/inkweaver-dsh/README.md)

## 织墨解决什么问题

普通聊天工具擅长生成一段文字，却很难长期维护小说中的角色状态、世界规则、章节计划和前后因果。织墨提供的是创作编排层：项目资料有明确归属，生成任务有上下文和状态，审稿意见由作者确认，定稿结果会继续成为后续章节的事实来源。

它不是模型服务，也不是在线小说平台。软件不附带模型额度；你可以连接本地模型或自己拥有权限的云端模型。项目数据默认保存在本机。

## 创作流程

1. 建立故事前提、题材、写作语言和创作策略。
2. 生成或编辑角色、人物关系、世界观和故事架构。
3. 规划全书目录与逐章蓝图。
4. 按章节选择模型和目标字数生成草稿。
5. 让 AI 提交结构化审稿意见，由作者编辑、忽略、补充并确认。
6. 根据人工确认的清单修稿，通过差异对比决定是否合并。
7. 定稿章节，更新连续性事实、人物状态和伏笔进度，再进入下一章。

## 核心能力

- **长篇一致性上下文继承**：故事前提、角色、世界观、蓝图与已定稿事实会进入后续创作，减少设定遗失和前后矛盾。
- **伏笔与叙事线索系统**：记录计划、埋设、推进、回收与超期线索，让长线悬念可以检查和兑现。
- **章节模型与字数控制**：单章和连续写作都使用本次选择的模型与目标字数；相同目标的重复任务会被阻止。
- **人工审稿闭环**：AI 审稿不是自动改稿。作者先确认问题清单，再修稿、检查差异并决定最终文本。
- **参考资料与知识库**：支持 TXT、Markdown 和 EPUB 导入；可使用向量检索，也可在未配置 Embedding 时使用全文检索。
- **角色卡与关系图**：维护结构化人物事实，关系图支持缩放、平移和一键清空。
- **可恢复任务**：长时间生成、批量章节、导入、单章写稿、人物提取、审稿、审稿驱动修稿、只读修稿、定稿、定稿后处理修复、架构生成、配置生成和章节蓝图生成具有不含正文的恢复收据；恢复时重新读取权威来源或安全启动参数并校验项目 lease，避免旧任务写入错误项目。
- **中英文界面**：界面语言与小说写作语言相互独立。
- **更准确的失败提示**：内容限制、模型调用失败、上下文预算不足和资源冲突不会被伪装成成功结果。

## 1.2.0 创作与日志体验

1.2.0 的验收目标是让一本长篇小说保持“持续发展”的阅读感，同时让每一次模型调用、作者决定和失败恢复都留下可追溯证据。新能力按作者实际工作顺序组织：

- **阶段化 Writing Skill**：Skill 可以作为独立 `SKILL.md` 安装、卸载和重新加载，并标明 `planning`、`drafting`、`review`、`polish` 阶段；Agent 面板按当前阶段筛选，用户 Skill 与项目 Skill 仍受路径和项目会话隔离。
- **主线/支线故事线视图**：每条叙事线显示 planned、planted、progressing、resolved 或 dormant/overdue 的投影进度、下一目标章节和事件数；事件行保留定稿草稿 ID、正文指纹和证据，点击“打开证据”前会重新验证当前项目会话。
- **规划资料导入**：大纲、世界观、人物表、时间线和风格说明可导入当前项目。导入先形成带 SHA-256 的 candidate，只有作者显式确认后才进入蓝图和后续写作上下文；重复内容幂等，冲突和拒绝均可回读。
- **角色权威边界**：蓝图明确列出的角色和作者确认的候选才可进入角色表；模型在定稿后发现的新角色只进入候选队列，不会自动写入 roster。每次状态变化追加 author/model/legacy-unknown 来源、定稿 ID、正文 hash 和证据区间。
- **完整中文长篇链**：项目会话、写作语言、界面语言、模型 lease 和来源指纹从蓝图、草稿、审稿、修订到定稿保持一致；草稿待审、作者确认和自动定稿是可见的不同阶段，不会把候选稿伪装成定稿。
- **四层章节材料**：写前上下文把作者任务、未来计划、定稿历史、未定稿候选稿和相邻正文片段分开显示；每层有 source span、纳入/省略原因和覆盖状态，预算不足或来源缺失不会静默吞掉作者硬性要求。
- **证据化审稿**：蓝图关键事件逐项标记 completed、prepared、deferred、not-found 或 needs-verification，并附来源章节/正文证据；证据不足不会自动触发修稿，修订目标必须由作者明确勾选。
- **连续草稿血缘**：批量续写优先读取实际保存的候选稿 ID、版本和完整正文，下一章不读取或污染 finalized history；关闭、重启或切换标签页后仍按保存版本继续。
- **全局结构化日志**：主进程、Renderer、IPC handle、工作流 UI、模型调用、更新器、MCP 子进程、文件/数据库边界、窗口生命周期、未捕获异常和 Promise 拒绝统一写入 append-only JSONL。日志包含事件 ID、进程/PID、序号、时间、run/project session/correlation ID、操作结果、耗时和错误链。
- **日志完整性与诊断**：日志按日期/大小轮转并生成 SHA-256 manifest，重试队列和 emergency spool 防止磁盘/IPC 短暂失败静默丢失；重启回放去重，页查询显示 pending/degraded 状态，主进程可导出包含段、manifest、bundle 清单和缺口状态的完整诊断包。默认只存元数据，长字符串、路径和凭据会限长/脱敏。
- **并发、恢复与导出护栏**：多标签保存、旧请求、过期恢复、非定稿导出、拆分目录残留、标题截断、更新队列覆盖和 Windows 辅助进程退出均有来源指纹、CAS、唯一临时目录或精确进程分类保护。
- **Windows/macOS 更新**：已打包 Windows x64、macOS arm64 和 macOS x64 使用同一 UpdateService 状态机；应用内检查、下载、安装、单飞排队和已下载版本单调性均有日志和失败分类。

## 1.1.0 创作体验

1.1.0 的目标是让长篇小说读起来像一个持续发展的整体，而不是一章章互不相干的生成结果。当前已经落地的开发能力包括：

- **章节连续性工作单**：为每章记录场景进入状态、目标、阻碍、选择、后果和离开状态，并区分作者计划、AI 候选、作者确认和正文实际；同一工作单还可以记录卷级主线/支线贡献、人物情绪余波、读者期待和多视角落点。
- **证据化章节交接**：前章定稿的地点、视角、未完成动作、即时目标、情绪和待回应问题带有来源正文证据；来源定稿变化后，旧交接不会继续冒充最新事实。
- **连读与重复提示**：连续阅读器按定稿权威顺序合并章节，显示章节边界、搜索、阅读位置和回到编辑器入口；重复开头、重复结尾或连续天气开场只作为建议，作者可以明确保留刻意复沓。
- **分层写前上下文**：上下文按完整条目裁剪，不会把证据或否定词从中间截断；AI 输出面板会显示哪些条目纳入、哪些因不相关或预算省略，且收据不复制私人正文。
- **知情范围与误信**：角色知道的事实、信念、传闻和误信分开保存，附获知方式、来源章节、有效范围和证据；只有作者确认且在当前章节生效的知识才会注入写稿。
- **安全历史修订**：历史正文变化会列出受影响的连续性投影、章节交接和叙事线；修稿 Proposal 绑定基准正文指纹，正文变化后拒绝合并旧修稿。
- **人物候选字段审核**：全文提取的角色候选保留字段证据、别名、关系和当前状态；作者可以逐字段勾选，未勾选内容不会写入权威角色卡。角色改名通过稳定 `characterId` 保留旧名和关系引用。
- **关系图工作台**：支持姓名/别名搜索、一跳和二跳聚焦、关系类型过滤、键盘列表、节点固定/取消固定、项目级布局保存和重置；有向关系可以显示箭头、来源章节和正文证据。
- **一致性快照与无蓝图导出**：SQLite 使用 backup API 创建一致性快照并记录文件哈希；即使没有章节蓝图，也能按 finalized authority 顺序导出定稿正文。

这些能力已通过内部工程验收；真实模型文学质量不在本轮发布声明内，作者仍应对事实、风格、版权和最终定稿负责。

## 模型连接

织墨支持两类请求协议：

- **OpenAI-compatible**：用于 OpenAI、DeepSeek、Ollama、NovelAI 预设及其他兼容 Chat Completions 的服务。
- **Gemini 原生协议**：用于 Google Gemini 兼容端点。

模型高级设置会根据已知能力提供推理强度、温度、结构化输出和最大输出长度等选项。填写 API Key 与 Base URL 后可以获取模型列表。自定义地址仍需符合以上协议之一，不能把任意 HTTP 接口直接当作模型服务。

### Ollama

推荐使用 Ollama 的 OpenAI-compatible 地址：

```text
Provider:  Ollama（本地）或自定义
Protocol:  OpenAI-compatible
Base URL:  http://127.0.0.1:11434/v1
Model:     你的 Ollama 模型名，例如 qwen3:14b
```

### NovelAI

NovelAI 目前属于最小兼容支持。请使用自己的 Persistent API Token 和账户实际可用的模型标识。项目不会向该端点发送标准 `response_format`；由于维护者无法使用用户账户完成资格验证，模型权限和接口差异请以 NovelAI 官方资料为准。

## 数据与隐私

| 数据 | 默认位置或去向 |
| --- | --- |
| 小说设定、角色、蓝图、草稿、审稿和定稿 | 项目目录内的本地 SQLite 数据库与定稿文本 |
| 知识库索引 | 项目目录内的本地 LanceDB 数据 |
| 模型和 API Key 配置 | 本机用户目录 `~/.vela/models.json` |
| 应用偏好 | 本机用户目录 `~/.vela/config.json` |
| 本地模型请求 | 你配置的本机或局域网推理服务 |
| 云端模型请求 | 你主动选择的模型供应商 |

渲染界面不能直接读取 API Key。文件、数据库和模型请求由 Electron 主进程执行；访问项目外文件必须由用户通过系统选择器授权。

## 安装与更新

### Windows x64

从 [GitHub Releases](https://github.com/shuishuipingan/InkWeaver/releases/latest) 下载：

```text
inkweaver-setup-<版本号>.exe
```

Windows 版本支持应用内检查、下载和安装更新。当前安装包未代码签名，系统可能显示发布者或信誉提示；继续前请确认下载来自项目官方 Release。

### macOS

Apple Silicon 与 Intel 分别使用：

```text
inkweaver-mac-arm64-<版本号>-installer.dmg
inkweaver-mac-x64-<版本号>-installer.dmg
```

当前 macOS 安装包未代码签名（未使用 Developer ID 签名）且未公证。请只从[正式 v1.2.0 Release](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.0)下载，并按系统安全提示确认首次打开。桌面 Release 使用七项资产合同，分别覆盖 macOS Apple Silicon 与 macOS Intel，另附 DSH 插件 tarball。
## DeepSeek Harness 插件

仓库中的 `@shuishuipingan/inkweaver-dsh@1.2.0` 是独立的 DSH 插件，不是桌面版的替代品。它提供精简的项目设置、故事架构、人物、全书纲要、章节蓝图和章节正文流程；模型修改先进入 Proposal，由用户审核应用后才改变权威项目状态。本轮 1.2.0 不发布 npm，插件通过 GitHub Release tarball 和本地安装说明交付。

迁移提示：`@ethanyoq/dsh-ai-novel-writer` 是仓库迁移前的历史包名，不是 1.2.0 开发线的交付包；新安装请只使用 `@shuishuipingan/inkweaver-dsh`。DSH 宿主本身与 Web UI companion 由 DeepSeek Harness 生态维护，不属于本仓库的 npm 包。

```sh
dsh plugin --profile web add '<path-to-inkweaver-dsh-tarball.tgz>'
dsh --profile web
```

插件使用独立的 `.ai-novel` 项目格式，不读取桌面版项目。完整说明见 [插件文档](plugins/inkweaver-dsh/README.md)。

正式 tarball：`shuishuipingan-inkweaver-dsh-1.2.0.tgz`，当前资格构建为 241,776 bytes、SHA-256 `0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`；GitHub Release 资产必须逐字节复现该 digest。它兼容目前官方默认发布渠道的 `@deepseek-ai/dsh@0.1.5-rc.1`；外部 `@linxin666/dsh-web-all@0.3.20` 只是宿主 companion，不属于本项目交付物。

## 本地开发

需要 Node.js 20+ 和 pnpm 11：

```sh
pnpm install
pnpm dev
```

常用验证命令：

```sh
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
```

## 当前边界

- 不提供模型账号、云端额度、在线发布或阅读社区。
- 不保证所有第三方接口只修改 URL 和 Key 就能接入。
- AI 输出仍需作者进行事实、质量和版权判断。
- 重要作品在升级和迁移前应自行备份。

## 许可证

桌面应用使用 [GPL-3.0](LICENSE)。内嵌 DeepSeek Harness 插件使用独立 MIT 许可。
