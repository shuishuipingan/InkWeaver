# Provider 资格 Dry-run 收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：通过 dry-run 安全门；不等同于真实 provider 资格或发布门通过。  
命令：

```text
node scripts/real-provider-generation-qualification.mjs --dry-run
```

## 固定输入与预算

| 项目 | 结果 |
| --- | --- |
| schema | 2 |
| fixture | `three-blueprints-and-5000-character-draft-v1` |
| fixture SHA-256 | `ae6e8708c940348acfbf13e3074437a2a1857f8fcdddb007855e3d12bca7d54c` |
| provider 数 | 3 |
| 调用数 | 6 / 12 上限 |
| requested output tokens | 49,152 / 98,304 上限 |
| prompt UTF-8 bytes | 3,648 / 540,000 上限 |
| estimated input tokens | 15,936 / 564,576 上限 |
| 单次 lease | 每个 provider begins=1、closes=1 |
| 每个 provider usage | 2 calls、5,600 total tokens |

参与 adapter：DeepSeek `deepseek-v4-flash`、xAI `grok-4.5`、Gemini `gemini-2.5-flash-lite`。每个 adapter 都生成 3 个 blueprint、5,000 字符目标草稿、usage 汇总和 SHA-256 receipt checksum。

## 保护边界

- 没有读取 API key，不产生真实 provider 请求或账单；
- 只验证 adapter lease、预算、输入上界、structured output、usage 和 checksum 结构；
- 价格状态为 `partial-unavailable` / `unavailable`，不会伪造美元金额；
- 不执行 Electron 主进程 IPC lease，因此不能替代真实桌面工作流资格；
- 当前工作树包含测试生成的用户产物，所以 receipt 的 `sourceTreeState` 是 `dirty-dry-run`，不作为发布源码 SHA 证据。

真实 provider 运行仍需单独授权密钥、价格快照、模型/提示词版本、延迟与失败样例，并在最终冻结 SHA 上执行。
