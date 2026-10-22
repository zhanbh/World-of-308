---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st02-05
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st02
    revision: 4605b8375d337ba356e49e2380fcf8a98e074c584c26f2f542dff20ab80d6e4f
    path: docs/stories/warrior-loop/st02/spec.md
implements: [st02-warrior-creation]
blocked_by: [4]
---
# 05：客户端创角协调器与结果恢复

**What to build:** 实现客户端纯模型 `CharacterCoordinator`，消费 E01 session-v2 协议，完成名称前置校验、会话信封构造、未知结果原意图保护与代次隔离。

**Blocked by:** 04。

## Acceptance criteria

- [x] 协调器纯模型封装：输入校验、生成稳定 `operationId`、构造合法 `SessionEnvelope` 及 `character.create` 请求。
- [x] 响应丢失与恢复保护：当遇到网络超时或返回 `status: 'unknown'` 时，协调器保持原 `operationId` 重试，不擅自换意图重新申请。
- [x] 业务拒绝与状态隔离：正确解析 `CLASS_EXISTS`、`INVALID_ARGUMENT`、`VERSION_CONFLICT` 等结果并通知调用方；隔离旧 launch 或旧请求的迟到回调。

## Tests and evidence

测试入口：客户端纯模型测试。
- 模拟网络丢包与重发时保持原意图。
- 接收已成功创角回执后角色摘要同步。
- 收到错误码后的状态转换驱动。
