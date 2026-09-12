# C01–C03 内部工程验收收据

执行日期：2026-09-12（Asia/Hong_Kong）  
结论：通过（内部工程验收）；外部双评阅者/真实 provider 质量评测按发布范围决议豁免。

## 验证结果

```text
node node_modules/vitest/vitest.mjs run \
  src/shared/__tests__/character-extraction.test.ts \
  src/components/editor/__tests__/character-extraction-policy.test.ts \
  src/services/__tests__/character-extraction-merge.test.ts \
  src/services/workflows/__tests__/character-extraction-context.test.ts \
  src/services/workflows/__tests__/character-extraction-workflow.test.ts \
  src/services/workflows/__tests__/character-extraction-workflow-recovery.test.ts \
  electron/repositories/__tests__/character-extraction-candidate-repository.test.ts \
  electron/repositories/__tests__/character-roster-repository.test.ts --maxWorkers=1
```

结果：8 files、44 tests passed。

```text
node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/CharacterExtractionCandidatesPanel.browser.tsx \
  src/components/editor/__tests__/CharacterEditor.relationships.browser.tsx --maxWorkers=1
```

结果：2 files、9 tests passed。

## 覆盖范围

- C01：TXT/Markdown/EPUB/定稿来源的 source-bound 分块、首尾窗口、后半段证据、多章别名和冻结模型租约；
- C02：stable `characterId`、aliases、同名 ambiguity、明确目标选择、改名后蓝图/关系目标同步；
- C03：逐字段证据预览、字段级勾选、别名/关系合并、revision 冲突、候选确认前不改权威 roster、应用后状态闭环和改动摘要。

## 范围说明

收据证明提取/消歧/合并的数据与 UI 边界，不声称模型在真实长篇中的召回率或人物语义质量；这些按发布范围决议豁免。
