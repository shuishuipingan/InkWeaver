# 1.3.15 GitHub 分发核验收据

核验日期：2026-10-03（Asia/Hong_Kong）

这是 1.3.15 正式 Release 的远端回读记录：源码、tag、四个平台资格运行、promotion 发布与资产回读绑定同一个不可变提交。npm 与 DSH 插件不在本轮发布范围（插件沿用 v1.2.0）。

## 源码与 tag 绑定

| 项目 | 证据 |
| --- | --- |
| 仓库 | `shuishuipingan/InkWeaver` |
| 功能源码 SHA | `626f10df9748e0a7ff36305a133b4ed163437544` |
| 提交 | `feat(agent): analyze change impact and apply coordinated multi-entity edits` + `chore(release): prepare v1.3.15` |
| tag | `v1.3.15`（annotated），peel 后解析到上述 SHA |
| 桌面版本 | `package.json` = `1.3.15` |
| 本地门禁 | 生产构建 `tsc && vite build` 通过；348 个测试文件 / 2587 个用例通过（8 跳过）；`tsc --noEmit`、eslint、i18n 覆盖率、运行日志覆盖率检查通过 |

## 平台资格（全部绑定 SHA `626f10d`）

| 平台 | 运行 | artifact | 结果 |
| --- | --- | --- | --- |
| Windows x64 | run `37132444815`，attempt 1 | `qualified-windows` = `11277089746`（223,791,681 bytes） | success |
| macOS arm64 | run `37132447650`，attempt 1 | `qualified-macos-arm64` = `11277307955`（302,037,719 bytes） | success |
| macOS x64 | run `37133174065`，attempt 1 | `qualified-macos-x64` = `11278325175`（311,894,492 bytes） | success（首次 run `37132450570` 因 RelationshipGraph 帧时间性能阈值在共享 runner 上抖动失败，未改代码，按 profile 的重试策略重新派发） |
| Linux x64 | run `37132453699`，attempt 1 | `qualified-linux-x64` = `11276759878`（1,155,004,565 bytes） | success |

## Promotion 与 Release 回读

| 项目 | 回读结果 |
| --- | --- |
| Promotion | run `37134185051`，success；由 `.release/scripts/github-desktop-promotion.mjs` 按 profile 校验四个限定的 run/attempt/artifact 后发布 |
| Release | `v1.3.15`，非 draft、非 prerelease、Latest；`targetCommitish` = `626f10df9748e0a7ff36305a133b4ed163437544`；发布时间 2026-10-03T15:46:09Z |
| Release body | 由 CHANGELOG 的 1.3.15 小节自动生成（含资产 SHA-256 清单与签名披露） |
| 资产 | 13 项完整；`node scripts/verify-github-release-assets.mjs --version 1.3.15` 返回 `ok: true`、`missing: []`、`invalid: []` |
| Signing | Windows 未签名；macOS 未代码签名、未公证；Linux 包未签名；Release body 已披露首次打开的系统提示 |

## 安全扫描边界（不作为安全结论）

同日运行一次静态深度扫描（`scan-2026-10-03T15-13-38.969Z-456acbbfb3b4`，seal `sha256:a4927dea…`）：228 条静态发现，0 条业务逻辑候选；扫描自身状态为 **inconclusive**（调用图不完整），边界为 `static_only_no_runtime_execution`、`verdictEffect: none`。发现全部落在打包产物（`dist-electron/*`）与既有 `electron/` 源码的启发式模式上，**没有一条指向本次新增的 `src/shared/change-*`、`src/shared/prose-metrics.ts`、`src/services/change-*` 或 `src/services/agent/tools/*`**。依赖公告的处置以 `docs/audits/security-audit-2026-10-03.md` 为准；本文件不构成新的安全结论。

## 1.3.15 用户可见变更摘要

- AI 写作助手新增联动修改：`analyze_change_impact` 依据当前项目状态算出改动牵涉的人物档案、人物状态、章节蓝图、知情边界、章节交接、线索、规划资料与定稿事实，并给出分级与可写性；`propose_change_plan` 一次提交整条改动链，确认卡片逐项展示当前值与建议值，批准后按依赖顺序写入，已定稿内容、新角色与名单版本校验保持原有边界。
- 修复“生成会话已用尽请求 Token 预算”：请求完成后按 provider 回报用量结算，未使用的预留立即释放；解析后的会话预算收敛到应用级安全上限。
- 助手工具调用可自我修复、支持并行只读调用；取消生成不再显示为失败；新增 `/change-propagation` 与 `/prose-polish` 技能与确定性文风测量工具。
