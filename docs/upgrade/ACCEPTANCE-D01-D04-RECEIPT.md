# D01–D04 内部工程验收收据

执行日期：2026-09-12（Asia/Hong_Kong）  
结论：通过（内部工程验收）；外部双评阅者/真实 provider 质量评测按发布范围决议豁免。

## 验证结果

```text
node node_modules/vitest/vitest.mjs run \
  src/components/editor/__tests__/relationship-label-layout.test.ts \
  src/components/editor/__tests__/relationship-graph-model.test.ts \
  src/shared/__tests__/relationship-presentation.test.ts \
  src/shared/__tests__/character-rename-references.test.ts --maxWorkers=1
```

结果：4 files、19 tests passed。

```text
node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/RelationshipGraph.browser.tsx \
  src/components/editor/__tests__/RelationshipGraph.regression.browser.tsx \
  src/components/editor/__tests__/RelationshipGraph.label-hit.browser.tsx \
  src/components/editor/__tests__/RelationshipGraph.performance.browser.tsx \
  src/components/editor/__tests__/CharacterEditor.relationships.browser.tsx --maxWorkers=1
```

结果：5 files、37 tests passed。浏览器运行输出包含既有 React `act(...)` 警告，但没有测试失败。

## 覆盖范围

- D01：bounded local label layout、200 边密集样本、缩放/拖拽后 Canvas hit，标签基线到所属边线段距离不超过 25 content px；
- D02：202 节点图谱、姓名/别名/关系类型过滤、一跳/二跳聚焦、键盘/列表替代、5000 节点模型压力和性能基线；
- D03：有向关系、箭头、来源章节、证据、关系历史折叠面板和键盘证据入口；
- D04：项目级布局固定/重置/重开、截至章节历史过滤、未来关系隐藏、两章新增/消失关系摘要和关系事实不被布局操作改写。

## 范围说明

收据证明关系图工程交互、证据边界和性能基线。跨硬件人工复测、真实长期关系质量和外部模型评阅按发布范围豁免。
