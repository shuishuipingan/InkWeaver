# A04–A08 内部工程验收收据

执行日期：2026-09-12（Asia/Hong_Kong）  
结论：通过（内部工程验收）；外部双评阅者/真实 provider 质量评测按发布范围决议豁免。

## 验证命令

```text
node node_modules/vitest/vitest.mjs run \
  src/shared/__tests__/story-continuity.test.ts \
  src/shared/__tests__/story-continuity-aggregation.test.ts \
  src/shared/__tests__/narrative-quality.test.ts \
  src/shared/__tests__/adjacent-continuity.test.ts \
  src/services/__tests__/chapter-handoff-context.test.ts --maxWorkers=1

node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/StoryContinuityPanel.browser.tsx \
  src/components/editor/__tests__/ContinuousReader.browser.tsx \
  src/components/editor/__tests__/WritingStyleHistoryPanel.browser.tsx --maxWorkers=1
```

结果：领域/服务 5 files、12 tests passed；browser 3 files、18 tests passed。

## 覆盖范围

- A04：计划/候选/确认/正文实际场景分离；候选只保留原文证据；确认/观察场景缺少 consequence 或 exitState 时给出非阻塞缺口；
- A05：卷级工作单聚合主线、支线、人物弧、转折、代价、未解问题，并区分新主线/延续主线/新支线；browser 视图可访问；
- A06：情绪前置状态、触发、选择、代价、后续状态和证据分离；写前提示余波遗漏；人物成长账本按章节显示；
- A07：读者期待期限/延后理由、视角落点和读者知识账本与角色知情边界分离；J02 browser 证据阻止跨视角秘密泄漏；
- A08：连续阅读 finalized authority、章节边界、导航、证据块、重复开头/结尾提示和文风历史应用均有测试覆盖。

## 范围说明

本收据证明数据模型、持久化、过滤、UI 和恢复边界。它不声称模型生成的自然语言质量、真实长篇召回率或误报率已经通过；这些按发布范围决议豁免。
