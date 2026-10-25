---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st11-01
status: accepted
revision: "53e5ce36c156757462e5f9ef4cdbbf10c08c4a9de2e76e309560160475c0e48a"
accepted_revision: "53e5ce36c156757462e5f9ef4cdbbf10c08c4a9de2e76e309560160475c0e48a"
derived_from:
  - artifact_id: spec:warrior-loop-st11
    revision: "605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b"
    path: docs/stories/warrior-loop/st11/spec.md
implements: [ST11]
blocked_by: []
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST11-01：移动输入片段与权威位置

**What it delivers：** 真实ST10 ready后的场景接收摇杆输入、客户端预测、服务端重算并纠正位置；移动可独立演示。

**Blocked by：** 无本包阻塞；真实ST10/ST05/ST04能力已就绪。

**验收：**

- [ ] 真实身份/会话/role、scene/timeline、CP版本、连续seq/tick、摘要及活动前沿全验；累计不超真实允许时间，不逐段赠送容差。
- [ ] X走跑/Y定速/斜向和面向服从主规格；地图足迹及静态墙体配置显式绑定版本，扫掠整路径拒绝薄墙穿透，穿怪不产生免伤。
- [ ] 打通simulation.submit执行及小型原结果/原操作查询，原子A/H/CP/实际变化块/O；未知恢复原意图，旧场景和旧回执不能覆盖新状态。
- [ ] 客户端输入队列有界，离散输入不静默丢弃；超过1秒未确认预测停止并查询原结果/当前CP，重放和心跳不刷新输入缺口。
- [ ] 整段/任意切片、不同渲染FPS位置和余数一致；时钟边界/2秒缺口/旧代次/写故障/丢响应/真实接管两顺序有证据。

真实集成、训练/正式内容边界、测试seams及共同负测沿本包只读spec和任务图；动作/伤害配置及相关API/状态/CP/预算同步活跃合同。实际执行状态及证据另记execution，不把批准当作测试通过。
