# J04 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：长篇原稿导入 → 全文人物提取 → 别名消歧 → 作者确认应用。  
源码资格树：`371b6ca6fb10264e8d974fcc6faf5c3a20677410`

## 执行证据

```text
pnpm exec vitest run src/services/__tests__/journey-j04.test.ts --maxWorkers=1
```

结果：1 test passed。旅程测试覆盖：

- 长篇正文的开头/结尾窗口保留，后半段人物证据不会被输入裁剪丢失；
- 候选携带跨章节 source-bound 证据和别名；
- 新人物候选可以加入 roster；
- 同名 `ambiguous` 候选在没有明确目标时不会自动写入任何角色；
- 作者指定目标后才允许合并；
- 字段合并只写入候选字段，已有作者背景资料保持不变。

关联浏览器证据：`CharacterExtractionCandidatesPanel.browser.tsx` 覆盖同名候选必须显式选择目标、字段审核和来源覆盖摘要。

