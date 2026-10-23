---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st07-03
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
# 03：`mail.claimAttachment` 单项附件领取事务服务

**What to build:**
实现邮件单项附件领取的受控事务服务（`backend/src/mail/mail-service.ts`）：
1. **基础前置校验**：
   - 会话、代次、角色归属、有效邮箱服务上下文（`contextId`）；
   - 目标邮件存在且未被删除；
   - 时效检查：若 `isMailExpired(mail, currentTime)` 为 true，明确拒绝 `MAIL_EXPIRED`，不可继续领取；
   - 附件检查：目标 `attachmentId` 必须存在于该邮件中；若已领完（`quantityClaimed >= quantityGranted`），拒绝 `ALREADY_DELIVERED`。
2. **堆叠道具领取逻辑（kind === 'stack'）**：
   - 剩余待领量 `remaining = attachment.quantityGranted - attachment.quantityClaimed`；
   - 调用 ST07-01 的容量计算 `calculateStackClaimQuantity(remaining, backpack)` 计算可入包数量 `deliveredQuantity`；
   - 若 `deliveredQuantity === 0`，整笔拒绝 `BAG_FULL`，不更新附件与背包；
   - 若 `deliveredQuantity > 0`：
     - 将 `deliveredQuantity` 道具放入背包：优先填入现有同模板、同绑定的未满堆叠（上限 20），剩余部分分配到可用空格；
     - 更新附件：`attachment.quantityClaimed += deliveredQuantity`；
     - 若 `attachment.quantityClaimed === attachment.quantityGranted`，`attachment.state = 'claimed'`；若仍有剩余，`attachment.state = 'partially_claimed'`；
3. **装备道具领取逻辑（kind === 'equipment'）**：
   - 检查背包空闲格子：若无空格，拒绝 `BAG_FULL`；
   - 若有空格：按附件定义的模板及固定随机规则物化一件全新 `EquipmentEntity` 实例（`id = H(mailId, attachmentId)`），`location = { kind: 'container', containerId: backpack.id }`；
   - 放入背包第一个可用空槽位；
   - 更新附件：`attachment.quantityClaimed = 1`, `attachment.state = 'claimed'`；
4. **事务提交与账本记录**：
   - 更新邮件（版本自增）、背包（版本自增）、角色版本；
   - 写入单笔资产流水 `assetJournal`（记录来源 `mailAttachment`、实领区间与交付数量）；
   - 写入操作记录 `operation`，支持网络丢包恢复与重放。

**Blocked by:** 01。

## Acceptance criteria

- [x] 已过期的邮件领取附件时明确拒绝 `MAIL_EXPIRED`，不改动背包。
- [x] 堆叠道具在背包满时拒绝 `BAG_FULL`；背包容量不足全部领取时，成功领取部分道具并入包，剩余数量留在附件中。
- [x] 装备道具满包拒绝 `BAG_FULL`；有空格时整件入包物化，更新附件为已领。
- [x] 来源实领区间、背包槽位、邮件附件状态与流水账本在同一事务中原子生效。

## Tests and evidence

- 附件领取服务测试 `backend/test/mail-service.test.mjs`。
- 堆叠道具满包拒绝与部分领取（如背包仅能装 3 个，附件 8 个，领出 3 个留 5 个）。
- 再次部分领取直到完全领完测试。
- 装备满包拒绝与整件物化断言。
- 过期邮件拒领与原请求重放断言。
