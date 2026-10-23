# ST05 本地实施

[引用规格](spec.md) · [计划检查](plan-check.json)

当前工作分支 `feat/st05-equipment`，基于 `feat/st04-inventory`（已交付背包整理与快捷位能力）。
E01～ST04 全部能力已验证；遵循本地文档驱动，不创建、同步或回填 Jira，不触发外部发布。

| 任务 | 交付 | 本故事内依赖 | 状态 |
| --- | --- | --- | --- |
| [ST05-01](issues/01-slot-restrictions-binding.md) | 13 槽位资格校验与紫装穿戴首次绑定 | 无 | `local-verified` |
| [ST05-02](issues/02-equip-unequip-swap.md) | 穿脱装备与满包原格同部位原子置换 | ST05-01 | `local-verified` |
| [ST05-03](issues/03-durability-combat-attributes.md) | 0耐久属性与套装失效、无耐久槽显示及饰品CD阻断 | ST05-02 | `local-verified` |
| [ST05-04](issues/04-scoring-ranking-projection.md) | 固有装备评分事实与排行榜投影同事务同步 | ST05-02 | `local-verified` |
| [ST05-05](issues/05-equipment-coordinator.md) | 客户端纯模型 EquipmentCoordinator 与状态流转 | ST05-03, ST05-04 | `local-verified` |
| [ST05-06](issues/06-integrate-verify.md) | 全量门禁回归、双轴独立评审与交付归档 | ST05-05 | `local-verified` |

本地验证与独立复核结果见[交付记录](../../../reviews/st05-06-local-verification-2026-10-23.md)、[Standards 独立复核](../../../reviews/st05-standards-independent-review-2026-10-23.md)与[Spec 独立评审](../../../reviews/st05-spec-independent-review-2026-10-23.md)。本地实现不替代真实云事务、Cocos 装备面板拖拽与真机验收。无 Jira 或其他外部 issue。

## 依赖关系

```text
           ST05-01（槽位限制与绑定）
                     |
           ST05-02（穿脱与满包交换）
                 /       \
ST05-03（耐久属性套装）   ST05-04（固有评分与投影）
                 \       /
           ST05-05（客户端协调器）
                     |
           ST05-06（联合验收与独立评审）
```
