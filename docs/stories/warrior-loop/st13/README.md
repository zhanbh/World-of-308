# ST13 战斗药品与主动饰品实施准备

接续优先级（2026-10-27）：建议先关闭ST12已确认的联调/预算证据缺口，再开始ST13编码。见[收尾与准备交接](../../../reviews/handoff-st12-closeout-st13-2026-10-27.md)。本目录草案保留，不视为新任务图已确认。

2026-10-27。当前集成分支`feat-1.0.0`，准备基点`c3e8e82`，工作区起始干净。用户要求按build继续ST13，并再次明确不得创建任何Jira单。当前仅准备本地任务图，未批准具体图、未开始业务编码。

[来源故事](../st13.md) · [任务图与测试边界](task-plan.md) · [当前权威合同](../../../backend/source-of-truth.md)。确认后冻结实施spec、发布五项本地issues并执行源hash/覆盖/依赖无环检查；不调用Jira建单、同步或外部状态流程，不编造key/SP。

药品规则来自[主规格](../../../spec.md)、[经济候选](../../../design/economy-proposal-v1.md)；协议/事务依据[有序动作](../../../backend/verified-action-protocol-v1.md)、[算术](../../../backend/combat-arithmetic-contract-v1.md)、[CP](../../../backend/simulation-checkpoint-schema-v1.md)、[物理资产映射](../../../backend/asset-physical-mapping-v1.md)。实际构建、浏览器、手机、SDK/云端各自取证，历史交付摘要不当作本轮已验证。

安装依赖、SDK、云资源和部署不在本轮范围。计划确认不等于验收完成。
