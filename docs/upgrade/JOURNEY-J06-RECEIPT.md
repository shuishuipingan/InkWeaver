# J06 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：修改历史正文 → 查看影响清单 → 启动可恢复重建 → 中断后从收据继续。  
源码实现 commit：`007d0e7`  

## 执行证据

```text
node node_modules/vitest/vitest.mjs run \
  src/services/workflows/__tests__/continuity-rebuild-workflow.test.ts --maxWorkers=1

node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/ContinuityImpactPanel.browser.tsx --maxWorkers=1
```

结果：工作流工厂 2 tests passed；影响面板浏览器回归 2 tests passed。

工程行为覆盖：

- 影响面板仍只列出 source-bound 连续性投影、章节交接和叙事线计划，作者可以取消勾选后再启动重建；
- 启动时只冻结变更章节、稳定影响 ID 和去重后的后续章节号，步骤按章节升序执行；
- `post_process` 工作流按当前 `finalized` 权威正文重建章节要点、连续性事实和角色状态，原稿不被覆盖；
- 工作流资源声明锁定连续性、章节摘要和角色名单写入，章节正文只作为读取资源；
- 恢复收据只保存 `changedChapter`、`affectedChaptersJson`、`impactIdsJson`，不保存正文、模型输出或作者计划；
- 通过现有 lease/session 校验，项目切换后恢复会被拒绝；底部任务面板可识别 `continuity-rebuild` 收据并继续执行。

## 保护边界

重建调用定稿后处理时关闭自动章节交接候选写入，避免用历史重建结果覆盖作者确认的交接；已有 finalized 正文和作者手工连续性工作单仍是独立权威。重建中断后，已完成步骤由通用 workflow checkpoint 保留，未完成章节从恢复工厂重新读取数据库权威源。

## 未覆盖项

本收据证明工作流编排、影响选择、恢复元数据和 UI 入口；不替代真实模型 provider 下的长篇重建质量评阅、跨平台暂停/恢复人工演练，以及 1.1.0 冻结后的最终安装包资格链。
