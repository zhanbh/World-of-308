---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st11-03
status: accepted
revision: "aa55f3ca5aa49deb04f7bd4052b006feea96f89eef591a977745bd077c98112d"
accepted_revision: "aa55f3ca5aa49deb04f7bd4052b006feea96f89eef591a977745bd077c98112d"
derived_from:
  - artifact_id: spec:warrior-loop-st11
    revision: "605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b"
    path: docs/stories/warrior-loop/st11/spec.md
implements: [ST11]
blocked_by: [2]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST11-03：十字斩、投射物与叠加流血

**What it delivers：** 合法十字斩取消普攻并以近身和飞行十字两节点命中；各有效段独立附加保守预算的流血，跨片段/恢复不丢失。

**Blocked by：** ST11-02。

**验收：**

- [ ] 按等级/MP/CD/控制校验后才取消普攻；低蓝/CD/未解锁拒绝不耗资源、不取消当前普攻，后续合法移动仍处理。
- [ ] 十字两节点独立几何判定/命中/暴击；发射后独立存续，路径扫掠及逐目标去重不依渲染帧，未生成和已释放残留分开处理。
- [ ] 每招固定流血预算按节点权重精确分配，未中不附着，叠加保留旧预算；攻端快照、逐跳独立暴击、防端实时且减伤一次，DOT不累计倒地。
- [ ] 急速封顶2倍，节点/间隔/持续从原点独立有理映射，固定跳数/预算不随切片或急速增加，最后份额承接预算余数。
- [ ] 增量扩展CP紧凑效果/快照及按需块与公开证明；最大本技能合法并发、恢复/切房/目标死亡/攻击者属性变更、自然回复余数及写故障可验证。

真实集成、训练/正式内容边界、测试seams及共同负测沿本包只读spec和任务图；动作/伤害配置及相关API/状态/CP/预算同步活跃合同。实际执行状态及证据另记execution，不把批准当作测试通过。
