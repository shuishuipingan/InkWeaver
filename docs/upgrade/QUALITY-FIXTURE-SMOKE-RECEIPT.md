# 1.1.0 固定质量样本 Smoke 收据

状态：自动化样本构造通过；不等同于章节盲评或真实 provider 长篇质量通过。  
执行日期：2026-09-12（Asia/Hong_Kong）  
源码树：`a67647fc4a516535858c8583b7dd6f0437647752`（开发线当前树）

## 命令与结果

```text
node node_modules/vitest/vitest.mjs run \
  scripts/__tests__/quality-fixtures.test.ts --maxWorkers=1
```

结果：1 test file、3 tests passed。

```text
node --experimental-strip-types -e "import('./scripts/quality-fixtures.ts').then(({buildLongFormQualityFixture,hashQualityFixture})=>console.log(hashQualityFixture(buildLongFormQualityFixture())))"
```

长篇 fixture SHA-256：`17195a8d07f4e1a40123ee2279a5593519cf501b3c4e04d3707cfef9fdfbd71f`

## 已证明的范围

- 24 对章节样本固定为六类，每类四对，ID 无重复；
- 100 章样本确定性生成，包含第 12/18 章钥匙转移、第 30/40 章受伤恢复、第 55 章角色知情和第 70 章读者知情状态；
- 相同输入产生相同结构与哈希，输入变化可由哈希门检测。

## 尚未证明的范围

发布负责人已豁免两名评阅者的匿名前后盲评和真实 provider 质量评测；新版偏好率、平均分提升、误报率和真实事实召回率不因此被宣称通过。工程发布证据改用 fixture、自动化回归、browser suite、provider dry-run、匿名 packet 和 strict 汇总器；A01/A02/A06/A08/B01/B02/B03 的功能状态仍按 tracker 逐项处理。
