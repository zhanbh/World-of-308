---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st15-03
status: accepted
revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
accepted_revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
derived_from:
  - artifact_id: spec:warrior-loop-st15
    revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
    path: docs/stories/warrior-loop/st15/spec.md
implements: [ST15]
blocked_by: [2]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST15-03 终局原子事务：金币/经验/跨级礼包/通关装备路由

依赖 02。交付：首领通关单笔原子提交事务，完成金币经验累加、升级跨级礼包邮件、通关专属装备 direct/pending 路由与体力结清。

- 即时金币与经验汇总结算至钱包 `account.wallet` 与角色 `character.xp`。
- 升级与跨级节点检测：跨越等级节点（5/10/15/20/25/30 级）生成确定性邮件（`mailId = mail:${characterId}:level-${node}`），检查不存在性，单来源绝不重发。
- 通关专属装备路由分流：
  - 生成一件固定通关装备 `itemId = H(challengeId, 'clear-equipment')`；
  - 背包有空位：走 direct 路由，写入背包 slot；
  - 背包已满：走 pending 路由，创建 pending 实例（`location = pending{grantId}`）并生成 `rewardGrant`；
  - 两路均写入 `clearReceipt` 固化路由与结果。
- 体力结算：锁定体力标记为 `staminaSettlement: 'settled'`，解锁下一难度。
- 写入单笔有界 `assetJournal`（<= 128KB）与 `assetOp` 幂等凭据。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
