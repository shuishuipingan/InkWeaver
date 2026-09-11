# DSH 插件 tarball Dry-run 收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：开发版本打包检查通过；未执行 npm publish。

## 结果

| 字段 | 值 |
| --- | --- |
| package name | `@shuishuipingan/inkweaver-dsh` |
| package version | `0.1.0`（开发版本） |
| tarball | `shuishuipingan-inkweaver-dsh-0.1.0.tgz` |
| bytes | `240857` |
| SHA-256 | `6fdf3ebe235fb7ea4314e57010906ec5f4fc5d1585a562595f10ea84c18ec648` |
| entries | `41` |

打包命令使用真实 `pnpm@11.11.0`：

```text
pnpm pack --pack-destination <isolated-temp-directory>
```

## 内容边界

- tarball 内含 `inkweaver` / `inkweaver-v2` preset、Host/Client `lib` 输出、README、许可证和兼容文档；
- 未发现历史包名 `@ethanyoq/dsh-ai-novel-writer`；
- 未打入外部宿主 `@linxin666/dsh-web-all`；
- `inkweaver-v2/preset.yml` 存在，入口清单为 41 entries。

这只是当前 0.1.0 开发包的内容合同检查。正式 1.1.0 必须在最终冻结 SHA 上重建、运行 DSH qualification、回读 tarball SHA，再由发布负责人确认 npm 权限后发布。
