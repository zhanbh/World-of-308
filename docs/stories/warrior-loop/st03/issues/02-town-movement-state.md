---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st03-02
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st03
    revision: 39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd
    path: docs/stories/warrior-loop/st03/spec.md
implements: [st03-town-authority]
blocked_by: [1]
---
# 02：城镇位置与移动权威状态

**What to build:** 实现离开旅店转入城镇固定锚点 `town{mapId, 'inn-door'}`，以及城镇有序移动验证。维护嵌入式小检查点 `characters.townState`（≤4KiB），校验连续输入片段、速度上限与地图边界，拒绝客户端直接自报坐标。

**Blocked by:** 01。

## Acceptance criteria

- [x] 出旅店固定落点：提供合法的离开旅店动作，将角色从 `inn{characterId}` 切换至地图固定锚点 `town{mapId, 'inn-door'}`，生成初始 `sceneEpoch` 与 `locationRevision`。
- [x] 有序移动验证：只接收有序输入片段（最大1秒/32条指令），按 seq 严格单调推进；按服务端活动预算和速度上限积分计算位移，严禁客户端直接赋值 `position`。
- [x] 边界与瞬移拦截：移动越界、超出速度上限、穿墙或乱序时拒绝并纠正，更新并单调递增 `locationRevision`。

## Tests and evidence

测试入口：受控 MemoryStore 事务与移动验证单元测试。
- 从旅店到城镇出门点转换正确，sceneEpoch 与坐标初始化。
- 连续合法步长移动，位置正确更新，locationRevision 单调递增。
- 超速移动、跳跃瞬移、乱序 seq 被严格拒绝并回滚/回弹。
