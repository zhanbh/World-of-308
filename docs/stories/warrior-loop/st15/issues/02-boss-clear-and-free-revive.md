---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st15-02
status: accepted
revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
accepted_revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
derived_from:
  - artifact_id: spec:warrior-loop-st15
    revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
    path: docs/stories/warrior-loop/st15/spec.md
implements: [ST15]
blocked_by: [1]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST15-02 首领击杀即刻通关、剩余怪物结算与免费复活

依赖 01。交付：战斗内核与挑战服务在首领生命归零时即刻判定通关，清场剩余小怪并汇总收益，处理同刻死亡免纹章复活与末房磨损保护。

- 首领 HP<=0 时即刻将挑战标记为通关（`result = 'completed'`）。
- 同房间存活小怪被动触发清场，击杀经验与常规掉落完整结算进挑战上下文。
- 同刻死亡判定：若玩家与首领同刻死亡，先记录死亡事实，立即触发免费复活（`lifeState = 'alive'`, 满血满蓝, 清除倒计时, 不扣纹章, 不计入 `paidRevives`）。
- 末房武器耐久磨损保护：扣减耐久至 0 耐久时仅更新武器状态，绝不翻盘判败。
- 纯内核规则与服务状态机测试覆盖：即刻通关、剩怪经验掉落汇总、同刻免死复活、0耐久通关保护。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
