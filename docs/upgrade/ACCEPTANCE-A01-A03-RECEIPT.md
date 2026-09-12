# A01–A03 内部工程验收收据

执行日期：2026-09-12（Asia/Hong_Kong）  
结论：通过（内部工程验收）；外部双评阅者/真实 provider 质量评测按发布范围决议豁免。

## 验证命令

```text
node node_modules/vitest/vitest.mjs run \
  electron/repositories/__tests__/chapter-handoff-repository.test.ts \
  src/shared/__tests__/chapter-handoff.test.ts \
  src/shared/__tests__/adjacent-continuity.test.ts \
  src/services/__tests__/chapter-handoff-context.test.ts --maxWorkers=1

node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/ChapterHandoffPanel.browser.tsx \
  src/components/editor/__tests__/ReviewReport.confirmation.browser.tsx --maxWorkers=1
```

结果：存储/领域 4 files、11 tests passed；browser 2 files、7 tests passed。

## 覆盖范围

- A01：章节交接候选绑定 finalized draft 的 SHA、章节和证据；确认后可读回，来源定稿替换后旧交接不再作为最新确认交接；面板显示现场、视角、情绪、限制、未完成动作、问题和逐字证据；
- A02：`continue-scene`、跨日、换地点、换视角、倒叙、并行事件等 transition contract 有严格枚举，作者确认前只保留候选，确认后才进入写作上下文；
- A03：相邻章节检查输出两端证据和稳定 finding；局部修稿/Proposal 绑定基准正文，正文变化后拒绝旧结果；审稿报告可通过项目 session 打开来源定稿，确认清单支持编辑、忽略、恢复和启动修稿。

## 范围说明

本收据证明工程数据边界、并发保护、用户界面和键盘可操作入口。它不声称模型生成的自然承接质量或误报率已经通过；这部分已按发布范围决议豁免，固定 fixture 和盲评工具仅作为可选后续研究设施。
