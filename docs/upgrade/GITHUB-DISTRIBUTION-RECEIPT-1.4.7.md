# 1.4.7 GitHub 分发核验收据

核验日期：2026-10-08（Asia/Hong_Kong；Release 发布于 2026-10-08T14:31:40Z，本机核验时刻 2026-10-08T22:33 HKT）

这是 1.4.7 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（见「回读方法」）。本版收据含两处需单列的内容：**Linux x64 的首跑失败与重跑**（如实记录，归因为推断而非实证）、以及**本版包含的一条内部加固**（无用户可见变化、CHANGELOG 未写）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `cb1c2ab27c45468fe5cdd780a00ba1cef60a01ae` |
| 提交 | `8daa25e fix(preflight): give each continuity finding its own identity`（3 files, +142/−6） + `cb1c2ab chore(release): prepare v1.4.7`（7 files）；另含 `5329059 refactor(preflight): make the exemption parameter required`（见「本版包含的内部加固」） |
| tag | `v1.4.7`（annotated）；tag 对象 `ae38e13568bfa4a0cb06ee7bc492a0746972ded4`（tagger `shuishuipingan`，2026-10-08T13:45:53Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.4.7` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-138 本机执行） |
| 类型检查 | `pnpm run typecheck` 在 task-138 冻结前本机 exit 0 |

## 平台资格（全部绑定 SHA `cb1c2ab2…`）

| 平台 | 运行 | 结果 |
| --- | --- | --- |
| Windows x64 | run `37786970066`，attempt 1 | success |
| macOS arm64 | run `37786981330`，attempt 1 | success |
| macOS x64 | run `37786989954`，attempt 1 | success（修复后 16/16） |
| Linux x64 | run `37786998204`，**attempt 2** | success（attempt 1 失败后重跑，见下） |

四个 run 的 `head_sha` 均为 `cb1c2ab27c…`（重跑未换代码）。

## Linux x64 首跑失败与重跑（如实记录，含归因的置信度）

**事实（本机回读 Actions API 确认）**：run `37786998204` 的 attempt 1 结论为 `failure`，失败 step 是 job `package-and-qualify` 的 **`Install and launch packages on Ubuntu, Debian, and Fedora`**；attempt 2 结论为 `success`、无失败 step；两次 `head_sha` 都是 `cb1c2ab27c`（未改代码）。

**发布侧记录的失败位置与形态**：失败发生在 `linux-package-smoke` 的 **`debian:13-slim` 容器**，错误串为 `Linux package smoke container failed for debian:13-slim: asar.unpacked/node_modules/onnxruntime-node/script…`（本地向量模型的原生依赖路径，串被截断）。

**与历史的关系**：**与 1.3.30 那次完全同型**——同样是 `linux-package-smoke` 的 debian:13-slim 容器、同样指向 `onnxruntime-node` 的原生依赖路径、同样是重跑即过。

**本轮改动与该路径的关系**：v1.4.7 的 3 个改动文件全部在**预检 / 一致性代码与其测试**（`src/shared/consistency-preflight.ts` 及其测试、browser 用例），**零涉及打包配置与依赖**。

**归因的置信度（必须写明）**：把这次失败归为「环境类、与本轮改动无关」的推理依据是——失败落在容器安装/启动冒烟步骤、错误指向原生依赖路径、本轮零涉及该路径；**但错误串被截断，我们没有深挖根因，因此该归因是推断而非实证**；重跑一次即过只能说明它**不是稳定复现**的失败，不能证明成因已定位。**处置建议：同类再现时先取完整日志再归因**（这条建议与 1.3.30 收据中的一致）。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run **`37792490765`**，attempt 1、success；本机回读 `/jobs` 确认两个 job（`plan-and-verify`、`publish`）均 success |
| Release | `v1.4.7`（id `406925376`），非 draft、非 prerelease；`target_commitish` = `cb1c2ab27c45468fe5cdd780a00ba1cef60a01ae`；发布时间 2026-10-08T14:31:40Z |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.4.7` 返回 ok: true、missing: []、invalid: []（本机执行，exit 0） |
| Signing | 按 profile 的 `allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.4.7.exe` | 223,565,016 | `1776ad5513b6cc52e60f183952b866155fd30ae32e1214ca1cb0cb07cc65ff41` |
| `inkweaver-setup-1.4.7.exe.blockmap` | 234,124 | `e69dec3ec0b354ea580b43548602c739344137b1a89ca6e87cf151f2c8f9f748` |
| `latest.yml` | 347 | `8dae937adde05522011312568bdb57d18b19ccf71083f5b437ccdde639b40198` |
| `inkweaver-mac-arm64-1.4.7-installer.dmg` | 302,050,586 | `d6b2ac54cb2c94f12d37944766095ac428b48aa7b20f25f9959139661e19ea3a` |
| `inkweaver-mac-arm64-1.4.7-installer.dmg.sha256` | 106 | `25234fd13d07cd40eae701f195829c261a6c925bd1ac14cecbcceced1d1c55e0` |
| `inkweaver-mac-x64-1.4.7-installer.dmg` | 311,963,184 | `8ad1f6de6a26ba297a4a6565c5ca9d2acecc534811564f69a72bad16fba5b7e4` |
| `inkweaver-mac-x64-1.4.7-installer.dmg.sha256` | 104 | `bc375e62d44c917ad1f39f6f2ab02c6a7998267373398a4d2d036e36aa4069da` |
| `inkweaver-linux-x64-1.4.7.AppImage` | 502,280,891 | `02d0d0f9bb3a56decea164af0c49eab026d7c296d9ea6f9ee533992b27a2797c` |
| `inkweaver-linux-x64-1.4.7.AppImage.sha256` | 101 | `9b70e8b5082d1832f4b622ecacbef2fabbe0cb14651793725f5dad38e91203d3` |
| `inkweaver-linux-x64-1.4.7.deb` | 354,513,380 | `8f58021f51542ec296dea84176d4e58b2c4ee745276e706fd35e7986f7807544` |
| `inkweaver-linux-x64-1.4.7.deb.sha256` | 96 | `8c16dc0bd3b6aca148f4721c83c6469a9b112d8f4524a27ad238ddf3ab13606e` |
| `inkweaver-linux-x64-1.4.7.rpm` | 298,300,141 | `b356c1e6833cb5efad85246fd4db340a1175ef6835bb92e710c4b14f1c9d5f75` |
| `inkweaver-linux-x64-1.4.7.rpm.sha256` | 96 | `a3e46b9a9b0c2c797d31a1059a3e93606d38f1fcd49eb55a6b349a1fb77cf1c4` |

## 用户可见变更：一致性提示的身份带上章节

**用户现场**：写稿确认框里出现 5 条**一模一样**的「[信息不足] 缺少当前状态证据 · 蓝图安排"赵阔"出场…」（其中 4 条标「来源：第3章」、1 条标「来源：第4章」），但按数据算**只应该有 2 条**（赵阔分别在第 3、4 章出场）；而且**每保存一次安排，重复就多一截**。

**根因链（四步）**：

| 步 | 环节 |
| --- | --- |
| ① | 提示身份**不含章节**（`missing:state:<角色>`） |
| ② | 同一角色在不同章节的两条提示**标识完全相同** |
| ③ | 列表渲染要求每条有唯一标识；**重复标识下的渲染结果是未定义的**（本机读取源码确认，`consistency-preflight.ts:324` 的注释原文：「面板在重复 key 下的协调是未定义的——用户看到的就是『线索越积越多』」） |
| ④ | 因此表现为**只在反复刷新时累积**——初次显示是正确的，用户越是重新检查，列表越长 |

**两个连带现象**（同一根因）：同一角色的两个输入框互相串值；**为某一章保存的安排会连带把该角色在其它章节的提示一并静默掉**。

**修法（本机读取源码确认）**：

- 身份带章节：`stableFactKey: "missing:state:" + 章节号 + ":" + 角色`（`consistency-preflight.ts:330`），与代码里同类规则保持一致；
- 测试锁定：`consistency-preflight.test.ts:342/343` 断言同角色在第 3、4 章各自的键为 `missing:state:3:赵阔` 与 `missing:state:4:赵阔`；`:355-359` 断言"第 3 章的安排生效时，第 4 章的同角色提示**仍然出现**"（不再连带）。
- **旧格式继续生效、不改动用户数据**：`:326-327` 保留第二层过滤，注释写明「兼容改键之前保存的旧格式：`missing:state:<角色>` 视为覆盖该角色的**所有章节**（与今天行为一致）」——即老数据语义不变，不做迁移、不改写任何已有记录。

## 判别力：实测红绿（含机制细节）

| 变异 | 实测结果（发布侧所测） |
| --- | --- |
| 放宽到修前状态 | browser 用例跑出 React 警告 `Encountered two children with the same key, 'missing:state:赵阔'. Non-unique keys may cause children to be duplicated and/or omitted`，断言 `expected 12 to be 8` |

**机制细节也被证实**：修前**前两次断言（2 条、3 条）通过**，堆叠**只在 props 更新时发生**——与用户描述的"越用越多"完全吻合（初次显示正确、反复刷新才累积）。这解释了为什么这类缺陷在"打开一次就截图"的验证方式下看不见。

## 本版包含的内部加固（无用户可见变化、CHANGELOG 未写）

**`5329059 refactor(preflight): make the exemption parameter required`**（2 files, +8/−6）

**它在本版之内（可复现的佐证）**：本机执行 `git merge-base --is-ancestor 5329059 cb1c2ab` → **退出码 0**；`git log --oneline -3 cb1c2ab` 依次为 `cb1c2ab`（版本提交）→ `8daa25e`（本轮修复）→ `5329059`（本加固）。

**它的价值**：把该参数默认值去掉——`- exemptions: readonly ConsistencyExemption[] = [],` → `+ exemptions: readonly ConsistencyExemption[],`。默认值 `= []` 会把「漏传参数」从**编译错误**降级成**静默的不过滤**（调用方能编译、测试能跑，运行时只是行为悄悄降级）；改为必填后，漏传会直接报 `TS2554`（参数个数不匹配）。

**它是 1.4.6 收据里那句判断的落地**：1.4.6 收据在「本轮形状」一节写过「若该参数必填，这次缺陷在编写时就会被挡住」；本版把这句话变成了机械保证。两条改动的关系是：**8daa25e 修的是这次的实例，5329059 修的是让同类实例不能再静默通过**。

（本条无用户可见变化，因此 CHANGELOG 未写它；记在收据里是为了让"发布内容 = 冻结 SHA 内的全部改动"这件事对得上账。）

## macOS x64 runner 抖动：第 22 次采样（修复后 16/16）

历史与判读口径见此前收据（3 次抖动全部在帧预算修复 `874dbad` 之前；修复前通过率 3/6、最长连续 2 次）。本轮 attempt 1 通过 → **修复后 16/16**。仍只记录事实与参照，不宣布「已根治」。

## 更新链路回读

`pnpm run verify:github-update-release` → **exit 1**（stderr 为「Release directory does not exist: …release\1.4.7」，原因同前二十二版：本机不构建官方安装包，见 `docs/adr/0006`）；本节结论已通过 mtime 冻结校验（跑前跑后零漂移）。

代偿回读：远端 `latest.yml`（347 bytes，HTTP 200）SHA-256 `8dae937adde05522011312568bdb57d18b19ccf71083f5b437ccdde639b40198` 与 GitHub 资产 digest 一致；声明 `size: 223565016` 与远端安装包资产 size 一致；`releaseDate: 2026-10-08T13:57:34.703Z`。

**未验证项（残留风险）**：安装包 SHA-512 未在本机重算，该比对在 CI 的 `windows-in-app-update-e2e` 中执行。

## 验证流程：mtime 冻结校验（第十一次落地）

本机对 8 个关键文件取 `mtimeMs + size` 快照，跑完两个验证脚本后比对：**零漂移**。

## 用户可见变更与验收

| 验收项 | 结果 |
| --- | --- |
| 全量 node 套件 | **399 文件 / 2,986 用例，0 失败**（8 skipped） |
| 浏览器套件 | 55 文件 / **289** 用例全绿（比上一版 +1，即本轮新增的重复身份复现用例） |
| 三项门禁 | `typecheck` / `check:i18n` / `check:runtime-log-coverage`，exit 0 |

## 遗留引用核对（只读检查，未改动）

`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.4.6.md` 内含 1.4.6 引用 24 处（历史收据，应保留）；`CHANGELOG.md` 的 1.4.6 小节 4 处。`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.4.6 残留。

## 已知限制

- **Linux x64 首跑失败的根因未定位**：归因为「环境类、与改动无关」是**推断而非实证**（错误串截断、未深挖）；重跑通过只能说明非稳定复现。同类再现时应先取完整日志再归因（与 1.3.30 同型）。
- 旧格式安排（不含章节）的语义是「覆盖该角色的**所有章节**」——这是为不改动用户数据而保留的兼容行为；用户若想逐章区分，需要在新格式下重新确认。
- v1.3.30 的 backlog：缺失清单续写**仍未做**。
- DSH 插件沿用 `1.2.0`，不随本轮发布；macOS 资产不参与应用内更新（见 `docs/adr/0006:5`）。
- 本轮未执行新的静态安全扫描；本机更新链路回读未通过（原因见其小节）。
- `scripts/` 下 Windows 时序敏感用例本轮未复现，但未被治理。
- macOS x64：采样 22 次中 3 次间歇失败（全在帧预算修复前），修复后 16/16。

## 1.4.7 用户可见变更摘要

（摘自 CHANGELOG 的 1.4.7 小节）

- 修复：一致性提示在列表里越积越多（身份标识现在带章节），同角色不同章节的提示各自独立确认；已保存的旧格式安排继续生效，不改动任何已有数据。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.4.7`（本机，exit 0）；
- `GET …/releases/tags/v1.4.7`、`GET …/git/ref/tags/v1.4.7` → `git/tags/ae38e135…`；
- `GET …/actions/runs/{runId}` 与 `/attempts/{n}`、`/jobs`（三个 attempt-1 run；Linux 的 attempt 1 失败 step 与 attempt 2 通过；promotion `37792490765`）；
- `GET <latest.yml 的 browser_download_url>`（重算 SHA-256 与 digest 比对）；
- `src/shared/consistency-preflight.ts:324-330`（新身份格式、旧格式兼容注释、重复 key 未定义性的注释）；
- `src/shared/__tests__/consistency-preflight.test.ts:331-365`（同角色跨章独立身份与旧格式兼容断言）；
- `git merge-base --is-ancestor 5329059 cb1c2ab`（内部加固在本版内的佐证）；
- mtime 冻结校验：8 个关键文件取 `statSync().mtimeMs + size` 快照 → 跑验证脚本 → 再比对；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见「更新链路回读」）。
