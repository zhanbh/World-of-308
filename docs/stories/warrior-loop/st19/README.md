# ST19 实施记录与跟踪

2026-11-02；实施规格草案与五项任务图已获用户确认并正式冻结。不开 Jira、不同步 Jira、不伪造 Jira 状态。

- [实施规格](spec.md)
- [五项任务图](task-plan.md)
- [原业务故事](../st19.md)

已核对硬依赖：ST15（通关结算）、ST09（银行金库）、ST07（邮件领取）、ST18（强化与损毁），四项前置能力均已在本地主干交付。

## 批准与当前范围（2026-11-02）

用户“好的，开始吧”确认任务图并授权本地实施。ST19-01 与 ST19-02 已按 frontier 完成实现并合入主干 `feat-1.0.0`。

## ST19-01 本地交付

源码 `a7967f00d2380f2d87e009ee59292395d98fa65e`：策略引擎算法与配置 Profile 解耦，支持 `weighted-random`、`missing-slot-first`、`weighted-missing-first` 调度分发、不可变 Profile 固化与 30 级特殊副本严格门禁；`TerminalConfig` 扩展支持 `strategyProfile`。独立定向测试 8/8 通过，跨模块关联测试 36/36 通过，两项 TypeScript 编译 exit 0，`git diff --check` 通过。见[01验证报告](../../../reviews/st19-01-verification.md)及[01合入核验](../../../reviews/st19-01-merge-verification.md)。

## ST19-02 本地交付

源码 `b8d42ebe96fab98e344ec41706b2dd804d869650`：全口径持有聚合检测（穿戴/背包/个人库/账号库/有效邮件/待领全 6 类存储源）、严格双角色私域隔离、公共账号金库联动共享、毫秒级邮件时效性判定、地面未拾取物排除与损坏摘要原子拒绝完整性保护。独立多口径与隔离测试 6/6 通过，关联回归测试 71/71 通过，两项 TypeScript 编译 exit 0，`git diff --check` 通过。见[02验证报告](../../../reviews/st19-02-verification.md)及[02合入核验](../../../reviews/st19-02-merge-verification.md)。

## ST19-03 本地交付

源码 `ba18c584508e769edc77e49a1946d39aa6e72c6c`：确定性基础样本生成（`deriveDropSample` 基于 `sourceKey` 与配置哈希）、并发 OCC 冲突重试未提交候选重映射且基础样本不漂移（`remapCandidate`）、11 部位全齐平滑安全回退至 `fallbackStrategy`（`weighted-random` 正常发放绝不卡死拒发）、终局结算 `planClear` 提交后绝对不可变性与网络丢包幂等返回原回执。独立定向测试 6/6 全部通过，全量 7 阶段门禁检查 7/7 全部通过（861 项测试 0 失败），TypeScript 编译 Exit Code 0，`git diff --check` 通过。见[03验证报告](../../../reviews/st19-03-verification.md)及[03合入核验](../../../reviews/st19-03-merge-verification.md)。04～05待启动，正式概率参数与真机继续 GAP；未 push。