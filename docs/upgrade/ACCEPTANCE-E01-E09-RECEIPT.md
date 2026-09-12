# E01–E09 内部工程验收收据

执行日期：2026-09-12（Asia/Hong_Kong）  
结论：通过（内部工程验收）；外部双评阅者/真实 provider 质量评测按发布范围决议豁免。

## 验证结果

核心服务/仓储/脚本：10 files、54 tests passed。覆盖 narrative-thread repository/candidate、revision、snapshot、export、finalization snapshot、usage/dry-run、continuity impact。

恢复工作流：8 files、49 tests passed。覆盖 architecture、batch、chapter draft/review/refine/finalize/repair、character extraction、import 和 resource claims 的恢复/lease/幂等边界。

Browser 工作台：7 files、66 tests passed。覆盖伏笔编辑器、写前连续性摘要、审查确认、三栏局部修稿锁定、导入恢复、AI 输出失败状态、连续性影响选择和 StoryContinuityPanel。

## 覆盖范围

- E01：伏笔 planned/planted/progressing/resolved/abandoned、逐字证据、沉寂/逾期状态、延后理由和跨卷摘要；
- E02：写前准备汇总蓝图、交接、人物、规则、活跃叙事线、知情边界和缺失资料；
- E03：相邻衔接、确定性冲突、人物候选、重复提示、审查问题编辑/忽略/确认和修稿入口；
- E04：base content fingerprint、段落锁定、三栏合并和正文变化后拒绝旧 Proposal；
- E05：取消/暂停/失败/重启、safe checkpoint、workflow-specific resume factory、lease 拒绝和幂等资源声明；
- E06：模型 ID、预算、usage 缺失显示未知、跨 workflow 汇总和 provider dry-run 预算/lease/checksum；
- E07：SQLite backup、manifest/hash、附件复制、空目录隔离恢复预览和逐文件核验；
- E08：以 finalized authority 枚举无蓝图章节、顺序/标题/字数/内容 SHA manifest 和导出回读；
- E09：i18n coverage、browser 双语入口、键盘列表/审核/恢复控件和错误状态。

## 范围说明

收据证明产品工程行为、数据完整性和 UI 操作边界。模型语义审查、长篇兑现质量、跨硬件人工可访问性审计和真实 provider 成本/延迟按发布范围豁免；内部 dry-run 和 browser 证据不被描述为真实模型质量通过。
