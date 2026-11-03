---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st20-03
status: accepted
revision: 3963b4672cf983d3911d4eca073dee4b04cb198675f5e2857ae455d32a58b2d0
accepted_revision: 3963b4672cf983d3911d4eca073dee4b04cb198675f5e2857ae455d32a58b2d0
implements: [ST20]
blocked_by: [1]
---
# 03：本人名次三段式精准计数与大容量降级熔断

**What to build:**
实现当前登录角色在排行榜中的精准名次聚合算法：通过三段互斥索引条件（比本人分高、同分但达到时间早、同分同秒但 ID 较小）进行 count 统计并加 1；关联返回 `ownRank`、`scoreReachedAt` 与 `rankAsOf`；在底层聚合能力受限、超时或超额时，优雅降级返回 `ownRank: null`（标识暂不可用），严禁伪造“未上榜”或全表扫库。

**Blocked by:** 01。

**验收：**
本人分段名次计算与全量排序排位 100% 严格一致；换装导致名次上升/下降即时反映；模拟 count 失败时降级返回 `ownRank: null`，列表与本人分数照常可用。

**覆盖：** AC20-5, AC20-6；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
