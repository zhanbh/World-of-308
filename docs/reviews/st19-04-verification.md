# ST19-04 实现与验证

日期：2026-11-03
实现分支：`feat/st19-04-lifecycle-ui`
范围：资产全生命周期联动与客户端套装收集展示协调器。
包含：
1. 资产全生命周期联动：商店出售（`shop.sell`）、强化损毁（+13~+20 在 `EnhancementService`）与公共金库跨作用域转移（`BankService`）即时同步持有摘要并在移出最后一件时即时恢复未持有（缺失件）状态；
2. 客户端纯模型协调器（`CollectionCoordinator.ts`）：维护 11 部位套装收集进度状态、高亮/灰显、`X/11` 格式展示、终局结算回执反馈（`latestAwardedSlot`、`isNewCompletion`）、未知状态防御降级及 generation 异步隔离。
来源：[ST19 实施规格](../stories/warrior-loop/st19/spec.md)、[04 实施任务](../stories/warrior-loop/st19/issues/04-lifecycle-ui.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **商店出售装备持有联动（`backend/src/shop/shop-service.ts`）**：
   - 在 `ShopServiceOptions` 中注入 `holdingsDomain?: BankHoldingsDomain`；
   - 在 `shop.sell` 事务处理中，当出售部位属于套装装备时，通过 `domain.keys` 匹配对应的 `collectionKey`，读取并扣减角色作用域持有实体（`HoldingsEntity`）中的 `permanentCount`（减至 0 时安全保留条目或清除计数，版本号自增）；
   - 出售移出最后一件装备后，`isCandidateMissing` 立即将该部位判定为缺失件，确保下一次掉落判定优先补齐。

2. **强化损毁持有联动（`backend/src/enhancement/enhancement-service.ts`）**：
   - 既有 +13~+20 损毁逻辑已接入 `holdingForDestruction` 与 `holdingWrite`，本轮在专项测试中完整建立端到端闭环验证；
   - 当装备在 +13 强化失败发生物理销毁时，事务原子扣减持有计数，使该部件即时回到缺失状态。

3. **公共金库与背包跨作用域转移持有联动（`backend/src/bank/bank-service.ts`）**：
   - `BankService` 跨背包与账号金库转移时，原子同步角色作用域与账号作用域持有摘要；
   - 个人背包向公共金库转移后，账号作用域持有增加，双角色共享全局可见性，避免不同角色跨库重复优先掉落。

4. **客户端套装收集纯模型协调器（`client/assets/scripts/net/CollectionCoordinator.ts`）**：
   - 纯逻辑状态机，遵循三层解耦与只读不可变快照原则；
   - 定义 11 部位枚举与标准顺序（`SET_SLOT_DEFS`）：`head`, `shoulder`, `chest`, `belt`, `leg`, `boots`, `necklace`, `bracelet`, `ring1`, `ring2`, `weapon`；
   - 暴露 `open(options)`、`close()`、`applyHoldings(holdingsList, domain)`、`applyClearReceipt(receipt, domain)`、`recover()`；
   - 维护 `X/11` 字符串进度、`collectedCount`、`isFullSet`、`slotState(slotId)`（`held` / `missing` / `unknown` / `highlighted`）；
   - 通关结算回执应用支持单件新点亮动效反馈（`latestAwardedSlot`）与全套集齐庆祝状态（`isNewCompletion`）；
   - 内置 `generation` 代次隔离，丢弃过时异步响应，界面关闭时拒绝脏更新。
   - 配置 `tools/tsconfig.models.json` 纳入 Stage 6 编译验证。

5. **定向测试套件（`backend/test/collection-lifecycle-ui.test.mjs` 6/6 全部通过）**：
   - `CollectionCoordinator: pure model tracks 11-slot progress, X/11 format, highlights, and full set completion`：验证纯模型状态跟踪与高亮逻辑；
   - `CollectionCoordinator: applyClearReceipt awards new set slot and triggers completion feedback`：验证通关回执实时点亮与首次全齐判定；
   - `CollectionCoordinator: generation isolation protects against late responses and closed UI`：验证代次隔离与界面关闭防御；
   - `ShopService equipment sale: selling last piece of a set item immediately decrements holdings and restores missing slot`：验证装备出售即时扣减持有并恢复缺件判定；
   - `EnhancementService destruction: destroying last piece of a set item restores missing slot`：验证 +13 强化损毁物理退役即时扣减持有并恢复缺件判定；
   - `BankService cross-scope transfer: moving set item between character and account vault synchronizes holdings`：验证背包与账号金库跨库转移持有摘要原子联动。

## 验证证据

1. **定向测试套件（`backend/test/collection-lifecycle-ui.test.mjs` 6/6 全部通过）**：
   - 纯模型 11 部位进度、展示文本及集齐状态断言通过；
   - 掉落回执解析与点亮动效反馈断言通过；
   - 代次隔离与生命周期安全断言通过；
   - 商店出售装备扣减持有断言通过；
   - 强化损毁装备扣减持有断言通过；
   - 金库跨域流转持有同步断言通过。

2. **跨模块关联回归套件（43/43 全部通过）**：
   - `backend/test/collection-lifecycle-ui.test.mjs`：6/6 通过；
   - `backend/test/drop-fixed-sample-fallback.test.mjs`：6/6 通过；
   - `backend/test/drop-strategy.test.mjs`：8/8 通过；
   - `backend/test/holdings-multi-scope.test.mjs`：6/6 通过；
   - `backend/test/repair-cocos.test.mjs`：8/8 通过；
   - `backend/test/boss-clear.test.mjs`：9/9 通过。

## 边界与已知限制

- 仅交付资产全生命周期联动与客户端纯模型协调器。
- 全链路大闭环联合验收、物理预算实测（R44/W33, 16KB summary）与两轴独立评审留待 ST19-05；
- 无 Jira、未向远程 push。
