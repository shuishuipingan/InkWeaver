# J07 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：局部修稿运行中继续编辑正文 → 尝试应用旧结果 → 拒绝旧版本 → 基于最新正文重新生成并合并。  
源码资格树：`f5a60cbf209dbbe4a0caa755964725773b0558a6`

## 执行证据

```text
pnpm exec vitest run electron/repositories/__tests__/revision-repository.test.ts \
  -t J07 --maxWorkers=1
```

结果：1 test passed。旅程实际验证：

- 修稿 Proposal 保存 `base_content_hash`；
- 作者在修稿生成期间编辑基准正文；
- 应用旧 Proposal 时被明确拒绝，旧 pending 修稿仍可查看且没有覆盖正文；
- 基于新正文指纹创建替代修稿，旧 Proposal 被 discarded；
- 新 Proposal 成功合并到新 draft，原作者正文保持可核验。

