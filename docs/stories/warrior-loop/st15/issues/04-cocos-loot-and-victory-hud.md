---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st15-04
status: accepted
revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
accepted_revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
derived_from:
  - artifact_id: spec:warrior-loop-st15
    revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
    path: docs/stories/warrior-loop/st15/spec.md
implements: [ST15]
blocked_by: [3]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST15-04 Cocos 掉落物展示、拾取交互与通关结算面板

依赖 03。交付：在客户端场景中渲染地面掉落物，提供拾取交互与满包反馈，并在首领死亡时展示通关胜利面板。

- 地面掉落物图标与光柱渲染：白/绿/蓝/紫不同品级光效与名称标签。
- 拾取交互：靠近后高亮或点击拾取按钮触发 `drop.collect`；满包弹出“背包已满”浮动提示。
- 首领死亡通关胜利弹窗（Clear Victory HUD）：
  - 胜利徽标与通关耗时展示；
  - 杀怪数量、获得金币与经验汇总；
  - 通关专属装备翻牌展示；若走 pending 路由展示“背包已满，已暂存至待领奖励”提示；
  - 提供【离开副本】按钮，点击后平滑调用 `challenge.leave(reason: 'finishLoot')`，渐隐转场退出。
- 纯模型解耦，确保离线 Cocos 构建与纯模型测试 100% 通过。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
