---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st06-04
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
# 04：`wallet.exchange` 货币整数兑换事务服务

**What to build:**
实现 `wallet.exchange` 事务应用服务：
1. **参数与单位合法性**：校验 `fromCurrency`（`gold` 或 `points`），`exchangeUnits` 必须为正整数（>= 1），若包含小数、0 或负数则协议/业务拒绝；
2. **法定比率与净资产守恒**：
   - 当 `fromCurrency === 'gold'`：扣除 `exchangeUnits * 10000` 金币，增加 `exchangeUnits` 点券；
   - 当 `fromCurrency === 'points'`：扣除 `exchangeUnits` 点券，增加 `exchangeUnits * 10000` 金币；
3. **共享钱包余额校验**：校验所属账号共享钱包（`wallets/{accountId}`），若源货币余额不足整笔拒绝（`CURRENCY_NOT_ENOUGH`）；
4. **整数边界与溢出防御**：运算全程使用安全无溢出精确算术（`BigInt` 或受控 SafeInteger），防资产数值溢出；
5. **事务原子性与幂等**：钱包 `gold`、`points` 与 `version` 原子更新，写入操作凭证（`OperationEntity`），重放返回原结果。

**Blocked by:** `ticket:warrior-loop-st06-01`。

## Acceptance criteria

- [x] 金币换点券：消耗 10000 金币精准兑换 1 点券，消耗 50000 金币精准兑换 5 点券。
- [x] 点券换金币：消耗 1 点券精准兑换 10000 金币，消耗 3 点券精准兑换 30000 金币。
- [x] 源货币不足时整笔拒绝 `CURRENCY_NOT_ENOUGH`，目标货币不发生变动。
- [x] 非法兑换单位（0、负数、浮点数）被严格拒绝。
- [x] 同一 `operationId` 重复提交返回原兑换结果（`replayed: true`），不发生重复扣换。

## Tests and evidence

- 事务集成测试 `shop-v2.test.mjs`：
  - 金币兑换点券成功用例与余额不足用例。
  - 点券兑换金币成功用例与余额不足用例。
  - 批量兑换（大额）与边界测试。
  - 操作重放幂等测试。
