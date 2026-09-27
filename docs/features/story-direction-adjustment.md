# AI 全书方向调整 / AI Story Direction Adjustment

在侧边栏「故事架构」下打开「AI 全书方向调整」，输入新的故事想法和章节范围。例如：主角有第二人格，会在关键时刻帮助他。

1. 选择目标章节范围。已定稿章节自动排除。界面显示角色与章节分析批次数；大范围任务会要求确认预计模型调用量。
2. 选择是否为受影响的未定稿正文生成候选修稿，然后生成方案。分析可以在当前请求完成后停止；保持窗口打开即可继续已验证的批次。
3. 审阅项目配置、故事架构、角色卡、叙事线索和章节蓝图的差异。若方案涉及已定稿事实的冲突，先核对并明确确认。
4. 确认后，规划变更会经过项目内容指纹及角色名单 revision 校验，并在同一数据库事务中提交。未保存的配置、架构或角色编辑需要先保存。
5. 候选修稿不会直接覆盖原稿。逐章任务和状态保存在项目内；关闭或重开窗口后可继续失败或未处理章节。候选修稿需要作者在编辑器中审阅、合并。

已定稿正文、定稿事实笔记和知识库文档不会由该功能改写。若一个未定稿草稿在方案确认后出现了新版本，旧任务会拒绝给旧版本生成修稿。长篇项目可能需要多次模型调用，建议先选择较小章节范围观察方案质量与模型消耗。

## English

Open **AI Story Direction Adjustment** beneath **Story Architecture** in the sidebar. Enter a new idea and a chapter range. Finalized chapters are excluded. The app estimates model calls for large ranges, generates a reviewable plan for project settings, architecture, character cards, narrative threads, and unfinished chapter blueprints, then checks the project fingerprint and roster revision before committing planning changes atomically.

Candidate revisions for affected unfinished drafts are stored separately and never overwrite the original draft. Their task status survives closing and reopening the dialog. Finalized prose, finalized fact notes, and knowledge documents remain unchanged. Review and merge each candidate revision in the editor.
