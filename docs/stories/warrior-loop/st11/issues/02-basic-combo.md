---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st11-02
status: accepted
revision: "eb867bae80659f30c1f7a00eaee4926875b34dfb571dd1178cc79d2982bbe71c"
accepted_revision: "eb867bae80659f30c1f7a00eaee4926875b34dfb571dd1178cc79d2982bbe71c"
derived_from:
  - artifact_id: spec:warrior-loop-st11
    revision: "605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b"
    path: docs/stories/warrior-loop/st11/spec.md
implements: [ST11]
blocked_by: [1]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST11-02：三段普攻、逐目标命中与暴击

**What it delivers：** 按住普攻在真实输入链路中完成三段循环，客户端看到权威命中/伤害/受击反馈，恢复后连段及调度可继续。

**Blocked by：** ST11-01。

**验收：**

- [ ] 三段动作、固定衔接/缓冲按版本配置；起手和未生成节点调度进入CP，单段每目标去重，稳定遍历与事件排序不依赖容器枚举。
- [ ] 先几何接触再逐段逐目标命中、独立暴击；精通不影响普攻，增伤/护甲等按当前数值合同与明确测试配置，0伤害不私加保底。
- [ ] 采用单一精确伤害/时间入口、稳定事件ID和服务端合法战斗随机；原意图重放不重抽，攻击随机不暴露掉落/强化状态。
- [ ] 普通倒地从出现/起身后跨招累计直接伤害，死亡优先；受控与免疫用显式靶怪配置，不编造完整怪物AI/奖励。
- [ ] CP扩展动作/目标/随机游标及必要紧凑快照，公开查询、预测、拒绝/未知/重开和当前状态纠正完成端到端。

真实集成、训练/正式内容边界、测试seams及共同负测沿本包只读spec和任务图；动作/伤害配置及相关API/状态/CP/预算同步活跃合同。实际执行状态及证据另记execution，不把批准当作测试通过。
