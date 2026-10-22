# ST03 本地实施任务图（已确认）

[来源故事](../st03.md) · [实施规格](spec.md)。ST02本地前置已交付，用户已整体确认任务图及测试边界，开始ST03本地实现；不扩大SDK/云授权。

| 编号 | 独立交付 | 硬依赖 |
| --- | --- | --- |
| [01](issues/01-character-select-epoch.md) | 角色选择与代次控制 | 无 |
| [02](issues/02-town-movement-state.md) | 城镇位置与移动权威状态 | 01 |
| [03](issues/03-service-location-context.md) | 服务地点授权与 ServiceContext 机制 | 02 |
| [04](issues/04-private-read-models.md) | 私有读模型与字段裁剪 | 03 |
| [05](issues/05-town-coordinator.md) | 客户端城镇协调器与生命周期状态机 | 04 |
| [06](issues/06-integrate-verify.md) | 联合验收、独立评审与迁移交接 | 04, 05 |

顺序：01→02→03→04→05→06，06依赖04与05。每票是可独立验证的能力切片，不按前后端分仓。任务计划已整体确认，plan_approval=user-confirmed；draft仍表示产物尚未验收。

本图及 spec 列出的四个公开测试边界已获一次整体确认，按 TDD 连续推进至 06，不逐票请求确认。真实平台微信认证、云 SDK/索引、真机仍为独立 GAP；遵循工程约束不创建 Jira 或外部发布。
