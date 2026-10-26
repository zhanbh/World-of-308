---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st12-04
status: accepted
revision: "b5b20ec772fd11cfd2b6fc1d1ea01821e948875e554b1ae8bb2cf8c2edb373de"
accepted_revision: "b5b20ec772fd11cfd2b6fc1d1ea01821e948875e554b1ae8bb2cf8c2edb373de"
derived_from:
  - artifact_id: spec:warrior-loop-st12
    revision: "26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7"
    path: docs/stories/warrior-loop/st12/spec.md
implements: [ST12]
blocked_by: [3]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST12-04 精英与牛头Boss基础阶段

依赖03。交付：精英顺劈/横扫、牛头Boss重槌/践踏与50%阶段交接。

- 牛头守卫及首Boss均为人形；平时可控，指定施招霸体仍受伤/流血，收招恢复可控。
- 起手/锁向/伤害/霸体结束/收招结束独立节点，控制成功与能否打断分开。
- 半血不强行打断当前招，不重置CD/回血/无敌；死亡优先，切阶段不清受控状态。
- 同时刻死亡、伤害、控制及阶段切换沿统一确定顺序，整段/分段与恢复同结果。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
