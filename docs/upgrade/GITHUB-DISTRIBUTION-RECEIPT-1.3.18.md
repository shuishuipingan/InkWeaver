# 1.3.18 GitHub 分发核验收据

核验日期：2026-10-05（Asia/Hong_Kong；Release 发布于 2026-10-04T15:58:41Z，本机核验时刻 2026-10-05T00:01 HKT）

这是 1.3.18 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。本文件中的远端字段、资产清单与 Actions 运行结论由本机直接回读 GitHub API 得到（`回读方法`一节可复现）；`pnpm run verify:github-update-release` 的本地复跑结果如实记录在`更新链路回读`一节。口径与 1.3.16/1.3.17 两版一致，并额外记录本轮的两处非顺利环节（Windows 资格重跑、promotion 首次失败）。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `eb8a5bd37465ff12656a9d279dcce1437510415a` |
| 提交 | `049ffcb fix(embedding): register model specs on the engine that actually runs inference` + `eb8a5bd chore(release): prepare v1.3.18` |
| tag | `v1.3.18`（annotated）；tag 对象 `2e60983b84ff469e89e449489678962c0833e7b0`（type=tag，tagger `shuishuipingan`，2026-10-04T15:10:21Z），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.18` |
| 版本一致性门禁 | `scripts/__tests__/release-version.test.ts` 6/6 通过（task-25 本机执行）：版本真值、13 项资产契约、quickstart/CHANGELOG 当版资产名、README 文案边界 |
| 类型检查 | `pnpm run typecheck`（tsc --noEmit）在 task-25 冻结前本机 exit 0 |
| 完整本地门禁 | 未由本机复跑，本收据不复制其结论 |

## 平台资格（全部绑定 SHA `eb8a5bd3…`）

四个平台的最终结果全部 success，其中 Windows **attempt 2** 才通过。

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37212015347`，**attempt 2** | `qualified-windows` = `11307259132` | success（attempt 1 失败后重跑，见下） |
| macOS arm64 | run `37212019521`，attempt 1 | `qualified-macos-arm64` = `11306654370` | success |
| macOS x64 | run `37212022887`，attempt 1 | `qualified-macos-x64` = `11307401133` | success |
| Linux x64 | run `37212026408`，attempt 1 | `qualified-linux-x64` = `11307446444` | success |

**Windows 重跑说明（如实记录，不省略）**：attempt 1 失败在 `Run complete Windows release gate`（job `package-and-qualify`）——崩溃点是 `smoke:win-v025-upgrade` 的进程句柄保留失败（`could not retain a process handle for job-contained PID 4508`），属 Windows runner 的进程监控时序抖动，与本次改动无关：该 gate 在 1.3.17 已通过过，且同类 flaky 在本地出现过并被 HEAD 纯净态对照证明。本机回读 Actions API 确认：attempt 1 结论为 `failure`、attempt 2 结论为 `success`，两次的 `head_sha` 均为 `eb8a5bd374`（同一冻结提交，重跑未换代码）。

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion（首次，失败） | run `37214225255`，`failure`；失败 job `plan-and-verify` 的 step `Verify all required platform artifacts without rebuilding`，后续 `publish` job 被跳过。原因：Windows 重跑后同一 run 下同时存在两个 artifact（`windows-cloud-build-diagnostics` 与 `qualified-windows`），发布侧的取值脚本取了列表中的第一个，遂报 `qualification artifact name mismatch` |
| Promotion（修正后，成功） | run `37214508284`，success；修正方式是显式传入 `qualified-windows` 的 artifactId `11307259132`。**这是发布脚本的取值缺陷（应按 artifact 名筛选，而非按列表顺序取第一个），不是产品缺陷**；本收据不隐藏该次失败 |
| Release | `v1.3.18`（id `403093398`），非 draft、非 prerelease；`target_commitish` = `eb8a5bd37465ff12656a9d279dcce1437510415a`；发布时间 2026-10-04T15:58:41Z |
| Release body | 由 CHANGELOG 的 1.3.18 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项，与 `.release/release-profile.json` 契约逐名一致；`node scripts/verify-github-release-assets.mjs --version 1.3.18` → `{ ok: true, missing: [], invalid: [] }`（本机执行，exit 0） |
| Signing | 按 `.release/release-profile.json` 的 `signingPolicy = allow-unsigned-with-disclosure`：Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 承载首次打开的系统提示披露 |

### 13 项资产（本机回读 GitHub API 的 size 与 digest）

| 资产 | bytes | GitHub digest (sha256) |
| --- | --- | --- |
| `inkweaver-setup-1.3.18.exe` | 223,542,091 | `bffea5c365aa476c708beffe74f8634685584c15913299d56644601d5c113ea4` |
| `inkweaver-setup-1.3.18.exe.blockmap` | 232,241 | `b9ec26905fe21578f9cd026de9eff5e231c796c74e3c47f2ea8ea358105f8c11` |
| `latest.yml` | 350 | `a5c4f3efa58697d445b5f76acc68dd6a250784fd62a03e98ceb82b9cf78f17d8` |
| `inkweaver-mac-arm64-1.3.18-installer.dmg` | 302,019,886 | `d47165d939a4d067805135d05f99b2544620256b69e6020c471060c48b5bc6ba` |
| `inkweaver-mac-arm64-1.3.18-installer.dmg.sha256` | 107 | `b58e211a2988a02fa34f91578efb2b7d6155ff9995ac702431ce6fff7937c4a1` |
| `inkweaver-mac-x64-1.3.18-installer.dmg` | 311,880,898 | `d0e0fe721e1380d9a3cf61f1fb409bfb04c193c665b5beb7ba490c047932c69e` |
| `inkweaver-mac-x64-1.3.18-installer.dmg.sha256` | 105 | `3f4a7c8f6c1701595fe302ffcd2ce3cb16417d41c3f71a491429070a3356ca71` |
| `inkweaver-linux-x64-1.3.18.AppImage` | 502,247,213 | `5af68a51f8c0f5f3baa6b4daedba8ca2a13f6756dce0288c912d401ef65ff0d0` |
| `inkweaver-linux-x64-1.3.18.AppImage.sha256` | 102 | `cace1716d1fe16992f1b63de843c1814409299d48ab01e25c989a05541434a06` |
| `inkweaver-linux-x64-1.3.18.deb` | 354,469,684 | `c3be6ed07dab60049141671828542ffd9f6720931340ed0cc472209a8de4d8d7` |
| `inkweaver-linux-x64-1.3.18.deb.sha256` | 97 | `214bd6af4430e24dd5a53b4d38f1c7967638aab7cfb7f778794f2c24cd93b3d9` |
| `inkweaver-linux-x64-1.3.18.rpm` | 298,279,969 | `33c6b429ee25e2995ed63935e6f1cf00e81509df1d8ef791bfec4af83535f2bf` |
| `inkweaver-linux-x64-1.3.18.rpm.sha256` | 97 | `7d1a416ab1ea61b8c72b54e3c21dbec82217be85a35865a7bc55b915c07a36fc` |

## 更新链路回读

命令：`pnpm run verify:github-update-release` → **exit 1**

- stdout：`[ELIFECYCLE] Command failed with exit code 1.`
- stderr：`Release directory does not exist: D:\Game APP\AI-Novel-Writer\release\1.3.18`
- 原因：该脚本以本机已验证的 Windows 构建产物（安装包 / `latest.yml` / blockmap）为基准，与远端资产做 size + SHA-256 + `latest.yml` 逐字节比对；本机从未构建 1.3.18 Windows 产物（`release/` 下仅有 0.9.2 / 1.3.10 / 1.3.13 / 1.3.14），且 `docs/adr/0006` 规定官方安装包只能由 GitHub Actions 构建、本机不得构建或上传。失败点是"本地产物缺失"，脚本未进入网络比对阶段。与 1.3.16、1.3.17 两次完全同因。

代偿回读（本机执行，结果如下）：

- 下载远端 `latest.yml`（350 bytes，HTTP 200），其 SHA-256 `a5c4f3efa58697d445b5f76acc68dd6a250784fd62a03e98ceb82b9cf78f17d8` 与 GitHub 资产 digest 完全一致；
- 解析 `latest.yml`：`version: 1.3.18`、`path/url: inkweaver-setup-1.3.18.exe`、`size: 223542091`、`sha512` 为 88 字符 base64、`releaseDate: 2026-10-04T15:38:43.369Z`；
- 其声明的 `size` 与远端 `inkweaver-setup-1.3.18.exe` 资产 size（223,542,091）数值一致。

**未验证项（残留风险，与前两版相同）**：安装包的 SHA-512 未在本机重算（需下载 223 MB），因此"`latest.yml` 的 `sha512` 与远端安装包字节内容一致"这一点**未经本收据独立复验**；该比对目前在 `.github/workflows/windows-in-app-update-e2e.yml`（`scripts/windows-in-app-update-e2e.mjs` 对正式 Release 资产做 size/sha512 比对）中执行，其结果不属于本收据的记录范围。

## 用户可见变更与验收

本轮实际修复的是本地向量模型"第一次真正走到推理引擎"时暴露的两个缺陷（档位未在推理单例上登记；回填一次性投喂整库文本）。

发布侧在**真实 Electron 主进程 + 生产构建产物**上的端到端实测数据（来源：发布侧实测，非本收据作者所测）：

| 验收项 | 实测结果 |
| --- | --- |
| 单条向量 | 512 维、归一化通过 |
| 批量 40 条 | 149 ms |
| 顺序校验 | 通过（同文本余弦 0.995，异文本 0.816） |

上表用于说明修复后推理链路可用；它不构成对文学质量、检索精度或第三方 provider 行为的结论。

## 遗留引用核对（只读检查，未改动）

全仓 `1\.3\.17` 命中三处，均为历史或说明性引用：

- `CHANGELOG.md`：1.3.17 小节标题与 Linux 资产名（4 处）；
- `docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT-1.3.17.md`：1.3.17 历史收据（30 处）；
- `electron/__tests__/vector-store-cold-start-rebuild.test.ts:25`：测试文件头注释中的历史说明（"1.3.17 修好了「守卫放行」"），属正当引用。

`README.md` / `README_en.md` / `README_zh.md` / `docs/quickstart/README.md` 无 1.3.17 残留。

## 已知限制

- DSH 插件沿用 `1.2.0`，不随本轮发布；插件 tarball 仍挂在历史 Release（`docs/upgrade/GITHUB-DISTRIBUTION-RECEIPT.md:34`）。
- macOS 资产不参与应用内更新（`docs/adr/0006:5`）；应用内更新链路只覆盖 Windows。
- 本轮未执行新的静态安全扫描；1.3.17 收据中的扫描边界说明不适用于 1.3.18。
- 本机更新链路回读未通过，残留风险见`更新链路回读`。
- 发布侧的 promotion 取值脚本按"列表第一个 artifact"取件，本轮暴露出在"同一 run 有多个 artifact"时会取错；修正仅通过显式传参完成，**脚本本身的按名筛选逻辑尚未修改**（截至本收据写作时）。

## 1.3.18 用户可见变更摘要

（摘自 CHANGELOG 的 1.3.18 小节）

- 修复本地向量模型首次真正生成向量时报"未知本地向量模型"：档位登记此前只发生在下载控制器的独立实例上，真正用于推理的引擎单例没有登记；现在推理与下载共用同一引擎实例，并消除两个实例互相覆盖 transformers.js 模块级缓存目录与下载源的隐患。
- 内置本地向量模型的向量生成改为分批执行（默认 16 条/批，可取消并记录进度），不再一次性把整个知识库交给推理。

## 回读方法（可复现）

- `node scripts/verify-github-release-assets.mjs --version 1.3.18`（本机，exit 0，13 项资产契约）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/releases/tags/v1.3.18`（tag / id / draft / prerelease / target_commitish / 资产 size+digest）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/git/ref/tags/v1.3.18` → `git/tags/2e60983b…`（annotated tag 对象与 peel 结果）；
- `GET https://api.github.com/repos/shuishuipingan/InkWeaver/actions/runs/{runId}` 与 `/attempts/1`、`/jobs`（四个资格 run 与两次 promotion run 的 attempt、conclusion、head_sha、失败 step）；
- `GET <latest.yml 的 browser_download_url>`（下载 350 bytes，重算 SHA-256 并与 GitHub digest 比对）；
- `pnpm run verify:github-update-release`（本机 exit 1，原因见`更新链路回读`）。
