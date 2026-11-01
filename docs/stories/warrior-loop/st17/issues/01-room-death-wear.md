---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st17-01
status: accepted
revision: b11a66dcdf6ee6866c8086d8eda8a0774d28b42d4c6178cb20c8708606b3d4d6
accepted_revision: b11a66dcdf6ee6866c8086d8eda8a0774d28b42d4c6178cb20c8708606b3d4d6
derived_from:
  - artifact_id: spec:warrior-loop-st17
    revision: d91949b4ddf0ba08bc39d5fed24f2b26ac3dbbc1cbdb4120fa5aa36293ccc8aa
    path: docs/stories/warrior-loop/st17/spec.md
implements: [ST17]
blocked_by: []
approval_kind: human
approval_evidence: '可以，确认；开始01吧先'
---
# 01：真实清房/死亡磨损与破损继续本局

**What to build:** 真实确认清房/死亡→7槽扣损→属性与公开CP一致→继续攻击/换房；保留末房奖励。修补普通清房及奖励配置耦合缺口，复用原事件与幂等，不新造客户端磨损上报接口。

**Blocked by:** 无。

**验收：** 真实普通房/死亡/同刻通关、各事实去重、不同ID重报、0截断/6不磨损槽/释放快照、原deadline与评分事实不变；新挑战仍拦截。无需反复真人刷本。

**覆盖：** AC17-1, AC17-2。

## 共同边界

派生自已确认ST17规格与任务图，按source-of-truth对应合同实施；不另定玩法，不修改冻结spec。沿真实协议/纯模型、服务+MemoryStore+授权传输、Cocos适配与离线构建三类已确认边界；实际测试/预算/缺口进入专属报告。不得以模拟身份、资产或消费者代替正确性关键路径。本轮用户仅授权启动01，其余任务等待后续实施指示；无Jira、安装、云资源、浏览器/设备、push或发布。
