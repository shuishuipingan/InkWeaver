# G01 文档实现一致性收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：通过（内部工程验收；外部文学质量评阅按发布范围豁免）。

## 工程检查

```text
node node_modules/vitest/vitest.mjs run \
  scripts/__tests__/readme-localization.test.ts \
  scripts/__tests__/release-version.test.ts \
  scripts/__tests__/release-version-sync.test.ts \
  scripts/__tests__/github-release-asset-contract.test.ts --maxWorkers=1
```

结果：4 test files、15 tests passed。

检查范围包括：

- 中英文 README 互链和无图默认入口；
- 当前桌面 v0.9.2 资产命名与主页版本文案；
- 1.1.0 版本冻结守卫确认桌面/插件均同步到 1.1.0；
- GitHub Release 资产合同和 `dsh-plugin` topic 元数据合同。

## 手工一致性修正

- 主页不再把尚未发布的 npm 包当作可直接安装链接，改为 DSH 插件说明入口；
- 插件 README 与官方安装说明统一到 Harness `183f08e9…` / DSH `0.1.5-rc.1`；
- 插件回归数量从旧的 432 更新为当前 433 passed / 6 skipped；
- CHANGELOG 的 topic 描述改为 API 索引已可见、公开主题页仍需正式 Release 后复核；
- 历史包名 `@ethanyoq/dsh-ai-novel-writer` 仍只出现在迁移说明和守卫测试中，没有回到安装目标。

## 待人工评阅

正式 Release 已创建并完成下载链接、资产哈希、插件 tarball、npm 范围和主题索引回读；主页、安装说明、更新日志和冻结 SHA 已按上述收据同步。外部文学质量评阅不属于本轮 G01 门槛。
