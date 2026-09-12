# 章节盲评结果模板

这份模板只定义记录格式，不包含任何预填分数。发布负责人已决定本轮不要求外部评阅；如果后续补做人工研究，评阅人必须使用同一份匿名 `public-packet.json`，不能看到 `evaluation-key.private.json`。没有人工结果时不应伪造 `eligible`，但它不阻塞本轮已豁免的发布范围。

## 运行元数据

| 字段 | 开发前基线 | 开发后结果 |
| --- | --- | --- |
| 源码 SHA |  |  |
| fixture SHA |  |  |
| packet seed fingerprint |  |  |
| 模型/版本 |  |  |
| 提示词版本 |  |  |
| 最大输出预算 |  |  |
| 实际输入/输出 token |  |  |
| 执行日期与时区 |  |  |

## 每个匿名 case 的评阅表

每位评阅者独立填写一份，不讨论版本标签。`preferred` 只能填写 `before`、`after` 或 `tie`；若输出失败，填写 `invalid` 并记录原因。

| blindId | 现场/动作承接 1–5 | 时间/地点/视角 1–5 | 情绪/选择延续 1–5 | 知情边界 1–5 | 必要复沓 1–5 | 延后兑现 1–5 | preferred | 原文理由 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `BLIND-________` |  |  |  |  |  |  |  |  |

复制上行 24 次；不要在公共结果文件中写入原始 fixture 类别。

## 汇总门槛

由评测负责人使用私有 key 汇总：

- 新版偏好率：`after / (before + after)`，目标至少 70%；
- 自然承接平均分变化：开发后减开发前，目标至少 +0.5/5；
- 事实正确性：不得下降；记录任何越界、遗漏和错误证据；
- 刻意转场/悬念误报率：目标不超过 10%；
- 两名评阅者分歧：逐 case 保留复核理由，不用单一总分掩盖分歧。

结果文件必须同时附上失败样例、token/延迟、模型波动说明和评阅者签名/日期。没有两名独立评阅者的完整表格时，质量门保持“未完成”。

工程汇总器：`scripts/quality-review-summary.ts` 的 `summarizeQualityReview(rows)` 会验证 reviewer/case 覆盖、重复行、1–5 分数和上述门槛，返回 `eligible` 与可审计的中间指标；它不会替评阅者填写分数。拿到真实 JSON rows 后可直接运行：

```text
node --experimental-strip-types scripts/summarize-quality-review.mjs \
  --input=review-results.json --strict
```

`--strict` 在 `eligible=false` 时返回退出码 2，便于把人工结果接入发布前门禁。
