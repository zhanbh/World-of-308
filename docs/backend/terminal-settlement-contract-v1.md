# ST15-03 本地终局原子结算合同

2026-10-29。依 [体力裁决](../stories/warrior-loop/st15/decision-terminal-stamina-2026-10-29.md)、[来源物理映射](asset-physical-mapping-v1.md)、[持有汇总](collection-holdings-projection-v1.md) 与 [终局预算](enhancement-terminal-budget-v1.md)。实现仅启用显式 local-test-terminal / isolated-local-assets-only，正式发布表、云 SDK 与设备验证仍 GAP。

ChallengeContent.terminal 为显式注入的有界配置：30个累计XP阈值、30行HP/MP属性（攻击继续沿绑定战斗配置）、六个绿武器邮件节点、最多32个通关装备候选和独立random/missing-first策略。创建挑战绑定完整配置SHA；每次产生收益的公开simulation.submit重验该摘要及角色progressionConfigRef。配置换版不得悄悄重写既有挑战结果。满级XP截断到30级阈值，rewardTotals.xp/流水为实际记入的有效经验。

真实submit的第二事务共同提交：当片确认击杀即时金币经验、角色等级/属性版本、活人升级满血满蓝与CP资源/属性revision、死亡升级保持dead、跨越节点确定键邮件、固定通关额外收益、装备direct/pending、套装持有、七磨损实例、房间地面来源、H/CP、原O与一笔<=128KiB J。升级发生后才生成CP分片及公开hash。邮件每封30天，非套装绿武器，不自动穿戴；deleted/expired来源stub同键阻重发。

通关装备ID为loginKey('equipment',[challengeId,'clear-equipment'])，sourceKey为确定clearSource；sourceLocator为challengeClear。背包当前合法空格决定direct，否则同笔物化pending实例与永久rewardGrant，角色pendingGrantIds记录引用。未提交冲突可重验当前背包，已成功原O/clearReceipt固定路由。套装只允许30级特殊副本，基础样本先定合法候选；missing-first仅在同套装版本、装等、品质池内选部位，读取角色/账号两份同步持有，缺失或损坏拒绝。pending生成即+1，领取不再次加。

H.clearReceipt永久保存原通关装备公开快照及route/source/item/grant、累计金币/有效XP/击杀数、耗时、剩余体力和配置ref。challenge.get响应可选顶层clearReceipt；parseClearReceipt及parseChallengeQueryResponse严格解析并校验completed、looting/closed组合，<=8KiB，不包含私有账号/随机种子。装备快照是原交付事实，pending领走后凭证仍为pending。sceneState投影为当前looting/closed，原H凭证不改写。

通关仍用原体力快照且unsettled；关闭/回城才settled。下一难度解锁与账号写栅栏在同一事务，no-rewards训练不启通关奖励或解锁。实际本地计量和边界见 [03验证](../reviews/st15-03-verification.md)，不能把唯一键设计预算当SDK实测。

ST15-05增加终局物理预算拒绝保护：结果页自身超W33/1.5MiB在资产事务前CONFIG_NOT_READY；提交回调按实际R44/W33、get/set80及最终写集1.5MiB保护，越限整笔回滚。正常8块域通过，3648到期效果最大域仍发布blocked，详见[预算实测](enhancement-terminal-budget-v1.md)。CONFIG_NOT_READY不能被解释为可丢弃奖励或异步补交付。
