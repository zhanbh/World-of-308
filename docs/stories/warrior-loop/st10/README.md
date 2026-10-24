# ST10 副本入口、体力快照与三步开房

2026-10-24；用户已确认五项任务图并授权“好的，开始吧”。integration为feat-1.0.0；无Jira/外部任务、无安装或云部署。

[只读规格](spec.md)、[已确认任务图](task-plan.md)、[来源/图检查](plan-check.json)、[当前执行状态](execution.json)。issues/01～05保存Approved修订快照；执行记录另存，不把源故事proposed快照当未授权。测试边界与任务图一并确认，不重复询问相同边界。

按01→02→03→04→05依赖推进；每implementer从最新integration tip建立独立工作树、TDD逐片、merger合入，再推进frontier。最终完整diff独立Standards/Spec评审并集中修复，保留实际SHA/结果/未运行项，不冒充真实微信/SDK/手机通过。
