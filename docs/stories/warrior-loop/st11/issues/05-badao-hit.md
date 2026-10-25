---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st11-05
status: accepted
revision: "4371b54755d7f1381af57058364f88191010ed012e2ea5d2616458c04b269ed6"
accepted_revision: "4371b54755d7f1381af57058364f88191010ed012e2ea5d2616458c04b269ed6"
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
# ST11-05：拔刀斩与宽幅单节点判定

**What it delivers：** 拔刀斩完成起势后的宽幅单次横斩，多个目标分别命中/暴击，沿同一原操作和CP链路恢复。

**Blocked by：** ST11-03。

**验收：**

- [ ] 解锁/MP/CD/动作合法性、普攻取消和起手快照与共用技能入口一致；只产生一个伤害节点，不恢复为持续扩散剑气。
- [ ] 宽幅前向几何、边界与稳定目标排序采用明确配置；每目标每节点一次，可命中近远多个目标但不转成多段。
- [ ] 单节点整招预算及附着流血继承共用守恒/独立暴击/实时防御，未命中不补伤，不重复消耗随机。
- [ ] 客户端展示明确释放/命中/拒绝/未知及权威纠正，旧响应不得恢复低版本血蓝/动作；重开后可恢复未确认原输入。
- [ ] 与十字及普攻连续施放、低蓝/CD拒绝、急速/增益中途变化和各参与写点失败通过端到端验证。

真实集成、训练/正式内容边界、测试seams及共同负测沿本包只读spec和任务图；动作/伤害配置及相关API/状态/CP/预算同步活跃合同。实际执行状态及证据另记execution，不把批准当作测试通过。
