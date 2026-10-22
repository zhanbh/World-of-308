---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st01-02
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st01
    revision: 5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c
    path: docs/stories/warrior-loop/st01/spec.md
implements: [st01-login-session]
blocked_by: [1]
---
# 02：prepare票据与不变截止

**What to build:** 实现按身份/launch/prepareOperationId稳定签发与原意图重放，冻结基础账号/epoch及服务端票据截止。

**Blocked by:** 01。

## Acceptance criteria

- [x] prepare不创建账号/钱包/库，不接管会话或关闭挑战。
- [x] 同键同参保留原票据/base/截止，异参拒绝；到期不因重试延期。
- [x] 使用受控时钟检查-1/0/+1到期边界和并发prepare。

## Tests and evidence

公开prepare入口与真实MemoryStore；不调用云。

QA映射：01/02/04。记录实际命令、精确工具/配置/代码版本、期望/实际、未覆盖项；不把task draft当已实现。
