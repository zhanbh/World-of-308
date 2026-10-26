---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st12-01
status: accepted
revision: "62be806566077548f9dc3a78e665dd9cb5fd90dcb5712d2c111ee3fcf9865f11"
accepted_revision: "62be806566077548f9dc3a78e665dd9cb5fd90dcb5712d2c111ee3fcf9865f11"
derived_from:
  - artifact_id: spec:warrior-loop-st12
    revision: "26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7"
    path: docs/stories/warrior-loop/st12/spec.md
implements: [ST12]
blocked_by: []
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST12-01 组合怪物与近战对抗

无本包前置。交付：真实开房后，配置的近战怪追击并攻击玩家，玩家能移动、打断及击杀；客户端可读权威状态与事件。

- 模板、类型、普通/精英/Boss身份、技能引用、行为、各控制/流血抗性及奖励标签独立；同技能能由不同模板使用，身份不隐式赋免控。
- 人形/野兽可流血，亡灵/机械默认免流血但可控；个体/阶段显式覆盖。复用ST11直接伤害/控制与精确算术，敌攻改变玩家真实HP/受控状态，不借用测试假人伤害上报。
- 有界AI决策时刻、起手/锁向/命中/收招/CD进入CP；普通伤害不自动打断，中断不返还冷却，死亡取消未释放本体节点。
- 公开DTO/证明、客户端恢复、最小命令演示与真实MemoryStore原子故障测试随行为交付。合法怪物来源不能用客户端选择随机结果。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
