# F04/F05 插件分发与主题发现验收收据

日期：2026-09-12（Asia/Hong_Kong）  
范围：1.1.0 冻结候选的内部工程验收  
结论：F04、F05 通过（不发布 npm；外部阅读评阅按发布范围决议豁免）

## F04：插件版本、打包和实际安装

| 项目 | 冻结候选证据 |
| --- | --- |
| 源码 commit | `b40cd124525fd7805cdf1c35f07eeee187d394eb` |
| 插件包 | `@shuishuipingan/inkweaver-dsh@1.1.0` |
| tarball | `shuishuipingan-inkweaver-dsh-1.1.0.tgz` |
| tarball SHA-256 | `35dd442171a426bcbea214b595f52ca7edcd20531567e3bdbc3b11e7bceb6dba` |
| tarball bytes / entries | `241389` / `41` |
| DSH Harness | `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`（官方 `dsh-v0.1.5-rc.1`） |
| qualification ticket | `128` |
| machine-readable receipt | `.runtime/.cache/dsh-ai-novel-qualification-128/runs/2026-09-12T04-01-52-418Z-15888/qualification-receipt.json`（隔离临时目录） |
| Web companion | `@linxin666/dsh-web-all@0.3.20`，仅为外部宿主前置依赖 |

资格脚本在干净 checkout 中完整执行并报告 `status: passed`，包含：

- 插件 typecheck、build、tarball content check；
- 插件完整回归：40 个测试文件通过、1 个 Windows 权限测试文件跳过，433 passed、6 skipped；
- Electron typecheck、renderer/main/release suites；
- 官方 Harness 构建、profile add/remove/reinstall、`inkweaver-v2` roster/mount；
- 初次安装、重启、重装三次 Chrome journey 与布局截图；
- `novel_read` / `novel_propose_change` 工具隔离、schema-5 Proposal 持久化、章节定稿和上一章上下文重启读回。

tarball 回读确认 41 个条目包含 `inkweaver` / `inkweaver-v2` preset、Host/Client 构建、类型声明、README、许可证和兼容文档；不包含历史包名 `@ethanyoq/dsh-ai-novel-writer`，不包含外部 `dsh-web-all`。最终 tarball 已作为 [v1.1.0 GitHub Release 资产](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.1.0)上传；本轮不执行 `npm publish`。

## F05：`dsh-plugin` 主题发现

2026-09-12 使用 GitHub API 回读公开仓库元数据和搜索索引：

```text
GET /repos/shuishuipingan/InkWeaver/topics
names: ... dsh-plugin ...

GET /search/repositories?q=topic:dsh-plugin+user:shuishuipingan
total_count: 1
item: shuishuipingan/InkWeaver
```

仓库为 public、未归档，主题元数据包含 `dsh-plugin`，用户限定的主题搜索已返回 `shuishuipingan/InkWeaver`。因此本项已具备元数据与实际索引两类证据；正式 Release 创建后只需再次回读 Release 资产，不把 topic 索引误写成 npm 发布证据。

## 范围说明

- `@linxin666/dsh-web-all` 不是 InkWeaver 插件，不进入本项目版本、tarball 或源码；它只作为 DSH Web 宿主的外部 companion。
- `@ethanyoq/dsh-ai-novel-writer` 是历史包名，不是当前安装目标，已从当前 manifest、README、preset 和发布命令中移除。
- 本收据证明工程安装/兼容性与发现性，不宣称真实模型的文学质量；用户已明确豁免外部评阅。
