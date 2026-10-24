---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st10-03
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st10
    revision: "23272608bc24780e09b3850e117598a78d44fea7614ee7d9015a1060989f34ed"
    path: docs/stories/warrior-loop/st10/spec.md
implements: [ST10]
blocked_by: [2]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST10-03：activate一次扣费，完整状态就绪后ready开场

**Blocked by：** ST10-02。

**What it delivers：** 成功加载后activate原子开首房进入awaitingReady；客户端读齐一致公开状态，再提交ready进入active。没有ready成功便没有预测开战。

- 原子创建确定room/有界CP头及分片，扣本局快照至最低0一次，递增scene/timeline代次并返回ready票据；不能重建同房或重扣，途中武器归零不新增暂停规则。
- H.transitionClock跨activate保留；activate结算已累计联网角色计时，ready只结未消费区间再清时钟。ready才建立活动锚点/inputGapBaseAt；awaitingReady不套战斗2秒输入缺口。
- recoveryPage/公开状态绑定ticket、revision、manifest/publicState hash；资源和完整状态未就绪不允许客户端预测，不开放并行写CP旁路。
- 资产命令走原operation，控制ready走原控制序号/票据回执；未知结果不换ID，重复ready不重启锚点。真实身份、版本、原截止、每写点故障及两种竞争顺序有断言。
- 首房命令端到端演示止于active，不伪造ST11战斗已完成；所有CP/响应/原结果实测UTF-8及边界，不能只测空CP。
