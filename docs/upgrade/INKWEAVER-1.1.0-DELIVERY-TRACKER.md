# InkWeaver 1.1.0 开发执行与验收追踪表

日期：2026-09-09。配套需求：[完整功能图与开发交接书](INKWEAVER-1.1.0-FULL-FEATURE-MAP.md)。本表不增加发布范围，不代表功能已开发。

## 使用方式

开发基线与保留的用户修改见 [1.1.0 开发基线](INKWEAVER-1.1.0-BASELINE.md)。

先阅读完整交接书，再把工单 00–13 分配给负责人。本表是发布范围的唯一逐项追踪入口；任务分支可以分别开发，但所有证据最终需要对应集成后的同一源码版本。

状态使用：未开始、开发中、待验收、通过、阻塞。以下全部初始化为“未开始”，指本轮增量需求；已有基础功能不代表本轮需求已经通过。未开始不代表仓库完全没有相关代码。

每个需求通过时，填写负责人、实现 commit/PR、测试结果、操作证据及评阅人。阻塞时记录具体条件与下一步，不删除需求行。公开证据必须脱敏；作品样本保留本地编号、哈希和授权说明。

## 1. 全部 38 项需求覆盖

| 需求 | 功能 | 主工单 | 验收必须回答的问题 | 状态 | 负责人 / 实现 / 证据 |
| --- | --- | --- | --- | --- | --- |
| A01 | 章节交接记录 | 04 | 现场和情绪有原文证据吗？来源修订后是否过期？ | 通过 | 内部工程收据见 `ACCEPTANCE-A01-A03-RECEIPT.md`：source-bound handoff repository/IPC、结构化候选、确认前候选边界、来源 SHA、定稿替换失效、ChapterHandoffPanel 证据展示和浏览器回归均通过；外部质量评阅按发布范围豁免 |
| A02 | 承接与转场策略 | 04 | 即时承接和刻意转场都自然吗？能由作者选择吗？ | 通过 | 内部工程收据见 `ACCEPTANCE-A01-A03-RECEIPT.md`：transition contract、候选确认边界、prompt 传递和六类本地化转场展示均通过；自然语言质量/误报率外部评阅按发布范围豁免 |
| A03 | 相邻章节检查与局部修稿 | 04 | 问题能定位两端原文吗？旧版本修改被拒绝吗？ | 通过 | 内部工程收据见 `ACCEPTANCE-A01-A03-RECEIPT.md`：相邻两端证据、稳定 finding、来源章节打开、base content hash 冲突拒绝、确认清单编辑/忽略/恢复和修稿入口均通过；模型分类质量外部评阅按发布范围豁免 |
| A04 | 场景因果链 | 06 | 能记录选择和后果吗？是否区分计划与实际事件？ | 通过 | `ACCEPTANCE-A04-A08-RECEIPT.md`：计划/候选/确认/正文实际场景分离、证据候选、因果缺口提醒和 browser 入口通过；模型语义质量按发布范围豁免 |
| A05 | 卷级剧情推进 | 06 | 章节贡献可查看吗？主线和支线是否持续发展？ | 通过 | `ACCEPTANCE-A04-A08-RECEIPT.md`：卷级工作单聚合、主线/支线/人物弧/转折/代价/未解问题和新/延续趋势视图通过；真实 provider 叙事质量按发布范围豁免 |
| A06 | 情绪与人物成长 | 06 | 重大事件影响是否延续？重建是否保留作者确认？ | 通过 | `ACCEPTANCE-A04-A08-RECEIPT.md`：情绪余波字段、写前遗漏提示、按章节人物成长账本和证据展示通过；模型候选自然语言质量按发布范围豁免 |
| A07 | 读者期待与多视角 | 06 | 切线落点和待回应问题是否保留？秘密是否串台？ | 通过 | `ACCEPTANCE-A04-A08-RECEIPT.md` 与 `JOURNEY-J02-RECEIPT.md`：读者期待期限/延后理由、视角落点、读者知识账本和角色知情边界分离通过，跨视角秘密不会泄漏；外部多视角质量评阅按发布范围豁免 |
| A08 | 连读与风格一致 | 10 | 能跨章阅读、定位断点、发现重复而保留刻意复沓吗？ | 通过 | `ACCEPTANCE-A04-A08-RECEIPT.md`：finalized 连读、章节边界、搜索/位置/导航、交接/事实证据块、重复提示和文风历史应用通过；外部阅读盲评按发布范围豁免 |
| B01 | 分层上下文 | 07 | 早期关键事实能召回吗？省略和预算是否可解释？ | 通过 | `ACCEPTANCE-B01-B05-RECEIPT.md`：完整条目选择、预算、省略原因、privacy-safe ContextReceipt、早期相关事实保留和写稿来源层分组测试通过；provider 真实召回质量按发布范围豁免 |
| B02 | 历史状态与时间线 | 05 | 不同章节能查询不同有效状态吗？倒叙处理正确吗？ | 通过 | `ACCEPTANCE-B01-B05-RECEIPT.md`：validFrom/validUntil 章节范围、历史查询 UI、倒叙/转场枚举和来源证据通过；真实长篇时间线质量按发布范围豁免 |
| B03 | 知情范围 | 05 | 世界事实、读者知识、角色知识和误信是否独立？ | 通过 | `ACCEPTANCE-B01-B05-RECEIPT.md` 与 `JOURNEY-J02-RECEIPT.md`：source-bound knowledge event、fact/belief/rumor/false-belief、candidate/confirmed、当前角色过滤和读者知识账本分离通过；模型提取质量按发布范围豁免 |
| B04 | 一致性审查 | 07 | 确定冲突、疑似冲突和信息不足是否区分并附证据？ | 通过 | `ACCEPTANCE-B01-B05-RECEIPT.md`：地点、物品归属、故事日、秘密知情范围等确定性冲突分类为 conflict/suspected/insufficient，证据、来源和作者豁免均通过；模型语义审查按发布范围豁免 |
| B05 | 改稿影响与重建 | 08 | 直接依赖失效吗？重建可恢复且不覆盖人工计划吗？ | 通过 | `ACCEPTANCE-B01-B05-RECEIPT.md` 与 `JOURNEY-J06-RECEIPT.md`：影响清单、source-bound post_process 重建、去重排序、恢复 metadata、跨 lease 拒绝和原稿/作者计划保护通过；真实 provider 重建质量按发布范围豁免 |
| C01 | 全文人物提取 | 03 | 后半段、跨块代词、多章和导入文本是否都覆盖？ | 通过 | `ACCEPTANCE-C01-C03-RECEIPT.md`：source-bound 分块、首尾窗口、后半段证据、多章别名、冻结租约、候选面板和恢复测试通过；真实模型召回质量按发布范围豁免 |
| C02 | 稳定身份与消歧 | 03 | 同名不会误合并吗？改名后旧蓝图和关系能用吗？ | 通过 | `ACCEPTANCE-C01-C03-RECEIPT.md`：stable characterId、aliases、同名 ambiguity、明确目标选择、改名关系同步和旧名兼容通过 |
| C03 | 证据预览与合并 | 03 | 未提及字段不编造吗？候选确认前不改变事实吗？ | 通过 | `ACCEPTANCE-C01-C03-RECEIPT.md`：逐字段证据、字段级勾选、别名/关系合并、revision 冲突、确认前只读、应用状态闭环和改动摘要通过 |
| D01 | 标签定位修复 | 02 | 标签始终靠近所属边吗？缩放拖拽后命中正确吗？ | 通过 | `ACCEPTANCE-D01-D04-RECEIPT.md`：bounded local label layout、200 边密集样本、缩放/拖拽 Canvas hit 和 ≤25 content px 证据通过；跨硬件人工复测按发布范围豁免 |
| D02 | 图谱密度和交互 | 09 | 大图谱能搜索过滤和聚焦吗？键盘/列表替代可用吗？ | 通过 | `ACCEPTANCE-D01-D04-RECEIPT.md`：202 节点、5000 节点模型压力、过滤/聚焦、键盘列表和真实 Chromium 性能基线通过；跨硬件人工复测按发布范围豁免 |
| D03 | 有向多关系 | 09 | 单向情感和反向信任能分别呈现并追踪证据吗？ | 通过 | `ACCEPTANCE-D01-D04-RECEIPT.md`：direction/sourceChapter/evidence、箭头、关系历史、键盘证据入口和项目会话来源导航通过；长期关系质量按发布范围豁免 |
| D04 | 布局与关系历史 | 09 | 固定位置重开保持吗？历史关系不会读取未来状态吗？ | 通过 | `ACCEPTANCE-D01-D04-RECEIPT.md`：项目级布局固定/重置/重开、截至章节过滤、未来关系隐藏、两章差异摘要和布局不改事实通过；长期关系质量按发布范围豁免 |
| E01 | 伏笔兑现 | 10 | 计划、推进、回收有证据吗？超期可以解释和调整吗？ | 开发中 | `NarrativeThreadEditor`/repository 已提供 planned/planted/progressing/resolved/abandoned、定稿逐字证据、沉寂章数、项目阈值、逾期标记和 AI 计划/事件候选审核；章节工作单新增读者期待、期限、延后理由和证据；`d1b26e5` 增加基于已保存连续性工作单的跨卷伏笔进展只读摘要，并保持事件人工确认边界；超期批量操作、长篇兑现质量和原文定位仍待完成 |
| E02 | 写前准备 | 07 | 当前蓝图、交接、规则、人物和缺失信息可查看吗？ | 开发中 | 章节编辑器的连续性工作单新增只读“写前准备摘要”：汇总本章蓝图、上一章确认交接、相关活跃叙事线、世界设定/全局指导/文风约束、角色知情边界/待审候选和缺失资料提示；仍待真实长篇写前验收 |
| E03 | 写后审查 | 07 | 衔接、一致性、重复和节奏可分类处理吗？ | 开发中 | 相邻衔接证据、确定性一致性预检、人物候选审核、重复开头/结尾/天气提示均已汇入同一份审稿报告供作者分类处理；节奏分类仍需模型审查输出明确类别 |
| E04 | 安全局部修稿 | 08 | 锁定段保留吗？应用前比较正文版本吗？ | 开发中 | 修稿记录新增 base content fingerprint；创建修稿和合并 pending 修稿都会拒绝已变化的基准正文，字段级人物候选与相邻衔接 Proposal 也保留来源绑定；三栏合并视图新增段落锁定/解锁，锁定段不会被“采用全部修稿”覆盖；更细的局部替换范围验收仍待完成 |
| E05 | 任务恢复 | 08 | 取消、重启、重复请求是否不造成重复或错误写入？ | 开发中 | 工作流新增不含正文的恢复收据：冻结项目会话、步骤状态、进度、失败码和安全边界写入本地 checkpoint；跨 lease 自动拒绝恢复；取消/暂停/失败/完成边界均有测试；底部任务面板新增恢复收据列表、当前 lease 可识别/过期提示和安全清理按钮；当前已提供导入、批量章节、单章草稿、人物提取、审稿、审稿驱动修稿、只读修稿、定稿、定稿后处理修复、架构生成、配置生成和章节蓝图生成十二类 workflow-specific resume factory，均重新读取权威 SQLite/draft 来源或使用序列化的安全启动参数并校验当前 lease，收据不保存正文或模型输出；完整跨工作流恢复审计和最终发布前人工验收仍待完成 |
| E06 | 模型成本 | 07 | 模型与预算明确吗？缺失用量不会显示成零吗？ | 开发中 | 工作流安全收据新增模型 ID、尝试次数、累计请求输出预算和 provider usage；AI 输出面板在 usage 缺失时显示“未知”而不是 0；数据统计新增费用估算状态卡，明确没有官方价格快照时只显示 token、不伪造美元金额；新增跨工作流 usage 汇总纯函数（按模型聚合尝试次数、请求预算和 provider 报告的 token；任一次缺失的桶返回 null，不猜 0）；`node scripts/real-provider-generation-qualification.mjs --dry-run` 已验证 DeepSeek/xAI/Gemini 三个 adapter 的预算、租约、usage 和 checksum receipt（6 次模拟调用，无密钥/无计费），详见 `REAL-PROVIDER-QUALIFICATION-DRY-RUN-RECEIPT.md`；价格快照与汇总 UI、真实 provider 资格运行仍待完成 |
| E07 | 项目快照恢复 | 01、08 | 数据库和附件一致吗？恢复后原稿和引用完整吗？ | 开发中 | 主进程新增 SQLite backup API 快照服务、manifest/hash、提示词与 manuscript 文件复制、快照列表/逐文件核验 IPC；`3546327` 新增隔离恢复预览与恢复 IPC/标题栏入口，标题栏恢复前会先核验最新快照的逐文件哈希，恢复只写入源项目外的空目录并回读 SQLite/附件；后续仍待真实跨平台隔离验证 |
| E08 | 导出完整性 | 08 | 无蓝图原稿也能导出全部定稿且顺序正确吗？ | 开发中 | `169ff10`：导出始终以 finalized authority 和定稿事实枚举章节，不再让蓝图改变顺序；拒绝缺章/重复/越界、空正文、标题漂移和字数不一致，并保留无蓝图原稿路径；当前新增不含正文的 `.manifest.json`，记录 authority 指纹、章节标题/字数、输出路径和内容 SHA-256；导出目录授权新增受限 read，并在写入主文件、分章文件和清单后逐字节回读校验，内容不一致即失败 |
| E09 | 双语与可访问性 | 10 | 新入口、错误、审核和恢复流程都有双语与键盘支持吗？ | 开发中 | 新增连续阅读、连续性工作单、关系图列表、知情边界和快照入口均使用中英文文案、可聚焦按钮/表单标签/键盘列表替代；`check-i18n-coverage.mjs` 通过，renderer/browser suite 38 files / 225 tests passed，详见 `ACCESSIBILITY-I18N-SMOKE-RECEIPT.md`；WCAG 全量人工审计和恢复流程的键盘回归仍待完成 |
| F01 | DSH 兼容版本 | 11 | 核对的是官方默认分发渠道且固定准确版本吗？ | 通过 | 2026-09-11 npm 查询确认 `@deepseek-ai/dsh` latest=`0.1.5-rc.1`、next=`0.1.5-rc.2`、alpha=`0.1.5-alpha.2`；插件已将 DSH 家族锁定到 `0.1.5-rc.1`，并保留官方仍未发布 0.1.5 版本的两个 client pin；persona/SystemPrompt/Session 事件迁移与消息数组 system-prompt 兼容证据见 `plugins/inkweaver-dsh/docs/dsh-0.1.5-rc.1-compatibility.md`；当前完整回归为 40 文件/433 passed/6 skipped，历史完整 receipt 为 `.runtime/.cache/dsh-ai-novel-qualification-128/runs/2026-09-10T23-02-50-025Z-4888/qualification-receipt.json` |
| F02 | 插件接口与安装 | 11 | InkWeaver tarball 在隔离 profile 的 roster、mount 和浏览器链通过吗？ | 通过 | 插件身份已统一迁移到 `@shuishuipingan/inkweaver-dsh`、目录 `plugins/inkweaver-dsh`、Host/preset `inkweaver`；DSH 0.1.5 exact shared `/api` Fetch routes、persona `prefix`、SystemPrompt `personaPrefix`、Session `assistant/message` 边界和 peer graph 均已通过；源码 `acc82f4`，Harness `183f08e`，tarball SHA-256 `dd3ae2467422613e249e7be6b94fb46d8002d5aab4222a3d7f6394f8f250725e`；receipt 覆盖隔离 profile add/remove/reinstall、真实 Chrome 三次 journey 和 layout QA；外部 prerequisite `@linxin666/dsh-web-all@0.3.20` 仅作为宿主依赖，不属于 InkWeaver 包 |
| F03 | 插件对应创作功能 | 12 | 交接/人物候选/事实上下文和 Proposal 审核形成闭环吗？ | 通过 | DSH V2 schema 5 的 `NovelChapterHandoff`、`NovelKnowledgeEvent`、`chapter/context` 有效/confirmed 过滤和 Proposal 审核闭环均在真实 Chrome 中通过；receipt 验证固定五项 Proposal 生命周期、schema-5 persistence、重启读回和重装读回；剩余长篇质量评阅仍属于 A–E 创作体验工单，不阻塞本 DSH 闭环门禁 |
| F04 | 插件版本与分发 | 13 | 1.1.0 可实际安装且公开兼容与升级说明吗？ | 开发中 | 发布范围已明确不发布 npm，改交付 GitHub Release tarball 与本地安装说明；`DSH-PACKAGE-DRY-RUN-RECEIPT.md` 验证当前开发 tarball 包名/41 entries/无旧包名/无外部宿主；`PUBLISHING-AUTHORITY-AUDIT.md` 保留 npm 401/404 事实但不再作为阻塞；最终仍需冻结 1.1.0 tarball、隔离 qualification 和 GitHub Release 回读 |
| F05 | 主题发现 | 13 | dsh-plugin 元数据和实际索引结果分别有证据吗？ | 开发中 | GitHub API 已回读仓库 topic 含 `dsh-plugin`；2026-09-12 API 搜索 `topic:dsh-plugin user:shuishuipingan` 返回 `shuishuipingan/InkWeaver`（total_count=1），实际 topic 索引已可见；正式 1.1.0 Release 后仍需复核公开主题页首屏并留档，不能把 topic 索引当作 npm/Release 已发布证据 |
| G01 | 详细文档 | 13 | 主页、指南、截图和更新日志是否真实对应实现？ | 待验收 | 中英文主页已明确 1.1.0 未发布开发线、连续叙事/人物/关系/快照能力和限制；新增 `docs/PROJECT-FILE-GUIDE.md`、`CHANGELOG.md`、DSH 兼容收据、GitHub 分发收据、固定质量样本集、插件 1.1.0 分发清单和 tracker；`DOCUMENTATION-CONSISTENCY-RECEIPT.md` 记录 README/版本守卫/GitHub contract 15 tests passed，以及旧 Harness/测试数/npm/topic 文案修正；真实新版本截图和最终冻结 SHA 对照仍待人工评阅 |
| G02 | 版本冻结 | 13 | 桌面、插件、tag、锁文件和构建源码是否一致？ | 开发中 | 新增 `scripts/release-version-sync.mjs` 与 3 项测试，冻结前会校验 desktop/plugin 同一 final semver、正式插件包名 `@shuishuipingan/inkweaver-dsh`，并拒绝 prerelease；`VERSION-FREEZE-REHEARSAL-RECEIPT.md` 记录当前 `0.9.2/0.1.0` 被安全拒绝；尚未冻结、打 tag 或构建 1.1.0 发布资产 |
| G03 | 安装包与分发 | 13 | Windows 和两种 macOS 架构同 SHA 资格通过吗？ | 开发中 | Windows 完整资格门禁已实际跑通：`test → prepare:native-node → clean:build → build:win:artifacts → verify update/package → smoke app/installer/upgrade → restore-native-node → final`；Windows release-contract 测试现为 25 passed，冷启动与 monitor 确认窗口已加固；开发版 `0.9.2` 安装器 SHA-256 为 `8acb574112ffe205439d5063767ccfa9cf90f3615b0c188d96b6918c1dc92022`，验收收据位于 `release/0.9.2/qualification/acceptance/`，其中升级收据确认官方 v0.2.5 输入、15 项资产、LanceDB 向量检索、数据库/设置/最近项目均保留；macOS 开发基线也已在远端提交 `b9f713b5` 通过 ARM64 workflow `34647639036`（artifact `10283130774`，DMG SHA-256 `aa736ab89e2fa33a2c4bb520aeb007320f3e92d5d20a0b8bc8693a6793ef2343`）和 Intel x64 workflow `34647642420`（artifact `10282422689`，DMG SHA-256 `89b0ff684ba8f2f32084e270b9f4f49752b5f9f861b280ba1d48cd39fa4993c0`），两者均包含 runtime-verified manifest、DMG mount、packaged smoke 和 signing 收据；这些仍是 `0.9.2` 开发基线，不是 1.1.0 冻结产物，后续版本冻结后必须用同一 SHA 资格链重跑 |
| G04 | 发布回读 | 13 | 远端源码、资产、哈希、更新元数据和安装链接核验了吗？ | 开发中 | 新增 `scripts/verify-github-release-assets.mjs` 与 3 项测试，冻结后可回读七项 Windows/macOS Release 资产、final tag、非 draft/prerelease 状态、GitHub SHA-256 digest 和 `dsh-plugin` topic；当前没有正式 Release，实际远端回读仍待发布后执行 |

## 2. 工单创建模板

以下模板复制到 Issue 或项目管理工具，必须把花括号内容换成真实值后再创建。

```markdown
标题：[1.1.0][工单编号] 用户可见的交付结果

目标：{作者在何种情况下能完成什么操作}
关联需求：{例如 A01、A02、A03}
前置工单：{编号及必要接口，不只写“依赖完成”}
当前基线：{仓库、分支、commit}

输入与输出：{正文版本、项目会话、领域对象、收据}
交互：{入口、主操作、空态、等待、失败与恢复}
数据变更：{迁移、索引、引用更新与回退方式}
并发约束：{版本变化、项目切换、取消与重复提交}
实现范围：{改动模块和调用链}

验收案例：
- 正常：{步骤和可见结果}
- 边界：{缺失信息、长文本、同名或特殊叙事}
- 故障：{失败点、应保留的数据、恢复方式}
- 升级：{旧项目输入、迁移后校验}

完成证据：{commit/PR、命令、退出码、测试结果、截图或录像、样本哈希}
评阅结果：{通过 / 不通过及理由}
已知限制：{具体影响，不得把关联需求移出范围}
```

## 3. 团队交付接口

| 工作组 | 主工单 | 向其他组交付的接口 | 整合前禁止猜测的内容 |
| --- | --- | --- | --- |
| 项目与存储 | 00、01、05、08 | 版本、身份、事实、依赖失效、快照收据 | 数据迁移顺序、历史定稿替代语义 |
| 写作与阅读 | 04、06、07、10 | 交接、上下文、问题报告、局部修订 | 事实权威状态、上下文省略与未来知识 |
| 人物与图谱 | 02、03、09 | 稳定人物 ID、候选、关系事件、布局偏好 | 姓名到 ID 映射、关系方向与时间范围 |
| DSH 适配 | 11、12 | Host DTO、typed read/proposal、Client 入口 | 宿主最新 API、工具集合、审批边界 |
| 集成与发布 | 13 | 同 SHA 的验收与资产合同 | 平台资格、npm 权限、topic 实际可见性 |

同一人可以承担多个组。共享 SQLite 迁移应由存储负责人统一编号和整合，禁止两个分支各自重复使用迁移版本。模型提取 schema 与持久化 schema 分开设计，避免外部输出直接成为写入参数。

## 4. 必跑的端到端验收旅程

| 编号 | 操作旅程 | 成功证据 |
| --- | --- | --- |
| J01 | 新建作品 → 设定 → 卷/角色 → 蓝图 → 前两章 → 连读 | 两章现场/情绪/因果可承接，证据可导航；开发基线组合收据见 `JOURNEY-J01-RECEIPT.md` |
| J02 | 夜间悬念章末 → 换视角 → 返回原视角 | 原问题仍存在，原人物未知的秘密不被泄漏；开发基线收据见 `JOURNEY-J02-RECEIPT.md` |
| J03 | 第 12 章得钥匙 → 第 18 章转交 → 分别查询两阶段 | 所有者历史准确，后续写作读取正确状态；开发基线收据见 `JOURNEY-J03-RECEIPT.md` |
| J04 | 长篇原稿导入 → 全文人物提取 → 别名消歧 → 应用 | 后半段人物不遗漏，候选不自动覆盖作者资料；开发基线收据见 `JOURNEY-J04-RECEIPT.md` |
| J05 | 200 人图谱 → 打开标签 → 缩放拖拽 → 聚焦 → 重开 | 标签距离受限、交互正确、位置保留；开发基线收据见 `JOURNEY-J05-RECEIPT.md` |
| J06 | 修改历史正文 → 影响清单 → 重建中断 → 重启继续 | 派生内容更新，作者确认与原稿完整；开发基线收据见 `JOURNEY-J06-RECEIPT.md` |
| J07 | 局部修稿运行中继续编辑正文 → 应用旧结果 | 拒绝旧版本覆盖，允许重新比较；开发基线收据见 `JOURNEY-J07-RECEIPT.md` |
| J08 | 无蓝图的定稿原稿 → 导出 → 快照 → 隔离恢复 | 定稿章数/顺序/正文哈希与附件一致；开发基线收据见 `JOURNEY-J08-RECEIPT.md` |
| J09 | 项目 A 发起提取 → 切到 B → A 返回 | B 不被写入，A 结果不会显示为 B 的候选；开发基线收据见 `JOURNEY-J09-RECEIPT.md` |
| J10 | DSH tarball 安装 → preset → 提案 → 应用 → 同页变化 → 重启 | 真实 roster/mount、用户可见结果和持久化读回；开发基线收据见 `JOURNEY-J10-RECEIPT.md` |
| J11 | DSH 旧作品升级 → 提取候选 → 正文先变化 → 应用旧 Proposal | 数据保留且拒绝过期结果；开发基线收据见 `JOURNEY-J11-RECEIPT.md` |
| J12 | 旧桌面版安装 → 升级 1.1.0 → 打开旧作品 → 导出恢复 | 三个平台相应安装/升级证据完整 |

以上旅程是跨模块验收，不替代完整交接书的 24 对章节与 100 章长篇质量评测，也不替代安装包资格脚本。

## 5. 单项验收记录模板

```markdown
需求 / 工单 / 旅程编号：
测试日期、执行者、评阅者：
源码 commit 与构建版本：
操作系统、架构、测试硬件：
宿主版本（插件测试必填）：
模型标识、参数、提示词版本（涉及 AI 必填）：
样本编号、哈希、授权/脱敏情况：

前置数据与操作步骤：
预期结果：
实际结果：
工程验证命令、退出码与结果文件：
用户可见截图/录像：
阅读评价与原文例证：
恢复/迁移验证：

结论：通过 / 不通过 / 证据不足
未解决问题及关联工单：
```

证据不足视为未通过。不能用截图替代数据库持久性证明，也不能用数据库记录替代界面可操作证明。集成后修改共享接口，需要重跑受影响旅程。

## 6. 版本发布总记录

| 字段 | 当前记录 |
| --- | --- |
| 功能需求通过数 | 19 / 38（A01–A08、B01–B05、C01–C03 已按发布范围完成内部工程验收；F01–F03 已由 DSH 0.1.5-rc.1 完整资格通过；其余需求仍需各自验收） |
| 端到端旅程通过数 | 11 / 12（J01 新建/蓝图/连读、J02 悬念/视角边界、J03 所有权历史、J04 人物提取、J05 关系图、J06 影响重建、J07 过期修稿、J08 导出/快照恢复、J09 项目隔离、J10 DSH、J11 DSH 旧作品升级已在开发基线通过；J12 依赖最终版本冻结，冻结后需用同一 SHA 重跑全部旅程） |
| 阅读质量评测 | 外部评阅已按发布负责人决议豁免；保留 fixture、自动化回归、browser、provider dry-run、匿名 packet 和 strict 汇总器证据，不宣称真实模型质量通过 |
| 开发基线对齐 | 本地开发线已推到 `origin/1.1.0-development`，并在每次同步后核对远端树与本地树一致；历史 macOS 资格 SHA `b9f713b5` 仍只代表 0.9.2 开发基线；`origin/main` 仍是官方 v1.0.0 基线 |
| 桌面候选版本 / 源码 SHA | 当前仍为开发版本 `0.9.2` / 插件 `0.1.0`，尚未冻结到 1.1.0；macOS 双架构基线资格使用 `b9f713b5` |
| 插件候选版本 / 宿主基线 | 尚未冻结；当前包名 `@shuishuipingan/inkweaver-dsh`，宿主兼容基线 `@deepseek-ai/dsh@0.1.5-rc.1` |
| Windows 资格 run / attempt / artifact / hash | 本地完整门禁已通过；`release/0.9.2/qualification/acceptance/` 收据，安装器 SHA-256 `8acb574112ffe205439d5063767ccfa9cf90f3615b0c188d96b6918c1dc92022` |
| macOS ARM64 资格 run / attempt / artifact / hash | run `34647639036` / artifact `10283130774` / DMG SHA-256 `aa736ab89e2fa33a2c4bb520aeb007320f3e92d5d20a0b8bc8693a6793ef2343`，runtime-verified 通过 |
| macOS x64 资格 run / attempt / artifact / hash | run `34647642420` / artifact `10282422689` / DMG SHA-256 `89b0ff684ba8f2f32084e270b9f4f49752b5f9f861b280ba1d48cd39fa4993c0`，runtime-verified 通过 |
| 插件 tarball / hash / 安装资格记录 | 当前开发插件已有 DSH 0.1.5-rc.1 隔离 qualification receipt；1.1.0 冻结 tarball 尚未构建 |
| npm 分发版本 / 发布结果 | 本轮明确不发布 npm；目标包保持未发布 |
| 文档实现一致性评阅 | 待验收；自动化 15 tests passed，手工修正收据见 `DOCUMENTATION-CONSISTENCY-RECEIPT.md` |
| 正式 tag / Release / 发布 SHA | 未发布 |
| topic 元数据 / 实际搜索结果 | 元数据此前已有 topic；实际可见性待发布验收 |
| 回滚或恢复说明 | 待实现验证 |

## 7. 接手者第一天的工作

1. 阅读完整交接书、原路线图、ADR 和插件开发门禁。
2. 对齐最新开发基线，记录用户已有修改，建立独立开发分支。
3. 查询官方 DSH 默认版本及 npm 包发布权限，记录准确兼容目标。
4. 跑基线检查并把已有失败和新增回归分开；不为过关删除测试。
5. 建立图谱偏移复现、章节对、长篇和人物提取固定样本。
6. 确认共享领域契约、数据库迁移负责人和工单依赖，再开始实现。

当前 GitHub CLI 在不使用 Git 已配置代理时曾受 hosts 本机映射影响。此前以进程级 HTTP(S) 代理配置重试后已验证认证和仓库管理权限；接手环境需重新核实，不复制机器地址为产品配置，不在日志输出凭据。
