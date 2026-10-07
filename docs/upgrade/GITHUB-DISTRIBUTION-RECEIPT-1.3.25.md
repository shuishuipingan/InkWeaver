# 1.3.25 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T05:34:06Z，本机核验时刻 2026-10-07T13:35 HKT）

这是 1.3.25 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与前九版一致（含 Actions 运行自证与失败 step 深读），并记录抖动修复后的第二次采样。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `15bc011b6e6ed6f46f439770366e9881d0037def` |
| 提交 | `bf98137 feat(agent): add four writing skills built on the new read tools`（2 files, +244） + `15bc011 chore(release): prepare v1.3.25` |
| tag | `v1.3.25`（annotated）；tag 对象 `a960c6ac3786a5874db1a8345f7cc5b82c4f2454`（type=tag，tagger `shuishuipingan`，2026-10-07T05:09:51Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.25` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-63 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-63 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论（发布侧记录见`用户可见变更与验收`） |

## 平台资格（全部绑定 SHA `15bc011b…`）

四个平台**全部 attempt 1 一次通过，零重跑**；本机回读 Actions API 逐条确认。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37574969476`，attempt 1 | `qualified-windows` = `11462109058` | success |
| macOS arm64 | run `37574973489`，attempt 1 | `qualified-macos-arm64` = `11462172468` | success |
| macOS x64 | run `37574978141`，attempt 1 | `qualified-macos-x64` = `11462606549` | success |
| Linux x64 | run `37574982635`，attempt 1 | `qualified-linux-x64` = `11463087114` | success |

四个 run 的 `head_sha` 均为 `15bc011b6e…`。macOS x64 本轮 attempt 1 的 job `package-and-qualify` 结论为 `success`、无失败 step（本机回读确认）。

## macOS x64 runner 抖动：跨版本对照（第 8 次采样，修复后 2/2）

| 版本 | 运行 | attempt 1 | attempt 2 | 最终结果 |
| --- | --- | --- | --- | --- |
| 1.3.16 | run `37140990679`（head `3a69421e5f`） | failure（帧时间 p95 `116.7` / `133.3` 超预算） | **failure**（同一测试） | 该 run 报废，**重派新 run** `37142453767` 才通过 |
| 1.3.19 | run `37217338528` | success | — | 一次通过 |
| 1.3.20 | run `37395647387` | success | — | 一次通过 |
| 1.3.21 | run `37470488648`（head `58b27a83c4`） | failure（`expected 116.7 to be less than 105`） | success | attempt 2 通过 |
| 1.3.22 | run `37563552549`（head `f405b2e1e6`） | success | — | 一次通过（零重跑） |
| 1.3.23 | run `37567309253`（head `26f495a0d0`） | failure（`expected 116.6 to be less than 105`） | success | attempt 2 通过 |
| 1.3.24 | run `37571952992`（head `668fa86123`） | success | — | 一次通过（修复后第 1 次采样） |
| **1.3.25** | run `37574978141`（head `15bc011b6e`） | **success** | — | 一次通过（修复后第 2 次采样） |

**统计判读（严格按样本说话）**：八次采样中 5 次 attempt 1 通过、3 次抖动（116.7 / 116.7 / 116.6，上限 105），三次抖动全部发生在帧预算修复（`874dbad`）之前。修复后目前的记录是 **2/2 通过**（1.3.24、1.3.25）。

**仍不足以判定修复生效**：修复前同样出现过连续两次通过（1.3.19 与 1.3.20），因此"修复后 2/2"与"未修复时的通常表现"仍未在统计上分开。要判定修复是否真正改变通过率，需要继续累积采样（本次记录不写"问题已解决"，也不撤回此前三次抖动的记录）。作为参照，修复前的通过率为 3/6（1.3.19 / 1.3.20 / 1.3.22），若修复有效且抖动的发生概率显著下降，应在后续样本中体现为明显低于修复前的抖动频率。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37576477061**`，attempt 1、success（本机从 promotion workflow 的运行列表独立查得，`head_sha` = `15bc011b6e…`，与该版本的资格 run 一致）；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.25`（id `405412986`），非 draft、非 prerelease；`target_commitish` = `15bc011b6e6ed6f46f439770366e9881d0037def`；发布时间 2026-10-07T05:34:06Z |
| Release body | 由 CHANGELOG 的 1.3.25 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.25` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续七次一次通过）

1.3.18 的 promotion 首次运行 `37214225255` 因取值脚本取了列表第一个 artifact（`windows-cloud-build-diagnostics`）报 `qualification artifact name mismatch` 而失败；自 1.3.19 起按 `qualified-*` 名精确筛选，直到本轮共七次 attempt 1 success（37218555871 / 37397404495 / 37473937227 / 37565028245 / 37569607418 / 37573450129 / 37576477061）。

可核验的边界（沿用前六版收据的口径）：截至本收据写作时，仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（两者的最后一次改动仍是 `0e9fb74`，"add qualified Linux packages for v1.3.6"）。七次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.25.exe` | 223,547,416 | `c667c89a2f29ecad2ccfbab188be9916f28958d245652360ddeb6b193c683ec2` |
| `inkweaver-setup-1.3.25.exe.blockmap` | 233,460 | `e4492ea4898de848e6533fd39fb90348cc1a76d723bcaa098e3dcd3832d32ba7` |
| `latest.yml` | 350 | `a6960638ace3574c42e10e8bab1c842e70d571699234aa44aed86e27b663066c` |
| `inkweaver-mac-arm64-1.3.25-installer.dmg` | 302,026,690 | `51c2bb19cc2d4270e8ed31f672d4a13b6ee6c73c99d5a77691c053f39c4e224c` |
| `inkweaver-mac-arm64-1.3.25-installer.dmg.sha256` | 107 | `f58bf8d777233eb9b676d8bc82af3741163b3a2e622fc0a420591146fbecb534` |
| `inkweaver-mac-x64-1.3.25-installer.dmg` | 311,926,774 | `6827ccb0988e666fb0cc6c4b69017e7a95324a97ffe7ae1eba25424d594686ee` |
| `inkweaver-mac-x64-1.3.25-installer.dmg.sha256` | 105 | `aa8ce47822faa47402c0aa3fe6079c9f77e10bb6d093a7c01cf49c27010889cf` |
| `inkweaver-linux-x64-1.3.25.AppImage` | 502,263,737 | `265163c902806e87b00e45b9cbf62125128c4e093bdaefe5d22ca01de8135eb4` |
| `inkweaver-linux-x64-1.3.25.AppImage.sha256` | 102 | `4b11bde91e93aee8309fd3650593ae9697950ca673ca56a5ca6d4bfc74abf745` |
| `inkweaver-linux-x64-1.3.25.deb` | 354,491,688 | `76b419fc014afb7f2316a9568614c8074211f52b7499c7f75f8b458765e43eea` |
| `inkweaver-linux-x64-1.3.25.deb.sha256` | 97 | `33b1cd97b881886f6c96326b1d5693dcd84f79d351090828952bd84036d626f0` |
| `inkweaver-linux-x64-1.3.25.rpm` | 298,281,873 | `bf6fae1d8bf4d13d3a61f0b638b26cab6c08c932f5a9f0ab9f50b8509f951c2a` |
| `inkweaver-linux-x64-1.3.25.rpm.sha256` | 97 | `3f3d7b3d42dedbca3d29256d7e558799311fb32180a26de9f7aa008b128a3f39` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.25`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.25 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16 起连续九次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `a6960638ace3574c42e10e8bab1c842e70d571699234aa44aed86e27b663066c` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.25`、`path/url: inkweaver-setup-1.3.25.exe`、`size: 223547416`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-07T05:19:13.395Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.25.exe` 资产 size（223,547,416）数值一致。

**未验证项（残留风险，与前九版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮一条交付线：**新增 4 个写作技能**（内置技能 7 → 11）。四个技能的差异点是它们真的用上了前几轮新增的只读工具，而不是只写提示词。

- `/chapter-brief`（章节开写简报）：把上一章遗留的未完成动作与待回应问题、该章蓝图职责、该在该章推进或回收的伏笔（带依据）、出场角色此刻各自知道什么、上一章的情绪余波汇成开写前简报，并列出待确认项。
- `/dialogue`（对白打磨）：先用正文检索取出该角色过往台词建立"声音基线"，再逐处对照用词层级、句长、称呼方式与回避习惯；每处修改写明偏离了哪条基线证据（章节号 + 片段）；样本不足时说明是推断而非测量。
- `/pacing`（节奏诊断）：判据是"该章是否完成蓝图赋予的职责"而非"有没有大事件"；标出无推进章、重复功能章、被压缩的转折与线索断层，每条附章节号与蓝图或工作单原文；铺垫章与喘息章不算问题。
- `/thread-audit`（线索审计）：拿线索的规划状态去正文里核对"已埋 / 已回收"是否属实（正文检索抽查关键词），输出审计表（线索 → 规划状态 → 正文证据 → 落差 → 建议动作）；找不到佐证如实写"未找到"。

四个技能都遵守既有安全边界：涉及改写的（对白打磨）走修订提案、先展示方案等作者确认，不直接覆盖正文；已定稿章节只给建议并说明应在哪一章处理。

以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 366 文件 / 2,802 用例，0 失败 |
| 浏览器套件 | 48 文件 / 271 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| 技能测试 | 7 条（含"`allowedTools` 里每个工具名都真实存在"的校验、以及"既有 7 个技能逐字未变"） |

上表用于说明本轮交付线的验收覆盖面；它不构成对文学质量、检索精度、第三方 provider 行为或真实模型输出质量的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.24` 命中两处，均为历史记录：

- `CHANGELOG.md`：1.3.24 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.24.md`：1.3.24 历史收据（35 处）。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.24 残留。¹

¹ 1.3.25 冻结期间曾观察到 README 系列仍指向 1.3.24（task-63 的简报记录）；本机在收据写作时重新 grep，公共文档已同步完毕，故此处记为无残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.24 收据中的扫描边界说明不适用于 1.3.25。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本（见`取值改进`），七次连续成功仍依赖发布侧取值正确。
- macOS x64 runner 的渲染进程性能断言在八次采样中出现过三次间歇失败（全部在帧预算修复之前）；修复后为 2/2 通过，但**仍不足以判定修复生效**（见`macOS x64 runner 抖动`）。

## 1.3.25 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.25 小节）

- 新增四个写作技能（内置技能 7 → 11）：章节开写简报（`/chapter-brief`）、对白打磨（`/dialogue`）、节奏诊断（`/pacing`）、线索审计（`/thread-audit`）；四个技能都遵守既有安全边界（涉及改写的走修订提案，已定稿章节只给建议）。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.25`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.25`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.25` → `git/tags/a960c6ac…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run 与 macOS x64 历次 attempt）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/workflows` → promotion workflow → `/runs`（本轮 promotion run 独立查出）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
