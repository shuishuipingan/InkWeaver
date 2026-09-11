# J09 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：项目 A 发起提取 → 切换到项目 B → A 的延迟结果返回。  
源码资格树：`16f5fabb75208735a498341803f677d55db3c4c8`

## 执行证据

```text
pnpm exec vitest run src/services/__tests__/project-service-refresh-context.test.ts \
  -t J09 --maxWorkers=1
```

结果：1 test passed。测试实际验证：

- 项目 A 的角色/草稿加载仍在异步等待时，当前项目切换到 B；
- A 的延迟完成结果不会发布 `PROJECT_CHANGED`，不会刷新 B 的数据绑定；
- B 重新打开后只使用 B 的 project id、lease 和路径；
- A、B 的加载调用参数分别绑定各自不可变 project session。

