# 1.1.0 发布权限只读核验

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：发布范围已豁免 npm；未执行任何外部写入。

发布负责人决议：本轮 1.1.0 不发布 npm，插件只作为 GitHub Release tarball 和本地安装包交付。以下 npm 401/404 结果保留作事实记录，但不再作为发布阻塞条件。

## npm

```text
npm whoami
```

结果：HTTP 401 Unauthorized。当前环境没有可用 npm 登录会话，因此不能证明发布负责人拥有 `@shuishuipingan` scope 的 publish 权限。

```text
npm view @shuishuipingan/inkweaver-dsh version dist-tags --json
```

结果：HTTP 404。目标包当前没有公开 registry 版本；这只能说明未读到已发布包，不能替代权限证明。

官方 DSH 对照查询仍为 `@deepseek-ai/dsh@0.1.5-rc.1`（latest）。

## GitHub

只读 API 回读结果：

- 现有 tag：`v1.0.0`；
- 现有正式 Release：`v1.0.0`，非 draft、非 prerelease；
- `1.1.0-development` 仅作为开发分支，不能当作正式 Release。

## 仍保留的事实记录

即使 npm 不发布，最终 tarball 仍需在冻结 SHA 上重建并回读 SHA；GitHub Release 资产和本地 `dsh plugin add <tarball>` 安装路径必须通过验证。当前审计不保存 token，也不改变版本号。
