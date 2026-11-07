# Issue 跟踪：本地 Markdown

本仓库的 Issue 和规格存放在 `.scratch/`，使用本地文件跟踪工作。

## 文件约定

- 每个功能使用独立目录：`.scratch/<feature-slug>/`。
- 规格文件：`.scratch/<feature-slug>/spec.md`。
- 实施任务：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，
  从 `01` 开始编号，每个任务单独一个文件。
- 分诊状态记录在任务文件顶部附近的 `Status:` 字段中，
  状态值见 `triage-labels.md`。
- 评论和讨论追加在文件末尾的 `## 评论` 下。

## 技能操作映射

技能要求“发布到 Issue 跟踪系统”时，在对应功能目录下创建文件。
代表用户发布的 Issue 正文须包含“由AI发布”。

技能要求“获取相关任务”时，读取用户提供路径对应的文件；
仅提供编号时，在对应功能目录的 `issues/` 下查找。

## Wayfinder 操作

- 工作地图：`.scratch/<effort>/map.md`，记录笔记、已有决策和待澄清问题。
- 子任务：`.scratch/<effort>/issues/<NN>-<slug>.md`，
  从 `01` 编号，正文记录问题。
- 类型：使用 `Type:` 字段，值为 `research`、`prototype`、
  `grilling` 或 `task`。
- 执行状态：Wayfinder 任务使用 `Status: claimed` 表示已认领，
  使用 `Status: resolved` 表示已解决。
- 依赖：在顶部附近用 `Blocked by: NN, NN` 列出前置任务；
  所有前置任务均为 `resolved` 时，依赖解除。
- 选择下一项：按编号顺序查找尚未解决、未认领且依赖已解除的任务。
- 认领：开始工作前，将状态改为 `claimed` 并保存。
- 解决：将答案追加到 `## 答案`，将状态改为 `resolved`，
  再向地图的已有决策部分追加结论摘要和任务文件链接。
