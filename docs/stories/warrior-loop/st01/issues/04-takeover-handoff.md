---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st01-04
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st01
    revision: 5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c
    path: docs/stories/warrior-loop/st01/spec.md
implements: [st01-login-session]
blocked_by: [3]
---
# 04：角色与旧场景原子交接

**What to build:** 在同一commit事务读取当前角色/H/CP头及在用块，关闭旧session与场景、结算体力并返旅店，保留已确认资产和终态。

**Blocked by:** 03。

## Acceptance criteria

- [x] active关闭failed、completed仅关拾取，旧已关闭指针不二次结算或覆盖体力。
- [x] 旧片段/终局与接管共用账号栅栏，两种先后顺序不丢确认资产或重复奖励。
- [x] 在用块按头引用验证并计数，关闭只改必要头/H；数据不一致拒绝，逐写故障全回滚。

## Tests and evidence

真实MemoryStore中合法v2角色/挑战/CP fixture与确定交接；不mock未实现的战斗成功。

QA映射：01/02/04。记录实际命令、精确工具/配置/代码版本、期望/实际、未覆盖项；不把task draft当已实现。

局部23项MemoryStore事务测试与真实tsc通过。外层LoginService组合及独立评审由06统一记录。[实施映射](../../../../design/st01-login-handoff-contract-v1.md)、[局部证据](../../../../reviews/st01-04-local-verification-2026-10-22.md)。保留draft不表示人工验收/平台门禁已通过。
