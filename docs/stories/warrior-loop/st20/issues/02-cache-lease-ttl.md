---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st20-02
status: draft
implements: [ST20]
blocked_by: [1]
---
# 02：短租约原子刷新缓存、TTL 新鲜度机制与并发抢锁

**What to build:**
首屏榜单确定性键独立缓存（`rankCaches`）；配置 15 秒 TTL 新鲜期与 60 秒最大回退期（`stale: true`）；实现 3 秒短租约与版本 CAS 抢锁刷新机制；在多并发请求穿透时，仅抢到锁的单个调用执行底层直读刷新，未抢到锁者安全读取旧缓存或有界直读，防止高并发缓存击穿。

**Blocked by:** 01。

**验收：**
15 秒以内返回 `stale: false`，15~60 秒之间返回 `stale: true`，超过 60 秒触发强制刷新；多并发竞争短租约测试通过；缓存写入失败时不回滚任何装备事实。

**覆盖：** AC20-4, AC20-6；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
