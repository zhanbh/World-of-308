---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st14-01
status: accepted
revision: "67ff75d2f28b0491209d326df01740a8dc6f3cd95e167ca12b541b644eb3bdb4"
accepted_revision: "67ff75d2f28b0491209d326df01740a8dc6f3cd95e167ca12b541b644eb3bdb4"
derived_from:
  - artifact_id: spec:warrior-loop-st14
    revision: "185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12"
    path: docs/stories/warrior-loop/st14/spec.md
implements: [ST14]
blocked_by: []
approval_kind: human
approval_evidence: "好的，开始"
---
# ST14-01 权威死亡判定与物理10秒倒计时锚定

无本包前置。交付：战斗内核在玩家 HP 归零时生成权威死亡事件，设置 10 秒物理时钟倒计时锚点，阻断输入，维持残留结算与免死判定。

- 玩家 HP<=0 触发权威死亡事件，生成递增 `deathIndex` 并锁定 `deathDeadline = deathAt + 10_000`。
- 死亡状态阻断常规位移与技能输入，暂停自然回血回蓝。
- 死亡期间获得击杀经验并升级时，经验与等级正常累加，但 `lifeState` 严格保持 `dead`，不触发升级满血复活。
- 残留技能与流血 DOT 持续结算至其生命周期结束；若击杀最终首领，触发通关免费复活并清除死亡倒计时。
- 纯内核规则测试验证：死亡事件生成、10s 截止锚定、输入阻断、升级保持死亡、残留击杀最终首领免死。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
