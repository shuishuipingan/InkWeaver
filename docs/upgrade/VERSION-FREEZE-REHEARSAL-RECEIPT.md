# G02 版本冻结 Rehearsal 收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：冻结守卫按预期拒绝开发版本；不代表 1.1.0 已冻结。

## 命令与结果

```text
node scripts/release-version-sync.mjs --expected-version 1.1.0
```

退出码：`1`。结构化结果：

```json
{
  "ok": false,
  "errors": [
    "desktop package version 0.9.2 does not match expected 1.1.0",
    "DSH plugin package version 0.1.0 does not match expected 1.1.0"
  ]
}
```

## 保护结论

- 桌面和插件不会在只改一侧时被误判为同一正式版本；
- 当前正式插件包名仍被校验为 `@shuishuipingan/inkweaver-dsh`；
- 版本冻结前不会创建 `v1.1.0` tag、GitHub Release 或 npm 发布资产；
- 只有 38 项需求、12 条旅程、长篇质量评测和三平台冻结 SHA 资格都完成后，才应把两个 package version 同步到 `1.1.0` 并重新跑完整门禁。
