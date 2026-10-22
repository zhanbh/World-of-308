---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st01-03
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st01
    revision: 5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c
    path: docs/stories/warrior-loop/st01/spec.md
implements: [st01-login-session]
blocked_by: [2]
---
# 03：首次commit与原登录回执

**What to build:** 实现可信票据提交、首次八键原子初始化及无旧角色/场景的已有账号切代，未知结果沿原open键恢复。

**Blocked by:** 02。

## Acceptance criteria

- [x] 同身份并发首次commit只生成一账号，一票据消耗/一原结果；冲突不自动抢回。
- [x] 响应丢失同意图重试不重复初始化或增epoch；历史回执标superseded，不恢复旧写权。
- [x] 每写点失败整笔回滚，已存账号钱包/库不重置；异常候选键碰撞拒绝不猜补。

## Tests and evidence

公开commit入口与真实事务故障/并发；带旧场景完整路径由04补齐。

QA映射：01/02/04。记录实际命令、精确工具/配置/代码版本、期望/实际、未覆盖项；不把task draft当已实现。
