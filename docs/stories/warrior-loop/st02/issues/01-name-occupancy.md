---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st02-01
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st02
    revision: 4605b8375d337ba356e49e2380fcf8a98e074c584c26f2f542dff20ab80d6e4f
    path: docs/stories/warrior-loop/st02/spec.md
implements: [st02-warrior-creation]
blocked_by: []
---
# 01：创角验证与全局占名

**What to build:** 实现角色命名格式校验（中文≤6或英文≤12、不混合），服务端全局原子名称占位 `characterNames/{name}`，以及账号下同职业互斥检查（当前仅开放 warrior）。

**Blocked by:** None。

## Acceptance criteria

- [x] 姓名合法性校验：纯中文1～6字或纯英文1～12字母通过；中英混编、特殊字符、超长或空串一律拒绝并返回 `INVALID_ARGUMENT`。
- [x] 全局原子占名：使用 `characterNames/{name}` 确定性键实现互斥；并发同名创角仅一笔成功，重复名字直接拒绝。
- [x] 账号内同职业排他：检查账号已读 `characterIdsByClass[classId]`，若已有战士则拒绝并返回 `CLASS_EXISTS`；hunter职业在此阶段明确返回未启用拒绝。

## Tests and evidence

测试入口：单元测试与受控 MemoryStore 事务。
- 名称正则边界（中英字数上下限、混编、边界符号）。
- 并发同名占位冲突单赢。
- 同账号同职业已存在时拒绝。
