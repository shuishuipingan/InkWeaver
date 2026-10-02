# 更新日志

本文件按用户可见行为记录变更。桌面版本不发布 npm；DSH 插件沿用已发布的 `1.2.0` 包。`1.2.0` 已从同一源码 commit 完成工程验收、三平台资产回读和正式 Release；`1.1.0` 的历史 Release 收据保留在 `docs/upgrade/`，不与 1.2.0 混用。

## 1.3.12 — 2026-10-02

- 修复 AI 一键替换角色名的应用死锁：应用成功后界面不再回到预览把已替换的名字重新当待改名做重名校验；批量改名一次写入整份名单，互换与链式改名都能生效。名单已改而落盘失败时保留草稿，可再次点击“应用改名”补上；落盘后仅同步失败时停在完成态并说明原因。整体改名的覆盖面补齐蓝图备注。
- AI 全书方向调整升级为真正的档案级调整：人物档案的外貌、背景、性别、年龄、定位、能力、动机、弧光、备注都可由 AI 改写，人物关系可整份替换（目标限现有角色）；未定稿章节蓝图的出场人物名单也可由 AI 调整（不得发明新角色）。预览按字段对照展示，所有写入仍受指纹、定稿章保护与角色名单校验约束。
- 草稿生成上下文的摘录摘要不再只保留约束句和含角色名的句子：在相关句之外按全文位置均匀取样，保住世界观、场景与氛围描写，避免草稿变干巴；自动续写现在携带本章要点时间线、活跃线索、知情范围与上一章交接，已写结尾窗口从 1600 字加宽到 2400 字，续写场景更连贯。
- 保持 Windows、macOS、Linux x64 同提交发布。Linux 文件为 inkweaver-linux-x64-1.3.12.AppImage、inkweaver-linux-x64-1.3.12.deb、inkweaver-linux-x64-1.3.12.rpm 及 SHA-256；运行资格覆盖 Ubuntu 22.04、Debian 13、Fedora 44，glibc 2.35 基线及 --appimage-extract-and-run 检查继续有效，包未签名。

## What's changed

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
