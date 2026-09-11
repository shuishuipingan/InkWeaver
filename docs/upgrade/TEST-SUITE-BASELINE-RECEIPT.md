# 1.1.0 测试套件基线收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：开发基线通过；不是 1.1.0 发布声明。

## Desktop 根目录

```text
node node_modules/typescript/bin/tsc --noEmit
```

结果：通过。

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=2
```

结果：292 test files passed；2143 tests passed；8 skipped；0 failed。

Windows release-evidence 测试需要读取 pinned pnpm。当前主机的 Corepack shim 在直接运行时会因 EXDEV rename 失败；本次证据使用隔离临时目录中的真实 `pnpm@11.11.0`（`pnpm --version` 返回 `11.11.0`），没有修改仓库或产品配置。

## DSH 插件

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=2
pnpm run build
```

执行目录：`plugins/inkweaver-dsh`。  
结果：40 test files passed、1 skipped；433 tests passed、6 skipped；typecheck、tsdown build、self-link 和 `verify-built` 均通过。Windows symlink 限制导致的 6 个测试 skip 仍按既有门禁记录，未被删除或伪装成通过。

## 解释范围

这份收据证明当前开发树的工程回归基线，不证明 38 项路线图全部验收、24 对章节盲评、100 章真实 provider 召回率、三平台 1.1.0 安装包或公开 npm/GitHub Release。版本仍保持桌面 `0.9.2`、插件 `0.1.0`，J12 仍等待版本冻结。
