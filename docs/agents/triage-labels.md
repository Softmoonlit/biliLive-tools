# 分诊标签

本地任务使用 `Status:` 字段记录分诊状态。
技能提及下列角色时，使用对应的状态字符串。

| 角色 | 状态值 | 含义 |
| --- | --- | --- |
| 待分诊 | `needs-triage` | 等待维护者评估 |
| 待补充信息 | `needs-info` | 等待报告者提供更多信息 |
| 可由 Agent 实施 | `ready-for-agent` | 规格充分，可交给 Agent 自主实施 |
| 需要人工实施 | `ready-for-human` | 需要人类参与实施 |
| 不予处理 | `wontfix` | 已决定不处理 |

Wayfinder 的认领和解决状态遵循 `issue-tracker.md`。
