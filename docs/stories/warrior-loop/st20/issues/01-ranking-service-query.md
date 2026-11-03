---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st20-01
status: accepted
revision: cdf65d73c6c0f28f0219b005099e04ad674101391b93ed62835ea91956aec2aa
accepted_revision: cdf65d73c6c0f28f0219b005099e04ad674101391b93ed62835ea91956aec2aa
implements: [ST20]
blocked_by: []
---
# 01：评分排行服务核心、索引排序与分页查询协议

**What to build:**
构建 `RankingService` 服务核心并接入 `ranking.list` 协议处理；建立基于 `(score DESC, scoreReachedAt ASC, characterId ASC)` 的三元组稳定排序索引；支持全服总榜（`all`）、战士职业榜（`warrior`）与猎人职业榜（`hunter`）；实现有界游标编码与解码（单页 1~50 条，默认 20 条，页游标携带签名与页上界）；查询完全只读，不修改角色达到时间。

**Blocked by:** 无（基于现有 ST05/ST18 已存在的 `rankingEntry` 物理实体与 `shared/src/protocol/asset-v2.ts` 中的 `ranking.list` 协议）。

**验收：**
稳定三元组排序单元测试通过；同分保持时间测试通过（分值变动 500→600→500 重新计时）；游标翻页跨页去重测试通过；非法 scope、非法游标、超额页大小严格拒绝；查询过程中角色 `scoreReachedAt` 绝对不变。

**覆盖：** AC20-1, AC20-2, AC20-3, AC20-6；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
