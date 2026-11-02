---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st19-01
status: accepted
revision: f4d254e4fe05d6774dafa290a9595a600afdbd50b3fd1d9178dcfe125b1d6eec
accepted_revision: f4d254e4fe05d6774dafa290a9595a600afdbd50b3fd1d9178dcfe125b1d6eec
---
# 01：策略引擎与多策略分层体系

**What to build:**
掉落策略算法与配置 Profile 严格解耦，构建策略注册表与调度分发接口；实现三种核心策略：`weighted-random`（标准权重随机）、`missing-slot-first`（100% 缺件优先）、`weighted-missing-first`（缺件加权，如 2:1 缺件权重）；定义动态策略配置结构（`DropStrategyProfile`，包含 `profileId`、`version`、`strategyId`、`candidates`、`fallbackStrategy`、`holdingsDomain`）；在挑战创建时固化策略 Profile 引用（`challenge.dropProfileRef`），确保挑战进行中不受外部配置热更影响。

**Blocked by:** 无（基于现有 ST15-03 终局结算基础）。

**验收：**
策略算法独立单元测试通过；多 Profile 调度分发正确；特殊本资格严格过滤（只有 30 级特殊本才允许产出套装）；普通副本或非 30 级特殊副本尝试掉落套装时直接报错拒绝（`CONFIG_NOT_READY`）。

**覆盖：** AC19-1、AC19-2；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
