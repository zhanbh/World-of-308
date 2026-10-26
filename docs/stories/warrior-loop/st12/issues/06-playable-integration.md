---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st12-06
status: accepted
revision: "efab9da3e74dfa5b185e58edc16157ffddad7663cc47ee8e78b1333577a666c7"
accepted_revision: "efab9da3e74dfa5b185e58edc16157ffddad7663cc47ee8e78b1333577a666c7"
derived_from:
  - artifact_id: spec:warrior-loop-st12
    revision: "26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7"
    path: docs/stories/warrior-loop/st12/spec.md
implements: [ST12]
blocked_by: [5]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST12-06 三本组合与可玩战斗联调

依赖05。交付：后两本既有可调整原型的技能/行为组合进入真实链路，并提供可运行Cocos战斗演示。

- 后两本遵循既有遭遇与阶段候选，不复制牛头专属机制；复用技能能换模板/身份，未知类型或缺配置发布前拒绝。
- 打通开房→战士操作→怪物AI→受击/击杀→清场换房的实际本地演示；显示血条/身份、动作预兆、预警及控制反馈。复用已有战士表现，怪物可用明确占位美术，不声称最终品质。
- 最新H5构建与浏览器鼠标/触屏模拟单独取证；设备、微信SDK与云端预算保持GAP。无法构建时标部分完成，不以协调器测试冒充可玩验收。
- 验证8敌群、912敌效果与ST11玩家效果共存，实际完整UTF-8、CP块/快照/公开分页及事务预算；保持旧profile严格兼容。
- 全量回归、两轴独立评审、修复复核和实际HEAD证据归档；完整死亡复活(ST14)、奖励(ST15)、平台恢复(ST16)不纳入本票。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
