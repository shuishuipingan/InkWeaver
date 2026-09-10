# RelationshipGraph 1.1.0 性能基线

记录日期：2026-09-10（Asia/Hong_Kong）

这是一份真实 Chromium 浏览器测量，不是纯函数压力测试，也不代表所有硬件都能达到相同结果。它用于 D02 的工程基线；正式发布前仍需在目标发布机器上复测并由评阅人确认。

## 测试环境

| 项目 | 值 |
| --- | --- |
| OS | Windows 11 专业版 64 位，10.0.26200 |
| CPU | Intel Core i7-14650HX，24 logical processors |
| 内存 | 15.61 GiB 总物理内存 |
| 浏览器 | Google Chrome 152.0.7977.83 |
| 架构 | x64 |
| 浏览器测试视口 | Vitest Chromium 实例实际 600×300 CSS px；fixture 请求的容器尺寸为 794×588 |
| 图谱规模 | 202 个角色、按固定规则生成关系边 |

## 测量方式

测试文件：

`src/components/editor/__tests__/RelationshipGraph.performance.browser.tsx`

运行命令（Windows）：

```powershell
node_modules/.bin/vitest.cmd run --config vitest.browser.config.ts `
  src/components/editor/__tests__/RelationshipGraph.performance.browser.tsx `
  --reporter=verbose
```

测试从 React 挂载开始计时，等待 canvas backing store 和 CSS 尺寸就绪后记录首次可交互时间；随后采集 4.5 秒布局阶段和 1 秒合成拖拽阶段的 `requestAnimationFrame` 间隔，并用 `PerformanceObserver`（浏览器支持时）统计 Long Task。

## 当前结果

| 指标 | 结果 | D02 目标/解释 |
| --- | ---: | --- |
| 首次可交互 | 45.6 ms | 当前硬件低于 2,000 ms 工程上限 |
| 布局帧间隔 p95 | 16.8 ms | 低于 33 ms 建议目标 |
| 拖拽帧间隔 p95 | 16.7 ms | 低于 33 ms 建议目标 |
| Long Task | 0 | 当前浏览器观察窗口没有记录到 Long Task |
| 布局样本 | 271 帧 | 4.5 秒窗口 |
| 拖拽样本 | 60 帧 | 1 秒窗口 |

这次结果只证明当前记录硬件、当前浏览器和 202 节点样本满足工程目标。它不替代 5,000 节点纯模型压力测试，也不替代发布前在不同分辨率、真实项目关系密度和长时间拖拽下的复测。

## 后续验收

- 在至少一台目标 Windows 发布硬件上重复同一命令并保存原始输出。
- 在 500+ 节点真实关系密度、缩放、搜索/过滤和拖拽混合操作下复测。
- 若 p95 超过 33 ms，先区分布局计算、canvas 绘制和 React 状态更新，再针对瓶颈优化；不要只提高测试阈值。
- 由评阅人确认 D02 后，才可把追踪表状态从“开发中”移入“通过”。
