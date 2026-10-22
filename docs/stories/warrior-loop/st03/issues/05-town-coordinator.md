---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st03-05
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st03
    revision: 39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd
    path: docs/stories/warrior-loop/st03/spec.md
implements: [st03-town-authority]
blocked_by: [4]
---
# 05：客户端城镇协调器与生命周期状态机

**What to build:** 实现客户端纯模型 `TownCoordinator`。驱动角色选择、出旅店、移动输入封包及本地预测、服务交互范围检测与上下文状态机维护；玩家移动时主动关闭面板与销毁上下文；拦截低版本迟到响应。

**Blocked by:** 04。

## Acceptance criteria

- [x] 场景与移动状态机：管理 `inn` 与 `town` 场景状态、当前坐标与移动队列；移动输入封包附带单调自增序号。
- [x] 移动关闭服务面板：玩家发起移动时，本地状态机先结束打开中的服务面板并释放当前 `ServiceContext`。
- [x] 代次防护与迟到拦截：代次升级或地点版本变更后，低版本迟到回包直接丢弃，不污染当前 UI 状态。

## Tests and evidence

测试入口：客户端纯模型单元测试。
- 移动封包与序号单调递增验证。
- 移动触发面板关闭状态变更。
- 迟到旧代次/旧版本响应隔离不污染状态。
