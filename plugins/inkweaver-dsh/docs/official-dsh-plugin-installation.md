# InkWeaver DSH 扩展安装

本文档说明 InkWeaver DSH Extension 如何作为 npm composition bundle 安装到外部 DeepSeek Harness 主机。当前兼容基线为 DeepSeek Harness `0.1.0-rc.6`，上源审查 commit 为 `47f943859bef60e4160492346772ded9b24f765a`。

## 公开 Release 安装

使用 InkWeaver v1.0.0 Release 中的已构建 tarball：

```powershell
dsh plugin --profile web add https://github.com/shuishuipingan/InkWeaver/releases/download/v1.0.0/shuishuipingan-inkweaver-dsh-1.0.0.tgz
dsh --profile web
```

`dsh plugin` 在目标 profile 中管理依赖，并把声明 `dsh.bundle.patch` 的包加入 `dsh.profile.bundles`。可用以下命令查看最终 composition：

```powershell
dsh --profile web --dump-config
```

命名 profile 位于 DSH home 中，因此安装作用于该 profile 启动的所有会话，而不是自动限定在某个 workspace。需要隔离时，请创建独立 profile。

## 本地贡献者安装

在 `plugins/inkweaver-dsh` 中构建并打包：

```powershell
pnpm install
pnpm test
pnpm pack --pack-destination ../../release/1.0.0
```

将生成 tarball 的绝对路径安装到一个隔离 profile，然后检查 `--dump-config`、preset roster 和真实 mount。这会验证实际打包字节，而不只是工作树源码。

Git spec 取回的是源码，不会自动执行普通 `build`。若 TypeScript 包依赖安装期 `prepare`，pnpm 10+ 还需要用户在目标 profile 显式允许构建。允许安装期脚本等同于允许包代码在 agent sandbox 之外运行，所以稳定安装优先使用已验证的 Release tarball。

## Windows 路径注意事项

固定基线的 DSH CLI 在 Windows 上使用 `shell: true` 调用 pnpm。当本地 checkout 路径包含空格时，`add .` 可能被二次分词。普通用户请直接使用上述 HTTPS tarball；本地资格脚本则以程序化 argv 传递绝对 tarball 路径。

## 项目数据与迁移

扩展只在 workspace 的 `.inkweaver` 中读写活动项目。支持的旧版扩展项目只能通过显式、只读预览的迁移边界导入；导入前后都会校验源指纹，且不会替换已存在的 `.inkweaver`。旧格式不会被新的普通读写继续使用。

## 上游依据

- [DeepSeek Harness 仓库](https://github.com/deepseek-ai/deepseek-harness)
- [Publish / install](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)
- [CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/reference/README.md#plugin-management)
- [Cordis Plugin Development Skill](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/config/agent-presets/cordis/skills/cordis-plugin-development/SKILL.md)
- [Editing Cordis Compositions Skill](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md)
