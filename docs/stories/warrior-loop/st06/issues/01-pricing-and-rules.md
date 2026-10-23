---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st06-01
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st06
    revision: cd6bd719284e6dd0da31c80047a3bb4a6cbfc9884ddd9da766d72a31ed3c3644
    path: docs/stories/warrior-loop/st06/spec.md
implements: [st06-shop-wallet-exchange]
blocked_by: []
---
# 01：商店报价与买卖规则计算

**What to build:**
建立商店商品目录、固定回购价与货币兑换规则引擎：
1. **商品目录与有效报价**：定义城镇商人支持的固定商品表（`ShopCatalog`），包含药剂（初级生命药剂、初级法力药剂）与基础白装（初学者铁剑、学徒皮甲等），配置单价、支持货币（`gold` 或 `points`）与报价标识（`quoteRef`）；
2. **装备与道具固定回收价计算**：实现 `calculateSellPrice(item)`，根据物品模板、装等（`itemLevel`）与品质（`white`, `green`, `blue`, `purple`）确定固定收购金币；严格遵守规则：强化等级（`enhancementLevel`）与附加词条不增加收购价；
3. **出售限制校验**：实现 `validateSellEligibility(item, location)`，严格校验出售资格：不可出售穿戴中的装备（必须来自背包），不可出售账号绑定（`account` 绑定且来源于商城的特定物品）或任务/非卖道具（返回 `BINDING_RESTRICTED`）；
4. **货币整数兑换计算**：实现 `calculateExchange(fromCurrency, units)`，保证 `10000 gold ⇄ 1 points` 法定固定比率，必须为正整数单位，双向净资产无增发。

**Blocked by:** None。

## Acceptance criteria

- [x] 报价表包含药剂与白装，具备唯一 `offerId`、价格与 `quoteRef`，非表中商品拒绝。
- [x] 固定回收价仅由模板、等级、品质决定，强化 +10 或带有极品词条的装备收购价与普通同模板同装等同品质装备完全一致。
- [x] 穿戴中装备尝试出售时直接拒绝，不可交易或商城绑定道具拒绝（`BINDING_RESTRICTED`）。
- [x] 货币兑换比率严格为 `10000:1`，非法单位（0、负数、浮点数）拒绝，净资产守恒。

## Tests and evidence

- 规则单元测试 `shop-rules.test.mjs`。
- 药剂/白装价格查询与无效 offer 校验。
- 强化高等级与基础白装回收价等值断言。
- 穿戴态/商城绑定物出售阻断断言。
- 兑换双向比率与非法参数防御测试。
