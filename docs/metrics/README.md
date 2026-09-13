# GitHub 增长快照

这里保存维护者手动读取的 GitHub 公开指标，用来判断“有人看见项目”和“有人真正安装使用”之间的差距。它不是应用遥测，也不读取小说正文、模型请求、API Key 或本机路径。

## 运行

需要一个有权读取仓库 traffic 的 GitHub token。推荐让 GitHub CLI 管理凭据，不要把 token 写入命令行历史：

```powershell
$env:GITHUB_TOKEN = gh auth token
node scripts/github-growth-snapshot.mjs --repository shuishuipingan/InkWeaver --output docs/metrics/YYYY-MM-DD.json
Remove-Item Env:GITHUB_TOKEN
```

脚本只把 token 放在当前 Node 进程内存中，输出中不会包含 Authorization header、token、响应原文或本机路径。没有 traffic 权限时，views/clones/referrer/path 会明确标记为 `available: false`，不会伪造为零。

## 字段

- `repositoryStats`：stars、forks、subscribers、watchers、issues、Discussions 和默认分支；
- `traffic.views` / `traffic.clones`：GitHub traffic 时间序列、总数和独立来源；
- `traffic.referrers` / `traffic.paths`：访问来源和热门页面；
- `releases`：每个 Release 的公开资产下载数和大小；
- `topicSearch`：`dsh-plugin` 搜索是否能返回本仓库；
- `interpretation`：GitHub 数据延迟、CI clone 不等于用户和 metadata-only 隐私说明。

GitHub traffic 通常不是实时数据，快照必须记录 `capturedAt` 和 `window.lastTrafficAt`。Clone 数量可能包含 Actions、镜像和自动化任务，不能当作用户数；要判断真实转化，应同时观察独立页面访问、Release 资产下载、Issue/Discussion 和重复回访。

基线文件：[2026-09-14-baseline.json](2026-09-14-baseline.json)。后续快照只在有明确分析问题时提交，避免用大量数字制造虚假的活跃度。
