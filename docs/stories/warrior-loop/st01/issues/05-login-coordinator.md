---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st01-05
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st01
    revision: 5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c
    path: docs/stories/warrior-loop/st01/spec.md
implements: [st01-login-session]
blocked_by: [2, 4]
---
# 05：调用方登录流程与迟回调隔离

**What to build:** 平台无关LoginCoordinator消费真实v2 wire，保持launch/prepare/open意图稳定并仅在当前流程发送commit，提供本地可重复演示。

**Blocked by:** 02, 04。

## Acceptance criteria

- [x] 旧流程prepare迟回调不发送commit；关闭/替换不把旧成功覆盖当前登录。
- [x] unknown先原键找回结果，不自动新票据抢占；superseded要求重新进入，状态明确。
- [x] 传输端口接真实本地应用合同，未接SDK/Cocos UI明确标记，无固定成功handler。

## Tests and evidence

调用方公开状态和传输边界；验证真实本地应用，平台认证/设备保持GAP。

QA映射：01/02/04。记录实际命令、精确工具/配置/代码版本、期望/实际、未覆盖项；不把task draft当已实现。

10项真实本地组合测试及strict类型检查通过，ticket保留draft代表未独立产物验收；[验证记录](../../../../reviews/st01-05-local-verification-2026-10-22.md)、[接口映射](../../../../design/st01-login-coordinator-v1.md)。真实平台保持platform-gap。
