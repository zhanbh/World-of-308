---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st11-04
status: accepted
revision: "057e2179e9114d9507ddf3a64f6ef96cd9b39f1d63dde54150a662fc94311043"
accepted_revision: "057e2179e9114d9507ddf3a64f6ef96cd9b39f1d63dde54150a662fc94311043"
derived_from:
  - artifact_id: spec:warrior-loop-st11
    revision: "605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b"
    path: docs/stories/warrior-loop/st11/spec.md
implements: [ST11]
blocked_by: [3]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST11-04：崩山击、位移与特殊击倒

**What it delivers：** 崩山击三节点随真实合法地面轨迹结算，终段特殊击倒，客户端反馈与权威事件相连。

**Blocked by：** ST11-03。

**验收：**

- [ ] 起跳接触/下劈/终段三节点及本次MP/CD/急速快照按配置；前两段可触发普通累计倒地，终段才自带特殊击倒。
- [ ] 复用移动扫掠/足迹/障碍规则，地图边缘、角落、薄墙、大步长和急速变化均不越界；以实际合法位置判命中，无画面高度豁免。
- [ ] 目标抗性/霸体按当时状态处理；普通短控制不缩短已有倒地，起身清累计，致死不再起身。
- [ ] 合法取消、拒绝不取消、每段流血份额、残留/打断边界及CP重建全部在真实片段链路演示，无独立客户端伤害上报。
- [ ] 最高急速与任意片段切法同结果，写失败/丢响应/恢复/切房并发保留已确认状态。

真实集成、训练/正式内容边界、测试seams及共同负测沿本包只读spec和任务图；动作/伤害配置及相关API/状态/CP/预算同步活跃合同。实际执行状态及证据另记execution，不把批准当作测试通过。
