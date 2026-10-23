---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st07-02
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st07
    revision: 1fceb0768f1fea2f27e60b3fdbc411f767da432d47cebf065626d01c6aee3a13
    path: docs/stories/warrior-loop/st07/spec.md
implements: [st07-mail-and-pending-rewards]
blocked_by: [1]
---
# 02：`mail.markRead` 与 `mail.delete` 事务服务

**What to build:**
实现邮件标记已读与删除的事务命令（`backend/src/mail/mail-service.ts`）：
1. **`mail.markRead` 命令**：
   - 校验会话（`sessionId`, `sessionEpoch`）、有效邮箱服务上下文（`contextId`, `serviceKind === 'mailbox'`）；
   - 校验角色归属与邮件存在性；若邮件不存在或已被逻辑删除，拒绝 `NOT_FOUND_OR_FORBIDDEN`；
   - 记录 `readAt = mail.readAt ?? currentTime`，邮件版本 `mail.version++`；
   - 保持严格不变性：绝不修改 `createdAt`（防止刷新邮件到期时间），不影响附件领取资格；
   - 支持幂等执行与原操作结果恢复。
2. **`mail.delete` 命令**：
   - 校验会话、邮箱服务上下文、角色归属与邮件存在；
   - 调用 ST07-01 规则 `canDeleteMail(mail)`：若存在未领取附件（`quantityClaimed < quantityGranted`），立即拒绝 `UNCLAIMED_ATTACHMENTS`；
   - 若全部附件已领完，执行逻辑删除：`mail.status = 'deleted'`, `mail.updatedAt = currentTime`, `mail.version++`；
   - 删除后保留来源存根（`mail.sourceKey` 及其附件领取终态凭据），从活跃邮件列表中排除，但确保该来源凭据不可再次生成新邮件；
   - 同事务记录操作结果 `operation`。

**Blocked by:** 01。

## Acceptance criteria

- [x] `mail.markRead` 记录当前时间为已读时间，邮件创建时间 `createdAt` 绝对保持不变。
- [x] 重复调用 `mail.markRead` 保持幂等，不推进已读时间。
- [x] `mail.delete` 面对含未领附件邮件时返回明确错误 `UNCLAIMED_ATTACHMENTS`，不修改邮件状态。
- [x] 全额领完附件的邮件可成功删除，删除后状态为 `deleted`，保留最小来源存根，防止换 operationId 重复发放新手礼包。

## Tests and evidence

- 邮件读/删服务测试 `backend/test/mail-service.test.mjs`。
- 标记已读后验证 `readAt` 填充且 `createdAt` 不变。
- 有附件手删拦截（`UNCLAIMED_ATTACHMENTS`）测试。
- 正常删除后状态为 deleted 与存根保留验证。
- 越权与会话失效阻断断言。
