---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st06-02
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
# 02：`shop.buy` 事务服务与背包空间校验

**What to build:**
实现 `shop.buy` 事务应用服务：
1. **服务地点上下文校验**：验证 `contextId` 为当前角色打开且处于 `open` 状态的商人上下文（`serviceKind === 'shop'`），否则返回 `CONTEXT_INVALID` 或 `LOCATION_NOT_ALLOWED`；
2. **报价与商品校验**：匹配有效商品报价单，若客户端 `quoteRef` 与服务端当前版本不符，拒绝 `QUOTE_CHANGED`；
3. **空间整笔校验**：检查角色背包（`backpack` 20 格）：
   - 购买堆叠道具（如药剂）：优先合并入已有未满堆叠（上限 99），剩余量占用新空格；
   - 购买装备（白装）：每件独立占用 1 个空格；
   - 若可用空间不足以容纳全部购买数量，整笔事务回滚并返回 `BAG_FULL`，不扣除任何货币；
4. **货币扣减与发货**：从所属账号共享钱包（`wallets/{accountId}`）扣除对应货币（金币或点券），余额不足拒绝 `CURRENCY_NOT_ENOUGH`；点券商品添加账号绑定；
5. **事务原子性与幂等**：钱包扣减、背包交付与操作日志（`OperationEntity`）在同一事务内完成，重放返回原结果。

**Blocked by:** `ticket:warrior-loop-st06-01`。

## Acceptance criteria

- [x] 非法/关闭的商人 context 拒绝购买（`CONTEXT_INVALID`）。
- [x] 报价不一致时拒绝 `QUOTE_CHANGED`，不静默按新价扣除。
- [x] 钱包金币/点券不足时整笔拒绝 `CURRENCY_NOT_ENOUGH`，背包不变。
- [x] 背包空间不足（如 20 格全满买白装或无法容纳堆叠）整笔拒绝 `BAG_FULL`，货币不扣除。
- [x] 点券购买物品赋予账号绑定；同一 `operationId` 重复提交返回原交付结果（`replayed: true`）。

## Tests and evidence

- 事务集成测试 `shop-v2.test.mjs`：
  - 成功购买药剂与白武器并验证背包和钱包变化。
  - 满包（20/20）购买白装整笔拦截与零扣款验证。
  - 余额不足购买拦截测试。
  - 报价过期/错误测试与操作幂等重放测试。
