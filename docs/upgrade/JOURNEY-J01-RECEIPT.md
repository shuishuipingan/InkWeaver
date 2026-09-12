# J01 端到端旅程收据（开发基线）

状态：通过（开发基线，组合验收）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：新建作品 → 设定/角色与蓝图 → 前两章定稿 → 连续阅读。  
源码实现 commit：`70adeb0`  

## 执行证据

```text
node node_modules/vitest/vitest.mjs run \
  electron/services/__tests__/project-access.test.ts \
  electron/repositories/__tests__/blueprint-repository.test.ts \
  src/services/__tests__/chapter-handoff-context.test.ts --maxWorkers=1

node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/ContinuousReader.browser.tsx --maxWorkers=1
```

结果：项目/蓝图/交接组合测试 3 files、37 tests passed；连续阅读器真实 Chromium 测试 1 test passed。

组合验收覆盖：

- 新项目目录创建、manifest/SQLite 安全边界和重新打开 lease；
- 章节蓝图的精确范围提交、角色同步收据和幂等读回；
- 前两章 finalized 章节按顺序进入连续阅读流，章间导航和阅读位置保持；
- 已确认章节交接的场景、视角、情绪、待回应问题和原文证据在连读视图显示；
- 定稿连续性事实的陈述与证据在连读视图显示，不把模型输出变成未经确认的权威事实。

## 用户可见结果

连读器仍以 finalized authority 枚举章节，不依赖蓝图是否存在；每章保留“回编辑器”入口。新增的证据块是只读投影，作者仍需在连续性工作单、交接面板或 Proposal 流程中修改权威记录。

## 未覆盖项

本收据是跨模块组合验收，不替代 24 对长篇质量样本、真实 provider 写作质量评阅，也不替代最终 1.1.0 平台安装包资格链。
