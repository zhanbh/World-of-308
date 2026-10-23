---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st08-02
status: local-verified
plan_approval: user-confirmed
implementation_status: local-verified
revision: 2
derived_from:
  - artifact_id: spec:warrior-loop-st08
    revision: e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d
    path: docs/stories/warrior-loop/st08/spec.md
implements: [st08-batch-mail-claim]
blocked_by: [1]
---
# 02：`DeliveryBatchEntity` 状态持久化与单步 4 项事务执行器

**What to build:**
实现持久化批次状态与单步最多 4 项的事务执行引擎（`backend/src/mail/batch-service.ts` 或扩展 `mail-service.ts`）：
1. **批次实体（DeliveryBatchEntity）**：
   - 存储在 `v2:batch:${accountId}:${batchIntentId}`；
   - 字段：`schemaVersion: 2`, `id`, `accountId`, `characterId`, `batchIntentId`, `items`, `cursor`, `state: 'pending' | 'partial' | 'completed'`, `createdAt`, `updatedAt`；
2. **单步 4 项有界执行**：
   - 单个服务请求最多执行 4 个候选附件（`items.slice(offset, offset + 4)`）；
   - 每个子项执行：
     - 实时校验当前真实时间：若邮件已过期，该子项标记为 `rejected`（`deliveredQuantity = 0`）；
     - 若为装备道具：检查背包是否有空格。若满包，该子项标记为 `rejected`（`BAG_FULL`，`deliveredQuantity = 0`），**不阻断批次，跳过继续处理后续项**；若有空格，整件物化入包，子项标记为 `committed`（`deliveredQuantity = 1`）；
     - 若为堆叠道具：根据背包空间计算可入包数量，若可容纳部分则成功领取并入包，子项标记为 `committed`（`deliveredQuantity = actualDelivered`）；若完全无空间则跳过；
     - 每项生成独立的 `childOperationId` 凭据与资产流水；
   - 步进结束更新 `nextCursor`，若所有候选处理完毕，批次状态置为 `completed`；若仍有剩余项，置为 `partial`。

**Blocked by:** 01。

## Acceptance criteria

- [x] 单次请求执行严格限制在 1～4 项之间，绝不越界单次执行超过 4 项。
- [x] 满包项标记为 `rejected` 并安全跳过，后续具备容纳条件的堆叠项依然能够成功领取并合堆。
- [x] 真实过期项正确被拦截，不因扫描时未到期而发生越权交付。
- [x] 每次执行原子更新批次状态、子项执行记录与背包/附件状态。

## Tests and evidence

- 批次步进服务集成测试 `backend/test/mail-batch-service.test.mjs`。
- 单次 4 项执行截断断言：`test('batch execution limits each request to at most 4 items with cursor progression')` 通过。
- 满包跳过后项继续成功领取断言（AC8）：`test('full bag equipment is skipped while subsequent stack item merges successfully (AC8)')` 通过。
- 执行前瞬间过期拦截测试：`test('real-time expiry intercept skips expired mail item during step execution')` 通过。

