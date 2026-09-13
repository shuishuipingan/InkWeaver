# InkWeaver 公共发现与首次体验优化验收收据

验收日期：2026-09-14（Asia/Hong_Kong）

状态：冻结候选通过，准备提交本次公开发现与首次体验优化。该优化不修改 v1.2.0 发布 tag、桌面安装包或 DSH tarball；v1.2.0 发布源码仍为 `2bcff9b9eca7c5eb142aa5293acad5aac78c0728`。

## 已交付

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 公共树清理 | 已完成 | 移除 14 个 `_tmp_*`、55 个 `.vitest-attachments` 和 54 个未被测试读取的浏览器截图输出；`.gitignore` 已覆盖后续生成物。 |
| 公共树检查器 | 已完成 | `scripts/check-public-tree.mjs`；纯路径分类器和 CLI，禁止路径 `violations=[]`。 |
| 中文兼容入口 | 已完成 | `README_zh.md` 已同步 v1.2.0、Release、快速开始和 DSH 安装链接。 |
| 产品首页 | 已完成 | README/README_en 首屏新增定位、目标用户、下载、三分钟入口、连续写作 SVG 和社区链接。 |
| 产品视觉入口 | 已完成 | `docs/assets/inkweaver-writing-loop.svg`，本地无外部资源，含 `<title>`/`<desc>`。 |
| 快速开始 | 已完成 | `docs/quickstart/README.md` 和“灯塔来信”无版权样例，覆盖第一章到下一章连续性。 |
| 社区入口 | 已完成 | Issue forms、Discussion templates、`CONTRIBUTING.md`、`ROADMAP.md` 和 DSH 精选列表提交材料。 |
| Discussions | 已完成 | GitHub API 回读 `has_discussions=true`。 |
| 增长快照 | 已完成 | `scripts/github-growth-snapshot.mjs`、测试和 `docs/metrics/2026-09-14-baseline.json`。 |
| 首页与路线图复核 | 已完成 | 移除重复中文入口、补充中英文反馈/Star 入口，并把已交付的公开 onboarding 从 Roadmap 的未来项移入已交付区。 |

## TDD 与专项测试

```text
public-tree-hygiene.test.ts       2/2 passed
public-homepage-contract.test.ts  3/3 passed
quickstart-contract.test.ts       2/2 passed
github-community-contract.test.ts 2/2 passed
github-growth-snapshot.test.ts   2/2 passed
组合专项运行                     5 files / 11 passed
```

公共树检查：

```text
node scripts/check-public-tree.mjs --json
exit 0
trackedPathCount: 1067
violations: []
```

## 最终工程回归

以下命令均在当前候选源码上执行并返回退出码 0。主机的 Corepack shim 会因 Windows `EXDEV` rename 失败，因此使用本机已缓存的真实 pnpm 11.11.0 直接运行等价脚本；没有修改产品配置或锁文件。

| 门禁 | 结果 |
| --- | --- |
| `pnpm run typecheck` | 通过 |
| `pnpm run check:i18n` | 通过：无未本地化 Renderer/Main 文案 |
| `pnpm run check:runtime-log-coverage` | 通过：uncovered 为 0 |
| `pnpm test` | 314 files / 2221 passed / 8 skipped（2229 tests） |
| `pnpm test:browser` | 39 files / 228 passed |
| `pnpm build` | 通过；仅有 Vite alias、inlineDynamicImports 和大 chunk 警告 |
| `pnpm --dir plugins/inkweaver-dsh typecheck` | 通过 |
| `pnpm --dir plugins/inkweaver-dsh build` | 通过，包含 `verify-built` |
| `pnpm --dir plugins/inkweaver-dsh exec vitest run --config vitest.config.ts` | 40 files / 433 passed / 6 skipped（439 tests） |
| 5 个公开优化专项测试 | 5 files / 11 passed |

## 增长基线

来源：`docs/metrics/2026-09-14-baseline.json`。GitHub traffic 最新可用日期为 2026-09-12，存在平台延迟。

| 指标 | 基线 |
| --- | ---: |
| views / unique views | 47 / 9 |
| clones / unique clones | 701 / 281（不等于用户；热门路径和 workflow 显示存在 CI/自动化来源） |
| stars / forks / subscribers | 1 / 0 / 0 |
| Release v1.2.0 asset downloads | 0（发布时间很新，需后续快照复查） |
| `dsh-plugin` topic search | total_count=1，返回 `shuishuipingan/InkWeaver` |
| Discussions | enabled |

## 公开分发回读

- [v1.2.0 Release](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.2.0) 仍为非 draft、非 prerelease、Latest，tag/资产不变；
- [GitHub dsh-plugin topic](https://github.com/topics/dsh-plugin) 可见 DSH 生态，但 topic 本身约有 1.5 万个仓库，必须配合精选列表和教程；
- [仓库主页](https://github.com/shuishuipingan/InkWeaver) 的 README 已切换为产品首屏，临时文件不再出现在新提交的公开树中；
- GitHub About 已保留 1.2.0、long-form fiction、runtime logs 和 DSH plugin 的描述。

## 远端回读与发布不变量

- `v1.2.0` tag object SHA：`2bcff9b9eca7c5eb142aa5293acad5aac78c0728`；`releases/latest` 仍返回 `v1.2.0`，且 release 为非 draft、非 prerelease；
- 桌面七项资产合同仍通过 `node scripts/verify-github-release-assets.mjs --version 1.2.0`；
- 插件资产 `shuishuipingan-inkweaver-dsh-1.2.0.tgz` 仍为 241,776 bytes，GitHub digest 为 `sha256:0b67def78e2660ad2e29840efa158132ec00d6ec51bc81f0ed36b4067515ad66`；
- 仓库 `has_discussions=true`，topics 含 `dsh-plugin`，`topic:dsh-plugin user:shuishuipingan` 搜索仍返回 `shuishuipingan/InkWeaver`；
- 本轮公开优化提交只包含文档、维护脚本、测试和忽略规则，不重新打包、不重传、不修改 v1.2.0 二进制资产，也不执行 npm publish。

## 隐私与回滚

- 增长脚本只读取 GitHub REST 的公开/维护者指标；不收集应用行为，不上传正文、模型内容、API Key 或本机路径；
- 清理前的用户截图通过本地 stash 保留；没有把任何用户截图纳入本次提交；
- v1.2.0 Release 的 tag、七项桌面资产和 `shuishuipingan-inkweaver-dsh-1.2.0.tgz` SHA 不改变；若公共文档优化需要回滚，只需回滚本次文档/维护提交，不影响已发布资产。

## 冻结复核命令

冻结前已运行：

```text
pnpm run typecheck
pnpm run check:i18n
pnpm run check:runtime-log-coverage
pnpm test
pnpm test:browser
pnpm build
pnpm --dir plugins/inkweaver-dsh typecheck
pnpm --dir plugins/inkweaver-dsh build
pnpm --dir plugins/inkweaver-dsh exec vitest run --config vitest.config.ts
node scripts/check-public-tree.mjs --json
node scripts/verify-github-release-assets.mjs --version 1.2.0
```

最终提交前必须检查 `git diff --cached --check`、没有用户产物被 staged、远端 `main` 已回读，并再次读取 Release target SHA、插件 digest、topic 和 Discussions 状态。
