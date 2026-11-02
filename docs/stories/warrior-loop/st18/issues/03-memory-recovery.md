---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st18-03
status: accepted
revision: 8cf875d04977db421e2d17a5737c1ab2b40011ba075f34ea84ee063592b1ee36
accepted_revision: 8cf875d04977db421e2d17a5737c1ab2b40011ba075f34ea84ee063592b1ee36
---
# 03：跨装备会话记忆与未知结果恢复

**What to build:** 验证同级/邻级/远级失败贡献与成功消耗；跨装备复用、切角/重登清代次与短恢复保留。真实协调器处理未知和迟包，原请求固定样本，已提交结果不因配置/会话变化重算。

**Blocked by:** 02。

**验收：** 20来源上界、定精度舍入/概率封顶、相似消耗守恒；服务重建后读取同代次记忆；成功丢响应/notFound/原tuple重试；切角/OCC冲突不重抽，隐藏字段不泄露。

**覆盖：** AC18-5、6、7、8；来源[规格](../spec.md)和[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；相关测试/类型检查与实际证据绑定提交，不伪造Jira或平台通过。

