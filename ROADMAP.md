# InkWeaver Roadmap

这份路线图把已经发布的能力和下一阶段方向分开，避免把计划写成现有功能。

## Shipped: v1.2.0

- 连续发展的长篇写作链：设定、角色、故事线、蓝图、候选草稿、证据化审稿、作者修订和定稿；
- 四层章节材料、上下文收据、覆盖缺口、角色动态状态和全文人物候选；
- 全局结构化运行日志、轮转 manifest、重试队列、emergency spool、查询和诊断 bundle；
- Windows x64、macOS arm64、macOS x64 安装包和应用内更新；
- DSH 插件 `@shuishuipingan/inkweaver-dsh@1.2.0`，官方 Harness `0.1.5-rc.1` 兼容资格通过；
- 不发布 npm；桌面和插件从 GitHub Release tarball 交付。

## Delivered after the v1.2.0 release: public onboarding

- 清理公开树中的测试附件、临时目录和未引用截图，并加入持续卫生检查；
- 中英文产品首页、连续写作流程图、三分钟快速开始和无版权样例项目；
- Issue forms、Discussions 模板、贡献指南、Roadmap 和 DSH 精选列表提交材料；
- GitHub 公开增长基线与只读快照脚本，明确区分页面访问、CI clone 和真实安装转化。

## Next: community discovery and trust

- 跟进 DSH 精选插件列表收录，并补充安装故障恢复案例；
- 评估 Windows portable 包、安装器签名和 macOS 公证，完成后再更新下载承诺；
- 用小规模、脱敏的用户反馈持续改进“下一步该做什么”提示和连续性证据视图；
- 维护者按明确问题复查 GitHub views、Release 下载和社区反馈，不用指标制造虚假活跃度。

## Later: opt-in diagnostics

- 可选加密诊断附件、日志完整性签名链和 OpenTelemetry/NDJSON 导出；
- 跨设备日志分析的实例 ID、服务端接收时间和时钟偏差；
- 更丰富的样例项目和作者工作流模板。

Roadmap 项目不会自动收集用户写作内容，也不会改变作者确认边界。路线图中的任何新版本都必须重新跑对应的测试和平台资格门禁。
