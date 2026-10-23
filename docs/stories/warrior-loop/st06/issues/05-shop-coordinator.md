---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st06-05
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
  - artifact_id: ticket:warrior-loop-st06-02
  - artifact_id: ticket:warrior-loop-st06-03
  - artifact_id: ticket:warrior-loop-st06-04
---
# 05：客户端纯模型 `ShopCoordinator` 与状态流转

**What to build:**
实现客户端无 UI 依赖纯 TypeScript 协调器 `client/assets/scripts/net/ShopCoordinator.ts`：
1. **状态机规范**：
   - 包含状态：`closed`（关闭）、`loading`（加载商品目录）、`ready`（就绪）、`submitting`（交易提交中）、`unknown`（结果未知/丢包）、`failed`（失败报错）；
2. **核心业务动作**：
   - `open(serviceKind)`：请求打开商店并初始化商品清单与当前钱包快照；
   - `buy(offerId, quantity, quoteRef)`：乐观调度购买请求；
   - `sell(target, quantity, quoteRef)`：乐观调度出售请求；
   - `exchange(fromCurrency, exchangeUnits, quoteRef)`：乐观调度兑换请求；
   - `close()`：关闭商店并清理上下文；
   - `retryOriginal()` 与 `recover()`：未知异常/超时状态下的幂等重试与原结果查询恢复；
3. **防护机制**：
   - 代次隔离：面板关闭后丢弃一切迟到的异步响应；
   - 乐观状态在服务端返回 `rejected` 时自动回滚到提交前快照；
   - 提交过程中互斥阻断重入。

**Blocked by:** `ticket:warrior-loop-st06-02`, `ticket:warrior-loop-st06-03`, `ticket:warrior-loop-st06-04`。

## Acceptance criteria

- [x] 协调器严密管理 `closed` -> `loading` -> `ready` -> `submitting` 状态转移。
- [x] 提交中并发调用被本地拦截，防双击重入。
- [x] 服务端返回错误时，本地乐观数据完整回滚，状态转为 `failed` 或恢复 `ready`。
- [x] 遇到网络未知丢包时转入 `unknown`，可通过 `recover` 恢复原已提交结果。
- [x] 关闭面板后，旧代次异步网络回调被彻底隔离丢弃，不污染新状态。

## Tests and evidence

- 协调器单元测试 `shop-coordinator-v2.test.mjs`：
  - 状态流转覆盖测试。
  - 购买/出售/兑换乐观流转与失败回滚测试。
  - 并发提交互斥拦截测试。
  - 代次隔离与超时未知状态恢复测试。
