# 更新日志

本文件按用户可见行为记录变更。桌面版本不发布 npm；DSH 插件沿用已发布的 `1.2.0` 包。`1.2.0` 已从同一源码 commit 完成工程验收、三平台资产回读和正式 Release；`1.1.0` 的历史 Release 收据保留在 `docs/upgrade/`，不与 1.2.0 混用。

## 1.3.30 — 2026-10-07

### 修复

- 角色架构生成的多面关系与势力立场保存后不再丢失：此前这两类数据能在生成结果里看到，保存后却会消失（势力立场在角色表没有对应字段、提交与合并环节的逐字段白名单不认识它；多面关系被关系规范化过滤掉）。现在两类数据都完整落库并可读回，旧项目库在打开时自动补齐字段；重新生成架构时，已经存在的势力立场与多面关系不会被抹掉。
- 势力立场在角色卡上可见、可编辑：角色卡新增“势力立场”区块，每行显示「势力 — 立场」，可以增删改，保存往返不丢失。势力不作为关系图的节点（它不是角色）。
- 减少同类问题再次发生：角色名单条目与关系接口新增编译期字段校验，将来给这两个接口新增字段而写入侧没有跟进时，会在编译阶段被发现，而不是等用户发现数据消失。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.30.AppImage、inkweaver-linux-x64-1.3.30.deb、inkweaver-linux-x64-1.3.30.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.30 — 2026-10-07 (English)

### Fixed

- Multi-faceted relationships and faction stances from character-architecture generation are no longer lost on save: both kinds of data were visible in the generated result and then disappeared after saving (faction stances had no column on the characters table and were not recognized by the per-field allow-lists in the submit and merge paths, while multi-faceted relationships were stripped by the relationship normalizer). Both are now stored and read back in full, existing project databases gain the field automatically when opened, and regenerating the architecture no longer erases stances and facets that are already there.
- Faction stances are visible and editable on the character card: a “faction stances” section lists one row per entry as faction — stance, supports adding, editing, and removing, and survives a save-and-reload round trip. Factions are not added as relationship-graph nodes, since they are not characters.
- Reducing recurrences of the same problem: character-roster entries and the relationship interface now carry compile-time field checks, so adding a field to either interface without updating the write path is caught at compile time instead of waiting for a user to notice that data disappeared.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.30.AppImage, inkweaver-linux-x64-1.3.30.deb, inkweaver-linux-x64-1.3.30.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.29 — 2026-10-07

### 修复

- 章节目录生成一次可以覆盖全书：此前每批 5 章、输出预算固定、会话窗口钉死 10 分钟、应用级调用上限 32 次，四重保守上限叠加，180 章必然撞墙（旧值下连 50 章的单任务都会被拒绝）。现在每批 12 章，输出预算按批次推导，会话窗口按批数伸缩，应用级调用上限提升到 512 次、单任务范围提升到 240 章；180 章可以一次生成全部，超过 240 章会在开工前给出分次引导。
- 目录生成失败时更可读：失败信息带上章节进度（例如“已生成 X/Y 章，剩余 Z 章”），不再只有一句“超过会话截止时间”。
- 角色关系图谱支持多面关系：此前每对角色之间只有一条关系句子，多个角色因此看起来共用同一份图谱；现在每对角色可有 2-4 条不同维度的关系（立场 / 情感 / 依赖 / 知情 / 历史），打开角色卡即可逐条查看，编辑保存不会丢失。
- 角色可以带势力立场：每个角色可有 0-3 条对具体势力的立场与依据；生成时要求每条都有依据、编不出就省略，解析层强制查重（同一目标不得重复、同一维度不得重复），不守约的输出会被精确定位并拒绝。旧项目数据完全兼容。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.29.AppImage、inkweaver-linux-x64-1.3.29.deb、inkweaver-linux-x64-1.3.29.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.29 — 2026-10-07 (English)

### Fixed

- Chapter-outline generation can now cover a whole book in one run: it previously combined four separate conservative ceilings — 5 chapters per semantic batch, a fixed output budget, a session window pinned at 10 minutes, and an application-level cap of 32 calls — so 180 chapters could not finish, and even a 50-chapter single task was rejected under the old values. Batches now hold 12 chapters, the output budget is derived from the batch size, the session window scales with the number of batches, and the application-level limits rise to 512 calls and a 240-chapter single-task range; 180 chapters can be generated in one run, and anything beyond 240 chapters gets a split-run guidance before work starts.
- Outline-generation failures are more readable: the message now carries chapter progress (for example “X of Y chapters generated, Z remaining”) instead of only “the session deadline was exceeded”.
- The character relationship graph supports multi-faceted relationships: each pair of characters previously held a single relationship sentence, which made several characters look as if they shared one graph. A pair can now carry 2-4 relationships along different dimensions (allegiance, emotion, dependence, knowledge, history), visible one by one on the character card, and edits are not lost on save.
- Characters can carry faction stances: each character may have 0-3 stances toward specific factions, each with its supporting evidence. Generation requires evidence for every entry and omits what it cannot support, the parsing layer enforces de-duplication (no repeated target, no repeated dimension), and non-conforming output is rejected with its exact location. Existing project data remains fully compatible.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.29.AppImage, inkweaver-linux-x64-1.3.29.deb, inkweaver-linux-x64-1.3.29.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.28 — 2026-10-07

### 修复

- 切换项目后不再看到上一个项目的内容。助手会话在切换项目时会先清空再恢复新项目的会话，快速连续切换也不会串（先返回的旧项目结果会被丢弃）；工作流任务历史按当前项目显示，并且在内存里按项目分别保留，切回原项目时它的历史仍然在；运行日志带上项目归属，只显示应用级日志与当前项目的日志，不再把别的项目混进面板；“项目切换时重置助手状态”改挂在统一的项目打开/关闭入口，与角色、草稿的处理一致，不再依赖某个面板恰好挂载。
- 顺带修掉三处库层问题：“清空定稿正文”过去没有清干净——定稿全文快照另存在一处、不在清理范围内，现已纳入，并补上另外两张漏清的表；修掉一个会让“从未用过摘要缓存的项目”整个清空操作失败的问题（那张表尚未创建却被直接清理）；同一个项目路径“删掉再重建”时不再跳过知识库迁移检查。
- 清空范围也讲清楚了：清空对话框现在明示“助手会话记录不受影响”、逐项列出会清掉什么，并指路到助手面板的历史里删除会话；判据写进代码作为唯一事实源——清空生成数据清的是稿子，不是规划与决定。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.28.AppImage、inkweaver-linux-x64-1.3.28.deb、inkweaver-linux-x64-1.3.28.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.28 — 2026-10-07 (English)

### Fixed

- Switching projects no longer shows the previous project's content. Assistant conversations are cleared and then restored for the newly opened project, so rapid consecutive switches do not mix them up (a stale result from the earlier project is discarded); the workflow task history is shown for the current project and now kept per project in memory, so switching back still finds its history; runtime logs carry project ownership and only show application-level entries plus the current project's, instead of mixing another project into the panel; and “reset assistant state when the project changes” now hangs off the shared project open/close entry point, the same way characters and drafts do, rather than depending on a particular panel happening to mount.
- Three further database-level problems found in the same sweep: “clear finalized prose” did not actually clear everything — the finalized full-text snapshot is stored separately and was not in scope, and it is now included along with two other tables that were being missed; a project that had never used the summary cache could fail the entire clear operation because that table did not exist yet but was cleared directly; and deleting then recreating the same project path no longer skips the knowledge-base migration check.
- The scope of clearing is now stated outright: the dialog says that assistant conversation records are not affected, lists what will be cleared, and points to the assistant panel's history for deleting conversations. The rule lives in code as the single source of truth — clearing generated data clears the manuscript, not the plans and decisions.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.28.AppImage, inkweaver-linux-x64-1.3.28.deb, inkweaver-linux-x64-1.3.28.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.27 — 2026-10-07

### 新增

- 助手的会话现在按项目保存在本地数据库中，重开应用后仍在。此前助手对话是纯内存的，关闭应用即全部丢失——作者与助手达成的重要决定（比如“这个设定定成 X”“这一章先不回收那条线索”）会随对话一起消失，每次新会话都要重新解释项目。现在历史面板里的会话会保留下来，打开即可继续；会话列表只取元数据，选中某个会话时才按需加载正文，不会一次拉取全部内容；面板顶部显示当前状态（已保存 / 读取中 / 最近一次保存失败），空状态也有可读提示。
- 两条可感知的取舍：流式生成期间不写库，只在你发出消息时、以及助手一轮结束（正常完成、出错或被取消）时保存，避免流式输出打出成百上千次写入；保存失败不会打断对话——落库异常只记一条警告并在面板上显示“最近一次保存失败”，对话本身照常进行，不弹出错误。
- 删除与清空会话是永久操作，会同时删除本地项目库中的记录（界面已明确提示）。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.27.AppImage、inkweaver-linux-x64-1.3.27.deb、inkweaver-linux-x64-1.3.27.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.27 — 2026-10-07 (English)

### Added

- Assistant conversations are now stored per project in the local database and survive restarting the application. They used to live only in memory, so closing the application lost every conversation — including the decisions you and the assistant had reached, such as fixing a setting a certain way or leaving a thread unresolved for a chapter — and each new conversation meant explaining the project again. Conversations in the history panel are now kept and can be reopened to continue; the list loads metadata only and a single conversation's text is fetched when you select it, rather than everything at once; and the panel header shows the current state (saved / loading / last save failed) with a readable empty state.
- Two visible trade-offs: nothing is written during streaming, so saving happens when you send a message and when a turn finishes (completed, failed, or cancelled), which avoids hundreds of writes from streamed output; and a save failure never interrupts the conversation — a database error only records a warning and shows “last save failed” in the panel while the conversation continues without an error dialog.
- Deleting or clearing a conversation is permanent and also removes its records from the local project database, as the interface states.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.27.AppImage, inkweaver-linux-x64-1.3.27.deb, inkweaver-linux-x64-1.3.27.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.26 — 2026-10-07

### 新增

- 助手现在可以批量创建角色档案。此前助手只能修改已有角色、无法新增，“一次性给出一批角色设定让助手建档”这件事一直做不成；现在可以一次提交一批新角色（作者只给一句话的，其余字段按已有架构补全），确认卡片逐个列出将新增的角色与人数变化（当前 N 人 → 提交后 M 人），作者批准后再写入。
- 三条边界：不会臆造角色的当前状态——位置、境界、身心状态、随身物品一律留空待作者填写，而不是编造；与现有角色的姓名或别名冲突时会指名报错并且不提交；角色名单在提案期间被其他人改动时如实报出版本冲突并请作者重新发起，不自动重试覆盖。
- 角色与势力分开处理：新增「批量建档」技能，并明确规定势力、组织、阵营这类内容写进架构的世界观正文，不塞进角色表；一批里同时有角色和势力时会分开提交。内置技能由 11 个增至 12 个。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.26.AppImage、inkweaver-linux-x64-1.3.26.deb、inkweaver-linux-x64-1.3.26.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.26 — 2026-10-07 (English)

### Added

- The assistant can now create character profiles in bulk. Previously it could only modify existing characters and had no way to add new ones, so handing it a batch of character concepts and asking it to file them never worked; it can now submit a batch of new characters at once (for any character described in a single sentence, the remaining fields are filled from your existing architecture) and the confirmation card lists every character to be added together with the roster change (currently N characters → M after submitting), which is written only after you approve.
- Three boundaries: it never invents a character's current state — location, cultivation level, physical and mental condition, and carried items are left blank for you to fill rather than fabricated; a name that collides with an existing character's name or alias is reported by name and nothing is submitted; and if the roster is changed by someone else while the proposal is pending, the conflict is reported honestly and you are asked to start again rather than the change being retried over the top of the newer roster.
- Characters and factions stay separate: a new “bulk profile” skill states that factions, organizations, and camps belong in the architecture's worldbuilding prose and must not be pushed into the character roster, and a batch containing both is submitted in separate parts. Built-in skills grow from 11 to 12.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.26.AppImage, inkweaver-linux-x64-1.3.26.deb, inkweaver-linux-x64-1.3.26.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.25 — 2026-10-07

### 新增

- 新增四个写作技能（内置技能由 7 个增至 11 个），都是开写与改稿流程里会直接用到的动作。
- 章节开写简报（/chapter-brief）：准备开写下一章时的“交接班”——把上一章留下的未完成动作与待回应问题、该章蓝图职责、该在这一章推进或回收的伏笔、出场角色此刻各自知道什么、上一章的情绪余波汇总成一份开写前简报，并列出待确认项；此前只能手工翻各个面板。
- 对白打磨（/dialogue）：先用正文检索取出该角色过往台词建立“声音基线”，再逐处对照用词层级、句长、称呼方式与回避习惯；每处修改都写明它偏离了哪条基线证据（章节号 + 片段），基线样本不足时会说明是推断而非测量。
- 节奏诊断（/pacing）：判据是“该章是否完成了蓝图赋予它的职责”，而不是“有没有大事件”；标出无推进章、重复功能章、被压缩的转折与线索断层，每条附章节号与蓝图或工作单原文；铺垫章与喘息章不算问题。
- 线索审计（/thread-audit）：拿线索的规划状态去正文里核对“已埋 / 已回收”是否属实，输出审计表（线索 → 规划状态 → 正文证据 → 落差 → 建议动作）；找不到佐证时如实写“未找到”。
- 四个技能都遵守既有安全边界：涉及改写的（对白打磨）走修订提案、先展示方案等作者确认，绝不直接覆盖正文；已定稿章节只给建议，并说明应在哪一章处理。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.25.AppImage、inkweaver-linux-x64-1.3.25.deb、inkweaver-linux-x64-1.3.25.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.25 — 2026-10-07 (English)

### Added

- Four new writing skills (built-in skills grow from 7 to 11), each one an action you reach for while planning or revising rather than a setting you configure.
- Chapter brief (/chapter-brief): the handover before you start the next chapter — the unfinished actions and open questions the previous chapter left behind, what the chapter blueprint asks for, the threads this chapter should advance or pay off, what each appearing character knows at this point, and the previous chapter's emotional carry-over, gathered into one pre-writing brief with the items still to confirm. Previously this meant leafing through several panels by hand.
- Dialogue polish (/dialogue): first builds a “voice baseline” from a character's past lines using manuscript search, then checks each passage against it for word register, sentence length, forms of address, and avoidance habits. Every proposed change states which piece of baseline evidence it departs from (chapter number plus excerpt), and when the baseline sample is thin the skill says it is inferring rather than measuring.
- Pacing diagnosis (/pacing): judged by whether a chapter fulfils the responsibility its blueprint gives it, not by whether something big happens. It flags chapters with no forward movement, chapters that repeat another chapter's function, compressed turning points, and thread gaps, each with a chapter number and the blueprint or work-sheet text behind it; setup chapters and breathing chapters are not treated as problems.
- Thread audit (/thread-audit): takes each thread's planned state and checks it against the manuscript to see whether “planted / paid off” is actually true, producing an audit table (thread → planned state → manuscript evidence → gap → suggested action), and plainly writing “not found” when there is no supporting evidence.
- All four skills respect the existing safety boundaries: anything that rewrites text (dialogue polish) goes through a revision proposal that is shown for your confirmation first and never overwrites prose directly, and finalized chapters receive suggestions only, with a note of which chapter they should be handled in.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.25.AppImage, inkweaver-linux-x64-1.3.25.deb, inkweaver-linux-x64-1.3.25.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.24 — 2026-10-07

### 新增

- 助手现在可以检索自己作品的正文（search_project）：按关键词在正文里检索，结果按章节分组，逐条给出「第 N 章（定稿 / v3 草稿）＋ 匹配点前后约 60 字的片段」，命中字在片段里加【】标记，并给出该版本的命中总次数（命中多处时说明列出的是前 K 处）与总量统计，完整保留章节号、版本、字数等出处便于作者复核；可限定只搜定稿或只搜草稿。此前助手只能检索导入的参考资料，项目正文（定稿与各版草稿）没有检索入口，作者问“某件信物或某句设定在第几章出现过”实际答不了——只能逐章读草稿，既慢又占上下文。现在不需要逐章读草稿，且只返回片段、不返回整章正文，既省上下文也避免把作者的长文反复搬进对话。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.24.AppImage、inkweaver-linux-x64-1.3.24.deb、inkweaver-linux-x64-1.3.24.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.24 — 2026-10-07 (English)

### Added

- The assistant can now search the prose of your own project (search_project): a keyword search across the manuscript returns matches grouped by chapter, each with “chapter N (finalized / draft v3) plus a roughly 60-character excerpt around the match”, the matched characters marked inside the excerpt, the hit count for that version (noting when only the first K of many are listed) and overall totals, keeping full provenance (chapter number, version, word count) for review, and it can be limited to finalized or draft text only. Previously the assistant could only search imported reference material, and the project's own prose — finalized chapters and every draft version — had no search entry point, so a question such as “which chapter mentioned this keepsake or this setting” could not really be answered and reading drafts chapter by chapter was the only option, which was slow and consumed context. That is no longer needed, and only excerpts are returned rather than whole chapters, which saves context and avoids pulling your long text into the conversation repeatedly.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.24.AppImage, inkweaver-linux-x64-1.3.24.deb, inkweaver-linux-x64-1.3.24.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.23 — 2026-10-07

### 新增

- 助手现在可以提案修改正文（propose_draft_revision）：助手按作者要求给出修订后的完整正文，以提案形式提交，并在确认卡片上直接给出逐行差异预览（新增/删除标记、未改动段折叠、字数前后对比与增减），作者看清改了什么再决定；提案绑定基准正文指纹以防覆盖，字数统计与修稿工作流同源。批准后仍由作者在既有修订界面完成合并，助手不会直接改写或覆盖正文。此前作者说“帮我把这段改紧凑些”，只能启动整套修稿工作流。

### 修复

- 修复助手“说了要改却什么都没发生”：助手会在正文里宣布“我现在提交改动计划”，然后结束回合，界面上不会出现任何确认卡片。根因不在界面（确认卡片只要被调用就必然出现），而是工具提示词从未说明“仅在正文里说明你要做什么不会执行任何操作，只有真的写出 `<tool_call>` 标签才会运行”；现已补上这条硬规则与一个正反示例，并要求宣布之后必须在同一条回复里紧接着给出调用标签、不要分两步。同一缺陷覆盖所有写入型工具。另补工具调用台账日志（记录本轮调用了哪些工具及各自结果，只记参数名不记正文），使这类问题以后可一眼诊断。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.23.AppImage、inkweaver-linux-x64-1.3.23.deb、inkweaver-linux-x64-1.3.23.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.23 — 2026-10-07 (English)

### Added

- The assistant can now propose a revision to your prose (propose_draft_revision): it returns the revised full text as a proposal and the confirmation card shows a line-by-line diff preview directly (added/removed markers, unchanged runs collapsed, word counts before and after with the delta), so you can see exactly what changed before deciding. The proposal is bound to the base-text fingerprint so it cannot overwrite newer prose, and its word counting is shared with the revision workflow. After approval you still complete the merge in the existing revision view — the assistant never rewrites or overwrites prose on its own. Previously, asking to tighten a passage could only start the whole revision workflow.

### Fixed

- Fixed the assistant “saying it would change something and then nothing happening”: it would announce in prose that it was submitting a change plan, end the turn, and no confirmation card ever appeared. The cause was not the interface (a confirmation card always appears once the tool is called) but the tool prompt, which never stated that describing what you intend to do in prose performs no action and that only actually emitting a `<tool_call>` tag runs anything. That hard rule and a positive/negative example are now in place, together with a requirement to emit the call tag in the same reply right after announcing rather than in two steps; the same defect covered every write-type tool. A tool-call ledger was also added (recording which tools this turn called and how each resolved, keeping parameter names but never prose), so this class of problem is diagnosable at a glance.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.23.AppImage, inkweaver-linux-x64-1.3.23.deb, inkweaver-linux-x64-1.3.23.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.22 — 2026-10-07

### 新增

- AI 写作助手现在能读取创作状态，不只是设定。新增 6 个只读工具：审稿意见（read_reviews）、叙事线索与伏笔（read_narrative_threads）、章节交接（read_chapter_handoff）、知情边界（read_knowledge_events）、连续性工作单（read_story_continuity）、修订提案（read_revision_proposals）。此前“这章审稿发现了什么”“伏笔进度如何”“上一章结尾是什么状态”“谁在第 N 章知道了这个秘密”助手都答不了；默认只返回作者已确认的记录，候选需显式要求并逐条标注。只读工具总数由 11 个增至 17 个。

### 修复

- 修复助手确认卡片“点了没反应”的两种哑状态：变更计划校验未通过时「批准执行」只是变灰、没有一句说明；确认已经失效（生成超时或被取消后等待回调已被清理）时卡片仍留在界面上，三个按钮点击都毫无反应。现在前者显示具体校验未通过原因，后者整张卡显示为已失效、按钮禁用并说明原因；校验未通过时另提供「请助手修正此计划」，把错误原因回注给同一会话由助手重新提交，不再让作者卡在死路上。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.22.AppImage、inkweaver-linux-x64-1.3.22.deb、inkweaver-linux-x64-1.3.22.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.22 — 2026-10-07 (English)

### Added

- The AI writing assistant can now read your creative state, not just the settings. Six new read-only tools: review findings (read_reviews), narrative threads and foreshadowing (read_narrative_threads), chapter handoffs (read_chapter_handoff), knowledge boundaries (read_knowledge_events), story-continuity sheets (read_story_continuity), and revision proposals (read_revision_proposals). Questions such as “what did the review find in this chapter”, “how far along is each thread”, “what state did the previous chapter end in”, or “who learned this secret in chapter N” previously had no answer. Author-confirmed records are returned by default, while candidates must be requested explicitly and are labelled one by one. The read-only tool count grows from 11 to 17.

### Fixed

- Fixed two silent states where the assistant's confirmation card “did nothing when clicked”: when a change plan failed validation, the Approve action merely greyed out with no explanation, and when a confirmation had expired (the generation timed out or was cancelled and its pending callback had been cleared) the card stayed on screen while all three buttons did nothing. A failed validation now shows the specific reason, an expired confirmation renders the whole card as no longer valid with disabled buttons and a stated reason, and a failed validation additionally offers “Ask the assistant to fix this plan”, which feeds the reason back into the same session so the assistant resubmits instead of leaving the author stuck.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.22.AppImage, inkweaver-linux-x64-1.3.22.deb, inkweaver-linux-x64-1.3.22.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.21 — 2026-10-06

### 新增

- 推理强度自动适配新模型：此前每个模型都必须在内置目录里逐个登记，否则设置里的推理强度显示“—(不支持/不发送参数)”；现在未登记的模型按厂商与模型家族自动匹配（覆盖 GPT-5 及以上与 o 系、Grok-4 及以上、Kimi K2 及以上、Gemini 2.5 及以上、DeepSeek V4 及以上、Qwen3 及以上、GLM-4.5/5 及以上、Claude 3 及以上），并沿用同类已验证模型的参数取值；确定不支持该参数的家族与网关型供应商保持不发送。

### 修复

- 修复生成小说架构或导入推导时结构化解码失败无法定位：之前只提示一句“结构化输出无法按合同解码”，没有出错位置；现在会给出错误码与具体路径（例如第几个角色的哪个字段）。同时，模型输出里出现多个 JSON 对象（推理模型常见）时会逐个按合同尝试并取可用的那个，而不再直接判为失败；未闭合的片段也不再让整次扫描失败。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.21.AppImage、inkweaver-linux-x64-1.3.21.deb、inkweaver-linux-x64-1.3.21.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.21 — 2026-10-06 (English)

### Added

- Reasoning effort now adapts to new models automatically: previously every model had to be registered in the built-in catalog one by one, and anything missing showed “—(unsupported / no parameters sent)” for reasoning effort in Settings. Unregistered models are now matched automatically by vendor and model family (covering GPT-5 and later plus the o series, Grok-4 and later, Kimi K2 and later, Gemini 2.5 and later, DeepSeek V4 and later, Qwen3 and later, GLM-4.5/5 and later, and Claude 3 and later) and reuse the parameter values of already-verified models in the same family, while families that certainly do not support the parameter and the gateway-style providers keep sending nothing.

### Fixed

- Fixed structured-decoding failures in novel-architecture generation and import inference being impossible to locate: the previous message was a single “structured output could not be decoded against the contract” with no position, and the decoder now reports an error code with a concrete path (for example which character's which field). When a model response contains several JSON objects (common with reasoning models), each is now tried against the contract and a decodable one is used instead of failing the whole run, and an unterminated fragment no longer fails the entire scan.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.21.AppImage, inkweaver-linux-x64-1.3.21.deb, inkweaver-linux-x64-1.3.21.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.20 — 2026-10-04

### 修复

- 修复生成小说架构与目录时被固定提示词上限拦住（报“提示词预算不足”）：这两条链路此前使用写死的输入上限（架构 24,000 字节、目录 16,384 字节），完全不看所用模型的上下文能力；使用大上下文模型时，一份合理的世界观设定（全局指导、主角设定、故事前提）就会被判超限而无法生成。现在它们与草稿链路一样按模型上下文动态计算输入上限（上下文未知时仍保守回退），同一份配置不再撞墙。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.20.AppImage、inkweaver-linux-x64-1.3.20.deb、inkweaver-linux-x64-1.3.20.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.20 — 2026-10-04 (English)

### Fixed

- Fixed novel-architecture and outline generation being blocked by fixed prompt limits (reported as “prompt budget exhausted”): both paths used hard-coded input ceilings (24,000 bytes for architecture, 16,384 bytes for the outline) that ignored the context capability of the selected model, so with a large-context model a reasonable worldbuilding set (global guidance, protagonist profile, story premise) was rejected as over budget and could not be generated. They now derive the input ceiling from the model's context the same way the drafting path does (falling back conservatively when the context is unknown), so the same configuration no longer hits the wall.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.20.AppImage, inkweaver-linux-x64-1.3.20.deb, inkweaver-linux-x64-1.3.20.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.19 — 2026-10-04

### 修复

- 修复打包版上“检测并重建向量索引”报 ENOTDIR（不是目录）：本地推理此前没有把自己的模型目录告知推理组件，而是沿用了组件内置的缓存位置；打包后该位置位于只读的应用归档内部，写入必然失败，也找不到你已经下载好的模型。现在推理与下载使用同一个模型目录，已下载的模型会被直接使用，不再尝试写入应用包内部。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.19.AppImage、inkweaver-linux-x64-1.3.19.deb、inkweaver-linux-x64-1.3.19.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.19 — 2026-10-04 (English)

### Fixed

- Fixed “detect and rebuild the vector index” failing with ENOTDIR (not a directory) in packaged builds: local inference had not told the inference component where its own model directory is and instead kept the component's built-in cache location, which inside a packaged app sits in the read-only application archive — writing always failed and the models you had already downloaded could not be found. Inference and download now use the same model directory, an already-downloaded model is used directly, and nothing tries to write inside the application bundle.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.19.AppImage, inkweaver-linux-x64-1.3.19.deb, inkweaver-linux-x64-1.3.19.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.18 — 2026-10-04

### 修复

- 修复本地向量模型首次真正生成向量时报“未知本地向量模型”：在“检测并重建向量索引”、知识库导入与资料检索中，本地模型第一次实际参与向量生成时，推理引擎从未登记过模型档位——档位登记此前只发生在下载控制器的一个独立实例上，而真正用于推理的引擎单例没有登记，于是本地模型报“未知本地向量模型”。现在推理与下载共用同一个引擎实例，档位登记在同一处注入，本地模型可以正常生成向量；两个实例此前还会互相覆盖 transformers.js 的模块级缓存目录与下载源，该隐患一并消除。

### 优化

- 内置本地向量模型的向量生成改为分批执行：默认每批 16 条文本，可取消并记录进度，不再一次性把整个知识库（可达上千个文本块）交给推理，导入与重建索引期间界面更可用、中断更可控。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.18.AppImage、inkweaver-linux-x64-1.3.18.deb、inkweaver-linux-x64-1.3.18.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.18 — 2026-10-04 (English)

### Fixed

- Fixed the “unknown local embedding model” error the first time a local model actually generated vectors: in “detect and rebuild the vector index”, knowledge-library import, and reference search, the inference engine had never been given the model tier registration — tiers were registered only on a separate instance owned by the download controller, while the engine singleton used for inference had none, so the local model reported an unknown model. Inference and download now share one engine instance and register tiers in the same place, so local models generate vectors normally; the two instances could also overwrite each other's module-level transformers.js cache directory and download source, and that hazard is gone as well.

### Improved

- Built-in local embedding now generates vectors in batches of 16 by default, with cancellation and recorded progress, instead of handing the entire knowledge library (up to thousands of text chunks) to inference in one call, so import and index rebuild stay responsive and can be interrupted safely.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.18.AppImage, inkweaver-linux-x64-1.3.18.deb, inkweaver-linux-x64-1.3.18.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.17 — 2026-10-04

### 修复

- 修复内置本地向量模型在导入知识库、检索资料与“检测并重建向量索引”时被误判为“未配置 Embedding 模型”：这三条链路沿用了 API 向量模型对凭据（Base URL 与 API Key）的要求，而本地模型本就没有凭据，于是导入时不会生成向量（静默退化为纯全文检索），重建索引则直接报错。现在本地模型在这三条链路正常生成向量，API 向量模型的行为与原有降级路径保持不变。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.17.AppImage、inkweaver-linux-x64-1.3.17.deb、inkweaver-linux-x64-1.3.17.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.17 — 2026-10-04 (English)

### Fixed

- Built-in local embedding models are no longer misreported as “no embedding model configured” when importing into the knowledge library, searching reference material, or detecting and rebuilding the vector index: those three paths reused the API embedding model's credential requirements (Base URL and API key), which a local model does not have, so imports produced no vectors at all (silently degrading to plain full-text search) and rebuilding the index failed outright. Local models now generate vectors on all three paths, while API embedding models keep their existing behaviour and fallback path.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.17.AppImage, inkweaver-linux-x64-1.3.17.deb, inkweaver-linux-x64-1.3.17.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.16 — 2026-10-04

### 修复

- 修复已下载并选中的内置向量模型被误判为“未配置向量模型”：模型权重实际写入的目录与就绪判定检查的目录不一致，导致知识库导入与检索在模型已经下载的情况下仍报“未配置向量模型：请下载内置本地向量模型或配置 API 向量模型”。现在下载落点与就绪判定共用同一份路径约定，旧版本留下的另一种落点目录继续被识别，设置里显示为已下载的模型可以直接使用。

- 修复同一模型仓库的不同量化档位互相冒充已下载：同一仓库的各个档位写入的是不同的权重文件，此前目录里只要存在任意一个权重，该仓库的所有档位都会被标成已下载，选中从未下载的档位后实际不可用。现在只有该档位自己的权重文件存在才算已下载。

- 修复删除内置向量模型时旧落点目录残留：删除模型时同时清理新旧两种落点目录，不再残留旧布局下的权重文件。

### 优化

- 设置里的“已选中”不再等同于“可用”：内置向量模型卡片只在模型真正下载完成后显示就绪，选中尚未下载的档位会明确提示该档位还不可用，不再显示成可用状态。

- 内置向量模型的来源选项说明改为中英文双语：界面语言为英文时按英文说明显示，不再只显示中文描述。

### 发布

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.16.AppImage、inkweaver-linux-x64-1.3.16.deb、inkweaver-linux-x64-1.3.16.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.16 — 2026-10-04 (English)

### Fixed

- Downloaded and selected built-in embedding models are no longer misreported as “no embedding model configured”: the directory the weights are actually written to did not match the directory the readiness check looked at, so knowledge-base import and search still failed with “No embedding model configured: download the built-in local embedding model or configure an API embedding model” even though the model was already downloaded. Downloads and the readiness check now share one path convention, the alternative layout left by older versions is still recognized, and a model that Settings shows as downloaded is ready to use.

- Quantization tiers of the same model repository no longer stand in for one another: each tier of a repository writes its own weights file, but the presence of any single weights file used to mark every tier of that repository as downloaded, leaving a selected tier unusable when it had never been downloaded. A tier now counts as downloaded only when its own weights file is present.

- Deleting a built-in embedding model no longer leaves the older layout behind: the removal clears both the current and the older layout directories.

### Improved

- “Selected” in Settings no longer means “ready”: the built-in embedding model card reports ready only after a model has actually finished downloading, and choosing a tier that has not been downloaded now says so explicitly instead of appearing available.

- The built-in embedding model source options now carry bilingual copy: an English interface shows the English descriptions instead of the previously hard-coded Chinese text.

### Release

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.16.AppImage, inkweaver-linux-x64-1.3.16.deb, inkweaver-linux-x64-1.3.16.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.15 — 2026-10-03

- 修复“❌ 生成失败：LLM 调用失败：GenerationHarnessError: 生成会话已用尽请求 Token 预算。”：根因是每次模型请求都把“本次请求最大可能输出”整份计入会话预算且从不退还——AI 助手对话、草稿续写、结构化多步生成因此在第 2～4 次请求就被误判为预算用尽，而实际输出往往只有几百 token。现在请求完成后按 provider 回报的 completion tokens 结算，未使用的预留立即释放回会话；provider 不回报用量时保留整份预留（fail-closed，不虚增可用预算）。同时把解析后的会话预算收敛到应用级安全上限内（单次请求 131,072、单会话 393,216 tokens），模型档案声明超大输出能力时不再突破上限；助手会话的调用次数上限从 8 提升到 16，为轮次内的上下文压缩请求留出余量。
- AI 助手工具调用可自我修复：参数不符合工具自身契约（缺必填项、可选值非法）时不再带着残缺输入执行，而是把该工具的完整参数契约（必填/类型/枚举取值）连同修正要求交回模型；未知工具名会给出相近的已注册工具。工具执行失败时同样附带契约而非只回一句错误，减少无效重试。
- AI 助手支持并行只读调用：系统提示允许并鼓励在同一条回复中给出多个互不依赖的只读 <tool_call>（写入型工具仍需逐个确认）；连续出现的只读调用并发执行，结果与界面卡片仍按原顺序合并展示，减少往返轮次与等待时间。
- 取消与预算耗尽不再显示为“生成失败”：用户取消或超时由对话状态写入停止标记，ReAct 循环不再把它覆盖成 ❌ 错误；计划内的预算用尽（token/次数/截止时间）改为保留已生成内容并提示可从当前进度继续。
- 新增“文风打磨”能力：内置只读工具 `analyze_prose_quality` 对指定章节最新草稿或任意文本片段做确定性测量（句首/段首/短语重复、句长均值与标准差、长句占比、对话占比、副词与模糊词密度），新增 `/prose-polish` 技能按“测量 → 定位 → 修改 → 复测”流程打磨文风，修改前后可用同一组数据对比，不再依赖“感觉更好了”。
- 新增“联动修改”能力：助手现在先算影响、再动手，而不是单点修改。内置只读工具 `analyze_change_impact` 依据当前项目状态算出一次改动会牵涉哪些人物档案、人物状态、章节蓝图、知情边界（谁在何时知道什么）、章节交接、叙事线索、规划资料与定稿事实，逐项给出理由、证据与“必须修改 / 需要复核 / 不可自动修改”的分级，并标明可写性（可写入计划 / 已定稿 / 仅作者可改——例如知情边界与定稿章节交接只能由作者在对应面板处理）；新工具 `propose_change_plan` 把整条改动链一次性提交（作品配置、架构正文、人物档案、角色当前状态、章节蓝图、线索规划、候选规划资料），确认卡片逐项展示“当前值 → 建议值”和校验结果，作者批准后按依赖顺序（设定 → 档案 → 状态 → 蓝图 → 线索 → 资料）写入。涉及世界观这类底层改动时，助手会同时给出作品配置、全部人物档案与各章蓝图的复核清单并据此组织计划。
- 联动修改守住既有安全边界：已定稿章节的蓝图与正文一律不可自动改写（预览期拦截、写入前再次复核），新角色必须走候选确认流程，角色写入带名单 revision 乐观校验与身份约束，全部写入仍走各自既有仓库（不新增绕过通道）。新增 `/change-propagation` 技能引导“分析影响 → 组织计划 → 作者确认 → 逐项汇报”的流程。

- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.15.AppImage、inkweaver-linux-x64-1.3.15.deb、inkweaver-linux-x64-1.3.15.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.15 — 2026-10-03 (English)

- Fixed "❌ 生成失败：LLM 调用失败：GenerationHarnessError: 生成会话已用尽请求 Token 预算。" (the generation session exhausted its requested-token budget): every request charged its worst-case maximum output to the session and never released it, so the assistant conversation, draft continuation, and multi-step structured generation were misreported as out of budget on their second to fourth request even when real output was a few hundred tokens. A completed request now settles against the provider-reported completion tokens and releases the unused hold immediately; when a provider reports no usage the full reservation stands (fail-closed, never inflating the remaining budget). Resolved session budgets are also clamped to the application ceilings (131,072 per request, 393,216 per session) so an oversized model capability can no longer widen a run, and the assistant session allows up to 16 calls so in-round context compaction has headroom.
- Self-repairing tool calls: a call that violates its tool contract (missing required argument, illegal enum value) is no longer executed with partial input — the model receives the full parameter contract (required/type/enum) plus a repair instruction, and unknown tool names come back with the closest registered names. Failed executions carry the same contract instead of a bare error, cutting dead-end retries.
- Parallel read-only tool calls: the system prompt now allows and encourages several independent read-only `<tool_call>` blocks per reply (write tools still confirm one at a time); consecutive read-only calls run concurrently while results and UI cards keep their original order, so a round needs fewer model round-trips.
- Cancellation and budget exhaustion no longer surface as "generation failed": the store already writes the stopped state on cancel or timeout and the ReAct loop no longer overwrites it with an error, while a planned session limit (tokens, calls, deadline) keeps the produced content and offers to continue from the current progress.
- New prose-polish capability: the built-in read-only `analyze_prose_quality` tool measures a chapter's latest draft or any text fragment deterministically (repeated sentence/paragraph openings and phrases, sentence-length mean and standard deviation, long-sentence share, dialogue share, adverb and hedge density), and the new `/prose-polish` skill polishes in a measure → locate → revise → re-measure loop, so a revision can prove which findings it removed instead of claiming the prose "feels better".
- New coordinated-change capability: the assistant now computes the blast radius before it edits. The built-in read-only `analyze_change_impact` tool derives, from the live project state, which character profiles, character states, chapter blueprints, knowledge boundaries (who knows what, and when), chapter handoffs, narrative threads, planning materials, and finalized facts a change touches, and grades each target with its reason, evidence, and "must change / review / cannot auto-change", marking writability too (safe to plan / finalized / author-only — knowledge boundaries and finalized chapter handoffs can only be handled by the author in their own panels). The new `propose_change_plan` tool submits the whole propagation chain at once (novel config, architecture prose, character profiles, structured character state, chapter blueprints, thread plans, candidate planning materials); the confirmation card shows per-item current → proposed values and validation results, and after approval the edits apply in dependency order (settings → profiles → states → blueprints → threads → materials). For foundational changes such as world rules, the assistant reports the config fields, every character profile, and every chapter blueprint as review targets and builds the plan from that list.
- Coordinated changes keep every existing safety boundary: finalized chapters' blueprints and prose can never be rewritten silently (blocked at preview time and re-checked immediately before each write), new characters must still come through candidate confirmation, roster writes keep revision-based optimistic concurrency and identity constraints, and all writes go through the existing repositories — no new bypass path. The new `/change-propagation` skill guides the analyze → plan → confirm → report flow.

- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.15.AppImage, inkweaver-linux-x64-1.3.15.deb, inkweaver-linux-x64-1.3.15.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.14 — 2026-10-03

- 内置本地向量模型（首跑可选下载）：知识库不再强制要求先配置 API 向量模型。设置 → 向量模型新增“内置本地向量模型”卡片，可浏览并下载离线模型（中文推荐 bge-small-zh-v1.5，另有 EmbeddingGemma Q8/F32、all-MiniLM-L6-v2、多语言 MiniLM-L12、Qwen3-Embedding-0.6B），每个模型附介绍、维度与近似体积；下载按 GPU → 核显 → CPU 自动选择执行后端并回退。向量来源支持 自动（本地优先回退 API）/ 仅本地 / 仅 API，默认自动；首次运行未配置任何向量模型时出现一次性引导弹窗。修复了未配置向量模型时反复调用主力对话模型 /embeddings 的问题：现在没有可用来源会明确报错或退化为全文检索。免费向量模型注册链接已更新。
- 打包与依赖：新增本地向量模型推理运行时（onnxruntime-node 等）后，原生依赖（推理运行时、sharp 图像库）纳入解包清单，打包后可用；非目标平台/架构的推理二进制（darwin、linux、win32-arm64 共约 174MB）由 afterPack 钩子在打包后删除，Windows 包只保留 win32-x64 的 onnxruntime_binding.node、onnxruntime.dll 与 DirectML.dll。修复了一次打包回归：平台级 files 只写排除项时 electron-builder 会把过滤规则当作“仅忽略”并回落为包含全部文件，导致整个仓库目录（release 产物、.worktrees、工具缓存等）被打进 asar（实测 2.2GB）；现在包含项集中写在工作区级 files，asar 恢复到 268MB 且不含任何开发依赖。Windows 打包门禁新增校验：ONNX Runtime 原生绑定、DirectML 运行时、非目标平台二进制残留，以及用打包后的可执行文件真实加载 onnxruntime；安装包冒烟在卸载前先清理安装目录中残留的产品进程，修复了卸载后置条件间歇失败（残留 Electron 子进程持有 InkWeaver.exe 映像导致卸载器无法删除）。仓库关闭 pnpm 的 peer 自动安装（开启时新增依赖长期无进展），并显式关闭 verifyDepsBeforeRun——pnpm 11 默认在 pnpm run/exec 前先跑一次隐式安装，本仓库实测会在收尾阶段挂起十分钟以上，electron-builder 内部调用 pnpm exec 时同样被卡住；两项设置都写在 pnpm-workspace.yaml（*.npmrc 里的写法 pnpm 11 不读取），关闭后 pnpm install 与 pnpm run 均为秒级完成。
- 修复打包后的主进程启动失败：主进程 bundle 是 ESM，而本地向量模型把推理栈（transformers/onnxruntime-node）打进了 bundle，其内部的 `require('.node')` / `require('electron')` 在 ESM 下没有 `require` 可用，启动即抛 “Calling `require` … in an environment that doesn't expose the `require` function”（Linux 安装包启动崩溃、Windows/macOS 弹出 JavaScript 错误对话框）。现在推理栈在构建时保持 external，运行时从 node_modules 动态加载；用户数据目录也改为静态导入 `app` 后再读取，不再使用 `require('electron')`。
- 安全（依赖整改）：按依赖审计结果整改随包分发的组件——dompurify（经 monaco-editor 进入渲染进程）提升到 3.4.16，修复多篇 XSS 公告；tar（经 onnxruntime-node 分发）提升到 7.5.22，修复解压 DoS 公告；js-yaml 提升到 4.3.2（限定在 4.x，避免跨大版本），修复二次复杂度 DoS；builder-util-runtime 提升到 9.7.0，修复跨源跳转泄露凭据；Electron 运行时由 41.2.0 升到 41.10.7（同一大版本补丁线）。sharp 0.34.1 的 libvips 公告只落在 @huggingface/transformers 的图像能力上（本应用的向量检索不经过它），且 transformers 声明的范围尚未放开到 0.35，随上游升级处理。其余公告只落在开发工具链（vitest、electron-builder、postcss 等），不随应用分发，已记录不处理。
- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.14.AppImage、inkweaver-linux-x64-1.3.14.deb、inkweaver-linux-x64-1.3.14.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.14 — 2026-10-03 (English)

- Built-in local embedding models with a first-run download: the knowledge library no longer requires an API embedding model. Settings → Embeddings offers a local model card where you can browse and download offline models (bge-small-zh-v1.5 for Chinese, plus EmbeddingGemma Q8/F32, all-MiniLM-L6-v2, multilingual MiniLM-L12, and Qwen3-Embedding-0.6B) with descriptions, dimensions, and approximate sizes; downloads pick GPU, then integrated GPU, then CPU, and fall back automatically. The embedding source can be Auto (local first, API fallback), local-only, or API-only, defaulting to Auto, and a one-time dialog appears on first run when nothing is configured. The old bug that kept calling the main chat model's /embeddings endpoint when no embedding model was configured is fixed: without a usable source the app now reports clearly or falls back to full-text search. The free embedding model signup link was updated.
- Packaging and dependencies: native modules (the inference runtime and sharp) are unpacked so they load after packaging, and foreign-platform inference binaries (about 174MB of darwin, linux, and win32-arm64 files) are pruned after packing, leaving only win32-x64 onnxruntime_binding.node, onnxruntime.dll, and DirectML.dll on Windows. A packaging regression is fixed: platform-level `files` entries containing only negations made electron-builder fall back to including every file, so the whole working tree (release artifacts, worktrees, tool caches) was packed into a 2.2GB asar; the include list now lives in the workspace-level `files` and the asar is back to 268MB with no development dependencies. The Windows package gate now also verifies the ONNX Runtime binding, the DirectML runtime, the absence of foreign platform binaries, and that the packaged executable really loads onnxruntime. pnpm peer auto-install and verifyDepsBeforeRun are both disabled in pnpm-workspace.yaml (writing them in .npmrc has no effect in pnpm 11); the implicit install pnpm runs before run/exec used to hang for minutes and blocked electron-builder's internal `pnpm exec` too, while both `pnpm install` and `pnpm run` now finish in seconds.
- Fixed a packaged-startup failure: the main-process bundle is ESM, but the local embedding feature bundled the inference stack (transformers / onnxruntime-node) into it, and that code calls `require('.node')` and `require('electron')`, which do not exist in ESM ("Calling `require` … in an environment that doesn't expose the `require` function" — the Linux package crashed at startup and Windows/macOS showed a JavaScript error dialog). The inference stack is now external at build time and loaded from node_modules at runtime, and the user-data directory is read through a static `app` import instead of `require('electron')`.
- Security (dependency remediation): shipped components were upgraded per the dependency audit — dompurify (reaching the renderer through monaco-editor) to 3.4.16, fixing several XSS advisories; tar (shipped through onnxruntime-node) to 7.5.22, fixing a decompression DoS advisory; js-yaml to 4.3.2 (pinned inside major 4) for a quadratic-complexity DoS; builder-util-runtime to 9.7.0 for a cross-origin credential leak; and the Electron runtime from 41.2.0 to 41.10.7 on the same major patch line. sharp 0.34.1's libvips advisories only reach @huggingface/transformers image handling, which this application's embedding search never executes, and transformers has not widened its range to 0.35, so that upgrade follows upstream. The remaining advisories only affect the development toolchain (vitest, electron-builder, postcss) and do not ship with the application; they are recorded as out of scope.
- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.14.AppImage, inkweaver-linux-x64-1.3.14.deb, inkweaver-linux-x64-1.3.14.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.13 — 2026-10-02

- 修复手动输入模型名称后推理强度映射失效的问题：手输名不再要求与预设逐字一致，大小写差异、部署变体后缀（如 -32b）、日期后缀、OpenRouter 路由后缀（如 :free）与分隔符/空格变体都能命中同一官方模型并继承其推理映射；“章节起草/故事规划/审稿与修订”不再显示“不支持 / 不发送参数”。完全无关的模型名仍正确判定为不支持。Gemini 预设目录收录 gemini-3.8-flash（1M 上下文、thinking budget 映射），gemini-3.8-flash-high/-low/-thinking 等强度别名后缀的手输名可自动命中。
- 修复 AI 一键替换角色名的应用死锁：应用成功后界面不再回到预览把已替换的名字重新当待改名做重名校验；批量改名一次写入整份名单，互换与链式改名都能生效。名单已改而落盘失败时保留草稿，可再次点击“应用改名”补上；落盘后仅同步失败时停在完成态并说明原因。整体改名的覆盖面补齐蓝图备注。
- AI 全书方向调整升级为真正的档案级调整：人物档案的外貌、背景、性别、年龄、定位、能力、动机、弧光、备注都可由 AI 改写，人物关系可整份替换（目标限现有角色）；未定稿章节蓝图的出场人物名单也可由 AI 调整（不得发明新角色）。预览按字段对照展示，所有写入仍受指纹、定稿章保护与角色名单校验约束。
- 草稿生成上下文的摘录摘要不再只保留约束句和含角色名的句子：在相关句之外按全文位置均匀取样，保住世界观、场景与氛围描写，避免草稿变干巴；自动续写现在携带本章要点时间线、活跃线索、知情范围与上一章交接，已写结尾窗口从 1600 字加宽到 2400 字，续写场景更连贯。单次生成的输出预留下限从 8192 提高到 16384 tokens 并按目标字数放大系数上调，减少多轮薄上下文续写；系统提示改为“正文的生动优先”，参考资料声明从“仅风格结构参考”改为“可化用冲突设计与细节笔法”。上一章候选稿恢复 1.2 时代的最多 12000 字全文注入（不再先摘要成 3000 字）；故事前提、剧情概要、世界观与核心大纲在 4000-4800 字以内保持原文直通，不再摘要。
- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.13.AppImage、inkweaver-linux-x64-1.3.13.deb、inkweaver-linux-x64-1.3.13.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## 1.3.12 — 2026-10-02

- 拆章支持“第X卷/回/话/节”与“序章/楔子/引子/前言/尾声/终章/番外/外传”等章节标记；书名与作者等前言短行不再被当成第一章。没有任何章节标记、只靠空行分节的长文按空行与段落边界切成约 3000 字的连续分节，不再整本变成一章。
- 拆解仿写逐章独立分析，超长章节保留开头与真实结尾并标注中间省略；导入推演的角色卡上限放宽到 3-12 人并要求覆盖全书重要角色，可推断字段不再用“（待确认）”敷衍。
- 导入的全局设定与文风推演改为全书均匀取样（首尾加中段共 5 章）；单章蓝图字段上限放宽（目的 240 字、关键事件 700 字、悬念钩子 220 字）。
- AI 批量生成章节名改为常见小说章节名风格并自动清洗书名号、引号、章号与前缀，按全书去重；生成章节蓝图与 AI 生成书名遵循同一命名约定，书名候选旁提示平台建议字数区间。
- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.12.AppImage、inkweaver-linux-x64-1.3.12.deb、inkweaver-linux-x64-1.3.12.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## What's changed

- Manually entered model names no longer lose the reasoning mapping: case differences, deployment suffixes, date suffixes, OpenRouter-style routing suffixes, and separator variants all resolve to the same official model. The settings screen shows the mapped stage efforts again, and runtime requests carry the reasoning directive. Catalogued gemini-3.8-flash (1M context, thinking budget), so strength-suffixed names like gemini-3.8-flash-high resolve automatically.
- The adaptation rename deadlock is fixed: applying no longer returns to the preview to re-validate already-applied names; renames apply to the whole roster in one batch (exchanges and chains work); a failed commit keeps the local draft for retry; post-commit sync failures stay on the completed screen. Blueprint notes are covered by full-identity renames.
- AI story direction is now a real profile-level adjustment: full character profiles, whole relationship lists (targets limited to the existing cast), and unfinished blueprint cast lists are AI-editable, with fingerprint, finalized-chapter, and roster-closure checks intact.
- Draft vividness levers restored: extractive summaries sample ambient sentences evenly instead of keeping only constraints; output reservations rise (16,384-token floor, target*3+8192) to avoid thin continuations; previous-chapter candidates and short settings text pass through verbatim up to historical budgets; system prompts state vividness first and allow adapting conflict design and detail craft from reference excerpts.
- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.13.AppImage, inkweaver-linux-x64-1.3.13.deb, inkweaver-linux-x64-1.3.13.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.12 — 2026-10-02 (English)

- Fixed the adaptation-rename deadlock: a successful apply no longer returns to the preview and re-validates already-applied names. Renames apply to the whole roster in one batch (exchanges and chains work), already-applied rows render as read-only results, a failed commit keeps the local draft for retry, and post-commit sync failures stay on the completed screen. Full-identity rename coverage now includes blueprint notes.
- AI story direction is now a real profile-level adjustment: appearance, background, gender, age, role, abilities, motivation, arc, and notes are AI-editable; a character's whole relationship list can be replaced (targets limited to the existing cast); unfinished chapter blueprints accept validated cast-list edits. Previews render the new fields, and every write still crosses fingerprint, finalized-chapter, and roster-closure checks.
- Extractive summaries no longer keep only constraints and cast mentions: remaining budget samples evenly across the document so worldbuilding and atmosphere survive. Automatic continuations carry the story-so-far timeline, active threads, knowledge range, and the confirmed handoff, with a wider (2,400-character) manuscript tail.
- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.12.AppImage, inkweaver-linux-x64-1.3.12.deb, inkweaver-linux-x64-1.3.12.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.11 — 2026-10-02

- 拆书仿写的一键替换角色名现在贯穿整张角色档案：除角色主键、关系目标与蓝图结构化引用外，外貌、性格、背景、能力、动机、弧光、关系描述，以及备注、动态状态、关系证据、知情事件与已确认导入规划资料都会同步换名，作品里不再残留原名。图表术语校正式改名仍按原策略保留备注、动态状态与证据文本，不改写冻结事实。人物关系的方向、来源章节与证据在手工保存（含一键改名）时不再被丢弃。
- 拆章支持“第X卷/回/话/节”与“序章/楔子/引子/前言/尾声/终章/番外/外传”等章节标记；书名与作者等前言短行不再被当成第一章，真正的第一章编号不再后移。没有任何章节标记、只靠空行分节的长文不再整本变成一章：按空行与段落边界切成约 3000 字的连续分节（单段超长时按句子边界切开），每节用首行做可辨认的标签；内容本身不长时仍保持单章与文件名标题。
- 拆解仿写逐章独立分析：每章的关键事件、目的与悬念钩子只能来自该章正文，不会只拆第一章或把多章事件混写进同一章；超长章节保留开头与真实结尾，并标注中间省略，避免凭想象补全。导入推演的角色卡上限从 3-8 人放宽到 3-12 人并要求覆盖全书重要角色；可推断的设定字段不再用“（待确认）”敷衍。
- 导入的全局设定与文风推演改为全书均匀取样（首尾加中段共 5 章），不再只读开头 3 章和结尾 2 章，长书中段的世界观与人物不会再被忽略。单章蓝图的字段上限放宽（目的 160→240 字、关键事件 400→700 字、悬念钩子 160→220 字），并要求拆解写足细节，减少模型写详细一点就整批校验失败重试的情况。
- AI 批量生成章节名改为常见小说章节名风格：优先 4-12 字的简短具体标题，落库前自动去掉《书名号》、引号、章号与“标题：”前缀、结尾标点，并按全书已有章节名去重；生成章节蓝图时的标题也遵循同一命名约定。AI 生成书名会自动去掉书名号与引号，并在候选旁提示平台建议字数区间。
- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.11.AppImage、inkweaver-linux-x64-1.3.11.deb、inkweaver-linux-x64-1.3.11.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## What's changed

- The adaptation rename now carries through the whole character profile: appearance, personality, background, abilities, motivation, arc, and relationships, plus notes, dynamic state, relationship evidence, knowledge events, and confirmed planning materials, so no previous name survives. Terminology-only renames keep notes, state, and evidence text untouched. Relationship direction, source chapter, and evidence are no longer dropped on manual saves.
- Chapter splitting recognizes 第X卷/回/话/节 and 序章/楔子/引子/前言/尾声/终章/番外/外传 headings, and book title or author preambles no longer consume the first chapter number. Books with no markers at all are split structurally into roughly 3,000-character sections along blank lines and paragraph boundaries instead of importing as one giant chapter; short single-chapter files keep their file-name title.
- Blueprint inference analyzes each chapter independently, keeps both the opening and the real ending of an over-budget chapter, and states where text was omitted so no missing plot is invented. The inferred cast grows from 3-8 to 3-12 cards with a requirement to cover the book's important roles.
- Global settings and writing-style inference sample five chapters evenly across the whole book instead of only the first three and last two. Single-chapter blueprint prose limits widen (purpose 240, key events 700, suspense hook 220 characters) so a detailed deconstruction is no longer rejected and retried as a batch.
- Generated chapter titles now follow conventional chapter-naming practice: short, concrete names, cleaned of book-title marks, quotes, chapter numbers, numbering prefixes, and trailing punctuation, and deduplicated against the whole book. Blueprint generation and imported chapter blueprints follow the same convention, and generated book titles lose their wrappers with a platform length hint.
- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.11.AppImage, inkweaver-linux-x64-1.3.11.deb, inkweaver-linux-x64-1.3.11.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.10 — 2026-10-02

- 章节草稿和续写使用冻结模型能力计算输入预算，扣除按章节目标设定的输出预留及安全余量。取消统一 64 KiB 草稿限制；应用最多使用 96,000 估算输入 Tokens，容量未知时采用 16,384 的保守上限。Token 数均为估算，非模型专用 tokenizer 的精确计数。
- 本章核心人物的身份、外貌、性格、能力、动机、关系、备注和约束保留完整；必保资料无法容纳时在模型请求前阻止生成。背景与弧线可使用完整句段的摘录摘要；相关非出场人物按关系、地点和势力筛选，最多 12 人，其余显示未纳入原因。
- 全书架构和前文使用来源绑定的摘录摘要；项目缓存依据源文本、章节、相关词和算法版本匹配，资料变更后不会复用不匹配的摘要。每项目最多 128 条，单条最多 32 KiB，不增加额外模型调用。
- 前文事件来自定稿连续性事实或实际已写正文；草稿标为候选，参考书片段标为参考资料，未写蓝图只作规划。未来/未核实人物状态不作为当前事实；旧图谱没有结构化卡片时提示先修复。
- 写前收据在模型响应前显示来源、核心保护、完整/摘要/未纳入、缓存命中和预算估算，并同步实际压缩结果。续写有对应请求的资料收据；大型列表支持滚动。兼容旧卡片缺失的可选文本字段。
- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.10.AppImage、inkweaver-linux-x64-1.3.10.deb、inkweaver-linux-x64-1.3.10.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## What's changed

- Drafting and continuation calculate input budgets from frozen model capabilities, task-sized output reservations and safety margin. Replaced the universal 64 KiB draft limit with a 96,000 estimated-input-token application ceiling and a conservative 16,384 ceiling for unknown capacities. Token counts are estimates, not exact provider tokenization.
- Protected core profiles retain identity, appearance, personality, abilities, motivation, relationships, notes and constraints; insufficient required context blocks dispatch. Background/arcs can use complete-sentence extractive summaries. Up to twelve related non-present characters are selected by relationships, locations and factions.
- Added source-bound architecture/prose summaries and a project cache keyed by text, chapter, relevance terms and algorithm version. Changed inputs cannot reuse mismatched summaries. Limits: 128 entries per project, 32 KiB per entry, no additional model calls.
- Prior events come from finalized continuity or actual written prose. Unfinished prose remains a candidate, reference-book excerpts remain reference material, and unwritten blueprints remain plans. Future/unverified states are excluded; legacy graphs without structured cards require repair.
- Live preflight receipts show sources, protected cores, full/summary/omitted status, cache hits and estimated budgets, then reflect final compaction. Continuations have request-specific receipts, long lists are scrollable, and legacy optional fields are supported.
- Continues Windows, macOS and Linux x64 same-commit releases. Linux packages: inkweaver-linux-x64-1.3.10.AppImage, inkweaver-linux-x64-1.3.10.deb, inkweaver-linux-x64-1.3.10.rpm with SHA-256. Qualification covers Ubuntu 22.04, Debian 13, Fedora 44, the glibc 2.35 baseline and --appimage-extract-and-run. Linux packages are unsigned.

## 1.3.9 — 2026-10-01

- 修复批量创作恢复从头重跑并被已有草稿阻断的问题。恢复收据保存草稿 ID、SHA-256 和定稿修订号；只继续原任务保存且正文未变化的草稿，已完成章节跳过，未完成定稿继续处理，失败会阻止后续章节。
- 修复保存成功后取消任务却清空结果的问题；单章恢复会重新打开已保存草稿。架构恢复只执行未完成步骤；蓝图已提交后的恢复只重试持久化角色同步，不重复生成蓝图。
- 修复补修仍有失败步骤却显示成功、遗漏章节交接及同秒跑批查询选中旧状态的问题。补修交接继续绑定定稿正文散列；旧章/同章补修不会倒退后续状态或覆盖人工修正，后续定稿仍可推进角色状态。
- 结构化拆批保留取消、超时、预算和供应商异常及尝试收据；结构化与角色架构请求遵守步骤输出上限，蓝图生成遵守工作流冻结的模型选择。
- 取消持久化回调同步抛错不会再卡住暂停任务；损坏的恢复收据逐条隔离，正常收据仍可读取并继续保存。
- Linux x64 继续提供 inkweaver-linux-x64-1.3.9.AppImage、inkweaver-linux-x64-1.3.9.deb、inkweaver-linux-x64-1.3.9.rpm 及 SHA-256；资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线与 --appimage-extract-and-run 验证保持有效。Linux 包未签名。

## What's changed

- Batch recovery now preserves saved draft IDs, SHA-256 hashes, and finalization revisions. It skips completed chapters and resumes unfinished finalization without regenerating or adopting unrelated drafts; further failure stops later chapters.
- Cancellation after a successful draft save retains its identity and result. Single-draft recovery reopens saved content, architecture recovery runs only unfinished steps, and recovery after a blueprint commit retries only its durable character synchronization.
- Finalization repair fails when any step remains failed and includes source-bound chapter handoff. Same-second run selection is deterministic. Older/same-chapter repair preserves newer states and author corrections, while later chapters can advance character state.
- Structured split retries preserve cancellation, deadline, budget, and provider failures and receipts. Structured/character requests honor intended output caps, and directory generation honors the frozen workflow model.
- Synchronous cancellation-hook failures no longer strand paused tasks. Malformed recovery receipts are isolated without hiding valid receipts or blocking new saves.
- Continues Linux x64 distribution: inkweaver-linux-x64-1.3.9.AppImage, inkweaver-linux-x64-1.3.9.deb, inkweaver-linux-x64-1.3.9.rpm and SHA-256 sidecars. Qualification covers Ubuntu 22.04, Debian 13 and Fedora 44 with a glibc 2.35 baseline and --appimage-extract-and-run checks. Linux packages are unsigned.

## 1.3.8 — 2026-09-30

- 全书方向调整兼容模型附带的 unchanged 元数据，不再将“未改动字段”当作小说配置值；角色和章节变更中的同类元数据也不会写入项目。
- 批量章节名生成的输出上限提高至最多 16,384 Token，仍遵守模型配置上限。遇到 length 截断会限次拆分小批次，丢弃截断响应并保留已验证候选；格式或标题质量不合格时限次重新生成。每个原始批次最多 7 次请求。
- 章节名按小说章节标题生成，中文优先 4–12 字、最多 20 字符，避免剧情梗概和多事件清单；作者仍可在预览中手工修改。新增截断恢复日志与额外调用提示，并修复切换项目时旧响应覆盖新弹窗状态的竞态。
- 章节交接提示词明确证据数组、逐字引文及长度约束；兼容单段引文和带 quote 的证据对象。保存时继续核对定稿来源、正文哈希及原文引文，候选仍需作者确认。
- 修复角色状态提交回读错误：读取当前状态来源时使用最近写入的历史记录，避免导入的后面章节状态历史覆盖当前定稿章节的来源。状态与来源仍在同一事务中校验提交。
- 桌面版继续提供 Windows、macOS 与 Linux x64。Linux 文件为 inkweaver-linux-x64-1.3.8.AppImage、inkweaver-linux-x64-1.3.8.deb、inkweaver-linux-x64-1.3.8.rpm 及 SHA-256；资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线与 --appimage-extract-and-run 验证保持有效。Linux 包未签名。

## What's changed

- Story direction proposals now treat unchanged as metadata rather than a project, character, or chapter field.
- Chapter-title generation reserves up to 16,384 output tokens while honoring the configured model limit. Length-truncated batches are split with bounded recovery; incomplete responses are discarded and validated candidates are retained. Invalid or summary-like titles receive a limited regeneration attempt, with at most seven requests per original batch.
- Prompts now ask for concise fiction chapter titles rather than plot summaries. Added recovery logging and extra-call disclosure, and prevented old responses from resetting a newer project or reopened dialog.
- Chapter handoff prompts specify exact quotation arrays and size limits; single quotations and explicit quote objects are normalized at the model boundary. Finalized-source, content-hash and verbatim-text checks remain mandatory, and candidates still require author confirmation.
- Fixed character state readback after importing later-chapter states by binding the active state to the most recently written provenance record. Transactional validation remains intact.
- Continues Windows, macOS and Linux x64 distribution: inkweaver-linux-x64-1.3.8.AppImage, inkweaver-linux-x64-1.3.8.deb, inkweaver-linux-x64-1.3.8.rpm and SHA-256 sidecars. Linux qualification covers Ubuntu 22.04, Debian 13 and Fedora 44 with a glibc 2.35 baseline and --appimage-extract-and-run checks. Linux packages are unsigned.

## 1.3.7 — 2026-09-30

- 修复 Linux deb/rpm 安装后的 Chromium sandbox 辅助程序权限，支持普通用户正常打开桌面窗口。
- 修复 AppImage 解压启动时错误使用 SUID sandbox 辅助程序的问题；AppImage 使用系统用户命名空间 sandbox，系统需允许普通用户创建用户命名空间。
- Linux 资格验证新增实际窗口、预加载 API、React 页面启动检查，覆盖 Ubuntu 22.04、Debian 13、Fedora 44；原生 SQLite 与 LanceDB 操作仍纳入验证。AppImage 每次都验证 --appimage-extract-and-run，并单独记录 FUSE 启动结果。
- 继续提供 inkweaver-linux-x64-1.3.7.AppImage、inkweaver-linux-x64-1.3.7.deb、inkweaver-linux-x64-1.3.7.rpm 及 SHA-256 文件。glibc 2.35 构建基线、Linux 未签名与 macOS 未签名/未公证的披露保持有效。

## What's changed

- Fixed Chromium sandbox helper ownership and permissions after deb/rpm installation so ordinary users can open the desktop window.
- Fixed AppImage extraction choosing an unusable SUID sandbox helper. AppImage uses the system user namespace sandbox and requires unprivileged user namespaces to be enabled.
- Linux qualification now checks the actual window, preload API, and React page on Ubuntu 22.04, Debian 13, and Fedora 44, alongside real SQLite and LanceDB operations. Every AppImage qualification checks --appimage-extract-and-run and records the FUSE result separately.
- Includes inkweaver-linux-x64-1.3.7.AppImage, inkweaver-linux-x64-1.3.7.deb, inkweaver-linux-x64-1.3.7.rpm and SHA-256 sidecars. The glibc 2.35 baseline and unsigned Linux / unsigned, unnotarized macOS disclosures remain applicable.

## 1.3.6 — 2026-09-30

- 修复 AI 一键替换角色名在模型回显空白或引号变体时误报“未知或重复的原名”。每个批次现在用稳定角色编号绑定改名；仅当原名变体唯一时才接受旧式名称回显，歧义映射仍会被拒绝。
- Linux x64 桌面版新增 AppImage、deb、rpm 三种安装包及各自的 SHA-256 文件，和 Windows、macOS 一起从同一 Release 获取；推广前必须通过 Linux 运行资格验证。
- Linux 下载文件名为 inkweaver-linux-x64-1.3.6.AppImage、inkweaver-linux-x64-1.3.6.deb 和 inkweaver-linux-x64-1.3.6.rpm；每个文件都有对应的 .sha256 校验文件。
- Linux 资格覆盖 Ubuntu 22.04 上的 deb 和 AppImage、Debian 13 上的 deb 和 AppImage、Fedora 44 上的 rpm 和 AppImage。构建基线使用 glibc 2.35；资格验证约束打包文件所需的最高 glibc 符号不高于此版本。
- AppImage 可在 FUSE 可用时直接启动；无 FUSE 时支持 --appimage-extract-and-run。Linux 安装包未签名，发布包附 SHA-256 校验文件。

## What's changed

- Fixed AI character renaming when a model echoes an original name with incidental whitespace or quote variations. Each request batch now assigns stable slot IDs and binds each proposed new name to its exact source character. Legacy name-only responses are accepted only when the source-name variant is unambiguous.
- Added Linux x64 AppImage, deb, and rpm packages with a separate SHA-256 sidecar for each; they ship in the same Release as Windows and macOS, and Linux runtime qualification is required before promotion.
- The exact Linux package filenames are inkweaver-linux-x64-1.3.6.AppImage, inkweaver-linux-x64-1.3.6.deb, and inkweaver-linux-x64-1.3.6.rpm; each has a matching .sha256 sidecar.
- Linux qualification covers deb and AppImage on Ubuntu 22.04, deb and AppImage on Debian 13, and rpm and AppImage on Fedora 44. The build baseline uses glibc 2.35 and qualification rejects packaged binaries requiring a newer glibc symbol.
- The AppImage runs directly when FUSE is available and supports --appimage-extract-and-run otherwise. Linux packages are unsigned and include SHA-256 checksum files.

## 1.3.5 — 2026-09-29

- 章节草稿预算现分别统计全局指导（包括小说配置中的副本和自定义模板中的重复位置）、项目专属提示和已确认规划资料；超长规划资料按整项保留或移除，作者指导和本章证据始终完整。提示词预检报告中的输出 Token 预留数与实际受上下文窗口限制的请求一致；多段指导中的换行整理不会再阻止生成。
- 默认草稿导出会合并当前打开的最新草稿缓冲区；写出前会重新核对最新版本、草稿正文和定稿指纹，若编辑器快照与数据库草稿在导出期间发生不同变化，或目标版本已定稿，则阻止导出，避免静默丢失修改或覆盖定稿事实。
- 同一时间仅允许一个导出任务写文件和 manifest；快速重复点击会被立即拦截。选定目录后若切换项目，已验证的导出会用冻结快照完成，避免留下不完整文件；完成或失败时会通知原项目名和结果。
- 完成全仓质量审计并修复提示词诊断与导出一致性问题；补充相关单元、浏览器及 renderer-surface E2E 覆盖。

## What's changed

- Draft-generation budgets now attribute global guidance (including novel-configuration copies and repeated custom-template positions), project prompts, and confirmed planning materials separately. Oversized planning materials are retained or removed as whole items while author guidance and current-chapter evidence remain protected. Valid multi-paragraph guidance is normalized consistently before budget attribution, and the preflight output-token reservation matches the request after context-window clamping.
- Draft-inclusive export now uses the current editor buffer for the selected latest draft. Before writing, it rechecks the latest version, exact draft bodies, and finalized-authority fingerprint. If the database version changed after that buffer was captured, or the target version became finalized, export stops rather than silently dropping edits or replacing finalized facts.
- Only one export may write files and a manifest at a time. Rapid duplicate clicks are blocked before opening a second destination picker. After directory selection, a validated export finishes from its frozen snapshot even if the user switches projects, preventing partial output; a completion or failure notification names the originating project.
- Completed a repository-wide quality audit and fixed prompt-budget diagnostics and export consistency, with added unit, browser, and renderer-surface E2E coverage.

## 1.3.4 — 2026-09-28

- AI 批量生成章节名现在可以先应用已生成并勾选的章节，再继续生成剩余章节；应用后更新蓝图快照，避免旧标题候选覆盖新结果。进度显示候选数、已应用数和剩余调用估计。
- AI 角色名预览允许个别角色保留原名，只要其他名字有变化且最终名称不冲突；空名和重复名仍会阻止应用。
- 导入推演遇到缺失或格式无效的角色备注时，会加上明确的待补充提示后继续合同校验；角色卡已达 8 张上限时，会把未闭合关系线索保存在对应备注中，不再发出必然超限的补卡请求。
- 全书方向调整会在确认按钮禁用时说明具体原因，可返回修改方案；大批次成本估计也会计入最多可能生成的候选修稿请求，并提示缩批重试可能增加调用。
- Embedding HTTP 402 会提示检查服务账号计费、余额或网关额度；向量请求按批写入脱敏运行日志，不记录正文、提示词、API Key 或 Base URL。知识库普通导入仍可在向量服务不可用时降级为全文检索。
- 角色名替换、章节名批处理、全书方向调整和导入恢复新增运行阶段日志，便于追踪请求、部分完成、应用与拒绝原因。

## What's changed

- AI batch chapter titles can now be applied as soon as selected candidates are ready, before every batch finishes. The updated blueprint snapshot is used for subsequent batches, and progress shows generated, applied, and remaining counts.
- Character rename previews allow an individual character to keep the original name while other characters are renamed, provided the final roster stays unique. Empty and duplicate names still block the apply action.
- Import inference fills missing or malformed character notes with an explicit follow-up reminder. At the eight-card limit, unresolved relationship clues are preserved in the source character's notes instead of requesting an impossible extra card.
- Story-direction confirmation explains why applying is blocked and offers a return-to-edit path. Large-run estimates include the upper bound for draft-candidate requests and warn that smaller-batch retries may add calls.
- HTTP 402 embedding failures now point to account billing, balance, or gateway quota checks. Embedding batches write privacy-safe runtime events without manuscript text, prompts, API keys, or Base URLs. Ordinary knowledge imports can still fall back to full-text search when vector service is unavailable.
- Added runtime events for character renaming, title batches, whole-book direction adjustment, and import recovery so requests, partial completion, application, and rejection reasons are traceable.

## 1.3.3 — 2026-09-28

- 全书方向调整支持作者明确提出的术语映射，例如“幽狼换成凤凰，黑虫系统换成智虫”。确认后会同步更新小说文本配置、角色卡、蓝图角色引用、规划文本和叙事线索；未定稿正文只创建可逐章审阅的候选修稿，定稿正文与章节事实备注保持不变。
- 修复模型把 `terminology` 作为对象、或回显蓝图 `characters` 列表时整批方向调整被字段合同拒绝的问题。确认术语映射后，会刷新当前配置、项目名、最近项目标签及已打开的架构页，避免旧值随后覆盖新值。
- 蓝图生成缺少 `suspenseHook` 且模型补全请求失败时，会依据本章已有事件生成提问式悬念钩子，不增添新的剧情事实，继续校验后再提交。
- 「AI 批量改章名」可从「章节蓝图」工具栏打开，为未定稿章节批量生成标题，预览、编辑并逐章选择应用；已定稿章节自动跳过。

## What's changed

- Story direction adjustment now accepts explicit terminology mappings such as “幽狼换成凤凰，黑虫系统换成智虫”. After confirmation, it updates textual project settings, character cards, blueprint cast references, planning prose, and narrative threads. Unfinished prose receives reviewable per-chapter candidate revisions; finalized prose and chapter fact notes remain unchanged.
- Fixed batch direction plans being rejected when a model returns a structured `terminology` mapping or echoes the unchanged/mapped blueprint `characters` list. Confirmed mappings now refresh the open settings, project name, recent-project label, and open architecture tabs so stale values cannot overwrite them later.
- If the model cannot complete a missing `suspenseHook`, blueprint generation can derive a question from that chapter's existing event facts without adding new plot events, then validates the full contract before saving.
- The “AI Batch Chapter Titles” dialog is available from the Chapter Blueprints toolbar. It generates titles for unfinished chapters in batches and lets authors review, edit, and select titles before applying; finalized chapters are skipped.

## 1.3.2 — 2026-09-27

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.3.2>

- 蓝图生成遇到已完成的 JSON 少了 `suspenseHook` 时，会追加一次只补缺失钩子的结构化请求，并保留原蓝图其余字段；补全仍须通过章节合同校验。
- 角色名替换现在还会同步小说名、流派、受众、故事模型、叙事视角等文本型配置字段。语言、创作策略、数字设置和已定稿事实备注不会被改写。
- 「章节蓝图」新增「AI 批量改章名」。AI 按现有章节信息分批生成标题；作者可预览、编辑、逐章勾选后应用，已定稿章节自动跳过，提交时检查蓝图快照避免覆盖并发修改。

## What's changed

- Blueprint generation now makes one bounded, field-only follow-up request when a completed JSON response omits `suspenseHook`. It patches only that field and validates the complete chapter contract before saving.
- Bulk character renaming now updates the project name and text-based novel settings such as genre, target audience, plot model, and narrative point of view. Language, creative strategy, numeric settings, and finalized fact notes remain untouched.
- Added AI batch chapter-title generation to the Chapter Blueprints toolbar. Authors can preview, edit, select, and apply suggestions; finalized chapters are skipped and snapshot checks reject stale updates.

## 1.3.1 — 2026-09-27

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.3.1>

- 修复项目没有填写总章数时，方向调整表单默认范围超过 0 章而禁用生成的问题。现在只有总章数是有效值时才限制范围末章；没有章节蓝图时仍可生成设定、角色卡和后续叙事线索调整。
- 审稿历史来源限定为当前草稿和目标章之前本项目已定稿的连续性事实与角色状态；不再搜索知识库，防止把拆书导入的未来章节当成本书事实。审计提示词也明确该来源边界。
- 中文 AI 字段标签（例如“第二人格定位”）会映射到支持的项目字段并保留在预览摘要，不再使完整方向方案失败。

## 1.3.1 — 2026-09-27

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.3.1>

- 方向调整响应中的“第二人格定位”等中文标签会映射到相应的主角设定/全局指导字段，并在预览摘要中说明兼容映射，不再因合同外标签拒绝整个方案。
- AI 审稿不再执行知识库向量搜索。审计输入现在以当前待审正文、目标章之前本项目的已定稿连续性摘要和事实、当前项目设定为准；拆书导入的参考原文和目标章之后的内容不会作为剧情证据。
- 审稿中的角色状态只采用目标章之前记录的状态，避免后续章节的状态污染早期章节审计。

## 1.3.0 — 2026-09-27

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.3.0>

- 侧边栏新增「AI 全书方向调整」。输入新想法与章节范围后，AI 分批提出项目配置、故事架构、已有角色卡、叙事线索与未定稿蓝图的字段差异；作者预览后确认，主进程以内容指纹和角色名单 revision 校验并在一个事务中提交规划。
- 受影响的未定稿正文可逐章生成候选修稿，不直接覆盖原稿。候选任务与进度保存在项目内，关闭或重开窗口后可继续；已定稿正文和事实保持不可变。大量章节分析会提前提示模型调用成本。
- 角色批量改名除角色卡、关系和蓝图人物名单外，还会在同一个角色名单事务中同步替换故事前提、世界观、情节大纲、相关配置文本、蓝图剧情字段与尚在规划中的叙事线索；最长名字优先且单次替换，保护其他更长角色名不被误替。已定稿事实笔记保持不变。
- 修复目录生成把高输出能力模型的 384,000 Token 单次上限一次性记入整轮预算，导致首个请求正常完成后无法继续拆批或修复的问题。目录生成现在遵守每批输出配额。

## 1.2.18 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.18>

- 修复第一个定稿后处理模型请求预留模型的完整单次输出上限，耗尽共享请求 Token 预算，导致“章节交接候选”和“角色状态更新”在发出请求前失败。后处理现在为各步骤使用有界输出配额；其他长篇生成任务仍保留原有模型能力策略。
- 已定稿章节可通过失败步骤重试路径继续后处理，已成功的知识库导入和剧情要点不会被重新覆盖。
- 角色批量改名界面会提示带引号与不带引号的疑似重复角色卡；不会自动合并作者的角色数据。

## 1.2.17 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.17>

- 角色批量改名遇到批内或跨批次重复新名时，不再直接终止整轮生成；冲突批次会收到已占用名字清单并重试，持续冲突时拆成更小批次，先前已验证的映射保持不变。
- 预览页手动编辑后若出现两个角色共用同一新名，会提示冲突并阻止应用；应用前再次校验，防止冲突写入角色卡。

## 1.2.16 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.16>

- 修复修稿合并先改写正文、后校验旧正文指纹造成的误拒绝；现在校验、写入及标记合并同在数据库事务中完成，真正过期的修稿不会覆盖作者已改过的正文。
- 对已写入合并正文但修稿仍标记待处理的旧状态，允许在正文与本次合并结果完全一致时完成状态修复。
- 拆书仿写批量改名不再只处理前 40 名角色；按小批次覆盖完整名单，输出长度截断时缩小批次重试，映射缺失或重名时停止在预览前。
- 非流式模型失败日志新增结束原因、输出长度及耗时，不记录角色名、提示词或模型正文。

## 1.2.15 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.15>

- 修复章节创作弹窗在一致性预检线索较多时超过屏幕高度，导致“仅本次忽略并继续”等底部选项无法看到或点击的问题；现在弹窗保持在视口内，内容可滚动到底部。
- 同步修复其他使用公共弹窗的长内容窗口；“清除项目生成内容”的选项列表在小视口中也可以独立滚动。

## 1.2.14 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.14>

- 全书目录生成和导入章节蓝图现在都会忽略端点不在本章角色清单中的可选关系提示；有效关系和其他蓝图内容仍按原合同严格校验，日志只记录忽略数量，不记录角色名或正文。
- DeepSeek V4.1 Flash 结构化工作流启用 JSON Output；当前模型目录、已存模型别名和 `low/high/max` 推理映射已更新。

## 1.2.13 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.13>

- DeepSeek V4.1 Flash 使用 JSON Output 进行结构化工作流；已保存的 `deepseek-v4.1-flash` 与 V4 Flash 兼容别名会识别为当前 Flash 能力，不再因能力未知而省略 JSON 模式。
- DeepSeek 当前模型目录使用 `deepseek-flash` 与 `deepseek-v4-pro`；V4.1 的推理强度映射支持 `low`、`high`、`max`，并把产品的 `medium` 映射为官方 `high`。
- 不再把已停用或目录外的旧型号仅凭名称前缀判为已验证可用；兼容端点会通过实际模型发现或探测确认。

## 1.2.12 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.12>

- 导入蓝图时，若某条关系引用了不在同一章节角色名单里的端点，会安全忽略该关系提示并继续校验、提交其余蓝图内容，不再因此中断整批导入。
- 运行日志只记录忽略的关系数量，不记录角色名或小说正文；有效关系、章节角色和其他蓝图字段保持原样。

## 1.2.11 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.11>

- 修复 Gemini 兼容网关把 Google 内容政策拦截说明作为普通 `STOP` 文本返回时，InkWeaver 将其误报成通用 `error` 的问题；现在会识别为 `content_filter`，工作流给出内容政策失败提示。
- 流式响应已明确包含该拦截说明时，不再发起重复的非流式恢复请求；拦截说明不会作为生成结果交给结构化合同解析。

## 1.2.10 — 2026-09-26

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.10>

- Gemini 结构化回退即使报告 `STOP`，若响应不是 JSON 对象，也会按提供方响应错误处理，不再把固定错误文本送入蓝图合同解析或对它反复拆批。
- 运行诊断会记录回退内容是否为 JSON 对象，不保存响应正文；完整合同校验和章节覆盖校验保持不变。

## 1.2.9 — 2026-09-25

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.9>

- Gemini 结构化 JSON 流在结束原因缺失或无法识别、且候选没有 usage 时，会在同一模型执行租约内尝试一次可取消的非流式请求恢复。
- 非流式回退返回明确 `STOP` 时，结果仍须通过蓝图完整合同；若回退也无结束标记，只有完整覆盖且通过合同的 JSON 可接受，非 JSON 文本或错误信封会明确失败并停止对同一错误响应反复拆批。
- 将 Gemini 非流式 `promptFeedback.blockReason` 规范化为安全失败原因；运行日志标明是否使用回退及其安全结束元数据，不记录提示词或响应正文。
- 角色关系图在大型角色表上使用 Barnes–Hut 斥力近似，减少布局动画每帧的节点对计算并保持远距离排斥效果。

## 1.2.8 — 2026-09-25

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.8>

- Gemini 兼容网关返回小写或 `finish_reason` 字段时仍能识别结束原因；上游明确报告安全拦截时，工作流现在显示安全失败原因。
- Gemini 流缺少完成标记时，只有完整覆盖本批章节且通过字段合同校验的结构化结果才可提交；未验证的输出仍会失败关闭。
- 增加 Gemini 异常流的安全诊断：记录原始结束码、候选/帧数量、usage 是否存在和提示拦截码，不保存模型响应正文。
- 修复“仅元数据”运行日志记录 IPC 参数时可能保存小说正文的问题；正文、提示词、文本、响应等字段会在写入日志前脱敏。

## 1.2.7 — 2026-09-25

- Gemini 蓝图流缺少完成标记时，单章重试一次；多章批次拆成较小批次恢复，避免对同一不完整流反复重放完全相同的请求。
- 拆分结果仍须覆盖本批全部章节并通过完整字段校验后才会一次提交；无法确认完成的子批次继续失败关闭。
- 运行日志会说明是重试单章还是拆分多章批次。

## 1.2.6 — 2026-09-25

- Gemini 协议的结构化生成在能力标记未知时请求原生 JSON MIME 输出；明确标记不支持时尊重该能力结果。
- 蓝图仍保持严格解析与字段校验，模型流缺少完成标记时只在当前批次有限重试，未验证内容不会落库。

## 1.2.5 — 2026-09-25

- Gemini 流结束但缺少明确完成标记时，对当前章节蓝图批次在同一生成会话中重试一次；第二次仍无完成标记则失败关闭，不保存未确认结果。
- 面板日志会说明正在重试的章节范围。

## 1.2.4 — 2026-09-25

- 修复章节蓝图 JSON 语法修复请求把整段章节提示重复装入“修复合同”、触发 UTF-8 预算不足的问题。现在合同只携带字段规则和本批章节编号，修复仍只允许改 JSON 语法。
- 延续 Gemini 多 part 修复：跳过 `thought` 摘要，并拼接正式答案文本 part。
- 蓝图首轮 system 消息附带完整合同；内置提示移除 Qwen 专用说明，并将缩批重试原因显示给用户。

## 1.2.3 — 2026-09-25

- 修复 Gemini 多 part 响应读取：跳过标记为 `thought` 的思考摘要，并拼接所有正式文本 part，防止把思考文字误当章节蓝图 JSON。
- 导入章节蓝图的首轮请求即在 system 消息中加入完整 JSON 合同；移除与当前 Gemini 模型不符的内置 Qwen 专用角色说明。
- 蓝图结果未通过校验而自动缩小批次时，显示重试范围与安全诊断码；初始调用次数不再误称“至多”次数。
- 保持严格合同校验：模型仍未返回合规 JSON 时，任务明确失败，不写入不完整蓝图。
- Windows 发布验证中的卸载器进程检查使用隔离的测试用户名，避免用户正在运行 InkWeaver 时产生假失败。

## 1.2.2 — 2026-09-24

- 日志面板改为读取最近 500 条磁盘事件，避免日志增多后一直停留在最早的记录。
- 增加“打开日志目录”按钮，并在面板中说明当前视图的数量限制；完整日志仍保存在本地 JSONL 文件并可导出完整日志包。
- 日志分页查询使用事件 ID 集合去重，改善大量日志时的读取开销。

## 1.2.1 — 2026-09-24

- 修复导入小说生成章节蓝图时旧提示模板与现行 JSON 封装合同冲突的问题。
- 单章模型返回非 JSON 文本时，在同一生成预算内按完整合同重试一次；仍不符合合同则保留失败状态，不写入不完整蓝图。

## 1.2.0 — 2026-09-13（已发布）

### 全局日志与可诊断性

- 主进程最早安装全局 console capture，统一记录 `log/info/warn/error/debug`，并监听未捕获异常、未处理 Promise 拒绝和 Node warning；Renderer 在 React 挂载前接入同样的五级桥接与关闭前 flush。
- IPC handle 自动记录调用开始、完成/失败、耗时、请求 ID、关联 ID 和安全参数摘要；LLM 流式请求只记录字符数、finish reason、usage/cache 元数据，不逐 chunk 保存正文。
- MCP 子进程记录 stdout/stderr 的 stream、字节数、行数、受限 stderr preview、PID、exit/close/error；JSON-RPC 响应内容不复制到默认日志。
- 日志事件写入 append-only `app-YYYY-MM-DD.NNN.jsonl`，每段附 bytes、eventCount、first/last sequence 和 SHA-256 manifest；主磁盘失败进入 emergency spool，IPC 失败保留待重试队列，并显示 pending/emergency-spool/degraded 状态。
- 重启会扫描历史事件 ID，避免 spool 回放或重复上报产生物理重复；即使主段和 spool 同时不可用，查询页也会显示尚在内存中的 pending 事件并明确 `complete=false`。
- 新增完整日志 bundle 导出：主进程负责目录选择和唯一子目录，导出所有段、manifest、spool 和 `bundle-manifest.json`；保留轻量“当前筛选视图”文本导出。默认 message 限长、路径/URL 凭据/Token 脱敏，redaction 字段保留审计线索。
- `pnpm run check:runtime-log-coverage` 扫描 `src`、`electron`、`scripts` 运行边界；只有机器可读 smoke/qualification 协议允许带理由的 allowlist，未解释缺口必须为零。

### 持续发展的长篇创作体验

- Writing Skill 支持独立安装、卸载、重新加载和 `planning/drafting/review/polish` 阶段筛选；非法 frontmatter、路径穿越、符号链接和超大文件被拒绝。
- 故事线视图显示主线/支线、规划进度、下一目标和事件数；事件证据绑定定稿草稿 ID 与内容 hash，点击跳转前重新校验项目会话。
- 大纲、世界观、人物表、时间线和风格说明可以导入项目；资料先是带 hash 的候选，作者确认后才进入蓝图和写作上下文，重复和拒绝均可回读。
- 角色表只接收蓝图明确角色或作者确认候选；模型在定稿后发现的新角色留在候选队列。角色状态追加作者、模型或旧项目未知来源，以及对应定稿、hash 和证据。
- 中文长篇链统一冻结项目会话、写作语言、界面语言、模型 lease 和来源指纹，贯通蓝图、候选草稿、审稿、修订与定稿；候选稿不会伪装为 finalized history。
- 写前材料分为作者任务、未来计划、定稿历史、未定稿候选和相邻正文片段；预算/来源不足生成覆盖缺口，作者硬性要求不会静默消失。
- 审稿逐项标记蓝图关键事件的 completed、prepared、deferred、not-found 或 needs-verification；证据不足只待核实，模型不能自动触发修稿，修订目标必须由作者明确选择。

### 并发、恢复、导出和更新回归

- 多标签保存增加 tab instance 和关闭 token；旧保存回调不再写入关闭后重开的同名页面。
- 蓝图、草稿、审稿、修订和恢复路径增加 project session、request/run identity、CAS 和正文 hash；旧响应/过期来源不能覆盖新事实。
- 拆分 Markdown 使用唯一临时目录；导出只枚举 finalized authority 并逐文件回读 hash；完成通知保留完整标题；Windows helper 正常退出不再升级为产品失败。
- 蓝图范围按 contiguous range 分批，恢复从未完成范围继续并保留已有蓝图；多项规划输出损坏时在原 GenerationSession 预算内缩小批次重试；审稿输出只允许一次同预算重建，第二次失败不写入有效报告。
- UpdateService 对 Windows x64、macOS arm64/x64 共享单飞队列和版本单调性；下载期间旧检查不能清掉已确认/已下载版本，应用内可查看并启动安装。

### DSH 插件与分发

- DSH 插件版本同步为 `@shuishuipingan/inkweaver-dsh@1.2.0`，目录、Host、preset 和 RPC 继续使用 `inkweaver` 命名；兼容当前官方默认渠道 `@deepseek-ai/dsh@0.1.5-rc.1`。
- 插件仍通过 GitHub Release tarball 和本地 `dsh plugin add` 交付，不执行 npm publish；外部 `@linxin666/dsh-web-all` 仅为宿主 companion，历史 `@ethanyoq/dsh-ai-novel-writer` 不再是安装目标。
- 1.2.0 Release 已包含 Windows/macOS 三架构安装包、更新元数据和插件 tarball，并在 GitHub `dsh-plugin` topic 回读可发现；签名/公证状态已在 Release 说明中如实披露。

## 1.1.0 — 2026-09-12

正式 Release：<https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.1.0>  
冻结源码：`b40cd124525fd7805cdf1c35f07eeee187d394eb`  
DSH 宿主：`@deepseek-ai/dsh@0.1.5-rc.1`  
插件：`@shuishuipingan/inkweaver-dsh@1.1.0`，tarball SHA-256 `35dd442171a426bcbea214b595f52ca7edcd20531567e3bdbc3b11e7bceb6dba`

### 持续发展的小说体验

- 新增连续阅读器：以定稿权威序列组织章节，显示章节边界，支持全文搜索、阅读位置保存、前后章导航和返回编辑器。
- 新增章节连续性工作单：记录场景进入状态、目标、阻碍、选择、后果、离开状态、卷级主线/支线贡献、人物情绪余波、读者期待和多视角落点。
- 写前摘要会提醒上一章记录了情绪“后续状态”但本章尚未补记的人物，避免重大事件的情绪余波被无声丢弃；刻意跳切仍可保留。
- 连续性工作单写前摘要会显示相关叙事线的沉寂/逾期提醒，让作者在动笔前看到该回收或推进的伏笔。
- 写前摘要会跨章汇总前几章的视角落点、读者已知信息和未解钩子，避免视角线和读者信息在续写时被遗忘。
- 写前摘要会列出前章记录中“本章到期或已逾期”的读者期待，作者可主动推进或写明延后理由。
- 连续性工作单可以从已定稿正文按段落边界提出带原文证据的场景候选；候选只保持 `candidate` 状态，目标、选择和后果不会由规则擅自编造，作者补充并保存后才成为工作单内容。
- 章节交接现在绑定定稿草稿 ID 与正文 SHA-256；候选可展示场景、视角、未完成动作、即时目标、情绪、待回应问题和原文证据。新定稿会使旧来源交接过期，作者确认后才进入下一章写作上下文。
- 写后审查加入相邻章节证据检查：可定位前章结尾与本章开头，分类场景跳跃、情绪归零、未完成动作、视角切换和重复背景，并允许作者保留刻意转场或复沓。
- 三栏修稿合并视图支持锁定段落：锁定内容不会被批量采用修稿覆盖，解锁后仍可继续编辑或采用对应变更。
- 连读质量提示会发现重复开头/结尾/天气开场；“保留刻意复沓”只关闭该阅读提示，不修改正文。
- AI 文风分析每次写入新档案前会记录旧值、新值和样本指纹到项目内版本历史；小说配置页可展开查看最近几次风格档案变化。
- 文风版本历史支持一键把某个历史版本应用到当前写作风格，方便在实验性文风之间回退。
- 点击“应用到当前”后会自动保存项目，回退的文风不会在关闭界面后丢失。

### 人物与关系事实

- 全文人物提取采用 source-bound 分块计划，保留跨块证据、别名、字段差异和来源章节；候选在作者确认前不改变 roster。
- 人物候选支持字段级勾选、证据预览、接受/拒绝、稳定 roster revision 和应用后的状态回读。
- 应用人物候选后会提示本次各角色实际改动的字段与关系增删数量，作者可以核对自己确认过的变更范围。
- 角色身份通过 `characterId` 跨改名保持，旧名进入 aliases；同名候选现在标记为 `ambiguous`，不会自动写入任一同名角色。
- 角色改名事务现在会同步重写其他角色卡中结构化关系 JSON 的目标旧名，普通“目标：关系”行首也会更新；自由备注和正文不会被自动改写。
- 关系图支持姓名/别名搜索、关系类型过滤、一跳/二跳聚焦、键盘列表替代、项目级布局固定与重置、有向关系、来源章节和证据提示。
- 同一对角色只绘制一条线，但同标签的不同章节/证据记录会保留在详情中，用于观察关系演变历史。

### 历史、一致性与安全恢复

- 定稿连续性事实支持 `validFromChapter` / `validUntilChapter`，写稿上下文不会把已过期事实带入当前章节。
- 知情事件区分事实、信念、传闻和误信，记录获知方式、来源章节、有效范围、证据和确认状态；只有确认且当前有效的事件进入写作上下文。
- AI 输出面板显示分层上下文纳入/省略收据；provider 没有返回 usage 时显示“未知”，不伪造为 0。
- 分层上下文收据现在按来源层分组（固定规则、剧情弧、角色状态、历史事实、叙事线、交接、知识检索），作者能直接看到每层纳入/省略了多少项及原因。
- 章节生成收据会额外登记固定规则、角色状态、活跃叙事线、知识库检索、章节交接和确认知情范围等来源层，但不会把正文写进收据。
- 任务面板显示不含正文的恢复收据，区分当前项目 lease 与过期 lease，并允许安全清理；统计面板在没有核验价格快照时明确显示“仅 token 用量”，不伪造费用。
- 恢复收据现在对导入、批量章节、单章写稿、人物提取、审稿、审稿驱动修稿、只读修稿、定稿、定稿后处理修复、架构生成、配置生成和章节蓝图生成提供工作流专属继续入口；恢复前会重新读取权威 SQLite/草稿来源或安全启动参数并校验当前项目 lease，收据不保存正文或模型输出。
- 新增跨工作流 usage 汇总数据层：按模型聚合尝试次数与 token 用量；任一次用量缺失的桶显示为空而不是 0。
- 项目快照使用 SQLite backup API，复制提示词和 manuscript 附件，生成逐文件哈希 manifest，支持完整性核验、恢复预览和恢复到源项目外的空目录。
- 恢复最新快照前会先执行逐文件哈希核验；发现缺失或篡改文件时会停止恢复并显示具体校验失败，不会进入目标目录写入。
- 快照按数量和总字节数自动清理旧目录；清理目标限定在 `.vela/snapshots` 内，不覆盖当前项目。
- 导出以 finalized authority 枚举章节，即使没有蓝图也能导出；拒绝缺章、重复、越界、空正文、标题漂移和字数不一致。
- 每次导出额外生成不含正文的 `.manifest.json` 清单，记录权威指纹、章节标题、字数、输出路径和内容哈希，方便作者或发布脚本回读核对。
- 导出后会在受限目录授权内读回主文件、分章文件和清单并逐字节比对，内容不一致时导出失败而不是伪装成功。
- 连续性工作单新增跨章事实时间线，只显示在当前章节仍有效的定稿事实和原文证据，不会直接修改事实源。
- 跨章事实时间线按来源章节折叠分组，作者可以先定位某一章的状态变化，再展开查看每条原文证据。
- 连续性工作单新增写前准备摘要：在动笔前汇总章节蓝图、上一章确认交接、相关活跃叙事线、世界规则、全局指导、文风约束、知情边界和缺失资料。
- 连续性工作单新增卷级推进摘要，聚合已保存章节的主线、支线、人物弧、转折、活跃读者期待、场景观察度和待回应问题，让作者能看到故事是否持续向前发展。
- 卷级数据新增跨卷趋势推导：新出现的主线/支线、上一卷延续的主线会作为纯数据输出，供后续跨卷图表复用。
- 局部修稿、审稿、人物候选和历史影响均保留来源正文指纹，正文变化后拒绝旧结果覆盖。
- 确定性一致性预检会区分“确定冲突”和“信息不足”：蓝图安排某角色出场但没有任何已定稿状态事实时，会提示补充状态或标记首次出场，而不是断言作者写错。

### DSH 插件

- 插件依赖已更新并固定到官方 npm 默认渠道的 `@deepseek-ai/dsh@0.1.5-rc.1` 兼容矩阵；同步迁移 persona 前缀、SystemPrompt 配置和 Session 事件边界，不使用浮动 `next` 或未经核验的 GitHub `main`。
- DSH V2 NovelStore 从 schema 4 迁移到 schema 5，章节 Proposal 可携带来源绑定交接与稳定 ID 知情事件。
- `chapter/context` 只返回当前章节有效且 `confirmed` 的知识；candidate 事件保留在 Proposal 收件箱，不会泄漏给模型。
- DSH Client 工作台显示章节交接、上一章定稿和已确认知情范围；客户端在 loopback 边界校验无路径的严格 DTO。
- 插件已通过 typecheck、build、emitted package verification、40 文件/433 passed/6 skipped 回归，以及官方 DSH 0.1.5-rc.1 的完整隔离 tarball/profile/Chrome qualification；receipt 同时记录真实 roster/mount、提案同页应用、重启读回、重装读回和布局 QA。
- DSH 0.1.5 的官方 `/api` interceptor 是宿主 singleton；InkWeaver 使用 shared `/api` 下的 exact Fetch routes（`/api/inkweaver/...`），不抢占宿主 gateway，也保留客户端现有 namespaced method envelope。
- DSH Web qualification 已更新为兼容 DSH 0.1.5 的外部 `@linxin666/dsh-web-all@0.3.20`；旧 `dsh-web-ui-all@0.1.16` 会因 `dsh-settings` API 不匹配阻止 Web 启动，不再作为发布依赖。
- 插件已从旧目录/包名迁移到 `plugins/inkweaver-dsh` 与 `@shuishuipingan/inkweaver-dsh`，Host/preset 统一使用 `inkweaver`；旧 `@ethanyoq/dsh-ai-novel-writer` 仅保留在迁移说明中，不是新安装目标。`@linxin666/dsh-web-all` 仍是外部宿主 companion，不属于本仓库交付物。

### 文档与开发交接

- 新增完整功能图、需求追踪表、开发基线、GitHub/分发核验收据和逐目录项目文件指南。
- 中英文主页现在链接正式 v1.1.0 Release，说明 Windows/macOS 安装包、插件 tarball、未签名/未公证限制和不发布 npm 的范围。

### 发布范围与已知限制

- npm 不属于本次发布范围；插件使用 GitHub Release tarball 和本地 `dsh plugin add` 安装。
- Windows 安装器未代码签名；macOS DMG 未使用 Developer ID 签名且未公证，系统可能显示安全提示。
- 外部真实模型文学质量评阅已按发布负责人决议豁免；工程回归、固定 fixture、browser、provider dry-run 和 DSH qualification 收据不等同于文学质量保证。
- `@linxin666/dsh-web-all@0.3.20` 是外部宿主 companion，`@ethanyoq/dsh-ai-novel-writer` 是历史包名，二者都不是 InkWeaver 1.1.0 发布包。

## 0.9.2

现行稳定桌面版本。详细历史请以 Git tag、Release 资产和远端源码为准。
