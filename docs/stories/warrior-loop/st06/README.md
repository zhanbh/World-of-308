# ST06 本地实施

[引用规格](spec.md) · [计划检查](plan-check.json)

当前工作分支 `feat/st06-shop`，基于 `feat/st05-equipment`（已交付装备穿脱、耐久与固有评分能力）。
E01～ST05 全部能力已验证；遵循本地文档驱动，不创建、同步或回填 Jira，不触发外部发布。

| 任务 | 交付 | 本故事内依赖 | 状态 |
| --- | --- | --- | --- |
| [ST06-01](issues/01-pricing-and-rules.md) | 商店报价与买卖规则计算 | 无 | `local-verified` |
| [ST06-02](issues/02-shop-buy-service.md) | `shop.buy` 事务服务与背包空间校验 | ST06-01 | `local-verified` |
| [ST06-03](issues/03-shop-sell-service.md) | `shop.sell` 事务服务与出售限制校验 | ST06-01 | `local-verified` |
| [ST06-04](issues/04-wallet-exchange-service.md) | `wallet.exchange` 货币整数兑换事务服务 | ST06-01 | `local-verified` |
| [ST06-05](issues/05-shop-coordinator.md) | 客户端纯模型 `ShopCoordinator` 与状态流转 | ST06-02, ST06-03, ST06-04 | `local-verified` |
| [ST06-06](issues/06-integrate-verify.md) | 全量门禁回归、双轴独立评审与交付归档 | ST06-05 | `local-verified` |

本地验证与独立复核结果见[交付记录](../../../reviews/st06-06-local-verification-2026-10-23.md)、[Standards 独立复核](../../../reviews/st06-standards-independent-review-2026-10-23.md)与[Spec 独立评审](../../../reviews/st06-spec-independent-review-2026-10-23.md)。本地实现不替代真实云事务、Cocos 商店面板货架渲染与真机验收。无 Jira 或其他外部 issue。

## 依赖关系

```text
           ST06-01（报价、回收价与兑换规则）
           /          |          \
ST06-02（购买）  ST06-03（出售）  ST06-04（兑换）
           \          |          /
           ST06-05（客户端协调器）
                      |
           ST06-06（联合验收与独立评审）
```
