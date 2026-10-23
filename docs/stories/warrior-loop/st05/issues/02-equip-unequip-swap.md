---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st05-02
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st05
    revision: d14286fc282f25df7cccf4ae35e5159b6f90fbc9115963a487f65dc934f73930
    path: docs/stories/warrior-loop/st05/spec.md
implements: [st05-equipment-attributes-sets]
blocked_by: [1]
---
# 02：穿脱装备与满包原格同部位原子置换

**What to build:**
实现应用服务与 MemoryStore 事务命令 `equipment.equip` 与 `equipment.unequip`：
1. `equipment.equip`（穿戴与替换）：
   - 从背包读取目标装备实例，校验有效性（01 提供）；
   - 若目标槽位为空：将装备移入角色 `equipped[targetSlot]`，从背包 `slots[originalIndex]` 移除，装备自身 `location` 更新为 `{ kind: 'equipped', characterId, slotId: targetSlot }`；
   - 若目标槽位已有装备：执行**满包原格置换**。被替换的旧装备退回新装备腾出的 `originalIndex` 背包槽位（携带准确 `sortHeader`），旧装备自身 `location` 更新为 `{ kind: 'container', containerId: backpackId }`；新装备入槽。即使背包已达到 20/20 满格，1-for-1 原格置换依然允许并成功执行；
2. `equipment.unequip`（卸下）：
   - 校验角色 `equipped[slot]` 是否存在目标 `itemId`；
   - 检查背包容量与剩余空位：若背包无空闲槽位（如 20 格已满），明确拒绝 `BAG_FULL`；
   - 有空闲槽位时，选取背包首个空格放入卸下的装备，角色 `equipped[slot]` 移除该装备，装备自身 `location` 更新为背包容器；
3. 容器与装备版本维护：背包 `version` 自增，涉及的装备实例 `version` 自增，操作结果与操作去重记录 `operations` 同事务原子提交；
4. 幂等与重试：同 `operationId` 同参重放返回原结果，异参拒绝 `OPERATION_MISMATCH`。

**Blocked by:** 01。

## Acceptance criteria

- [x] 空槽穿戴：背包装备顺利穿入指定空槽，背包释放 1 格空间，装备位置与槽位映射同步。
- [x] 满包原格同部位替换：当背包 20 格全部占满时，向已有装备的槽位发起穿戴，成功将被替换装备置回原格，背包总占用与容量维持 20/20，不报 `BAG_FULL`。
- [x] 满包卸下拒绝：背包 20 格全满时，对身上任意已穿戴装备执行 `equipment.unequip`，严格拒绝并返回 `BAG_FULL`。
- [x] 有空位卸下成功：背包有空位时卸下装备，装备落入首个空格，槽位解除占用。
- [x] 原子回滚与版本一致：若穿脱事务内任一写点失败（如写入背包或装备失败），整笔回滚，角色身上的装备与背包槽位无状态残留。
- [x] 操作幂等恢复：相同 `operationId` 重试时直接返回原穿脱结果，不进行二次替换或产生多余版本递增。

## Tests and evidence

测试入口：MemoryStore 事务与应用服务集成测试。
- 满背包（20/20）同槽替换测试，验证两件装备位置互换及背包格索引精确继承。
- 满背包（20/20）卸下装备测试，验证返回 `BAG_FULL` 且身上装备与背包无变动。
- 非满背包正常卸下测试，验证空位分配与位置更新。
- 事务故障注入回滚测试与并发冲突测试。
