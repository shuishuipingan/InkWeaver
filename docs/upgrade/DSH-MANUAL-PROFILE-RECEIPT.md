# DSH 隔离 profile 子门禁收据

日期：2026-09-07（Asia/Hong_Kong）

这是一份开发线子门禁收据，不是正式插件 1.1.0 发布收据。

## 环境

| 项目 | 值 |
| --- | --- |
| DSH CLI | 本机 `dsh.ps1` |
| 隔离 DSH_HOME | `C:\Users\shuishui\.cache\inkweaver-dsh-profile-manual\dsh-home` |
| profile | `web` |
| tarball | `ethanyoq-dsh-ai-novel-writer-0.1.0.tgz` |
| tarball SHA-256 | `bcb343059851efa5b9e4807a604d62b281597c5c8c878f1697768f377c9f542a` |
| tarball bytes | `236207` |
| web UI companion | `@linxin666/dsh-web-all@0.3.17` |

## 已完成操作

1. 用当前开发源码构建并打包插件 tarball。
2. 在新的 `DSH_HOME` 中执行 `dsh --profile web --dump-config`，确认 profile 可启动并输出 DSH composition。
3. 执行：

   ```powershell
   dsh plugin --profile web add <tarball> --ignore-scripts
   dsh plugin --profile web add @linxin666/dsh-web-all@0.3.17 --save-exact --ignore-scripts
   dsh --profile web --dump-config
   ```

   回读结果包含 `@ethanyoq/dsh-ai-novel-writer` bundle 和 Host 条目 `ai-novel-writer`。

4. 执行 profile 卸载：

   ```powershell
   dsh plugin --profile web remove @ethanyoq/dsh-ai-novel-writer
   ```

   回读 `package.json` 后插件依赖与 bundle 已移除，web UI companion 保留。

5. 再次从同一 tarball 安装并回读 `package.json` 与 dump-config；插件依赖、bundle 和 Host 条目恢复。

6. 使用兼容的 `@linxin666/dsh-web-all@0.3.17` 启动真实 Web：

   ```powershell
   dsh web --no-open --host 127.0.0.1 --port 0
   ```

   Playwright 回读到页面标题 `DeepSeek Harness`，页面正文包含“小说工作台”。这证明当前 companion 与 DSH runtime 可以启动；旧的 `dsh-web-ui-all@0.1.16` 会因 `dsh-settings` 导出不匹配而启动失败，已从当前 qualification 目标中移除。

## 尚未完成的门禁

- 当前插件 qualification 脚本还要求固定 Harness checkout、完整根项目测试、真实 `agentPreset.list`、mount、浏览器 Proposal 同页应用和重启读回。
- 为保持用户未提交修改不被提交，qualification 使用临时干净 worktree；该 worktree 的 pnpm 安装在下载 `app-builder-bin-5.0.0-alpha.12.tgz` 时超时，因此完整脚本没有被误报为通过。
- 本收据只证明 tarball/profile add/remove/reinstall 和 dump-config 子门禁；不能替代正式 F02/F03/F04 资格。
