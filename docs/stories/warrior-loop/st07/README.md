# ST07 本地实施

[引用规格](spec.md) · [计划检查](plan-check.json)

当前工作分支 `feat-1.0.0`，承接 ST06 商店买卖与钱包兑换交付。
E01～ST06 全部能力已验证；遵循本地文档驱动，不创建、同步或回填 Jira，不触发外部发布。

| 任务 | 交付 | 本故事内依赖 | 状态 |
| --- | --- | --- | --- |
| [ST07-01](issues/01-mail-rules-and-expiry.md) | 邮件时效判定、部分领取空间计算与防手删规则引擎 | 无 | `local-verified` |
| [ST07-02](issues/02-mail-read-and-delete.md) | `mail.markRead` 与 `mail.delete` 事务服务 | ST07-01 | `local-verified` |
| [ST07-03](issues/03-mail-claim-attachment.md) | `mail.claimAttachment` 单项附件领取事务服务 | ST07-01 | `local-verified` |
| [ST07-04](issues/04-reward-claim-pending.md) | `reward.claim` 永久待领装备领取事务服务 | ST07-01 | `local-verified` |
| [ST07-05](issues/05-mail-queries-and-coordinator.md) | 邮件/待领列表查询与客户端纯模型 `MailCoordinator` | ST07-02, ST07-03, ST07-04 | `local-verified` |
| [ST07-06](issues/06-integrate-verify.md) | 全量门禁回归、双轴独立评审与交付归档 | ST07-05 | `local-verified` |

## 依赖关系

```text
           ST07-01（时效、容量计算与防手删规则）
           /          |          \
ST07-02（读/删）  ST07-03（附件领）  ST07-04（待领领）
           \          |          /
           ST07-05（查询与协调器）
                      |
           ST07-06（联合验收与独立评审）
```
