# J02 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：夜间悬念章末 → 切换视角 → 返回原视角。  
源码实现 commit：`0efb551`  

## 执行证据

```text
node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  src/components/editor/__tests__/StoryContinuityPanel.browser.tsx \
  -t "does not leak a switched viewpoint secret" --maxWorkers=1
```

结果：1 test passed；随后同一文件完整浏览器回归为 15 tests passed。

旅程使用真实 Chromium 渲染的 `StoryContinuityPanel`，并验证：

- 第 3 章蓝图只声明林夏为当前视角人物，项目 roster 同时存在林夏和顾舟；
- 林夏在第 1 章确认的“信件来自未来”仍出现在当前角色知情范围；
- 顾舟在第 2 章确认的“跟踪者藏在灯塔地下”不会出现在切回林夏后的知情边界；
- UI 发出的 `db:knowledge-event-list-for-chapter` 和 review IPC 只携带当前章节蓝图人物；
- 读者知识账本仍是独立的只读 projection，不因角色边界过滤而丢失跨视角悬念证据。

## 实现边界

`StoryContinuityPanel` 现在优先使用当前章节蓝图中的人物列表。旧项目没有蓝图时，只有 roster 中恰好一个人物才回退；多个 roster 人物但缺少章节边界时宁可不查询，也不把另一条视角线的秘密注入当前面板。候选知情事件仍须作者确认，未改变候选/确认状态语义。

## 未覆盖项

本收据证明的是 UI 侧当前章节角色边界和跨视角秘密不泄漏，不替代 B03 的模型候选提取、独立读者知识审计、长篇泄漏评测，也不替代最终版本冻结后的桌面/DSH资格重跑。
