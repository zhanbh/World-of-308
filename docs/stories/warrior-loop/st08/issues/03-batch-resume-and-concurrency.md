---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st08-03
status: local-verified
plan_approval: user-confirmed
implementation_status: local-verified
revision: 2
derived_from:
  - artifact_id: spec:warrior-loop-st08
    revision: e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d
    path: docs/stories/warrior-loop/st08/spec.md
implements: [st08-batch-mail-claim]
blocked_by: [2]
---
# 03：跨请求恢复、关窗重验与并发批次排他

**What to build:**
实现批次跨请求断点推进、中途关窗防越权与并发批次互斥机制（`backend/src/mail/batch-service.ts`）：
1. **跨请求断点恢复（Cursor Continuation）**：
   - 客户端携带上一次返回的 `nextCursor` 发起新的 `mail.claimAvailable` 请求，服务端从对应偏移量精准续接后 4 项；
   - 跨请求累计处理，直到全量 20 项完成（`nextCursor = null`, `state = 'completed'`）；
2. **未知提交与暂停保护**：
   - 当某子项写入发生 `CommitUnknown` 或底层异常时，将该子项置为 `unknown`，批次立即暂停，不跳过该项，等待客户端通过原子操作查询原结果恢复；
3. **关闭面板后重开地点重验**：
   - 客户端关窗离开 NPC 服务半径后，再次请求必须提供新签发的当前有效邮箱上下文（`contextId`）；
   - 严禁凭借旧批次的 `batchIntentId` 绕过服务地点授权校验；
4. **并发批次原子排他**：
   - 当同一角色的两个并发批次指向同一邮件附件时，底层附件依据其 `quantityClaimed` 与版本号原子锁控；
   - 先提交者成功领取，后提交者在重验附件时发现剩余量已为 0，标记跳过或已交付，严禁发生重复交付与负数数量。

**Blocked by:** 02。

## Acceptance criteria

- [x] 跨请求携带 `nextCursor` 能够完整分段执行完全部 20 个候选附件。
- [x] 某项提交出现未知异常时批次立即挂起，不跳过不丢单，支持断点恢复。
- [x] 关闭面板或离开 NPC 后，必须重新签发合法邮箱上下文方可继续执行后续步骤。
- [x] 两个并发批次对同一附件的领取严格互斥，保证数量完全守恒且绝不重领。

## Tests and evidence

- 跨请求与并发测试 `backend/test/mail-batch-service.test.mjs`。
- 多请求连续推进直到 `completed` 的端到端断言：`test('multi-step execution across 20 candidates continues to completion')` 通过。
- 关窗离开 NPC 后再次提交被拒断言：`test('location re-verification blocks batch advancement after service closed and resumes on reopen')` 通过。
- 并发两批次争抢同一附件无超领断言：`test('concurrent batches competing for same attachments preserve quantity conservation')` 通过。
- 原生操作查询支持与恢复断言：`test('child operation receipts and recovery via operation.get')` 通过。

