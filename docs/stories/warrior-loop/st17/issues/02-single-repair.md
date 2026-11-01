---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st17-02
status: accepted
revision: 48a326b23317326a3030fc9569a95324f7ecd9f7433c9b8edfffe6e9a7e17759
accepted_revision: 48a326b23317326a3030fc9569a95324f7ecd9f7433c9b8edfffe6e9a7e17759
derived_from:
  - artifact_id: spec:warrior-loop-st17
    revision: d91949b4ddf0ba08bc39d5fed24f2b26ac3dbbc1cbdb4120fa5aa36293ccc8aa
    path: docs/stories/warrior-loop/st17/spec.md
implements: [ST17]
blocked_by: []
approval_kind: human
approval_evidence: '可以，确认；开始01吧先'
---
# 02：林纳克斯报价与穿戴/背包单件修满

**What to build:** 真实城镇服务权限→指定本人穿戴或背包实例→版本化费用报价→确认单件修满→协调器刷新钱包/装备；没有Cocos时可经真实授权传输重复演示。

**Blocked by:** 无。

**验收：** 0/半损/全满、不磨损/金库/他人/已毁拒绝，候选测试价格与精确单位，实例固有字段/评分时间不变，非法/过期上下文与旧报价拒绝，原O丢响应及实际写点回滚。

**覆盖：** AC17-3, AC17-5, AC17-6。

## 共同边界

派生自已确认ST17规格与任务图，按source-of-truth对应合同实施；不另定玩法，不修改冻结spec。沿真实协议/纯模型、服务+MemoryStore+授权传输、Cocos适配与离线构建三类已确认边界；实际测试/预算/缺口进入专属报告。不得以模拟身份、资产或消费者代替正确性关键路径。本轮用户仅授权启动01，其余任务等待后续实施指示；无Jira、安装、云资源、浏览器/设备、push或发布。
