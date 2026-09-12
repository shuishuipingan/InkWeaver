# J12 旧版本升级与恢复旅程收据

状态：通过（1.1.0 正式 Release 的内部工程组合验收）  
源码：`b40cd124525fd7805cdf1c35f07eeee187d394eb`  
日期：2026-09-12（Asia/Hong_Kong）

## Windows x64

Windows qualification run `34670948171`（attempt 1，artifact `10290679866`）执行了完整的旧版本升级路径：

- 下载并 SHA-256 校验官方 v1.0.0 安装器：`3bb76f7e448ca6d0ad880268d774f4f409516f24f4889712ad5e0ecd4721395e`；
- 旧应用先打开隔离升级作品，再安装 1.1.0 NSIS 安装器并重新打开同一作品；
- 旧 fixture 的 11 张 legacy 表、项目/草稿/审稿/后处理/LLM/摘要记录、物理附件、LanceDB 768 维向量查询、全局设置和最近项目均在升级后校验；
- 1.1.0 安装、打包 smoke、应用启动、卸载、native ABI 恢复和 5 秒 quiet-window 收据全部 accepted。

Windows acceptance receipt 的 `upgrade-data.json` 记录 `previousVersion=1.0.0`、`legacyTableCount=11`、`preservedAssetCount>0`、`vectorDimension=768`、`queryResultCount=1`。

## macOS ARM64 / Intel x64

两条 macOS qualification 同样使用冻结 SHA，运行了完整 test suite、renderer browser suite、native secure helper、DMG mount、packaged vector/homepage/skin smoke、signing observation 和 legacy qualification manifest projection：

| 架构 | run / artifact |
| --- | --- |
| ARM64 | `34670949545` / `10291050076` |
| Intel x64 | `34670951472` / `10291115154` |

macOS 的迁移事务、SQLite backup、LanceDB 向量格式和导出/恢复逻辑由同一跨平台主进程测试与 legacy qualification adapter 覆盖；DMG 内的当前 1.1.0 app bundle 在两个架构上完成真实打包 smoke。平台差异只在安装器、DMG 挂载和安全 helper，数据合同保持一致。

## 结论与范围

J12 的内部工程结论为通过：Windows 提供旧安装器→当前安装器→旧作品打开/恢复的完整 UI 证据，macOS 两架构提供同一迁移代码路径的测试、legacy manifest、DMG 和 packaged smoke 证据。该收据不宣称真实模型文学质量，也不把 npm 发布作为条件；最终下载入口是 [v1.1.0 Release](https://github.com/shuishuipingan/InkWeaver/releases/tag/v1.1.0)。
