# 1.1.0 发布权限只读核验

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：发布前审计；未执行任何外部写入。

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

## 发布前动作

在 38 项需求、12 条旅程、长篇质量评测和冻结安装包全部通过后，发布负责人需要在受控环境完成 npm 登录/组织权限确认，再用最终 tarball 做 `npm publish --access public`；发布后必须回读版本、tarball SHA 和公开安装结果。当前审计不保存 token，也不改变版本号。
