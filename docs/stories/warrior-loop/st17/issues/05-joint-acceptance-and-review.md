---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st17-05
status: accepted
revision: 745a646ff82caad884ef49667c3da4591b770980a4a23c4aa2770dfdde09da3b
accepted_revision: 745a646ff82caad884ef49667c3da4591b770980a4a23c4aa2770dfdde09da3b
derived_from:
  - artifact_id: spec:warrior-loop-st17
    revision: d91949b4ddf0ba08bc39d5fed24f2b26ac3dbbc1cbdb4120fa5aa36293ccc8aa
    path: docs/stories/warrior-loop/st17/spec.md
implements: [ST17]
blocked_by: [4]
approval_kind: human
approval_evidence: '可以，确认；开始01吧先'
---
# 05：磨损—修理—再入本联合验收与两轴评审

**What to build:** 真实战斗/死亡磨损至0→继续或通关→回城新挑战被拦→修理→重新入场闭环，汇总01-04证据、预算与评审，不将既有实现或静态UI当整体验收。

**Blocked by:** 04。

**验收：** 最大7目标/100格背包与小/8CP分列，实际R/W/调用/UTF-8；新写意图逐写点回滚、提交未知、穿脱/出售等现有装备写竞争两序；保留03整批原子/评分不变；一次最终全7阶段、Standards/Spec独立评审及必要修复，SDK/设备/正式配置GAP如实。

**覆盖：** AC17-1, AC17-2, AC17-3, AC17-4, AC17-5, AC17-6, AC17-7, AC17-8。

## 共同边界

派生自已确认ST17规格与任务图，按source-of-truth对应合同实施；不另定玩法，不修改冻结spec。沿真实协议/纯模型、服务+MemoryStore+授权传输、Cocos适配与离线构建三类已确认边界；实际测试/预算/缺口进入专属报告。不得以模拟身份、资产或消费者代替正确性关键路径。本轮用户仅授权启动01，其余任务等待后续实施指示；无Jira、安装、云资源、浏览器/设备、push或发布。
