# DSH 插件 1.1.0 tarball 收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：1.1.0 冻结候选打包与隔离安装检查通过；未执行 npm publish。

## 结果

| 字段 | 值 |
| --- | --- |
| package name | `@shuishuipingan/inkweaver-dsh` |
| package version | `1.1.0` |
| tarball | `shuishuipingan-inkweaver-dsh-1.1.0.tgz` |
| bytes | `241334` |
| SHA-256 | `140565e6089800dad7c6a46ba100ecf3f591e089eb8495694e969eb4f1eb3d27` |
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

该 tarball 已在源码 `0358584da5333b1c6476062a0518d765800a4b2f` 和 Harness
`183f08e9c6dde7e36cd2318eaee70b0da08fb35e` 上完成完整 qualification，机器可读收据见
`ACCEPTANCE-F04-F05-RECEIPT.md`。交付方式是 GitHub Release 资产和本地路径安装，不执行 npm publish。
