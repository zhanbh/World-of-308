# ST15 拾取、首领结算与奖励来源实施准备

接续状态（2026-10-29）：用户授权核实并继续，01复用既有干净工作树按TDD实施。实际摘要核验发现旧声明revision与正文不符；不改冻结正文，当前源字节以[接续核验](plan-validation-2026-10-29.json)固定，旧plan-check的hash声明不得冒充本次通过。详见[接续记录](../../../reviews/st15-resume-check-2026-10-29.md)，实际进度沿execution。

当前状态（2026-10-28）：用户已确认开始 ST15 任务规划与实施准备。
集成分支 `feat-1.0.0`，基准为 **`4243635`**。已冻结只读 [实施spec](spec.md)、生成五项本地 [issues](issues/01-room-drop-collect.md)，完成源hash/覆盖/依赖无环检查并记录于 [计划检查](plan-check.json) 与 [执行记录](execution.json)。
当前待推进首项实施票据：**ST15-01 房间怪物掉落生成、拾取入包与满包留地**。

[来源故事](../st15.md) · [任务图与测试边界](task-plan.md) · [当前权威合同](../../../backend/source-of-truth.md)。确认后冻结实施spec、发布五项本地issues并执行源hash/覆盖/依赖无环检查；不调用Jira建单、同步或外部状态流程，不编造key/SP。

拾取与首领终局规则来自[主规格](../../../spec.md)；状态与恢复契约依据[状态转换](../../../backend/state-transitions-v2.md)、[物理资产映射](../../../backend/asset-physical-mapping-v1.md)与[强化与终局预算](../../../backend/enhancement-terminal-budget-v1.md)。实际构建、无头Node测试、离线Cocos各自取证，历史交付摘要不当作本轮已验证。

安装依赖、SDK、云资源、外部浏览器和部署不在本轮范围。计划确认不等于验收完成。
