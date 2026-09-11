# J05 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：202 人图谱 → 标签/列表 → 缩放拖拽 → 聚焦 → 重开。  
源码资格树：`1f7640d7a69f2c45d3c0cfce26d29bed20d40a02`

## 执行证据

```text
pnpm exec vitest run --config vitest.browser.config.ts \
  src/components/editor/__tests__/RelationshipGraph.regression.browser.tsx \
  -t "J05" --maxWorkers=1
```

结果：1 test passed。测试实际覆盖：

- 202 个角色节点，Canvas 尺寸与布局初始化成功；
- 可访问角色列表双击固定节点，布局快照写入项目级 localStorage；
- 缩放按钮、鼠标滚轮和“适合视图”操作；
- 搜索角色并切换一跳聚焦范围；
- pointer down/move/up 拖拽事件；
- 卸载并重新挂载同一 `projectKey` 后，固定节点标记和 Canvas 布局仍然存在。

关联的真实 Chromium 证据测试：

- `RelationshipGraph.label-hit.browser.tsx`：缩放和拖拽后标签到所属边的距离约束；
- `RelationshipGraph.performance.browser.tsx`：202 节点首次交互、布局帧和拖拽帧指标。

本次旅程还修复了一个真实问题：重开图谱时 Canvas 节点已经恢复 pinned 状态，但键盘/列表投影没有重新渲染固定标记；现在初始化持久化布局会触发列表投影刷新。

