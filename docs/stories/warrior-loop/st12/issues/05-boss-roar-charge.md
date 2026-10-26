---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st12-05
status: accepted
revision: "901b4c5ce7f00843cabf5ec817dbc0b33f84983ba97f04ab7a2000e6b12b863b"
accepted_revision: "901b4c5ce7f00843cabf5ec817dbc0b33f84983ba97f04ab7a2000e6b12b863b"
derived_from:
  - artifact_id: spec:warrior-loop-st12
    revision: "26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7"
    path: docs/stories/warrior-loop/st12/spec.md
implements: [ST12]
blocked_by: [4]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST12-05 牛头Boss连续践踏、冲撞与吼叫

依赖04。交付：P2连续践踏接锁向冲撞、撞墙虚弱，以及两阶段独立CD吼叫。

- 冲撞沿实际路径碰墙停；未撞墙不触发虚弱，虚弱不因受击续期，不擅加增伤。
- 吼叫前方扇形、锁向、持续阶段霸体；每节点按玩家当前位置判定，离开停止受本次范围作用；倒地后仍伤害和击退，直到离开或结束。
- 本次吼叫累计实际伤害达到比例阈值时最多倒地一次，离开重入不重置；不套怪物倒地阈值。死亡取消后续需维持声波。
- 六节点候选与既有怪物效果912条上界逐一核验；不私增第七跳、无界选招或静默丢效果。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
