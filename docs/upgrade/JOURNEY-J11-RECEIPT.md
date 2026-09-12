# J11 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终插件 SHA 重跑资格链。  
旅程：DSH 旧作品升级 → 提取知情候选 → 正文/章节来源先变化 → 应用旧 Proposal。  
插件测试 commit：`e7e950d`  

## 执行证据

```text
node node_modules/typescript/bin/tsc --noEmit

node node_modules/vitest/vitest.mjs run \
  tests/novel-artifacts.spec.ts --maxWorkers=1
```

执行目录：`plugins/inkweaver-dsh`  
结果：插件 typecheck 通过；`novel-artifacts.spec.ts` 5 tests passed。

旅程使用真实 `NovelStore` SQLite 数据库覆盖：

- 在旧 schema 3 的工作区中保留一个未应用的章节 Proposal，其中包含从正文提取出的 `candidate` 知情事件；
- 重开工作区并完成 V3 → V4 → V5 迁移，Proposal 和章节事实没有丢失；
- 作者先以新的 aggregate revision 修改章节来源；
- 旧 Proposal 应用被标记为 `stale / STALE_REVISION`，没有覆盖作者的新修改，候选也没有越过人工确认边界；
- 迁移后的 store 仍能读取 schema 5、Proposal inbox 和章节数据。

## DSH 边界

本旅程证明的是 InkWeaver Host store 的旧数据升级和 Proposal 并发安全；没有重新引入旧包名，也没有改变 DSH preset、Host RPC 或 Client 工具合同。正式发布前仍须在冻结的 `@deepseek-ai/dsh@0.1.5-rc.1` Harness、隔离 profile 和最终 tarball 上重跑完整 qualification。
