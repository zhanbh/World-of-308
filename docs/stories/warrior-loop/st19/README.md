# ST19 实施记录与跟踪

2026-11-02；实施规格草案与五项任务图已获用户确认并正式冻结。不开 Jira、不同步 Jira、不伪造 Jira 状态。

- [实施规格](spec.md)
- [五项任务图](task-plan.md)
- [原业务故事](../st19.md)

已核对硬依赖：ST15（通关结算）、ST09（银行金库）、ST07（邮件领取）、ST18（强化与损毁），四项前置能力均已在本地主干交付。

## 批准与当前范围（2026-11-02）

用户“好的，开始吧”确认任务图并授权本地实施。ST19-01 已按 frontier 完成实现并合入主干 `feat-1.0.0`。

## ST19-01 本地交付

源码 `a7967f00d2380f2d87e009ee59292395d98fa65e`：策略引擎算法与配置 Profile 解耦，支持 `weighted-random`、`missing-slot-first`、`weighted-missing-first` 调度分发、不可变 Profile 固化与 30 级特殊副本严格门禁；`TerminalConfig` 扩展支持 `strategyProfile`。独立定向测试 8/8 通过，跨模块关联测试 36/36 通过，两项 TypeScript 编译 exit 0，`git diff --check` 通过。见[01验证报告](../../../reviews/st19-01-verification.md)及[01合入核验](../../../reviews/st19-01-merge-verification.md)。02～05未启动，未执行全七阶段或Creator，正式概率参数与真机继续GAP；未push。
