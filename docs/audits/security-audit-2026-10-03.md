# 安全审计收据 — 2026-10-03（v1.3.14）

本文记录 v1.3.14 发布前的一次完整静态安全审计：扫描来源、结论边界、逐类处置与遗留风险。
审计工具：Mimosa 深度静态扫描（`static_only_no_runtime_execution`）+ 依赖公告审计（`pnpm audit`）。

## 1. 扫描记录

| 扫描 | scanId | seal | 结论 |
| --- | --- | --- | --- |
| 全量静态扫描（整改前） | `scan-2026-10-03T07-33-03.996Z-6e64cb4caf09` | `sha256:dafd6a2fa095fbecd7fe277a3522a2a49c90be5e377ba3be06f77203c4e41968` | 471 条（high 215 / medium 256），runStatus = inconclusive |
| 全量静态扫描（复核） | `scan-2026-10-03T07-54-49.338Z-4075e77027e6` | `sha256:0d025c07ceef409e52e4ad9da4a2493270b86da6675c9db0be251b52028cd321` | 471 条，runStatus = inconclusive |
| 全量静态扫描（整改后） | `scan-2026-10-03T08-03-07.985Z-3f51678038d1` | `sha256:810ef14b73bf6c651f561129b0769459ac334ecdb0e85d57dbeb4c0b647831f7` | 471 条（静态集合不变，见下） |

扫描自报的覆盖缺口：`调用图部分不完整:部分调用为动态派发或超出分析规模,跨文件可达性可能不完整`。
因此三次扫描的 runStatus 都是 **inconclusive**、`verdictEffect: none`：它们是待人工确认的静态线索，
不是可执行结论，也不代表"项目安全"。本文不把扫描通过当作安全声明。

## 2. 471 条的构成与逐类处置

| 类别 | 数量 | 处置 |
| --- | --- | --- |
| `dist-electron/transformers.node-*.js` 内的第三方打包产物（minified） | 152 high | 上游库（HuggingFace 运行时）被打进主进程 bundle；线索来自符号名启发式（`ssrf`、`mongo-sort-injection` 等），项目本身不使用 MongoDB，也未在推理路径拼接网络目标。不修改上游代码；随上游版本升级消化。 |
| `dist-electron/*` 其它构建产物 | 42 | 与源码 1:1 对应的编译结果；按源码处置（下表）。 |
| 源码：`electron/controllers/project-controller.ts` 等（环境变量 → 路径/进程） | 31 | 污点源是烟测专用环境变量（`AI_NOVEL_SMOKE_OPEN_PROJECT`、`AI_NOVEL_SMOKE_PROJECT_MARKER`、`AI_NOVEL_VELA_HOME`）。这些变量决定打开哪个项目、把标记写到哪、配置目录在哪。**判定：接受现状并记录**——利用前提是攻击者已经能控制本机进程的环境变量，即已经具备同等或更强的本地能力；且写入内容是固定结构的烟测 JSON。 |
| `dist-electron/main.js` 的 `spawn`（不可信程序选择） | 4 | 源码层两处：`electron/mcp/mcp-manager.ts` 以**用户自己配置的** MCP 服务器命令启动子进程（`shell: false`，等同用户自行编辑配置）；`electron/security/windows-safe-file-system.ts` 在 Windows 用固定字面量 `powershell.exe`、其它平台用应用内置 helper 路径。两者都不由环境变量决定可执行文件。 |
| MongoDB 动态排序字段注入 | 其余 medium | 项目不依赖 MongoDB，为启发式误报（命中 LanceDB/数组排序调用）。 |

Mimosa 的离线公告数据集在三次扫描中都报告"2 个包 / 5 条公告"，不随我们的整改变化；
依赖侧的权威结论以 `pnpm audit` 为准（下一节）。

## 3. 依赖审计与整改（随 1.3.14 发布）

`pnpm audit` 整改前后对比：

| 指标 | 整改前 | 整改后 |
| --- | --- | --- |
| critical | 4 | 3 |
| high | 68 | 53 |
| moderate | 46 | 19 |
| low | 8 | 2 |

随包分发、本次已整改：

- `dompurify`（经 `monaco-editor` 进入渲染进程）→ **3.4.16**，修复多篇 XSS 公告；
- `tar`（经 `onnxruntime-node` 分发）→ **7.5.22**，修复解压 DoS；
- `js-yaml` → **4.3.2**（在 4.x 内，避免跨大版本）修复二次复杂度 DoS；
- `builder-util-runtime`（electron-updater）→ **9.7.0**，修复跨源跳转泄露凭据；
- Electron 运行时 **41.2.0 → 41.10.7**（同一大版本补丁线）。

记录为"不处理/随上游"：

- `sharp@0.34.1` 的 libvips 公告只落在 `@huggingface/transformers` 的图像能力上，本应用的向量检索不经过该路径，且上游声明的依赖范围尚未放开到 0.35；
- 其余公告只落在开发工具链（`vitest`、`@vitest/browser`、`electron-builder`、`postcss`、`@xmldom/xmldom`、`glob`、`vite` 等），不随应用分发。

## 4. 本次审计的产出

- 依赖整改：见上表，并在 `pnpm-workspace.yaml` 的 `overrides` 中固定；
- 打包门禁修复：安装包冒烟在卸载前清理安装目录中残留的产品进程（见 `scripts/smoke-win-installer.ps1` 的 `Stop-AiNovelInstalledProcesses`），修复卸载后置条件间歇失败；
- 发布门禁新增校验：ONNX Runtime 原生绑定、DirectML 运行时、非目标平台二进制残留、打包后可执行文件真实加载 onnxruntime。

## 5. 遗留风险与边界

1. 三次静态扫描都是 inconclusive，且调用图不完整；本文不声明"无漏洞"或"项目安全"。
2. 环境变量驱动的烟测钩子按设计保留（见第 2 节判定），需要在威胁模型上承认"能控制进程环境 = 已具备本地能力"。
3. `sharp`、`dist-electron` 中第三方 bundle 的公告随上游版本消化。
4. 本审计是静态审计 + 依赖公告审计，不含渗透测试、运行时动态分析或第三方代码审计。
