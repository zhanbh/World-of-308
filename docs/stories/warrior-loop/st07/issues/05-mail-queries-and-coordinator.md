---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st07-05
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st07
    revision: 1fceb0768f1fea2f27e60b3fdbc411f767da432d47cebf065626d01c6aee3a13
    path: docs/stories/warrior-loop/st07/spec.md
implements: [st07-mail-and-pending-rewards]
blocked_by: [2, 3, 4]
---
# 05：邮件/待领列表查询与客户端纯模型 `MailCoordinator`

**What to build:**
实现邮件与待领查询接口以及客户端纯模型协调器（`client/assets/scripts/net/MailCoordinator.ts`）：
1. **列表与摘要查询**：
   - `mail.list`：校验邮箱服务上下文；返回该角色未删除邮件，按 `createdAt` 倒序排列；每个邮件带到期时间戳、是否已读、附件列表（`attachmentId`, `kind`, `templateRef`, `quantityGranted`, `quantityClaimed`, `binding`）；
   - `reward.list`：校验邮箱服务上下文；返回该角色处于 `pending` 状态且未交付的永久待领记录，按 `createdAt` 倒序排列，绝不携带到期时间；
   - `delivery.summary`：无需服务上下文（HUD 徽标直接调用）；动态汇总当前角色的未读/有未领附件的有效（未过期且未删除）邮件数 `unreadMailCount`，以及未领取的永久待领数 `pendingCount`。
2. **客户端纯模型协调器（MailCoordinator）**：
   - 状态模型：`idle | loading | ready | submitting | error`；
   - 支持的方法：
     - `loadMailList()` / `loadRewardList()` / `refreshSummary()`；
     - `markRead(mailId)`；
     - `deleteMail(mailId)`；
     - `claimAttachment(mailId, attachmentId)`；
     - `claimReward(grantId)`；
   - 世代代次隔离（`generation`），丢弃旧代次或已关闭面板后迟到的响应；
   - 网络异常转换为 `RESULT_UNKNOWN` 并通过 `operation.get` 受控轮询恢复，不产生重复意图。

**Blocked by:** 02, 03, 04。

## Acceptance criteria

- [x] `mail.list` 返回结果严格按 `createdAt` 倒序，已删除邮件不出现在列表中。
- [x] `reward.list` 返回永久待领列表，倒序排列，不包含过期字段，已交付待领排除。
- [x] `delivery.summary` 准确计算未读/未领邮件数与待领装备数，过期邮件不计入未领计数。
- [x] `MailCoordinator` 状态流转符合状态机，单项领取、已读、删除及错误恢复均正常响应。
- [x] 协调器支持面板关闭后的世代隔离，丢弃低版本响应。

## Tests and evidence

- 邮件与待领协调器集成测试 `backend/test/mail-coordinator.test.mjs`。
- 邮件倒序列表查询与分页游标测试。
- HUD 交付摘要数量在各种状态（未读、领完、过期、待领）下的准确性断言。
- 协调器网络丢包恢复与代次隔离断言。
