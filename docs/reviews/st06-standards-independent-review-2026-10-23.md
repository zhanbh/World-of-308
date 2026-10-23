# ST06 Standards 独立复核

2026-10-23。依据 soflow:code-review 的 Standards 轴；评当前未提交工作区，基线 HEAD `f3adcac`，分支 `feat/st06-shop`。

## 结论

硬性标准违规：0。需要整改的 smell 判断：0。此结论只覆盖下述范围；产品合同符合性由独立 Spec 轴处理。

- **确定键与存储隔离**：`assetOp`、`assetJournal`、`stack`、`item` 均通过确定性安全键派生（SHA-256 base64url），无注入风险。
- **状态防御与输入权威**：服务端全权校验价格与目录，拒绝客户端自报价格或余额覆盖；客户端提交 `quoteRef` 必须与有效报价一致，否则拒绝 `QUOTE_CHANGED`，不静默改价。
- **空间守恒与零扣款**：购买白装或堆叠道具时，预先计算背包剩余格子与堆叠余量，若背包无法容纳（如满包 20/20），整笔事务回滚并拒绝 `BAG_FULL`，绝不扣除任何货币。
- **出售限制与无回购**：严格禁止出售穿戴中装备与商城账号绑定物品；固定按模板、装等与品质计算收购价，强化与词条不溢价；不设回购与分解。
- **双向整数兑换与净资产守恒**：`10000 gold ⇄ 1 points` 法定固定比率，严格要求 `>= 1` 整数单位，双向兑换净资产保持恒定，且防 BigInt/安全数值溢出。
- **客户端协调器防御**：`ShopCoordinator` 具备完整的乐观调度、失败恢复与未知状态处理；具备 generation 代次隔离，关闭后丢弃迟到响应。

## 阅读与验证范围

- 检查 `backend/src/shop/shop-model.ts`、`backend/src/shop/shop-rules.ts`、`backend/src/shop/shop-service.ts`。
- 检查 `client/assets/scripts/net/ShopCoordinator.ts`。
- 检查 `backend/test/shop-rules.test.mjs`、`backend/test/shop-v2.test.mjs`、`backend/test/shop-coordinator-v2.test.mjs`。
- 独立命令：运行 232 项全量回归测试，100% 通过；7/7 统一门禁 100% 绿灯。
- 不覆盖 Cocos 商人货架交互与商品图标渲染；该项列为 platform-gap。

## 阅读快照 SHA-256

- `backend/src/shop/shop-model.ts` — `aa0cc32e8698b62d8a4f3962975b46a95c98af0b745117a682131fc891d1adbf`
- `backend/src/shop/shop-rules.ts` — `a70dfb82633866d730f7ca0c7d63b3a1686a7ace6198e61efbb5d3df6029fb8a`
- `backend/src/shop/shop-service.ts` — `552c7dce813daba5f519c8508a336c64d5e2b19bdef521f2a9f4605876ad8d66`
- `client/assets/scripts/net/ShopCoordinator.ts` — `1b73ee2f6b94661190da10fc583d22f5f674f3b10fad50158f8953c5db5032d1`
- `backend/test/shop-rules.test.mjs` — `e5347413a47175ad933811e4224a89ba6a1b6c7db3834399d82a06355490c9af`
- `backend/test/shop-v2.test.mjs` — `6bf9f9f3b21cff891b9e692a780157826617dada3c9b8c9af4b3eeb64f5da5be`
- `backend/test/shop-coordinator-v2.test.mjs` — `c1d1896abefceb5097ea4370779371b93d10133eadcb5835e28266784336ce53`
- `tools/tsconfig.models.json` — `c9bf88736c093ade4d09439cc23694e591335d59b9d3008c595fe03ac4c8121a`
