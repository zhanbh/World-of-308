---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st14-03
status: accepted
revision: "0f854820d62e43545cfd9c7ffcbc38b47853214e4c624dbb6c1a09db826bcb32"
accepted_revision: "0f854820d62e43545cfd9c7ffcbc38b47853214e4c624dbb6c1a09db826bcb32"
derived_from:
  - artifact_id: spec:warrior-loop-st14
    revision: "185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12"
    path: docs/stories/warrior-loop/st14/spec.md
implements: [ST14]
blocked_by: [2]
approval_kind: human
approval_evidence: "好的，开始"
---
# ST14-03 倒计时超时判败、主动放弃与落点退出

依赖 02。交付：死亡超时或主动放弃时安全终结挑战，保留已有收益，并根据在线/重登场景正确落点。

- 倒计时结束时接收复活请求直接返回 `DEADLINE_EXPIRED`，并在生命周期检查中标记 `result = 'failed'`, `sceneState = 'closed'`。
- 支持显式 `challenge.leave`（`reason: 'abandon'` 或 `'deathTimeout'`），进入不可逆失败终态。
- 挑战结束时结算已有掉落与击杀经验，不退还已扣减的体力。
- 场景关闭后清除 `account.openSceneChallengeId`；在线正常退出落回城镇对应副本传送门坐标；离线/重新登录则回退至旅店空间。
- 状态机严格测试：失败终态不可逆、原操作重放一致、非法重进阻断。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
