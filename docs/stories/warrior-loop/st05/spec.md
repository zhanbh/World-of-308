---
artifact_kind: specification
artifact_id: spec:warrior-loop-st05
spec_hash: d14286fc282f25df7cccf4ae35e5159b6f90fbc9115963a487f65dc934f73930
tracker: local-markdown
plan_status: approved
approval_kind: human
approval_evidence: "好的，开始吧"
stories:
  - slug: st05-equipment-attributes-sets
    title: 穿脱装备、属性与套装生效
    covers: [US3, US7, AC6]
---
# ST05：穿脱装备、属性与套装生效实施规格

2026-10-23。承接 ST04 背包整理与快捷位交付，当前工作分支 `feat/st05-equipment`。
本文件为 ST05 实施任务图提案与规格边界，不包含 Jira 操作、SDK 安装、云资源或发布。
来源为[业务故事卡](../st05.md)（SHA-256：`d14286fc282f25df7cccf4ae35e5159b6f90fbc9115963a487f65dc934f73930`）、[评分与排行映射](../../backend/scoring-projection-mapping-v1.md)、[排行与查询基线](../../backend/ranking-query-baseline-v1.md)、[物理映射](../../backend/asset-physical-mapping-v1.md)、[数据字典](../../backend/data-dictionary-v2.md)与[真相源索引](../../backend/source-of-truth.md)。

## 玩家可验证结果

在合法会话与角色状态下，玩家进行装备穿戴、替换、卸下及属性/评分验证：
1. **13 槽位与穿戴资格**：支持全部 13 个标准槽位（`weapon`, `shoulder`, `chest`, `belt`, `pants`, `boots`, `trinket`, `bracelet`, `necklace`, `ring`, `subEquip`, `magicStone`, `earring`）。穿戴时严格校验职业、装等限制（`character.level >= item.itemLevel`）、部位匹配及归属；不符时拒绝（`ITEM_NOT_ELIGIBLE`、`BINDING_RESTRICTED`）。
2. **满包原格同部位替换与卸下满包拒绝**：
   - 空槽穿戴：背包装备移入槽位，背包对应格释放；
   - 有装替换：当背包满 20 格时，穿戴新装备将原装备退回该背包装备所在的原格，完成原子 1-for-1 原位置换，不因包满阻断换装；
   - 卸下装备：检查背包剩余空间，若无空格明确拒绝（`BAG_FULL`）；有空格时移入背包并从角色槽位移除。
3. **紫装首次穿戴绑定与耐久规则**：
   - 品质为 purple（及以上）的无绑定装备首次穿戴时，原子转为角色绑定（`binding: { kind: 'character', characterId }`）；
   - 7 个可磨损槽位（武器、五防具、耳环）具备耐久属性；6 个无耐久槽位（饰品、手镯、项链、戒指、辅助装备、魔法石）`durability.wearEnabled = false`，不显示 0/0；
   - 当装备当前耐久降至 0 时，其实例词条不计入战斗属性，且不计入套装生效件数；
4. **饰品冷却锁止与固有评分事实同步**：
   - 处于生效冷却中（CD > 0）的饰品禁止卸下或换装替换（`LOCATION_NOT_ALLOWED`）；
   - 每次穿戴、替换、卸下装备引起固有属性变化时，同步计算 13 槽装备评分事实，并同事务更新角色事实（`score`, `scoreReachedAt`, `scoreConfigRef`, `equipmentVersion`）及 `rankingEntries/{characterId}` 投影；
   - 严格遵循已确认规则 P01：装备评分基于固有价值，0 耐久不降低装备评分；换装但总分未变时保持原 `scoreReachedAt`，分数变动时更新时间戳。
5. **客户端协调器**：纯模型 `EquipmentCoordinator` 提供乐观预测、状态机管理（空闲、提交中、错误、回滚）与版本栅栏。

## 本轮实施范围

- 后端受控 MemoryStore 事务实现 `equipment.equip`、`equipment.unequip` 命令，集成 13 槽位、满包原格替换、紫装绑定、0耐久属性过滤、饰品 CD 检查与评分/排行投影同事务更新。
- 扩展 `character.get` 返回聚合后战斗属性列表（`attributes`）及 13 槽装备列表。
- 客户端纯模型 `EquipmentCoordinator.ts`。
- 本地 100% 自动化测试与门禁验证，不调用云数据库，不发外部单据。

## 公开测试边界

1. **资格与绑定边界**：跨职业/超装等/部位不匹配拒绝；紫装穿戴首次绑定变更、他人角色绑定拒绝。
2. **穿脱与满包原子交换边界**：空槽穿戴、满包原格置换、满包卸下拒绝（`BAG_FULL`）、背包容量与物品位置守恒。
3. **耐久与套装生效边界**：0 耐久装备属性与套装件数失效、非磨损槽不显示 0/0、饰品 CD 冷却中卸换拦截。
4. **评分与排行投影同事务边界**：固有评分计算（公式与权重）、0 耐久不降分（P01）、同分保持原达到时间、500→600→500 刷新达到时间、`rankingEntries/{characterId}` 投影写入。
5. **客户端协调器边界**：纯模型状态流转、并发请求互斥、版本落后丢弃与异常回滚。
6. **门禁与评审边界**：`tools/check-all.cjs` 全量通过、Standards 与 Spec 双轴评审归档。
