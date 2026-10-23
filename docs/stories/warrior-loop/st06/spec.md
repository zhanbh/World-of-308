---
artifact_kind: specification
artifact_id: spec:warrior-loop-st06
spec_hash: cd6bd719284e6dd0da31c80047a3bb4a6cbfc9884ddd9da766d72a31ed3c3644
tracker: local-markdown
plan_status: approved
approval_kind: human
approval_evidence: "好的，开始"
stories:
  - slug: st06-shop-wallet-exchange
    title: 商店买卖、共享钱包与整数兑换
    covers: [US6, US12, AC11]
---
# ST06：商店买卖、共享钱包与整数兑换实施规格

2026-10-23。承接 ST05 装备穿脱与评分交付，当前工作分支 `feat/st06-shop`。
本文件为 ST06 实施任务图提案与规格边界，不包含 Jira 操作、SDK 安装、云资源或发布。
来源为[业务故事卡](../st06.md)（SHA-256：`cd6bd719284e6dd0da31c80047a3bb4a6cbfc9884ddd9da766d72a31ed3c3644`）、[API 合同](../../backend/api-contract-v2.md)、[物理映射](../../backend/asset-physical-mapping-v1.md)、[数据字典](../../backend/data-dictionary-v2.md)与[真相源索引](../../backend/source-of-truth.md)。

## 玩家可验证结果

在合法会话与角色状态下，玩家进行商店购买、物品出售与钱包货币兑换：
1. **商店购买（shop.buy）**：
   - 玩家在城镇向商人（商人服务上下文 `contextId` 有效）按固定商品报价单（`offerId`、`quoteRef`）购买药剂（如初级生命/法力药剂）或新手白装；
   - 支持金币或点券支付（依商品目录配置）；点券购买的商品具备账号绑定属性；
   - 购买数量（1～20）与总费用同步结算；若背包无可用空间容纳所购物品，整笔交易拒绝（`BAG_FULL`），不扣除任何货币；
   - 若钱包对应货币不足，整笔交易拒绝（`CURRENCY_NOT_ENOUGH`）；
   - 报价校验：若客户端提交的 `quoteRef` 与服务端当前有效报价不一致，明确拒绝（`QUOTE_CHANGED`），不静默多扣。
2. **物品出售（shop.sell）**：
   - 玩家可向商人出售背包中的装备或堆叠道具（`target: { kind: 'equipment', itemId }` 或 `{ kind: 'stack', stackId }`）；
   - 仅限出售位于角色背包（`backpack`）中的物品；穿戴中的装备禁止直接出售（需先卸下）；
   - 账号绑定商城商品或不可交易物品禁止出售（`BINDING_RESTRICTED`）；
   - 收购价规则：按物品模板、等级与品质基准固定计入收入金币；强化等级与随机词条不增加收购价；
   - 不设回购（无 buyback）机制，不设分解逻辑；出售后物品原子移出背包，金币原子增加至所属账号共享钱包。
3. **共享钱包与货币整数兑换（wallet.exchange）**：
   - 账号共享钱包（`wallets/{accountId}`）包含 `gold`（金币）与 `points`（点券）；
   - 支持双向法定固定比率整数兑换：`10000 金币 ⇄ 1 点券`；
   - 兑换单位 `exchangeUnits` 必须为正整数（>= 1）；
   - 当 `fromCurrency === 'gold'` 时：扣除 `exchangeUnits * 10000` 金币，增加 `exchangeUnits` 点券；
   - 当 `fromCurrency === 'points'` 时：扣除 `exchangeUnits` 点券，增加 `exchangeUnits * 10000` 金币；
   - 兑换过程保证净资产守恒，严格检查源货币余额（不足拒绝 `CURRENCY_NOT_ENOUGH`），防溢出；
   - 钱包变动同事务原子写入，版本号自增。
4. **客户端协调器**：
   - 纯模型 `ShopCoordinator` 提供商店状态管理（关闭、加载商品表、就绪、提交中、未知结果恢复、错误回滚）与版本隔离。

## 本轮实施范围

- 后端受控 MemoryStore 事务实现 `shop.buy`、`shop.sell`、`wallet.exchange` 命令。
- 扩展 `account.get` 与 `character.get` 查询，返回最新钱包余额与背包状态。
- 客户端纯模型 `ShopCoordinator.ts`。
- 本地 100% 自动化测试与门禁验证，不调用云数据库，不发外部单据。

## 公开测试边界

1. **购买边界**：单件/批量购买、金币不足拒绝、背包满整笔拒绝、报价版本变动拒绝、点券商品绑定赋予。
2. **出售边界**：背包装备/堆叠出售、穿戴中装备禁售拦截、绑定物禁售、强化不涨价收购、非装备数量边界。
3. **兑换边界**：金币换点券、点券换金币、非整数单位拒绝、0/负数拒绝、余额不足拒绝、大额无溢出。
4. **并发与幂等边界**：同一 `operationId` 结果恢复、旧代次会话与跨账号越权拒绝、并发购买/兑换事务隔离。
5. **门禁与评审边界**：`tools/check-all.cjs` 全量 7/7 门禁通过、Standards 与 Spec 双轴评审归档。
