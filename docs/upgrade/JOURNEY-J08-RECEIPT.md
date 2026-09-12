# J08 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：无蓝图定稿原稿 → 导出 → 快照 → 隔离恢复。  
源码资格树：`ce996f799e7f7a318470da2a0f02a4f252d491ac`

## 执行证据

```text
pnpm exec vitest run src/services/__tests__/journey-j08.test.ts --maxWorkers=1
```

结果：1 test passed。该测试使用真实 SQLite backup、真实快照 manifest/hash、真实隔离恢复目录和 export service project-session seam，覆盖：

- 没有章节蓝图时，仍按 finalized authority 顺序导出两章；
- 导出 manifest 记录章节号、顺序和正文 SHA-256；
- 快照创建后逐文件 verify 通过；
- snapshot preview 确认目标目录为空且可恢复；
- 恢复到项目外的隔离目录后，SQLite 状态、提示词和两份定稿 manuscript 文件均保持一致。

导出目录属于外部交付物，快照只复制项目权威源（SQLite、prompts、manuscript），不会把任意外部导出目录误吸收到项目快照中；旅程测试对此边界也有明确断言。

