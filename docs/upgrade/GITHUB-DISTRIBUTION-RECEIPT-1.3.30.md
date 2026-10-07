# 1.3.30 GitHub 分发核验收据

核验日期：2026-10-07（Asia/Hong_Kong；Release 发布于 2026-10-07T11:20:36Z，本机核验时刻 2026-10-07T19:22 HKT）

这是 1.3.30 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。本版收据重点：**七处白名单丢点的完整清单**、**Linux 首跑失败后重跑的诚实归因**、以及 mtime 冻结校验。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `3560fa741d35c9d97455191812f6d13284516255` |
| 提交 | `969ee07 fix(roster): keep generated relationship facets and faction edges across saves`（17 files, +1271/−10） + `3560fa7 chore(release): prepare v1.3.30` |
| tag | `v1.3.30`（annotated）；tag 对象 `1c29e08add82a63e18e2099ed592579eef4c46d2`（type=tag，tagger `shuishuipingan`，2026-10-07T10:33:15Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.30` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-94 本机执行） |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-94 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `3560fa74…`）

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37608181698`，attempt 1 | `qualified-windows` = `11478225068` | success |
| macOS arm64 | run `37608188418`，attempt 1 | `qualified-macos-arm64` = `11475459969` | success |
| macOS x64 | run `37608194505`，attempt 1 | `qualified-macos-x64` = `11476133024` | success（修复后 7/7） |
| Linux x64 | run `37608200754`，**attempt 2** | `qualified-linux-x64` = `11478408979` | success（attempt 1 失败后重跑，见下） |

四个 run 的 `head_sha` 均为 `3560fa741d…`（重跑未换代码）。

### Linux x64 首跑失败与重跑（如实记录，含归因的置信度）

**事实（本机回读 Actions API 确认）**：run `37608200754` 的 attempt 1 结论为 `failure`，失败 step 是 job `package-and-qualify` 的 **`Install and launch packages on Ubuntu, Debian, and Fedora`**；attempt 2 结论为 `success`、无失败 step。同一提交（`head_sha` 两次都是 `3560fa741d`），未改代码。

**发布侧记录的失败位置与形态**：失败发生在 `linux-package-smoke` 的 **`debian:13-slim` 容器**，错误信息被截断为 `asar.unpacked/node_modules/onnxruntime-node/script...`（指向本地向量模型的原生依赖路径）。

**本轮改动与该路径的关系**：v1.3.30 的 17 个改动文件全部是 `repositories` / `editor` / `roster-client` 的业务代码与版本文件，**没有任何一处涉及打包配置、依赖清单或原生模块**。这一条是可核验的（`git show --stat 969ee07` 的文件清单）。

**归因的置信度（必须写明）**：把这次失败归为"环境类、与改动无关"的推理依据是——失败落在容器安装/启动冒烟步骤、错误指向原生依赖路径、且本轮零涉及该路径；**但错误日志被截断，我们没有深挖根因，因此该归因是推断而非实证**。重跑通过只能说明它不是稳定复现的失败，不能证明成因已被定位。本收据不把这条记为"已确认的环境问题"。

## macOS x64 runner 抖动：跨版本对照（第 13 次采样，修复后 7/7）

| 版本 | attempt 1 | 最终结果 |
| --- | --- | --- |
| 1.3.16 | failure（p95 `116.7` / `133.3`） | 该 run 报废，重派新 run `37142453767` 才通过 |
| 1.3.19 | success | 一次通过 |
| 1.3.20 | success | 一次通过 |
| 1.3.21 | failure（`expected 116.7 < 105`） | attempt 2 通过 |
| 1.3.22 | success | 一次通过 |
| 1.3.23 | failure（`expected 116.6 < 105`） | attempt 2 通过 |
| 1.3.24 – 1.3.28 | success ×5 | 连续一次通过（修复后第 1–5 次） |
| 1.3.29 | success | 一次通过（修复后第 6 次） |
| **1.3.30** | **success**（run `37608194505`） | 一次通过（修复后第 7 次） |

十三次采样：10 次 attempt 1 通过、3 次抖动（116.7 / 116.7 / 116.6，上限 105），三次抖动全部在帧预算修复（`874dbad`）之前。修复后连续 **7/7** 通过；参照系仍为修复前 3/6 且最长连续 2 次。样本在持续增长，但本收据继续只记录事实与参照，不宣布"已修复"结论。

## 七处白名单丢点：完整清单与堵法

v1.3.29 生成的多面关系（facets）与势力立场（factionEdges）在保存链路上共有**七处丢点**，本轮全部堵上。清单如下（这是对用户"确保不再出其他问题"要求的直接回应）。

| # | 数据 | 丢点位置 | 本轮堵法 |
| --- | --- | --- | --- |
| 1 | factionEdges | `characters` 表**没有对应列** | 加列 + 旧库自动迁移 |
| 2 | factionEdges | 提交入口的**逐字段白名单**不认识它 | 白名单纳入 |
| 3 | factionEdges | 重新生成时的**合并规则**不采纳 | 合并规则保留已有立场（重新生成不带时不抹掉） |
| 4 | factionEdges | **幂等回放**路径丢失 | 回放路径纳入 |
| 5 | facets | 关系规范化函数的白名单**剥掉** facets | 规范化纳入 facets（非法维度条目丢弃而非整批拒绝） |
| 6 | facets | **渲染层手工保存**的逐字段投射 | 投射同步补上 |
| 7 | facets | **renderer card ↔ entry 双向**投射 | 双向补齐；并做排序稳定化，避免顺序抖动影响幂等 |

配套的用户可见变更：**角色卡新增"势力立场"区块**（每行"势力 — 立场"，可增删改，保存往返保真）；势力不进关系图节点（它不是角色）。

### 两层编译期穷尽钉子（防再犯）

本轮五处丢点里有四处是**同一种模式**——逐字段白名单投射（写侧新增字段而投射没跟进）。为此加了两层"编译期字段穷尽钉子"：

- **roster entry 层**：给角色名单条目接口装穷尽检查；
- **relationship 层**：给关系接口装穷尽检查。

效果是：将来给这两个接口加任何新字段、而写侧没跟进时，**在编译时就会报错**，而不是等用户发现数据消失。这把"记得改四处"从人的自觉变成了机械保证——也是本收据把清单写得这么细的原因：清单是这次的账，钉子防的是下一次。

## 验证流程：mtime 冻结校验（第二次落地）

- 发布侧记录：本轮 mtime 冻结校验 **5 个文件零漂移**。
- 本机复核（本收据作者独立做的同类校验）：对 5 个关键文件——`package.json`、`.release/release-profile.json`、`scripts/verify-github-release-assets.mjs`、`scripts/verify-github-update-release.mjs`、`.github/workflows/cross-platform-runtime-artifact-promotion.yml`——记录 `mtimeMs + size`，跑完两个验证脚本后再比对：**零漂移**。因此`更新链路回读`与资产回读的结论确实来自冻结快照。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37612675647**`，attempt 1、success（本机独立交叉核对：位于 promotion workflow 最近运行列表首位，`head_sha` = `3560fa741d…`） |
| Release | `v1.3.30`（id `405679342`），非 draft、非 prerelease；`target_commitish` = `3560fa741d35c9d97455191812f6d13284516255`；发布时间 2026-10-07T11:20:36Z |
| Release body | 由 CHANGELOG 的 1.3.30 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.30` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 取值改进（1.3.18 失败 → 1.3.19 起连续十二次一次通过）

1.3.18 的 promotion 首次运行因取值脚本取了列表第一个 artifact 而失败；自 1.3.19 起按 `qualified-*` 名精确筛选，直到本轮共十二次 attempt 1 success（37218555871 / 37397404495 / 37473937227 / 37565028245 / 37569607418 / 37573450129 / 37576477061 / 37579728622 / 37584341816 / 37590448119 / 37602285378 / 37612675647）。

可核验的边界：仓库内 `.release/scripts/github-desktop-promotion.mjs` 与 `.github/workflows/cross-platform-runtime-artifact-promotion.yml` **仍没有针对 artifact 筛选逻辑的提交**（最后改动仍是 `0e9fb74`）。十二次连续成功来自发布侧的取值方式，尚未固化进仓库代码。

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.30.exe` | 223,554,893 | `38b73ae8059a73ebf497a48ef66ce437806bf3991061626bda2d9b315d7a0922` |
| `inkweaver-setup-1.3.30.exe.blockmap` | 233,989 | `a879411c1d90b814bc8a15686ffa511cac4105e42041254b469ac43a749410cf` |
| `latest.yml` | 350 | `cae985e26e2ef4b0696eae20c0b58926b2fa8018a593b270991f5ffff19a05d8` |
| `inkweaver-mac-arm64-1.3.30-installer.dmg` | 302,049,405 | `c5a95ec7a8c6af55e453f0eb3d26e72b04719154f018877282a166711bc9c106` |
| `inkweaver-mac-arm64-1.3.30-installer.dmg.sha256` | 107 | `86b3375d8a39a0e0616c8b152a8234a6889388f5464b124aa2950c8e7d457399` |
| `inkweaver-mac-x64-1.3.30-installer.dmg` | 311,962,812 | `09734280e27a72513a93a3618215fe3669c0c35cfba79f57f61aab31f73242f0` |
| `inkweaver-mac-x64-1.3.30-installer.dmg.sha256` | 105 | `8ef32f7007aede8c77f6e64b8c1bb3af8db40ef91253a6540df7a2202ca3b276` |
| `inkweaver-linux-x64-1.3.30.AppImage` | 502,277,514 | `88f813b06a9f556f7fa23b94884ed4643af62d15a867ebc198dbf0510f71b7bf` |
| `inkweaver-linux-x64-1.3.30.AppImage.sha256` | 102 | `f94bfb10bc035e4b5fe7220207d91c12988843a50697b45935af434a90634ac2` |
| `inkweaver-linux-x64-1.3.30.deb` | 354,504,884 | `5060714bb4b95f219474ceaf52e2843dbca1333d08ff5c82275000b088b36606` |
| `inkweaver-linux-x64-1.3.30.deb.sha256` | 97 | `1bc351d106e1a9333d2515bff03c5bc9e793e96cbb21fba995d7ffdeb5d59fdb` |
| `inkweaver-linux-x64-1.3.30.rpm` | 298,328,841 | `c4d79264c7516aa6538ffb62b67d4f417bf01550f6e5e3fb448f14b7ad816b95` |
| `inkweaver-linux-x64-1.3.30.rpm.sha256` | 97 | `5863f9ad056ee888242c9f0ed22d4b5e80e044432f3fcd23369d6a54022df4e8` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**（stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.30`）。原因同前十三版：该脚本需要本机已验证的 Windows 构建产物作比对基准，而本机不构建官方安装包（`docs/adr/0006`）。本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（350 bytes，HTTP 200）SHA-256 `cae985e26e2ef4b0696eae20c0b58926b2fa8018a593b270991f5ffff19a05d8` 与 GitHub 资产 digest 一致；声明 `size: 223554893` 与远端 `inkweaver-setup-1.3.30.exe` 资产 size 一致；`version: 1.3.30`、`releaseDate: 2026-10-07T10:44:46.742Z`。

**未验证项（残留风险，与前十三版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 用户可见变更与验收

见`七处白名单丢点`与`两层编译期穷尽钉子`两节。以下为**实现侧 / 发布侧实测**数据（来源：实现侧与发布侧记录，非本收据作者所测）：

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | 386 文件 / 2,899 用例，**0 失败**（8 skipped） |
| 浏览器套件 | 54 文件 / 287 用例，全绿 |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |
| mtime 冻结校验 | 5 个文件跑前快照、跑后零漂移（本机复核同样零漂移） |

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.29` 命中两处：`CHANGELOG.md`（4 处）与 `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.29.md`（27 处），均为历史记录。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.29 残留。

## 已知限制

- **Linux x64 首跑失败的根因未定位**：归因为"环境类、与改动无关"是**推断而非实证**（错误日志截断），重跑通过不能证明成因已查清。若同类失败再次出现，应先取完整日志再归因。
- v1.3.29 的 backlog 两条（缺失清单续写、`factionEdges` UI）中，**`factionEdges` 的 UI 展示已在本轮完成**（角色卡"势力立场"区块）；**缺失清单续写仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描。
- 本机更新链路回读未通过，残留风险同上。
- promotion 的"按 `qualified-*` 名筛选"仍未固化进仓库脚本。
- macOS x64 runner：十三次采样中 3 次间歇失败（全在帧预算修复前），修复后 7/7；仍不宣布"已修复"结论。

## 1.3.30 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.30 小节）

- 修复角色架构生成的多面关系与势力立场保存后丢失（七处白名单丢点全部堵上）；势力立场在角色卡上可见、可编辑（每行"势力 — 立场"，可增删改、保存往返保真）。
- 两层编译期字段穷尽钉子：将来给角色名单条目或关系接口加新字段而写侧未跟进时，编译期即报错。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.30`（本机，exit 0，13 项资产契约）；
- `GET …/releases/tags/v1.3.30`、`GET …/git/ref/tags/v1.3.30` → `git/tags/1c29e08a…`（tag 与 peel）；
- `GET …/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（四个资格 run；Linux 的 attempt 1 失败 step 与 attempt 2 通过；macOS x64 历次 attempt）；
- `GET …/actions/workflows` → promotion workflow → `/runs`（本轮 promotion 独立交叉核对）；
- mtime 冻结校验：对 5 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对（本机零漂移）；
- `git show --stat 969ee07`（本轮 17 文件确不涉及打包/依赖）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
