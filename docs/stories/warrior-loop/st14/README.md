# ST14 死亡、复活与失败退出实施准备

当前状态（2026-10-28）：用户已确认开始 ST14 任务规划与实施准备。
集成分支 `feat-1.0.0`，基准为 **`4577f28`**。已冻结只读 [实施spec](spec.md)、生成五项本地 [issues](issues/01-authoritative-death-window.md)，完成源hash/覆盖/依赖无环检查并记录于 [计划检查](plan-check.json) 与 [执行记录](execution.json)。
当前待推进首项实施票据：**ST14-01 权威死亡判定与物理10秒倒计时锚定**。

[来源故事](../st14.md) · [任务图与测试边界](task-plan.md) · [当前权威合同](../../../backend/source-of-truth.md)。确认后冻结实施spec、发布五项本地issues并执行源hash/覆盖/依赖无环检查；不调用Jira建单、同步或外部状态流程，不编造key/SP。

死亡复活规则来自[主规格](../../../spec.md)、[生命周期决策](../../../wayfinder/challenge-flow/issues/01-lifecycle-decisions.md)；状态与恢复契约依据[状态转换](../../../backend/state-transitions-v2.md)、[恢复时序](../../../backend/recovery-timeline-proposal-v1.md)、[算术](../../../backend/combat-arithmetic-contract-v1.md)、[CP模式](../../../backend/simulation-checkpoint-schema-v1.md)与[物理资产映射](../../../backend/asset-physical-mapping-v1.md)。实际构建、无头Node测试、离线Cocos各自取证，历史交付摘要不当作本轮已验证。

安装依赖、SDK、云资源、外部浏览器和部署不在本轮范围。计划确认不等于验收完成。
