---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st13-02
status: accepted
revision: "5935f4175621d2aa0460fd74fb02b3f2d6d8176d7bb96b578a508ed56b36fdde"
accepted_revision: "5935f4175621d2aa0460fd74fb02b3f2d6d8176d7bb96b578a508ed56b36fdde"
derived_from:
  - artifact_id: spec:warrior-loop-st13
    revision: "09bc9716057a26d11b177816d25259d8cfdcee64c6771359a60a2ea158ae278b"
    path: docs/stories/warrior-loop/st13/spec.md
implements: [ST13]
blocked_by: ["ST13-01"]
approval_kind: human
approval_evidence: "确认，开始吧"
---
# ST13-02 主动饰品：合法穿戴、固定CD与属性生效

依赖01。交付：真实饰品输入在同一战斗链路激活限时属性，装备不消耗，CD/等待及公开状态一致。

- 校验角色、实际穿戴、装备/配置版本、CD及60秒等待；拒绝不打断普攻/职业技能，不伪造额外MP消耗。
- 属性只接既有主属性→AP、副属性与总急速封顶计算；起手快照保留，增益到期不反算旧攻击/流血预算，后续新技能与实时防端读取当前属性。
- CP/公开buff与CD字段版本严格；未知buff/非法值发布前拒绝，旧profile不隐式启用。数值候选显式local-test，不把候选饰品值当正式掉落内容。
- ST05卸换守卫与战斗CD事实共享一致时间语义，不拿墙钟比较逻辑tick；覆盖死亡、断线、换房时钟映射的合法/非法卸换。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
