---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st08-01
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st08
    revision: e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d
    path: docs/stories/warrior-loop/st08/spec.md
implements: [st08-batch-mail-claim]
blocked_by: []
---
# 01：批次扫描与候选附件规划引擎

**What to build:**
实现批次建立与候选附件收集规划纯函数（`backend/src/mail/batch-planning.ts`）：
1. **有界扫描规则**：
   - 输入：角色邮件集合（按 `createdAt` 倒序）、当前服务器时间戳 `now`；
   - 扫描上限：至多扫描 100 封有效（未删除）邮件；
   - 过滤条件：排除已过期的邮件（`now >= mail.expiresAt`），仅收集包含未领完附件（`quantityClaimed < quantityGranted`）的条目；
   - 候选数量上限：单批最多收集固定 20 个候选附件（`BatchItemCandidate`）；
2. **确定性子操作 ID 生成**：
   - 格式：`${batchIntentId}-c${index}` 或 `${batchIntentId}-${mailId}-${attachmentId}`；
   - 保证幂等执行与网络重试时不因客户端重新发起而生成随机新 ID。
3. **支持游标切片与显式选择**：
   - 若客户端提供 `selection`，校验其非空且长度不超过 20，并映射为规划条目；
   - 若客户端提供 `cursor`，支持从既有批次中基于游标向后切出下一批最多 4 项待处理子任务。

**Blocked by:** None。

## Acceptance criteria

- [x] 扫描上限严格限制为 100 封邮件，单批候选附件严格不超过 20 个。
- [x] 自动跳过已过期邮件与所有附件已领完的邮件，只规划未领完附件。
- [x] 为每个候选附件生成稳定确定性的 `childOperationId`。
- [x] 支持基于游标的分页切片，切片步进上限为 4 项。

## Tests and evidence

- 规划单元测试 `backend/test/batch-planning.test.mjs`。
- 超过 100 封邮件与超过 20 个附件的有界截断断言。
- 过滤已过期邮件与已领完附件测试。
- 确定性子操作 ID 生成断言。
