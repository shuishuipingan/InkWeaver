# 24 对章节盲评包

开发线现在提供确定性的 reviewer packet 生成器。它只生成评阅输入和一份必须单独保管的映射，不生成或伪造评分结果。

## 生成

```text
node --experimental-strip-types scripts/build-quality-review-packet.mjs \
  --seed=inkweaver-1.1.0-review-v1 \
  --output-dir=.runtime/quality-review-packet
```

输出：

- `public-packet.json`：给评阅者的匿名包，只含 `BLIND-XXXXXXXX`、前章文本和后章文本；
- `evaluation-key.private.json`：评测负责人保管的映射，包含原始 fixture ID、类别和 expected signals，不应与公共评阅包同时交给评阅者。

生成器按 `seed + caseId` 的 SHA-256 排序，重复执行得到相同顺序；更换 seed 会改变顺序和 blind ID，但不会丢失 24 个样本。公共包不会输出 `kind` 或 `expectedSignals`，避免评阅者从文件直接猜到题型。

## 仍需人工完成

盲评包只是工程准备，不是质量结果。发布前仍需为开发前/开发后两组输出分别保存模型、参数、提示词版本、token 用量和样本 SHA；两名评阅者独立评分现场承接、时间地点视角、情绪延续、知情边界、必要复沓和延后兑现，并由负责人用私有 key 汇总偏好率、平均分变化、事实正确性和误报率。
