---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st12-02
status: accepted
revision: "02731e474c2625de15b77b01584cd6574ecf8bcd84625cb59ef84c936e48fde5"
accepted_revision: "02731e474c2625de15b77b01584cd6574ecf8bcd84625cb59ef84c936e48fde5"
derived_from:
  - artifact_id: spec:warrior-loop-st12
    revision: "26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7"
    path: docs/stories/warrior-loop/st12/spec.md
implements: [ST12]
blocked_by: [1]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST12-02 远程、冲锋与四档协同行为

依赖01。交付：近战/远程/冲锋同时对抗，四档策略有可观察差别。

- 远程保持距离、冲锋锁向与地图扫掠；穿怪不免伤，不以玩家身体当墙。
- 普通怪和紫名无额外红圈/红线/感叹号，仅动作预兆；精英/Boss预警独立配置。
- 重型攻击许可与普通攻击重叠规则可配置；不逐次事务重新抽选招、不靠渲染FPS改变决策。
- 已发射投射物/地面效果与需施法者维持效果分别处理；中断、死亡、切房不统一清空或无限保留。
- 参数未定时使用标识清楚的版本化本地候选；不要求受伤或伤害随难度单调递增，不新增词缀。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
