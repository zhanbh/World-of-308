---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st02-03
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st02
    revision: 4605b8375d337ba356e49e2380fcf8a98e074c584c26f2f542dff20ab80d6e4f
    path: docs/stories/warrior-loop/st02/spec.md
implements: [st02-warrior-creation]
blocked_by: [2]
---
# 03：初始白武器穿戴与新手邮件发放

**What to build:** 实现角色创建时自动生成并穿戴合法10级白品质武器，以及发送包含8血/8蓝/10纹章的一次性新手邮件与来源去重存根。

**Blocked by:** 02。

## Acceptance criteria

- [x] 初始武器合法穿戴：生成10级白品质战士武器实例，绑定属性为角色绑定（`binding=character`），磨损启用（`wearEnabled=true`，初始当前耐久=最大耐久），初始位置直接为穿戴（`equipped{characterId, 'weapon'}`），角色 `equipped['weapon']` 记录该武器ID。
- [x] 新手邮件精准发送：生成30天到期的新手礼包邮件，含8个生命药水、8个魔力药水、10个复活纹章三个角色绑定堆叠附件。
- [x] 来源去重存根防重复：写入不可篡改的交付来源存根（`grantKey`），确保即使玩家删除了新手邮件，该角色也永远无法通过任何途径再次获得新手礼包。

## Tests and evidence

测试入口：装备模型、邮件模型与附件结构测试。
- 武器槽位、品质、装等、角色绑定与满耐久校验。
- 邮件到期时间（当前时间+30天）及附件数量/模板类型校验。
- 来源存根存在性与去重互斥断言。
