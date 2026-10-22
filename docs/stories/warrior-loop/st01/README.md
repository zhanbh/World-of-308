# ST01 本地实施任务图（已确认）

[来源故事](../st01.md) · [实施规格](spec.md)。E01本地前置已交付，用户已整体确认任务图及测试边界，开始ST01本地实现；不扩大SDK/云授权。

| 编号 | 独立交付 | 硬依赖 |
| --- | --- | --- |
| [01](issues/01-identity-foundation.md) | 私有身份端口与登录持久模型 | 无 |
| [02](issues/02-prepare-ticket.md) | prepare票据与不变截止 | 01 |
| [03](issues/03-commit-initialize.md) | 首次commit与原登录回执 | 02 |
| [04](issues/04-takeover-handoff.md) | 角色与旧场景原子交接 | 03 |
| [05](issues/05-login-coordinator.md) | 调用方登录流程与迟回调隔离 | 02, 04 |
| [06](issues/06-integrate-verify.md) | 联合验收、独立评审与迁移交接 | 04, 05 |

顺序：01→02→03→04→05→06，05另依赖02；06依赖04/05。每票是可验证能力切片，不按前后端分仓。任务计划已确认，plan_approval=user-confirmed；draft仍表示产物尚未验收。

本图及spec列出的三个公开测试边界已获一次整体确认，按TDD连续推进至06，不逐票请求确认。真实平台身份/SDK、云事务/索引、真机仍为独立GAP；不创建Jira或外部发布。
