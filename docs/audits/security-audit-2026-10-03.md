# 安全审计收据 — 2026-10-03（v1.3.14）

本文记录 v1.3.14 的完整安全审计：扫描范围与限制、五次 Mimosa 扫描的密封标识与覆盖率、
全部 32 条源码发现的逐条定性、依赖整改的前后对比，以及明确写出的"结论边界"。

审计工具：Mimosa 深度静态扫描（`static_only_no_runtime_execution`）+ 依赖公告审计（`pnpm audit`）。

## 1. 扫描记录

| 扫描 | scanId | seal | 范围 | 覆盖 |
| --- | --- | --- | --- | --- |
| ① 全项目（含构建产物） | `scan-2026-10-03T07-33-03.996Z-6e64cb4caf09` | `sha256:dafd6a2fa095fbecd7fe277a3522a2a49c90be5e377ba3be06f77203c4e41968` | 948 文件 | 471 条发现；五阶段 completed；整体 inconclusive |
| ② 全项目（复核） | `scan-2026-10-03T07-54-49.338Z-4075e77027e6` | `sha256:0d025c07ceef409e52e4ad9da4a2493270b86da6675c9db0be251b52028cd321` | 948 文件 | 同上 |
| ③ 全项目（依赖整改后） | `scan-2026-10-03T08-03-07.985Z-3f51678038d1` | `sha256:810ef14b73bf6c651f561129b0769459ac334ecdb0e85d57dbeb4c0b647831f7` | 948 文件 | 同上 |
| ④ **仅源码（本次结论依据）** | `scan-2026-10-03T11-53-13.380Z-5767ac854a02` | `sha256:430f7b51aa46333f101d0e37a6be91da5a5eae01d456569f4a0028b2e197e99d` | 942 文件 | **32 条发现**；五阶段 completed；整体 inconclusive |
| ⑤ 对照：仅 `electron/` | `scan-2026-10-03T11-54-33.362Z-0eff68e200cd` | `sha256:91b8bc3674f039cf83f09446d9ebc931da2c0ba46f08c490a157b886f62750c8` | 212 文件 | 34 条发现；同一缺口 |

扫描 ①-③ 包含 `dist/`、`dist-electron/`、`release/`、`.worktrees/` 等构建产物与额外工作树，
其中压缩后的第三方 bundle（`dist-electron/transformers.node-*.js`）单独贡献了 152 条启发式线索；
扫描 ④ 之前把构建产物、额外工作树、测试快照临时移出仓库，只扫描源码（还原见 §6）。

### 1.1 为什么工具给不出 "complete"（结构性上限，已用对照实验证明）

扫描 ④ 与 ⑤ 的 `coverage.json` 都是：

- `phases`: threatModel / findingDiscovery / validation / pathAnalysis / reporting 全部 `completed`；
- `gaps`: `["调用图部分不完整:部分调用为动态派发或超出分析规模,跨文件可达性可能不完整"]`；
- `completeness: partial`、`runStatus: inconclusive`、`verdictEffect: none`。

对照实验：把扫描范围缩小到 212 个文件 / 4,644 个函数（仅主进程源码），缺口原文不变。
因此该 `inconclusive` 来自分析器对 JS/TS **动态派发**的静态上限，与项目规模、构建产物无关；
在这个代码库上它不可能产出 "complete/safe" 判定。按工具契约，`partial` 覆盖不得被表述为整体安全结论。

## 2. 扫描 ④ 的 32 条发现：逐条定性

严重度：high 24 / medium 8；其中 28 条是工具标注的 "advisory（需人工确认）"，4 条是确定性规则。

### A. 环境变量 → 项目/数据路径（24 条，advisory）

落点：`electron/controllers/project-controller.ts`（:240/:245/:289/:293/:294/:472/:473/:476/:545/:724/:728/:731/:759/:764/:788/:823/:843）。
污点源是**烟测专用环境变量**：`AI_NOVEL_SMOKE_OPEN_PROJECT`、`AI_NOVEL_SMOKE_PROJECT_MARKER`、`AI_NOVEL_VELA_HOME`。

定性：**接受（记录在案）**。利用前提是攻击者已能控制本机进程的环境变量，即已具备同等或更强的本地能力；
`project:smoke-open-confirm` 在写标记前要求"请求路径 == 已打开项目路径"，写入内容是固定结构的烟测 JSON；
项目路径本身还会经 `sameCanonicalProjectRoot` / `canonicalProjectRoot`（`electron/services/project-access.ts`）做规范化比较。

### B. 发布烟测入口（4 条，advisory）

- `electron/main.ts:301` → `runReleaseOfficialHomepageSmoke` → `loadProbeDocument`（只读探测文档）；
- `electron/main.ts:361/:364`、`electron/release-vector-smoke-runner.ts:15` → 命令行 `--ai-novel-release-smoke=<token>` → 向量/皮肤烟测。

定性：**误报（有下游护栏）**。三条 CLI 入口都要求 token 同时出现在参数与环境变量中并匹配
`/^[a-f0-9]{32,128}$/i`（`electron/services/release-vector-smoke.ts:52-54`），
项目目录由 `createInternalProjectRoot()` 在系统临时目录内新建并校验边界（同文件 :69-84）。

### C. 确定性路径穿越规则（4 条，非 advisory，CWE-22）

| # | 位置 | 规则描述 | 定性 | 证据 |
| --- | --- | --- | --- | --- |
| 29 | `electron/services/import-source-identity-secret.ts:17` | 动态路径片段进入读写 | **误报** | 文件名是常量 `SECRET_FILE_NAME`，路径 = `app.getPath('userData')` + 常量，无外部片段 |
| 30 | `electron/services/project-snapshot-service.ts:47` | 同上 | **误报（护栏本身）** | 该行位于 `isWithin()`——专门实现根目录边界比较；调用方 `assertRestoreDestination()` 还额外拒绝"恢复到源项目内"。回归测试：`electron/services/__tests__/project-snapshot-service.test.ts:61` 断言 `/越界路径/` |
| 31 | `electron/services/runtime-log-writer.ts:192` | 同上 | **按设计（目的即任意目标）** | `exportBundle(destination)` 是"导出日志到用户选择目录"的功能，目标路径本就允许任意；代码拒绝导出到日志源目录内，并已补边界测试 `runtime-log-writer.test.ts`（`rejects exporting a log bundle into its own source directory`，本次审计新增，14 用例通过） |
| 32 | `electron/services/skin-service.ts:387` | 同上 | **误报 + 记录一处纵深建议** | 文件名 = `sha256(bytes)` 十六进制 + `png/jpg`（`assetFileFor()` / 调用点 :268-270），不含用户片段。纵深建议：`customSkin.revision` 来自持久化状态，若状态文件被篡改，读取侧会把 `../..` 拼进路径；影响为只读、且读到的内容仍要通过图像解码与尺寸上限（`MAX_SKIN_INPUT_BYTES`）校验，篡改者本来就已具备写 userData 的能力，故按"接受"处理并在此备案 |

**A–C 合计：0 条可被外部触发的越权读写。** 所有需要"利用"的路径都要求攻击者先具备本地进程控制或本地文件写权限。

## 3. 依赖侧：审计与整改（随 1.3.14 发布）

`pnpm audit` 整改前后：critical 4→3、high 68→53、moderate 46→19、low 8→2。

已整改（随包分发）：`dompurify` 3.4.16、`tar` 7.5.22、`js-yaml` 4.3.2（限 4.x）、
`builder-util-runtime` 9.7.0、Electron 41.2.0→41.10.7。整改设置固定在 `pnpm-workspace.yaml` 的 `overrides`。

记录为"不处理/随上游"：`sharp@0.34.1` 的 libvips 公告只在 `@huggingface/transformers` 的图像能力路径上
（本应用向量检索不经过），且上游依赖范围尚未放开到 0.35；其余公告只落在开发工具链
（`vitest`、`@vitest/browser`、`electron-builder`、`postcss`、`@xmldom/xmldom`、`glob`、`vite` 等），不随应用分发。

Mimosa 自带的离线公告库在五次扫描中都固定返回"2 个包 / 5 条公告"，不随我们的整改变化；
依赖侧的权威结论以 `pnpm audit` 为准。

## 4. 运行时侧证据（与静态结论相互独立）

- 打包后的 Windows 应用启动：主窗口正常、无错误对话框、`所有 Controller 已注册完成`、运行日志 20 分钟内 0 条 error；
- 打包后真实推理：bge-small-zh-v1.5 走 DirectML 返回 2×512 维、L2 范数 1.0000；
- 发布门禁：ONNX Runtime 原生绑定 / DirectML 运行时 / 非目标平台二进制缺失 / 打包后真实加载 onnxruntime；
- 四平台云端资格构建（Windows、Linux x64、macOS arm64、macOS x64）在发布提交上全部通过。

## 5. 结论

1. **结论边界**：Mimosa 对本仓库的整体判定上限是 `inconclusive`（动态派发导致的调用图缺口，已用 212 文件对照扫描证明与规模无关）。本文**不声明"项目无漏洞"或"项目安全"**。
2. **已完成的完整结论**：扫描 ④ 的 32 条源码发现已 100% 定性——24 条环境变量链（接受并记录）、4 条发布烟测入口（下游 token/边界护栏，误报）、4 条确定性路径规则（2 条常量/护栏误报、1 条按设计、1 条误报并备案纵深建议）；无一条可被未持有本地权限的外部攻击者触发。
3. **依赖侧**：随包分发的 5 个组件已完成公告整改；剩余公告限于开发工具链与上游范围，已逐条备案。
4. **可复核性**：扫描产物位于 `~/.mimosa/security-scans/<project-id>/<scanId>/`，seal 为三份语义文档
   （`scan-manifest.json`、`findings.json`、`coverage.json`）的 SHA-256；seal 只能检测本地产物被改动，
   不是数字签名，也不构成运行时证明。
5. **未做的部分**：没有动态/运行时渗透测试，没有第三方代码审计，没有对 Chromium/Electron 二进制本身的分析。

## 6. 扫描范围与还原

扫描 ④ 前临时移出（同盘移动，扫描后已全部还原，`git status` 为空）：`dist/`、`dist-electron/`、
`release/`、`.worktrees/`、`.runtime/`、`.superpowers/`、`.vitest-attachments/`、
`plugins/inkweaver-dsh/.runtime/`、`.snapshot-test-*`（30 个测试快照）、`output/`、
`.dsh-upgrade-inspect/`、`.playwright-cli/`、`.qualification-git-shim/`。
因此扫描 ④ 覆盖的是**源码树**（942 文件，`node_modules` 未被纳入解析），不含构建产物。
