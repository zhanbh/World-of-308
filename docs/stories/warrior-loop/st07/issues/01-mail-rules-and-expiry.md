---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st07-01
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st07
    revision: 1fceb0768f1fea2f27e60b3fdbc411f767da432d47cebf065626d01c6aee3a13
    path: docs/stories/warrior-loop/st07/spec.md
implements: [st07-mail-and-pending-rewards]
blocked_by: []
---
# 01：邮件时效判定、部分领取空间计算与防手删规则引擎

**What to build:**
建立邮件与奖励领取的纯函数规则引擎（`backend/src/mail/mail-rules.ts`）：
1. **时效判定（isMailExpired）**：
   - 规则：`now >= mail.expiresAt` 则视为已过期；精确按毫秒时间戳比对，UI 剩余天数仅作展示，服务端严格以 `now >= expiresAt` 为准。
2. **防手删规则校验（canDeleteMail）**：
   - 检查邮件是否包含未领完附件：若 `mail.attachments.some(a => a.quantityClaimed < a.quantityGranted)`，返回 false 并阻断删除（对应错误 `UNCLAIMED_ATTACHMENTS`）；
   - 仅当无附件或所有附件的 `quantityClaimed === quantityGranted` 时才允许删除。
3. **堆叠道具部分领取容量计算（calculateStackClaimQuantity）**：
   - 输入：附件待领数量 `remainingQuantity = quantityGranted - quantityClaimed`、物品模板、绑定属性、背包容器 `backpack`；
   - 统计背包当前可用容纳量：
     - 已有相同 `templateRef` 且相同 `binding` 的未满堆叠的可用余量之和（每个堆叠上限 20，`sum(20 - stack.quantity)`）；
     - 空闲槽位数量（`capacity - occupiedSlots`）每个槽位可容纳 20 个；
     - `availableCapacity = existingSpace + emptySlotSpace`；
   - 若 `availableCapacity === 0`，返回 0（调用方映射为 `BAG_FULL`）；
   - 若 `availableCapacity > 0`，实际交付量 `deliveredQuantity = Math.min(remainingQuantity, availableCapacity)`。
4. **装备整件领取容纳校验（canClaimEquipmentAttachment）**：
   - 装备不可拆分堆叠，检查背包空闲槽位数量 `freeSlots = capacity - occupiedSlots`；
   - 若 `freeSlots < 1`，返回 false（对应错误 `BAG_FULL`）。

**Blocked by:** None。

## Acceptance criteria

- [x] `isMailExpired` 在 `now < expiresAt` 时为 false，在 `now === expiresAt` 和 `now > expiresAt` 时精确为 true。
- [x] 只要有一个附件的 `quantityClaimed < quantityGranted`，`canDeleteMail` 必返回 false；全部领完返回 true。
- [x] 堆叠道具满包返回 0 可容纳量；部分可用空间时准确返回可装下的整数数量，不溢出 20 上限。
- [x] 装备道具满包（0 空格）返回不可容纳，至少有 1 个空格时允许整件领取。

## Tests and evidence

- 规则单元测试 `backend/test/mail-rules.test.mjs`。
- 临界时间戳（`expiresAt - 1`、`expiresAt`、`expiresAt + 1`）过期断言。
- 附件未领/部分领/全领下的防手删判断断言。
- 堆叠多未满堆叠与空格组合下的容量计算断言。
- 装备满包与单空格边界断言。
