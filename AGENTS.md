# AI 协作规范

当 AI 代表用户发布 Issue 或 Pull Request 时，必须在 Issue 或 Pull Request 的正文中明确添加“由AI发布”。

# 基本命令

```bash
pnpm run format   # 格式化代码
pnpm run test     # 运行测试
```

# 依赖

`node`版本参照`.node-version`，`pnpm`版本参考`package.json/packageManager`字段

## Agent skills

### Issue tracker

Issue 和规格使用本地 Markdown；创建、读取或更新任务时，参阅 `docs/agents/issue-tracker.md`。

### Triage labels

分诊使用五个默认状态；评估或变更任务状态时，参阅 `docs/agents/triage-labels.md`。

### Domain docs

领域文档采用单上下文布局；探索代码、使用领域术语或调整架构前，参阅 `docs/agents/domain.md`。
