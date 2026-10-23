---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st05-01
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st05
    revision: d14286fc282f25df7cccf4ae35e5159b6f90fbc9115963a487f65dc934f73930
    path: docs/stories/warrior-loop/st05/spec.md
implements: [st05-equipment-attributes-sets]
blocked_by: []
---
# 01：13 槽位资格校验与紫装穿戴首次绑定

**What to build:**
建立 13 槽位规则引擎与资格校验器。实现穿戴前的前置条件判定：
1. 槽位类型合法性：目标槽位必须在 13 槽枚举内（`weapon`, `shoulder`, `chest`, `belt`, `pants`, `boots`, `trinket`, `bracelet`, `necklace`, `ring`, `subEquip`, `magicStone`, `earring`），且装备的 `slotKind` 必须与 `targetSlot` 完全一致；
2. 等级与职业限制：角色等级需满足 `character.level >= equipment.itemLevel`，装备适用的职业限制需包含角色职业（如战士武器防具），不符合返回 `ITEM_NOT_ELIGIBLE`；
3. 归属与绑定校验：装备必须归属于当前账号且在角色背包中；若已存在角色绑定且不是当前角色，返回 `BINDING_RESTRICTED`；
4. 紫装首次穿戴绑定：当品质为 `purple` 或以上且当前绑定为 `none` 时，在穿戴判定中将其标记为角色绑定（`binding: { kind: 'character', characterId }`）。

**Blocked by:** None。

## Acceptance criteria

- [x] 13 槽位部位严格匹配：尝试将项链穿入戒指槽或武器穿入防具槽时，明确拒绝 `ITEM_NOT_ELIGIBLE`。
- [x] 等级限制校验：1 级战士尝试穿戴 10 级以上装备时拒绝 `ITEM_NOT_ELIGIBLE`。
- [x] 职业限制校验：猎人专用装备战士尝试穿戴时拒绝 `ITEM_NOT_ELIGIBLE`。
- [x] 紫装穿戴绑定生效：未绑定的紫色品质装备穿戴后，`binding` 字段原子更新为 `{ kind: 'character', characterId: character.id }`；已绑定的紫装保持绑定；白/绿/蓝装保持原有绑定规则。
- [x] 跨角色绑定防护：同账号下其他角色专属绑定的装备，当前角色无法穿戴，返回 `BINDING_RESTRICTED`。

## Tests and evidence

测试入口：受控规则与领域模型单元测试。
- 13 槽位枚举一一对应测试与异槽拦截测试。
- 等级不足、职业不匹配拒绝测试。
- 紫色装备穿戴前 `none` 穿戴后变为 `character` 绑定验证。
- 跨角色绑定装备穿戴拒绝测试。
