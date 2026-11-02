---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st19-03
status: proposed
---
# 03：固定样本重映射、全齐平滑回退与提交不可变性

**What to build:**
基础随机样本由 `sourceKey` 与配置哈希确定性生成；在并发 OCC 冲突重试时，若同笔持有版本变动，未提交候选根据最新持有版本重映射，但基础随机样本绝对不重新抽样（防止样本漂移）；实现 11 部位全齐平滑回退机制（当角色已集齐全部 11 个套装部位时，策略降级调用 `fallbackStrategy` 正常发放，严禁卡死或拒发）；实现提交后绝对不可变性（首次事务提交生成装备实例、pending grant 与原回执 `clearReceipt` 后，重复请求幂等返回原回执）。

**Blocked by:** 02。

**验收：**
OCC 模拟并发重试时基础样本稳定性测试通过；11 件全齐回退随机策略发放通过；丢包重试幂等返回原意图测试通过。

**覆盖：** AC19-6、AC19-7；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
