# G01 文档实现一致性收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：自动化与手工一致性检查完成，等待最终人工评阅；不等同于 G01 正式通过。

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
- 1.1.0 版本冻结守卫仍拒绝桌面/插件未同步到 1.1.0 的状态；
- GitHub Release 资产合同和 `dsh-plugin` topic 元数据合同。

## 手工一致性修正

- 主页不再把尚未发布的 npm 包当作可直接安装链接，改为 DSH 插件说明入口；
- 插件 README 与官方安装说明统一到 Harness `183f08e9…` / DSH `0.1.5-rc.1`；
- 插件回归数量从旧的 432 更新为当前 433 passed / 6 skipped；
- CHANGELOG 的 topic 描述改为 API 索引已可见、公开主题页仍需正式 Release 后复核；
- 历史包名 `@ethanyoq/dsh-ai-novel-writer` 仍只出现在迁移说明和守卫测试中，没有回到安装目标。

## 待人工评阅

最终 G01 仍需评阅人核对主页截图、安装说明、更新日志与冻结 SHA 的逐项对应关系；正式 Release 创建后还要重新回读下载链接、资产哈希、npm 状态和主题页。
