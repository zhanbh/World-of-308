# ST08 本地实施

[引用规格](spec.md) · [计划检查](plan-check.json)

当前工作分支 `feat-1.0.0`，承接 ST07 单项邮件与永久待领领取交付。
E01～ST07 全部能力已验证；遵循本地文档驱动，不创建、同步或回填 Jira，不触发外部发布。

| 任务 | 交付 | 本故事内依赖 | 状态 |
| --- | --- | --- | --- |
| [ST08-01](issues/01-batch-planning.md) | 批次扫描与候选附件规划引擎 | 无 | `local-verified` |
| [ST08-02](issues/02-batch-step-service.md) | `DeliveryBatchEntity` 状态持久化与单步 4 项事务执行器 | ST08-01 | `local-verified` |
| [ST08-03](issues/03-batch-resume-and-concurrency.md) | 跨请求恢复、关窗重验与并发批次排他 | ST08-02 | `local-verified` |
| [ST08-04](issues/04-coordinator-claim-available.md) | 客户端协调器一键批领驱动与状态汇总 | ST08-03 | `local-verified` |
| [ST08-05](issues/05-integrate-verify.md) | 全量门禁回归、双轴独立评审与交付归档 | ST08-04 | `local-verified` |

## 依赖关系

```text
ST08-01（扫描与候选规划）
   │
ST08-02（持久化与单步4项执行）
   │
ST08-03（跨请求恢复与并发排他）
   │
ST08-04（客户端协调器驱动）
   │
ST08-05（全量门禁与双轴评审）
```
