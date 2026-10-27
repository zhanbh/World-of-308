# ST13 战斗药品与主动饰品实施准备

当前状态（2026-10-27）：用户已以“确认，开始吧”正式批准 ST13 任务图与实施边界，授权开始实施。
集成分支 `feat-1.0.0`，基准为 **`5a89338`**。已冻结只读 [实施spec](spec.md)、生成五项本地 [issues](issues/01-battle-potion.md)，完成源hash/覆盖/依赖无环检查并记录于 [计划检查](plan-check.json) 与 [执行记录](execution.json)。
当前推进首项实施票据：**ST13-01 战斗血蓝药：库存、恢复与共享CD同笔生效**。


[来源故事](../st13.md) · [任务图与测试边界](task-plan.md) · [当前权威合同](../../../backend/source-of-truth.md)。确认后冻结实施spec、发布五项本地issues并执行源hash/覆盖/依赖无环检查；不调用Jira建单、同步或外部状态流程，不编造key/SP。

药品规则来自[主规格](../../../spec.md)、[经济候选](../../../design/economy-proposal-v1.md)；协议/事务依据[有序动作](../../../backend/verified-action-protocol-v1.md)、[算术](../../../backend/combat-arithmetic-contract-v1.md)、[CP](../../../backend/simulation-checkpoint-schema-v1.md)、[物理资产映射](../../../backend/asset-physical-mapping-v1.md)。实际构建、浏览器、手机、SDK/云端各自取证，历史交付摘要不当作本轮已验证。

安装依赖、SDK、云资源和部署不在本轮范围。计划确认不等于验收完成。
