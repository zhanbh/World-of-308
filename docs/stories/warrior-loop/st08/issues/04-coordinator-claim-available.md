---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st08-04
status: local-verified
plan_approval: user-confirmed
implementation_status: local-verified
revision: 2
derived_from:
  - artifact_id: spec:warrior-loop-st08
    revision: e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d
    path: docs/stories/warrior-loop/st08/spec.md
implements: [st08-batch-mail-claim]
blocked_by: [3]
---
# 04：客户端协调器一键批领驱动与状态汇总

**What to build:**
在客户端纯模型协调器（`client/assets/scripts/net/MailCoordinator.ts`）中增加一键批量领取驱动逻辑：
1. **自动循环驱动**：
   - 提供 `claimAvailable()` 方法；
   - 生成唯一的 `batchIntentId`；
   - 第一次发送携带 `cursor: null`；
   - 收到服务端每步最多 4 项的返回后，检查 `nextCursor`；若 `nextCursor` 非空且 `state !== 'completed'`，自动发起下一步请求携带该游标；
   - 持续循环直到 `state === 'completed'` 或 `nextCursor === null`；
2. **汇总与状态更新**：
   - 统计整个批次中成功交付的道具总数（`totalDelivered`）与被跳过的满包/过期项总数（`skippedCount`）；
   - 每次成功步进后同步本地邮件与附件剩余状态；
   - 批次结束后刷新 `delivery.summary` 与邮件列表；
3. **世代隔离与未知恢复**：
   - 支持在执行过程中面板被用户关闭时的立即停止；
   - 当遇到子项或请求 `unknown` 时挂起状态，通过 `operation.get` 恢复原结果后继续推进。

**Blocked by:** 03。

## Acceptance criteria

- [x] `MailCoordinator.claimAvailable()` 能自动完成跨多步（多请求）的批次领取直至 `completed`。
- [x] 准确汇总全批次的成功交付数与跳过数。
- [x] 面板关闭后立即阻断后续自动步进请求，世代代次隔离有效。
- [x] 中途网络抖动能够安全进入 `unknown` 并在恢复后继续。

## Tests and evidence

- 协调器批领单元测试 `backend/test/mail-coordinator-batch.test.mjs`。
- 自动驱动跨多步 4 项测试：`test('MailCoordinator.claimAvailable auto-loops across steps until completed and aggregates delivered & skipped')` 通过。
- 满包跳过项目统计断言：Step 1 与 Step 2 累计成功交付 11 项，跳过 2 项断言通过。
- 中途关窗停止推进断言：`test('MailCoordinator.claimAvailable halts immediately if panel is closed mid-loop')` 通过。
- 网络中断进入 unknown 与 recover 恢复断言：`test('MailCoordinator.claimAvailable enters unknown on network drop and recovers via operation.get')` 通过。

