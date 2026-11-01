---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st17-04
status: accepted
revision: 1d2a68536a0de9cd382b7f5f864bd183816d0a39db20c4fc86ca11c05ee4ec99
accepted_revision: 1d2a68536a0de9cd382b7f5f864bd183816d0a39db20c4fc86ca11c05ee4ec99
derived_from:
  - artifact_id: spec:warrior-loop-st17
    revision: d91949b4ddf0ba08bc39d5fed24f2b26ac3dbbc1cbdb4120fa5aa36293ccc8aa
    path: docs/stories/warrior-loop/st17/spec.md
implements: [ST17]
blocked_by: [1, 3]
approval_kind: human
approval_evidence: '可以，确认；开始01吧先'
---
# 04：Cocos城镇修理面板与破损提示

**What to build:** 真实林纳克斯地点交互→穿戴/背包目标展示→报价确认→单修/穿戴全修→钱包/装备/属性刷新；副本破损提示非阻断。沿现有面板和传输组合根，不搭第二套资产逻辑。

**Blocked by:** 01, 03。

**验收：** 加载/空/失败/不足/报价变化/提交/未知可见；原O重试不二扣，关面板/重attach/切角迟包隔离；0武器不中断本局；纯适配测试与批准离线构建，不冒称真机。

**覆盖：** AC17-2, AC17-3, AC17-4, AC17-7。

## 共同边界

派生自已确认ST17规格与任务图，按source-of-truth对应合同实施；不另定玩法，不修改冻结spec。沿真实协议/纯模型、服务+MemoryStore+授权传输、Cocos适配与离线构建三类已确认边界；实际测试/预算/缺口进入专属报告。不得以模拟身份、资产或消费者代替正确性关键路径。本轮用户仅授权启动01，其余任务等待后续实施指示；无Jira、安装、云资源、浏览器/设备、push或发布。
