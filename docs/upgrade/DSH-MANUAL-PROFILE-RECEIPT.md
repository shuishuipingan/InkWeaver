# DSH 隔离 profile 子门禁收据

日期：2026-09-11（Asia/Hong_Kong）

这是一份历史开发线子门禁收据，保留用于追踪早期 profile 调试；它已被
`ACCEPTANCE-F04-F05-RECEIPT.md` 中绑定源码 `0358584d`、插件 `1.1.0` 的完整
qualification 收据取代，不得作为当前版本哈希或测试数的来源。
`@linxin666/dsh-web-all` 是 DSH 宿主侧的外部 UI companion，不属于 InkWeaver
插件的源码、版本或发布资产；这里仅记录它作为 Web qualification 的环境前置依赖。

## 环境

| 项目 | 值 |
| --- | --- |
| DSH CLI | 官方 Harness commit `183f08e9c6dde7e36cd2318eaee70b0da08fb35e` (`dsh-v0.1.5-rc.1`) |
| 隔离 DSH_HOME | `.runtime/.cache/dsh-ai-novel-qualification-128/runs/2026-09-10T23-02-50-025Z-4888/dsh-home` |
| profile | `web` |
| tarball | `shuishuipingan-inkweaver-dsh-0.1.0.tgz` |
| tarball SHA-256 | `dd3ae2467422613e249e7be6b94fb46d8002d5aab4222a3d7f6394f8f250725e` |
| tarball bytes | `240605` |
| web UI companion | `@linxin666/dsh-web-all@0.3.20` |
| machine-readable receipt | `.runtime/.cache/dsh-ai-novel-qualification-128/runs/2026-09-10T23-02-50-025Z-4888/qualification-receipt.json` |

## 已完成操作

1. 用当前开发源码构建并打包插件 tarball。
2. 在新的 `DSH_HOME` 中执行 `dsh --profile web --dump-config`，确认 profile 可启动并输出 DSH composition。
3. 执行：

   ```powershell
   dsh plugin --profile web add <tarball> --ignore-scripts
   dsh plugin --profile web add @linxin666/dsh-web-all@0.3.20 --save-exact --ignore-scripts
   dsh --profile web --dump-config
   ```

   回读结果包含 `@shuishuipingan/inkweaver-dsh` bundle 和 Host 条目 `inkweaver`。

4. 执行 profile 卸载：

   ```powershell
   dsh plugin --profile web remove @shuishuipingan/inkweaver-dsh
   ```

   回读 `package.json` 后插件依赖与 bundle 已移除，web UI companion 保留。

5. 再次从同一 tarball 安装并回读 `package.json` 与 dump-config；插件依赖、bundle 和 Host 条目恢复。

6. 使用兼容的 `@linxin666/dsh-web-all@0.3.20` 启动真实 Web：

   ```powershell
   dsh web --no-open --host 127.0.0.1 --port 0
   ```

   Playwright 回读到页面标题 `DeepSeek Harness`，页面正文包含“小说工作台”。这证明当前 companion 与 DSH runtime 可以启动；旧的 `dsh-web-ui-all@0.1.16` 会因 `dsh-settings` 导出不匹配而启动失败，已从当前 qualification 目标中移除。

7. 使用该 profile 启动 `dsh web --no-open --host 127.0.0.1 --port 0`，Playwright 回读页面标题 `DeepSeek Harness`，并看到“小说工作台”入口；页面控制台仍有宿主预览版自身的已知警告，未把它们计为插件失败。
8. 使用该 profile 的 installed package/preset 路径运行 `web-all-composition.spec.ts`，真实 Loader 请求头隔离测试通过：每个模型请求只包含 `novel_read` 与 `novel_propose_change` 两个小说工具。

## 当前结论与剩余发布门禁

该历史 qualification 曾通过插件 40 个测试文件、432 tests passed、6 个 Windows symlink privilege tests skipped；当前 1.1.0 冻结候选的最新完整 qualification（433 passed）见 `ACCEPTANCE-F04-F05-RECEIPT.md`。DSH 0.1.5 的官方 `/api` interceptor 是 singleton，InkWeaver 通过 shared `/api` 下的 exact Fetch routes 注册自身 endpoint。

这份收据仍然不是桌面 1.1.0 发布收据。版本冻结、Windows/macOS 安装包、npm 发布、GitHub Release 资产和 `dsh-plugin` 主题索引回读仍属于后续发布门禁。
