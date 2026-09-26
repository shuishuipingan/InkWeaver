# 三分钟开始第一章

这份指南带你用一个无版权、无凭据的短篇样例，走完 InkWeaver 的第一条连续写作路径：设定 → 角色 → 蓝图 → 候选草稿 → 审稿 → 作者确认 → 定稿 → 下一章。

## 你将得到什么

- 一个可以直接照着填写的短篇项目；
- 一次带上下文收据的候选草稿；
- 一份由 AI 提出的、需要作者确认的审稿清单；
- 一章真正定稿后，下一章可以继续读取的连续性事实。

这个示例全部是 InkWeaver 原创演示文本，不包含真实人物、用户作品或模型密钥。你可以从[示例项目说明](example-project/README.md)开始，也可以只复制[故事设定](example-project/story-bible.md)、[大纲](example-project/outline.md)和[第一章](example-project/chapters/chapter-01.md)作为自己的起点。

## 0. 准备环境

最简单的方式是从 [v1.2.16 GitHub Release](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.16) 下载对应系统的安装包：

- Windows x64：`inkweaver-setup-1.2.16.exe`
- macOS Apple Silicon：`inkweaver-mac-arm64-1.2.16-installer.dmg`
- macOS Intel：`inkweaver-mac-x64-1.2.16-installer.dmg`

安装包目前未签名；Windows 可能显示未知发布者，macOS 可能要求你在系统设置中确认首次打开。请核对 Release 里的 SHA-256，并只从项目官方 Release 下载。

如果你从源码运行，需要 Node.js 20+ 和 pnpm 11：

```sh
pnpm install
pnpm dev
```

## 1. 连接模型

打开“设置 → 模型”，选择一个你有权限使用的服务。模型账号和额度由你自己提供，InkWeaver 不附带任何 API Key 或云端额度。

本地 Ollama 可以使用：

```text
协议：OpenAI-compatible
Base URL：http://127.0.0.1:11434/v1
模型：你本机已经下载的模型，例如 qwen3:14b
```

云端服务请填写你自己的 Base URL、模型名和 API Key。不要把密钥粘贴进 GitHub Issue、示例项目或日志附件；应用日志默认只保存元数据并会脱敏。

## 2. 创建样例作品

1. 点击“新建作品”。
2. 标题填写“灯塔来信”。
3. 题材选择“悬疑/奇幻”，写作语言选择“简体中文”。
4. 选择“平衡”或“深度规划”创作策略。
5. 把 `example-project/project-brief.md` 的故事前提复制到项目设定，把 `story-bible.md` 的规则和角色分别填入对应字段。
6. 保存后确认左侧项目树已经出现作品、角色和架构文件。

预期结果：作品资料被保存到本地 `.vela` 项目，模型还没有替你创建定稿章节。

## 3. 生成并检查第一章蓝图

1. 打开“全书大纲”，参考 `example-project/outline.md` 输入六章计划。
2. 打开第一章蓝图，把标题“潮汐退去”作为目标。
3. 生成蓝图后，检查人物、关键事件、悬念和故事线是否符合 `story-bible.md`。
4. 如果模型提出了新人物，先放在候选区；不要在没有确认前直接加入角色表。

预期结果：蓝图是可编辑的候选资料，作者仍然拥有确认权。写前面板会列出作者任务、未来计划、定稿历史、未定稿候选和相邻正文材料。

## 4. 生成候选草稿

1. 在第一章蓝图中点击“生成草稿”。
2. 等待模型完成后，先阅读候选文本和上下文收据。
3. 检查上一章定稿、角色状态、故事线和相邻段落是否被正确引用。
4. 直接编辑候选文本不会改变权威定稿；关闭窗口后仍可从保存的候选版本恢复。

预期结果：候选草稿有自己的 ID、版本和正文指纹，不会被伪装成 finalized history。

## 5. 审稿、修订和定稿

1. 点击“审稿”，让 AI 返回结构化问题。
2. 对每个问题选择“处理”“忽略”“补充说明”或“待核实”。证据不足时不要强行接受模型判断。
3. 只有你明确确认的问题才会进入修订入口。
4. 查看三栏差异，锁定不想被覆盖的段落，再应用修订。
5. 最后点击“定稿”，确认章节标题、字数和正文。

预期结果：定稿章节进入权威序列，人物状态、故事线推进、读者期待和章节交接会产生可追溯记录。

## 6. 继续下一章

打开第二章蓝图或新建第二章时，检查写前摘要：

- 第一章的场景离开状态和未完成动作；
- 角色最新状态及其来源；
- 仍然有效的事实、读者已知信息和待回应问题；
- “门后第二封信”这个未解悬念是否仍被列为下一章任务。

这就是 InkWeaver 与一次性聊天生成的区别：下一章读取的是上一章作者确认的事实，而不是模型凭印象猜测的全文。

## 可选：安装 DSH 插件

DSH 插件与桌面版使用独立项目格式。先从 Release 下载 `shuishuipingan-inkweaver-dsh-1.2.0.tgz`，再在安装了官方 DeepSeek Harness 的环境执行：

```sh
dsh plugin --profile web add '<path-to-inkweaver-dsh-1.2.0.tgz>'
dsh --profile web
```

插件名固定为 `@shuishuipingan/inkweaver-dsh`。`@linxin666/dsh-web-all` 是宿主 companion，不是本项目包；`@ethanyoq/dsh-ai-novel-writer` 是历史包名，不要用它安装。桌面 `.vela` 项目和 DSH `.ai-novel` 项目不能直接混用。

## 遇到问题

| 现象 | 处理 |
| --- | --- |
| 模型列表为空 | 检查 Base URL、模型名和账号权限；先用 Ollama 本地地址验证。 |
| 首次打开被系统拦截 | 确认文件来自官方 Release，核对 SHA-256，再按 Windows/macOS 的安全提示允许打开。 |
| 审稿结果显示“待核实” | 打开来源章节和正文证据；补充作者判断后再决定是否修订。 |
| 下一章没有上一章内容 | 确认上一章已经作者定稿，而不是仍停留在候选草稿；检查写前上下文的覆盖缺口。 |
| DSH 找不到插件 | 确认使用的是 `@shuishuipingan/inkweaver-dsh` tarball、`--profile web` 和官方 Harness `0.1.5-rc.1` 兼容基线。 |

## 进一步阅读

- [完整功能与验收图](../upgrade/INKWEAVER-1.2.0-FEATURE-AND-ACCEPTANCE-MAP.md)
- [全局日志审计](../upgrade/GLOBAL-LOGGING-AUDIT-2026-09-13.md)
- [GitHub 分发收据](../upgrade/GITHUB-DISTRIBUTION-RECEIPT.md)
- [贡献指南](../../CONTRIBUTING.md)
