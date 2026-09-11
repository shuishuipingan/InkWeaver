# J03 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：第 12 章取得钥匙 → 第 18 章转交 → 查询两个阶段的所有权历史。  
源码资格树：`6d7c383384892f9c1fd0740edef61b0f281fdb41`

## 执行证据

```text
pnpm exec vitest run electron/repositories/__tests__/summary-repository.test.ts \
  -t J03 --maxWorkers=1
```

结果：1 test passed。测试通过真实项目 SQLite 和 finalized continuity projection 验证：

- 第 12 章保存“旧钥匙属于林夏”，有效到第 17 章；
- 第 18 章保存“旧钥匙转交给顾舟”，从第 18 章开始有效；
- 查询第 13 章之前只得到取得钥匙阶段；
- 查询第 19 章之前，在第 17 章仍得到林夏，在第 18/19 章得到顾舟；
- 每个事实都绑定 finalized draft、来源章节和正文证据，不修改原始正文。

