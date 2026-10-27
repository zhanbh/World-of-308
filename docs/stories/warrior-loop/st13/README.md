# ST13 战斗药品与主动饰品实施准备

当前状态（2026-10-27）：ST12 收尾加固与真实接线已彻底闭环并通过全量回归（见 [收尾验证报告](../../../reviews/st12-closeout-verification.md)），阻碍缺口已清除。
集成分支 `feat-1.0.0`，基点为 **`93ef202`**，工作区干净。已准备 ST13 本地任务图与测试边界，待用户最终确认后冻结实施规格并发布本地票据。


[来源故事](../st13.md) · [任务图与测试边界](task-plan.md) · [当前权威合同](../../../backend/source-of-truth.md)。确认后冻结实施spec、发布五项本地issues并执行源hash/覆盖/依赖无环检查；不调用Jira建单、同步或外部状态流程，不编造key/SP。

药品规则来自[主规格](../../../spec.md)、[经济候选](../../../design/economy-proposal-v1.md)；协议/事务依据[有序动作](../../../backend/verified-action-protocol-v1.md)、[算术](../../../backend/combat-arithmetic-contract-v1.md)、[CP](../../../backend/simulation-checkpoint-schema-v1.md)、[物理资产映射](../../../backend/asset-physical-mapping-v1.md)。实际构建、浏览器、手机、SDK/云端各自取证，历史交付摘要不当作本轮已验证。

安装依赖、SDK、云资源和部署不在本轮范围。计划确认不等于验收完成。
