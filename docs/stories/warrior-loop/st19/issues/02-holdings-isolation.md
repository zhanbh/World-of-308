---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st19-02
status: accepted
revision: 4007207c84ca20ec8271929c8480a39aded9674f2a16670abd737d082030bdc5
accepted_revision: 4007207c84ca20ec8271929c8480a39aded9674f2a16670abd737d082030bdc5
---
# 02：全口径持有同步检测与双角色严格隔离

**What to build:**
聚合检测当前角色 13 槽穿戴、背包、个人金库、公共账号金库、有效邮件、永久待领；实现严格的双角色私域隔离（同一账号下角色 A 拥有的套装物品，即便未绑定或账号绑定，角色 B 判定缺件时绝对排除）；只有真正存入账号金库的公共装备才计入账号 scope；实现邮件时效性判定（`now < expiresAt` 计入持有，`now >= expiresAt` 自动排除）；实现完整性保护（摘要损坏、负数、domainRef 不匹配时原子拒绝，绝不当成缺件补发）。

**Blocked by:** 01、ST09、ST07。

**验收：**
双角色三容器测试矩阵通过；有效邮件恰好到期前后断言正确；未拾取地面物排除断言通过；损坏摘要整笔拒绝断言通过。

**覆盖：** AC19-3、AC19-4、AC19-5；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
