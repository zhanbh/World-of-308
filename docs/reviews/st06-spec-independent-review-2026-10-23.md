# ST06 Spec 独立评审

2026-10-23。依据 soflow:code-review 的 Spec 轴；核对当前工作区对 [ST06 规格](../stories/warrior-loop/st06/spec.md)（源故事卡 SHA-256：`cd6bd719284e6dd0da31c80047a3bb4a6cbfc9884ddd9da766d72a31ed3c3644`）的符合性。

## 评审结论

阻断性发现：0。主要需求（US6、US12、AC11）实现完全符合已确认设计合同。

### 1. 商店购买（shop.buy）与空间守恒（AC11）
- **实现核对**：`shop.buy` 在事务内校验商人地点上下文（`contextId`），匹配商品目录与报价 `quoteRef`；当客户端报价版本与服务端不一致时拒绝 `QUOTE_CHANGED`。
- **空间守恒**：购买白装按 1 件 1 格严格核算，购买药剂堆叠按上限 99 先填后开格核算。若背包无法完全容纳，整笔事务回滚并返回 `BAG_FULL`，钱包金币/点券零扣除。点券商品购买后赋予账号绑定（`account` 绑定）。
- **自动化断言**：`shop-v2.test.mjs` 中“shop.buy purchases potions and white equipment...”与“shop.buy rejects BAG_FULL...”全数通过。

### 2. 物品出售（shop.sell）与固定收购价（AC11）
- **实现核对**：`shop.sell` 拦截穿戴中装备直接出售（必须在背包 `backpack` 内），拦截商城账号绑定道具（`BINDING_RESTRICTED`）；
- **固定收购价**：装备仅按模板基础价、装等与品质计算固定金币收入，强化等级（如 +10）与附加词条不增加收购价；不设回购（无 buyback）机制，不设分解逻辑。
- **自动化断言**：`shop-rules.test.mjs` 中“calculateSellPrice guarantees enhancement and affixes do not increase sell price”与 `shop-v2.test.mjs` 中“shop.sell sells equipment and stacks from backpack...”全数通过。

### 3. 共享钱包与双向整数兑换（wallet.exchange）（US12）
- **实现核对**：`wallet.exchange` 支持金币换点券与点券换金币，严格按 `10000 gold ⇄ 1 points` 整数比率执行，单位必须 `>= 1` 整数；
- **净资产守恒**：双向兑换净资产严格守恒，源货币不足时整笔拒绝 `CURRENCY_NOT_ENOUGH`，目标货币不发生变化；钱包变动为账号级别共享原子更新。
- **自动化断言**：`shop-rules.test.mjs` 与 `shop-v2.test.mjs` 兑换用例全数通过。

### 4. 客户端协调器与幂等恢复
- **实现核对**：`ShopCoordinator` 包含完整状态流转，实现乐观并发拦截、网络异常转 `unknown`、原请求幂等重发及通过 `operation.get` 恢复已提交结果；关闭面板代次隔离丢弃迟到响应。
- **自动化断言**：`shop-coordinator-v2.test.mjs` 7 项测试全数通过。

## 遗留平台缺口（Platform Gaps）

- Cocos 商人货架节点渲染、商品图标展示与拖拽出售手势。列为后续 UI 集成责任，不阻塞当前业务与协议完成。
