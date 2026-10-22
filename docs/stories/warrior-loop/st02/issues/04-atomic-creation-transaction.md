---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st02-04
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st02
    revision: 4605b8375d337ba356e49e2380fcf8a98e074c584c26f2f542dff20ab80d6e4f
    path: docs/stories/warrior-loop/st02/spec.md
implements: [st02-warrior-creation]
blocked_by: [3]
---
# 04：创角原子事务与故障回滚

**What to build:** 组装创角九键写入（名称占位、角色、背包、个人库、初始武器、邮件、邮件来源存根、账号角色索引、资产流水与操作回执）的原子事务，实现单写点故障全额回滚与同意图响应丢失恢复。

**Blocked by:** 03。

## Acceptance criteria

- [x] 九键原子提交：名称占位、角色、背包、个人库、武器、邮件、邮件来源存根、账号更新及资产流水在单笔事务内原子完成，更新账号 `characterIdsByClass['warrior']` 与 `writeRevision`。
- [x] 故障注入全额回滚：在全部写点注入故障，验证任何一处失败都不会残留未完成的角色、占位或容器，严禁产生“半创建”状态。
- [x] 意图去重与结果恢复：同一 `operationId` 重复提交返回原创建成功结果（`replayed=true`），异意图重复提交同一名字或职业直接拒绝。

## Tests and evidence

测试入口：MemoryStore 真实原子事务与故障路径测试。
- 9 个写点故障注入全额回滚测试。
- 提交丢响应后原 `operationId` 重发精准找回原角色 ID 与实体。
- 并发提交同账号或同名创角仅一笔成功。
