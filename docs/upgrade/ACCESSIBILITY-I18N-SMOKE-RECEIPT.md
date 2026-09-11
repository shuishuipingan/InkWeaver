# E09 双语与可访问性 Smoke 收据

执行日期：2026-09-12（Asia/Hong_Kong）  
状态：自动化 smoke 通过；完整人工 a11y 审计仍未完成。

## 命令与结果

```text
node scripts/check-i18n-coverage.mjs
```

结果：`i18n coverage check passed: no unlocalized renderer or main-boundary copy`。

```text
node node_modules/vitest/vitest.mjs run \
  --config vitest.browser.config.ts --maxWorkers=2
```

结果：38 test files、225 tests passed、0 failed。覆盖连续阅读、连续性工作单、关系图键盘列表/证据面板、人物候选审核、恢复/任务面板和主要双语设置入口。

## 已知测试噪声

浏览器 suite 输出了既有 React `act(...)` 警告、模拟 IPC 拒绝日志和 Electron API 未注入提示；这些没有导致测试失败，也没有被静默吞掉。它们应在发布前的人工 a11y/console review 中逐项复核。

## 尚未证明

本收据不等同于 WCAG 全量审计、真实屏幕阅读器验证、焦点顺序/高对比度/缩放人工评阅，也不证明所有恢复错误路径都可仅用键盘完成。因此 E09 仍保持“开发中”。
