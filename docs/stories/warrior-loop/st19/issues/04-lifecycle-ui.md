---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st19-04
status: accepted
revision: a528a4d1433a58dd88bcc8cb9848f6f143454c2dbc25d190c148c667d1554ad9
accepted_revision: a528a4d1433a58dd88bcc8cb9848f6f143454c2dbc25d190c148c667d1554ad9
---
# 04：生命周期联动与客户端套装收集展示

**What to build:**
实现资产变动生命周期缺件联动（商店出售最后一件该部位装备即时恢复缺件、强化损毁最后一件该部位装备即时恢复缺件、跨 scope 存入/取出账号金库即时同步持有计数）；实现客户端套装收集状态协调器（`CollectionCoordinator`）与纯模型/UI 视图（展示套装收集进度 `X/11`、各部位已收集高亮与未收集灰显、通关结算获得套装补全反馈、迟包与代次隔离）。

**Blocked by:** 03、ST18-02。

**验收：**
出售与强化损毁后缺件恢复回归测试通过；跨库移转持有同步测试通过；客户端收集模型 100% 测试通过；关闭与切角迟包隔离测试通过。

**覆盖：** AC19-8；来源[实施规格](../spec.md)与[任务图](../task-plan.md)。

仅本地文档提案，待人工确认后冻结；未授权编码、安装、云操作或推送。遵循真相源，冲突不擅改；不伪造 Jira 或平台通过。
