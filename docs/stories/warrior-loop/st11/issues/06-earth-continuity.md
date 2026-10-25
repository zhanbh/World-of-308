---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st11-06
status: accepted
revision: "8e58438d3bea8c3684509aabaa01d09dc2498af8f60dd936e220abedd248f363"
accepted_revision: "8e58438d3bea8c3684509aabaa01d09dc2498af8f60dd936e220abedd248f363"
derived_from:
  - artifact_id: spec:warrior-loop-st11
    revision: "605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b"
    path: docs/stories/warrior-loop/st11/spec.md
implements: [ST11]
blocked_by: [4, 5]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST11-06：大崩、独立残留与四技能连续战斗

**What it delivers：** 大崩完成受地图约束的位移、拍地与三次爆发；四技能连续输入与死亡后的合法已释放残留在统一权威状态中重建。

**Blocked by：** ST11-04、ST11-05。

**验收：**

- [ ] 大崩4节点，拍地特殊击倒及后续爆发范围独立判断；倒地等待本次效果结束，不每段叠加整段倒地，免疫仍承伤/流血。
- [ ] 整条位移路径采用共用扫掠碰撞，朝边缘、角落、薄墙释放不出地图；实际落点建立后续地面来源，跳跃只影响表现。
- [ ] 已释放残留与未生成节点区分，攻击者死亡/属性变化不销毁合法尾伤或改旧快照；目标死亡清目标效果，切场景不打新怪。死亡/奖励对接仅走内部权威事件，不引入公开reportEvents或异步补奖架构。
- [ ] 四技能/普攻/控制/属性事件混合序列的整段与任意切片、30/60/120渲染帧一致；真实ST10加载/恢复、非零回复、当前装备/破损与最高急速共同回归。
- [ ] 当前战士实现域的稳定按需1～8块、效果128B/快照192B及头16KiB/块80KiB/总640KiB实际UTF-8、32KiB公开页/回复、最大合法并发和有界CPU记录；不截断合法效果。怪物912效果等未来AI状态用合法编码夹具验证接口并标明ST12尚未实现，不能宣称完整AI运行通过。
- [ ] 重复/异参/缺序/前沿加速/旧身份/暂停补报、每新增写点故障及提交丢响应/两种争用顺序全部验证；完成真实服务与客户端连续战斗命令演示，最终两轴独立review集中修复。

真实集成、训练/正式内容边界、测试seams及共同负测沿本包只读spec和任务图；动作/伤害配置及相关API/状态/CP/预算同步活跃合同。实际执行状态及证据另记execution，不把批准当作测试通过。
