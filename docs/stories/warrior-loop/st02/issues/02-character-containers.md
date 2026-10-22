---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st02-02
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st02
    revision: 4605b8375d337ba356e49e2380fcf8a98e074c584c26f2f542dff20ab80d6e4f
    path: docs/stories/warrior-loop/st02/spec.md
implements: [st02-warrior-creation]
blocked_by: [1]
---
# 02：初始角色属性与容器隔离

**What to build:** 实现角色基础实体（1级/0经验/308体力/旅店隔离位置）及专属20格背包与20格个人金库；验证共享账号金库与共享钱包不随创角被重置。

**Blocked by:** 01。

## Acceptance criteria

- [x] 角色模型初始字段完全符合权威契约：`level=1`、`xp=0`、`stamina={value:308, refillWindow}`、`location=inn{characterId}`、`quickSlots`初始3空位。
- [x] 容器按角色物理隔离：创建背包（`kind='backpack'`, `capacity=20`, `stage=0`）与个人金库（`kind='personalVault'`, `capacity=20`, `stage=0`）。
- [x] 共享资产防重置：创角不修改或重置所属账号的共享金库（`accountVault`，100格）与钱包（`wallet`）。

## Tests and evidence

测试入口：MemoryStore 实体边界与角色创建持久化测试。
- 角色实体初值与旅店位置校验。
- 背包与个人金库容量为 20。
- 创建第二角色时原有共享金库和钱包余额零影响。
