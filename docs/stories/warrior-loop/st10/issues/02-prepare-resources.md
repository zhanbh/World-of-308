---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st10-02
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st10
    revision: "23272608bc24780e09b3850e117598a78d44fea7614ee7d9015a1060989f34ed"
    path: docs/stories/warrior-loop/st10/spec.md
implements: [ST10]
blocked_by: [1]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST10-02：prepare固定房间manifest并验证资源加载

**Blocked by：** ST10-01。

**What it delivers：** 首房prepare获得唯一attempt及资源摘要；客户端加载成功/失败可观察，失败留在同一挑战，不扣下一房费、不刷新安排。

- 一次至多一个pending attempt；校验首房/顺序、活着/连接/挑战未终止和配置，生成确定manifest/hash并绑定挑战release。
- prepare不扣费、不推进战斗、不删除旧房；复用相同意图返回同一attempt，不重新随机站位或紫名。
- 创建唯一H.transitionClock基点；客户端LoadingCoordinator隔离异步流程代次，失败/取消/重试不换challenge/attempt，不让旧资源回调进入新流程。
- 实际manifest/资源摘要校验接口、缺资源与hash错、同ID异参、过期上下文、接管/终止竞争、逐写点失败和原结果恢复；保持未付首房时无CP的既有接管合同。
