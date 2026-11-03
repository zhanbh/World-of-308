---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st20-04
status: draft
implements: [ST20]
blocked_by: [2, 3]
---
# 04：Cocos 排行榜面板与纯模型协调器

**What to build:**
构建纯模型协调器 `RankingCoordinator.ts`，维护完整的关闭、加载、就绪、翻页中、失败等状态机；具备代次隔离机制（`generation`），页面关闭后立即停止轮询并过滤在途延迟响应；实现 Cocos 交互组件 `RankingPanel.ts`：支持全榜/职业榜选项卡切换、列表滚动触底翻页、本人排名悬浮行置顶、缓存新鲜度（实时/已缓存）标识与错误重试。

**Blocked by:** 02, 03。

**验收：**
协调器状态机与代次隔离测试全部通过；翻页数据按 characterId 幂等去重；断网或未知响应友好展示恢复重试；Cocos 离线构建通过。

**覆盖：** AC20-3, AC20-7；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
