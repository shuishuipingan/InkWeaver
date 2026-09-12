# B01–B05 内部工程验收收据

执行日期：2026-09-12（Asia/Hong_Kong）  
结论：通过（内部工程验收）；外部双评阅者/真实 provider 质量评测按发布范围决议豁免。

## 验证结果

```text
node node_modules/vitest/vitest.mjs run \
  src/shared/__tests__/context-receipt.test.ts \
  src/shared/__tests__/finalized-continuity.test.ts \
  src/shared/__tests__/knowledge-event.test.ts \
  src/shared/__tests__/consistency-preflight.test.ts \
  src/shared/__tests__/workflow-recovery.test.ts \
  electron/repositories/__tests__/knowledge-event-repository.test.ts \
  electron/repositories/__tests__/summary-repository.test.ts \
  src/services/workflows/__tests__/continuity-rebuild-workflow.test.ts --maxWorkers=1
```

结果：8 files、26 tests passed。

```text
node node_modules/vitest/vitest.mjs run \
  src/services/workflows/commands/__tests__/generate-draft.command.test.ts \
  -t "context|fact|budget|lease" --maxWorkers=1
```

结果：7 tests passed、30 skipped（筛选运行）。

```text
node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/StoryContinuityPanel.browser.tsx \
  src/components/editor/__tests__/ContinuityImpactPanel.browser.tsx \
  src/components/editor/__tests__/ReviewReport.confirmation.browser.tsx --maxWorkers=1
```

结果：3 files、23 tests passed。

## 覆盖范围

- B01：完整上下文条目选择、预算、省略原因和 privacy-safe receipt；早期相关事实在预算紧张时保留；
- B02：validFrom/validUntil 章节有效范围、历史查询 UI、倒叙/转场枚举和来源证据；
- B03：fact/belief/rumor/false-belief、candidate/confirmed 边界、当前角色过滤和读者知识账本分离；
- B04：角色地点、物品归属、故事日、秘密知情范围等确定性冲突分类为 conflict/suspected/insufficient，并保留证据与豁免；
- B05：历史改稿影响项选择、source-bound 连续性重建、去重章节排序、恢复 metadata、跨 lease 拒绝和作者原稿/计划保护。

## 范围说明

本收据证明确定性数据边界和 UI/恢复工程行为。模型语义审查精度、100 章真实召回率和 provider 质量按发布范围豁免，不在此收据中宣称通过。
