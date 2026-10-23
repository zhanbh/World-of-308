---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st06-03
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st06
    revision: cd6bd719284e6dd0da31c80047a3bb4a6cbfc9884ddd9da766d72a31ed3c3644
    path: docs/stories/warrior-loop/st06/spec.md
implements: [st06-shop-wallet-exchange]
blocked_by:
  - artifact_id: ticket:warrior-loop-st06-01
---
# 03：`shop.sell` 事务服务与出售限制校验

**What to build:**
实现 `shop.sell` 事务应用服务：
1. **服务地点上下文校验**：验证 `contextId` 对应合法开启的商人服务；
2. **出售对象与位置校验**：
   - 支持装备（`equipment`，数量必须为 1）与堆叠物品（`stack`，数量 1～20）；
   - 目标物品必须位于当前角色的背包（`backpack`）内；
   - 拦截穿戴中装备直接出售；
   - 拦截账号商城绑定道具或不可出售物（返回 `BINDING_RESTRICTED`）；
3. **固定收购金币结算**：
   - 按物品模板、装等、品质基准计算固定收购金币（强化等级与词条不加价）；
   - 堆叠道具按 `单价 * 出售数量` 结算；
4. **事务原子性与无回购**：
   - 物品从背包移除（或堆叠扣减），所属账号钱包增加金币；
   - 不设回购（无 buyback 表与状态），出售后不可逆转；
   - 幂等记录 `operationId`，重复提交返回原结果。

**Blocked by:** `ticket:warrior-loop-st06-01`。

## Acceptance criteria

- [x] 尝试出售穿戴中装备被拦截拒绝，必须处于背包中方可出售。
- [x] 尝试出售装备但传入数量不等于 1 被拒绝（`INVALID_EQUIPMENT_QUANTITY` 或 `INVALID_ARGUMENT`）。
- [x] 商城账号绑定道具禁止出售（`BINDING_RESTRICTED`）。
- [x] 强化 +10 武器出售所得金币与未强化白武器完全相同，无词条溢价。
- [x] 出售成功后背包物品移除/数量扣减，所属账号共享钱包金币原子增加，重复请求幂等返回原结果。

## Tests and evidence

- 事务集成测试 `shop-v2.test.mjs`：
  - 成功出售背包白装及药剂堆叠测试。
  - 穿戴中装备出售拦截测试。
  - 强化装备与普通装备收购价等值验证测试。
  - 绑定道具出售拦截测试。
  - 操作重放幂等测试。
