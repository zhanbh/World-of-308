# ST02 本地实施任务图（已确认）

[来源故事](../st02.md) · [实施规格](spec.md)。ST01本地前置已交付，用户已整体确认任务图及测试边界，开始ST02本地实现；不扩大SDK/云授权。

| 编号 | 独立交付 | 硬依赖 |
| --- | --- | --- |
| [01](issues/01-name-occupancy.md) | 创角验证与全局占名 | 无 |
| [02](issues/02-character-containers.md) | 初始角色属性与容器隔离 | 01 |
| [03](issues/03-weapon-novice-mail.md) | 初始白武器穿戴与新手邮件发放 | 02 |
| [04](issues/04-atomic-creation-transaction.md) | 创角原子事务与故障回滚 | 03 |
| [05](issues/05-character-coordinator.md) | 客户端创角协调器与结果恢复 | 04 |
| [06](issues/06-integrate-verify.md) | 联合验收、独立评审与迁移交接 | 04, 05 |

顺序：01→02→03→04→05→06，06依赖04与05。每票是可独立验证的能力切片，不按前后端分仓。任务计划已整体确认，plan_approval=user-confirmed；draft仍表示产物尚未验收。

本图及 spec 列出的三个公开测试边界已获一次整体确认，按 TDD 连续推进至 06，不逐票请求确认。真实平台微信认证、云 SDK/索引、真机仍为独立 GAP；遵循工程约束不创建 Jira 或外部发布。
