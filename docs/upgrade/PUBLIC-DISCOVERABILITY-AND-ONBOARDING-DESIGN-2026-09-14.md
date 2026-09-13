# InkWeaver 公共仓库与首次体验优化设计

日期：2026-09-14  
范围：公开仓库卫生、产品首页、首次安装体验、GitHub 社区发现和隐私友好的增长复盘  
适用版本：已发布的 InkWeaver 1.2.0 代码线；本改造不发布 npm

## 目标

把 InkWeaver 从“工程功能已经完成但新用户不容易理解和试用”的仓库，优化成一条清晰的公开用户路径：用户从搜索或 topic 进入仓库后，在十几秒内知道产品解决什么问题，在三分钟内完成首次启动，并能看到从设定、角色、蓝图、草稿、审稿到定稿的连续写作效果。

## 当前证据基线

维护者通过 GitHub API 读取到的基线：仓库创建于 2026-09-02；最近可用的流量窗口为 47 次 views / 9 个独立访客；701 次 clones / 281 个独立 clone 来源，但热门路径主要是 Actions，不能将其当作真实用户数；仓库为 1 star、0 fork、0 subscriber、0 issue，Discussions 未开启；v1.2.0 Release 于 2026-09-13 发布，资产下载统计尚处于新发布和 GitHub 延迟窗口。

当前公开树还包含 14 个 `_tmp_*` 临时文件、55 个 `.vitest-attachments` 文件和大量未被测试断言引用的 `__screenshots__` 输出；`README_zh.md` 仍为 v0.9.2。`README.md` 没有产品截图或 GIF，GitHub About 仅指向 README。

## 不可改变的约束

1. 不删除 `src`、`electron`、`plugins/inkweaver-dsh` 中的业务源码、DSH preset、插件文档或发布脚本。
2. 不修改 v1.2.0 Release 的 tag、桌面资产、插件 tarball 或其 SHA；公共仓库优化只能产生后续文档/维护提交。
3. 视觉回归文件只有在确认没有任何测试、脚本、文档或发布流程读取后才能移除；若仍有价值，应迁移到明确命名的 `test/visual-baselines/` 并说明用途。
4. 不新增隐藏遥测，不上传小说正文、prompt、模型响应、API key 或用户路径；增长数据只记录 GitHub 公开/维护者可读指标。
5. DSH 正式包仍为 `@shuishuipingan/inkweaver-dsh`；`@linxin666/dsh-web-all` 是外部 companion；`@ethanyoq/dsh-ai-novel-writer` 只是历史名称；不发布 npm。

## 设计分层

### A. 公共仓库卫生

先建立可回滚的文件分类清单：

- 保留：业务源码、单元测试、实际被测试读取的 fixture、必要的应用图标、发布 profile、正式文档和 DSH 插件文件。
- 移除：零字节 `_tmp_*` 临时文件、`.vitest-attachments/` 运行附件、明确由浏览器测试自动生成且没有比较断言的 `__screenshots__/` 输出、无源码引用的本地审查目录。
- 忽略：`.vitest-attachments/`、所有测试截图输出目录、`.snapshot-test-*`、`.playwright-cli/`、`.dsh-upgrade-inspect/` 和其他运行时生成目录；保留已有的用户本地数据，不使用宽泛递归删除。
- 验证：删除前用 `rg` 检查引用，删除后运行全量 unit/browser 和 `git ls-files` hygiene 检查，确保测试不会因为缺少真正基线而变绿或变红。

### B. 首页信息架构

中英文首页采用同一信息顺序：

1. 一句话产品定位和目标用户；
2. 一张真实界面截图/短 GIF（不使用用户作品）；
3. Windows/macOS 下载按钮和版本；
4. “三分钟开始第一章”快速开始；
5. 设定→角色→蓝图→草稿→审稿→定稿→下一章的连续流程图；
6. DSH 插件安装方式和包名边界；
7. 隐私、模型连接、未签名安装器和外部文学质量声明；
8. 深入文档、完整功能图和验收收据。

首页不能把内部验收表放在产品价值之前，也不能暗示软件自带模型额度、在线阅读社区或文学质量保证。

### C. 首次体验与样例

新增无版权的短篇示例项目和 `docs/quickstart/`：用户可以复制项目、连接 Ollama 或兼容 API、打开第一章、查看上下文收据、接受审稿项目、定稿并继续下一章。快速开始必须说明：模型账号由用户提供、DSH 插件与桌面项目格式独立、首次启动可能出现系统安全提示。

### D. 社区与发现

GitHub 维护入口包括 Discussions、Bug report、Feature request 和安装问题模板；README 增加 Roadmap、贡献入口和反馈链接。提交 DSH 精选列表时使用独立的一段安装说明和截图，而不是把完整工程日志复制到社区帖子。

关键词同时覆盖中文和英文：`AI 小说创作`、`长篇小说`、`long-form fiction`、`chapter continuity`、`story bible`、`evidence-backed review`、`DeepSeek Harness`、`dsh-plugin`。保留 InkWeaver 品牌名，不在没有用户迁移计划前直接改仓库名。

### E. 隐私友好的指标复盘

增加维护者脚本或模板，每周记录以下公开指标：views、unique views、clones、unique clones、stars、forks、subscribers、Release asset downloads、referrer、topic 搜索结果和 issue/discussion 活跃度。记录日期、统计窗口和 GitHub 延迟说明；不将 clone 自动推断为用户，不收集应用内行为。

## 文件责任地图

| 交付物 | 文件 | 责任 |
| --- | --- | --- |
| 主页中文 | `README.md` | 首屏定位、下载、快速开始、功能和限制 |
| 主页英文 | `README_en.md` | 与中文主页保持结构和事实一致 |
| 兼容中文入口 | `README_zh.md` | 指向当前 1.2.0 主文档，不保留过期版本号 |
| 快速开始 | `docs/quickstart/` | 无版权示例、模型配置、第一章和 DSH 安装流程 |
| 社区模板 | `.github/ISSUE_TEMPLATE/`、`.github/DISCUSSION_TEMPLATE/` | 收集可复现问题和功能需求 |
| 贡献/路线 | `CONTRIBUTING.md`、`ROADMAP.md` 或对应 docs | 解释如何参与和下一步方向 |
| 流量快照 | `scripts/github-growth-snapshot.mjs`、`docs/metrics/` | 维护者手动运行，输出脱敏公开指标 |
| 文件卫生 | `.gitignore`、`scripts/check-public-tree.mjs` | 防止生成物重新进入公开树 |
| 审计记录 | 本文件及后续 acceptance receipt | 记录决策、删除范围、验证命令和限制 |

## 验收设计

### 文件卫生验收

- `git ls-files` 不再返回 `_tmp_*` 或 `.vitest-attachments/*`；
- `README_zh.md` 不包含 `v0.9.2`；
- `scripts/check-public-tree.mjs` 对禁止路径返回空问题列表；
- 业务源码和实际测试 fixture 数量在删除前后经过引用检查；
- 工作区用户已有截图和未跟踪测试目录不被纳入 commit。

### 首页/快速开始验收

- README 中英文都能在首屏找到版本、下载、目标用户、截图/演示和快速开始；
- 所有 Release 链接、插件包名、DSH companion 边界和签名披露可点击且一致；
- 示例项目不含真实用户作品或凭据；
- 快速开始中的命令在干净临时目录完成路径检查；
- 文档链接、Markdown 和中英文事实一致性检查通过。

### 社区/分发验收

- GitHub Discussions、Issue 模板和贡献入口已通过 API/网页回读；
- `dsh-plugin` topic 仍包含仓库，精选列表提交内容准备完毕；
- Growth snapshot 能区分统计窗口、CI clone 和 Release 下载，不产生应用遥测；
- Release `v1.2.0`、资产 SHA 和插件 tarball 不发生变化。

### 回归门禁

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
node scripts/verify-github-release-assets.mjs --version 1.2.0
```

最终还需回读 `git diff --check`、远端 `main`、v1.2.0 Release、topic API 和公开仓库树。任何文档优化提交都不能被误写成重新生成了 v1.2.0 二进制资产。
