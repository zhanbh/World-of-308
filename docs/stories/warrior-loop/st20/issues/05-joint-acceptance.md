---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st20-05
status: draft
implements: [ST20]
blocked_by: [4]
---
# 05：换装/强化即时刷新联合验收、物理预算与两轴评审

**What to build:**
构建端到端大闭环联合验收套件 `backend/test/ranking-joint-acceptance.test.mjs`：
1. 真实换装（ST05）/强化（ST18）→ 评分与达到时间变动 → 排行榜投影即时更新 → 打开榜单即时呈现名次变化大闭环；
2. 物理读写与网络传输预算实测（单页响应 $\le 64$ KiB，单文档 $\le 16$ KiB）；
3. 并发换装/出售与排行查询的 OCC 安全竞争；
4. 交付全量 7 阶段自动化门禁（`tools/check-all.cjs`）；
5. 产出 Standards 独立评审与 Spec 独立评审报告并归档。

**Blocked by:** 04。

**验收：**
端到端大闭环测试 100% 通过；物理事务与传输预算合格；全量回归 0 失败；双轴独立评审无违规偏离。

**覆盖：** AC20-1 ～ AC20-8；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
