---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st05-03
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st05
    revision: d14286fc282f25df7cccf4ae35e5159b6f90fbc9115963a487f65dc934f73930
    path: docs/stories/warrior-loop/st05/spec.md
implements: [st05-equipment-attributes-sets]
blocked_by: [2]
---
# 03：0耐久属性与套装失效、无耐久槽显示及饰品CD阻断

**What to build:**
实现装备耐久度规则、战斗属性聚合引擎、套装件数计算与饰品冷却防护：
1. 槽位耐久分类与视图规范：
   - 7 磨损槽位（`weapon`, `shoulder`, `chest`, `belt`, `pants`, `boots`, `earring`）具有有效耐久（`wearEnabled: true`, `current: number`, `max: number`）；
   - 6 无磨损槽位（`trinket`, `bracelet`, `necklace`, `ring`, `subEquip`, `magicStone`）`wearEnabled: false`，在读模型与客户端视图中禁止显示 `0/0`，必须展示为无耐久状态；
2. 0 耐久战斗属性失效规则：
   - 遍历 13 槽装备实例，若磨损槽位装备的 `durability.current === 0`，该装备的所有词条（`rolledAffixes`）不计入角色综合战斗属性；
   - 0 耐久装备不计入所属套装的有效件数（例如 3 件套中 1 件耐久为 0，则仅按 2 件生效对应套装加成）；
3. 战斗属性聚合与协议输出：
   - 根据有效装备实例汇总词条与激活的套装效果，计算出角色属性列表，更新角色的 `statsVersion`；并在 `character.get` 中准确返回 `attributes`；
4. 饰品冷却防护：
   - 检查已穿戴饰品（`trinket`）的冷却状态；若饰品处于冷却生效中（CD > 0），对该饰品槽发起 `equipment.unequip` 或换装置换时予以拦截拒绝（`LOCATION_NOT_ALLOWED`）。当冷却结束（CD = 0）后方可正常卸换。

**Blocked by:** 02。

## Acceptance criteria

- [x] 0 耐久属性排除：将身上某件装备耐久置为 0，重新获取角色属性，该装备的攻击力/防御力/副属性完全排除。
- [x] 0 耐久套装件数排除：穿戴某套装 3 件，其中 1 件耐久降为 0，套装有效件数降为 2 件，仅触发 2 件套属性，3 件套属性失效；若修理恢复耐久后自动恢复 3 件套属性。
- [x] 6 个无耐久槽视图规范：饰品、首饰等槽位 `wearEnabled: false`，返回数据与视图中无 0/0 耐久展示。
- [x] 饰品冷却锁止：对处于冷却中的饰品发起卸下或替换，返回 `LOCATION_NOT_ALLOWED`；冷却清零后允许卸下与替换。

## Tests and evidence

测试入口：战斗属性计算引擎与装备状态服务测试。
- 磨损装备在 100/100 与 0/100 下的角色属性对比测试。
- 套装在完整穿戴与其中一件耐久归零时的套装属性激活变化测试。
- 饰品 CD > 0 时换装拦截与 CD = 0 时换装成功测试。
- 6 类首饰与特殊装备槽位的 `durability.wearEnabled === false` 结构一致性断言。
