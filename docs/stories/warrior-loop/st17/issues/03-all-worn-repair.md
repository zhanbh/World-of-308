---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st17-03
status: accepted
revision: 5c902efff6dd5d5ffa0752e4d213edc29b94a4bbf71891f108e7a04f07c10aba
accepted_revision: 5c902efff6dd5d5ffa0752e4d213edc29b94a4bbf71891f108e7a04f07c10aba
derived_from:
  - artifact_id: spec:warrior-loop-st17
    revision: d91949b4ddf0ba08bc39d5fed24f2b26ac3dbbc1cbdb4120fa5aa36293ccc8aa
    path: docs/stories/warrior-loop/st17/spec.md
implements: [ST17]
blocked_by: [2]
approval_kind: human
approval_evidence: '可以，确认；开始01吧先'
---
# 03：当前穿戴一键全修原子闭环

**What to build:** 沿02报价/服务/协调器扩展当前穿戴全修，完整清单及总价可查看，最多7个磨损槽，修满与扣币一次同成同败。

**Blocked by:** 02。

**验收：** 13槽满穿+背包/金库均有损耗时只修穿戴7槽；空/全满/余额恰足/差1单位、缺价、目标集合变化整批拒绝；逐实际写点、原O及OCC两序，报价不被悄悄替换。

**覆盖：** AC17-4, AC17-5, AC17-6。

## 共同边界

派生自已确认ST17规格与任务图，按source-of-truth对应合同实施；不另定玩法，不修改冻结spec。沿真实协议/纯模型、服务+MemoryStore+授权传输、Cocos适配与离线构建三类已确认边界；实际测试/预算/缺口进入专属报告。不得以模拟身份、资产或消费者代替正确性关键路径。本轮用户仅授权启动01，其余任务等待后续实施指示；无Jira、安装、云资源、浏览器/设备、push或发布。
