---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st03-01
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st03
    revision: 39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd
    path: docs/stories/warrior-loop/st03/spec.md
implements: [st03-town-authority]
blocked_by: []
---
# 01：角色选择与代次控制

**What to build:** 实现角色选择命令 `character.select`。校验目标角色归属当前会话账号；单调递增角色 `rolePlayEpoch`；设置账号活跃角色指针 `selectedCharacterId`；初始化旅店隔离落点 `inn{characterId}`。

**Blocked by:** None。

## Acceptance criteria

- [x] 归属合法性校验：所选角色必须属于会话绑定的 `accountId`，若跨账号选择返回 `NOT_FOUND_OR_FORBIDDEN`，若角色不存在返回 `NOT_FOUND_OR_FORBIDDEN`。
- [x] 代次单调递增：每次成功切入角色，该角色的 `rolePlayEpoch` 自增（+1），使旧会话、旧生命周期的请求被拦截判定失效（`VERSION_CONFLICT`）。
- [x] 旅店隔离落点：选择角色后初始场景状态隔离于专属旅店 `inn{characterId}`，不向公共城镇广播或暴露出入状态。

## Tests and evidence

测试入口：受控 MemoryStore 事务与服务应用层。
- 本账号合法角色选择成功，返回最新 `rolePlayEpoch` 与旅店初始状态。
- 非本账号角色选择拒绝（`FORBIDDEN`）。
- 连续选择时 `rolePlayEpoch` 严格自增。
