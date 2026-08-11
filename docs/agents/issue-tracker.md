# Issue tracker：GitHub

本仓库的问题与规格存放在 GitHub Issues 中。所有操作均使用 `gh` CLI。

## 约定

- 创建 issue：`gh issue create --title "..." --body "..."`
- 读取 issue：`gh issue view <number> --comments`
- 列出 issue：使用 `gh issue list`，并按需指定标签和状态过滤条件
- 评论 issue：`gh issue comment <number> --body "..."`
- 添加或移除标签：`gh issue edit <number> --add-label "..."` 或 `--remove-label "..."`
- 关闭 issue：`gh issue close <number> --comment "..."`

在仓库目录中运行命令，由 `gh` 根据 `git remote -v` 自动识别仓库。

## 将 Pull Request 作为 triage 请求入口

**PRs as a request surface: no.**

如以后改为 `yes`，外部 PR 将使用与 issue 相同的标签和状态，并通过 `gh pr view`、`gh pr diff`、`gh pr comment`、`gh pr edit` 和 `gh pr close` 操作。

GitHub 的 issue 和 PR 共用编号空间。遇到 `#42` 时，可先运行 `gh pr view 42`，失败后再运行 `gh issue view 42`。

## 当 skill 要求“发布到 issue tracker”

创建一个 GitHub issue。

## 当 skill 要求“获取相关 ticket”

运行 `gh issue view <number> --comments`。

## Wayfinding 操作

`/wayfinder` 使用一个 map issue 管理多个子 issue：

- Map：带有 `wayfinder:map` 标签的单个 issue，正文保存 Notes、Decisions-so-far 和 Fog
- 子 ticket：优先使用 GitHub sub-issue；不可用时，在 map 的任务列表中关联，并在子 issue 顶部写入 `Part of #<map>`
- 类型标签：`wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`
- 阻塞关系：优先使用 GitHub 原生 issue dependencies；不可用时，在子 issue 顶部记录 `Blocked by: #<n>, #<n>`
- Frontier：按 map 顺序选择第一个未关闭、未被阻塞且尚未分配的子 issue
- Claim：运行 `gh issue edit <n> --add-assignee @me`
- Resolve：添加答案评论、关闭子 issue，并把上下文链接写入 map 的 Decisions-so-far
