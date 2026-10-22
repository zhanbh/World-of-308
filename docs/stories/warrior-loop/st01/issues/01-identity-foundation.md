---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st01-01
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st01
    revision: 5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c
    path: docs/stories/warrior-loop/st01/spec.md
implements: [st01-login-session]
blocked_by: []
---
# 01：私有身份端口与登录持久模型

**What to build:** 限定VerifiedIdentity的受信产生入口、配置环境/AppID/来源白名单、确定键及意图编码；复用Store端口并验证v2实体边界。

**Blocked by:** None。

## Acceptance criteria

- [x] 公开DTO无法直接成为可信身份；缺失/跨AppID/环境/来源错误在资产事务前拒绝。
- [x] loginAttempt/openReceipt/session/account及初始化记录有明确v2字段、归属和原元组校验。
- [x] 确定候选ID在事务重试中固定，不泄露subject或凭证到公开结果。

## Tests and evidence

通过受控测试IdentityAdapter和真实应用入口观察；不验证微信SDK。

QA映射：01/02/04。记录实际命令、精确工具/配置/代码版本、期望/实际、未覆盖项；不把task draft当已实现。
