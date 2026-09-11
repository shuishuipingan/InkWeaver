# J10 端到端旅程收据（开发基线）

状态：通过（开发基线）；正式 1.1.0 冻结后必须用最终 SHA 重跑。  
旅程：DSH tarball 安装 → preset → 提案 → 应用 → 同页变化 → 重启。  
核验日期：2026-09-12（Asia/Hong_Kong）

## 固定来源

| 项目 | 证据 |
| --- | --- |
| qualification status | `passed` |
| qualification ticket | `128` |
| clean source commit | `50a7bb2d6aa48c9a6d66e32194e22459675ca6f4` |
| Harness commit | `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`（官方 DSH 0.1.5-rc.1） |
| plugin package | `@shuishuipingan/inkweaver-dsh@0.1.0`（开发基线） |
| tarball SHA-256 | `7bc070c2788a525aa5d1e877435a461d861fc019941379abd12188ba2caaaac0` |
| tarball bytes / entries | `240740` / `41` |
| Web companion | `@linxin666/dsh-web-all@0.3.20`（外部宿主依赖） |

## 旅程证据

- profile 初次安装、preset `inkweaver-v2` mount、卸载、重装均在隔离 DSH profile 中完成。
- 初次安装、重启、重装后的 Chrome journey 均返回 `Google Chrome`，并生成布局与交互截图。
- V2 store schema 为 5；5 项 Proposal 的状态、章节 1 定稿和章节 2 的上一章上下文在重启与重装后保持一致。
- Proposal 应用、章节定稿选择、`novel_read` 上下文读取和 `novel_propose_change` 的 exactly-two-tool 隔离均通过。
- profile reinstall 后 preset descriptor、agent Cordis 文件和已安装包内容 SHA 保持一致。

原始机器可读 receipt 位于 qualification run 的 `qualification-receipt.json`，并包含 `artifact`、`profile`、`presetTools`、`persistence`、`web`、`designQa` 和 `checks` 字段。该 receipt 仍属于 0.1.0 开发基线，不能替代 1.1.0 冻结后的再次 qualification。

