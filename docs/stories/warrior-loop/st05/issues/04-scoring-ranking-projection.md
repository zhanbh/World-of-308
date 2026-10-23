---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st05-04
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
# 04：固有装备评分事实与排行榜投影同事务同步

**What to build:**
按照 `scoring-projection-mapping-v1.md` 与 `ranking-query-baseline-v1.md` 规范，实现装备评分与个人排行投影的同步事务维护：
1. 13 槽固有评分公式计算：
   - 单件分 = `floor(100 × itemLevel × slotWeight × [qualityMult + 0.05 × enhancementLevel + 0.1 × sum(affixNormalized)])`；
   - 部位权重：武器 = 2；五防具（`shoulder`, `chest`, `belt`, `pants`, `boots`）= 1；其他七槽（`trinket`, `bracelet`, `necklace`, `ring`, `subEquip`, `magicStone`, `earring`）= 0.75；
   - 品质系数：white = 1, green = 1.2, blue = 1.5, purple = 2, orange = 2.5；
   - 词条归一值：`实际词条数值 / 该词条在模板中合法上限`（无额外词条为 0）；
   - 总评分为 13 槽单件分之和，空槽为 0；
2. 遵循 P01 决策（固有价值评分不受耐久影响）：
   - 评分仅由装备固有属性与强化等级决定；装备即使耐久降为 0，依然计入装备总分，评分绝不因耐久磨损而下降；
   - 磨损与修理不读写评分投影，不触发评分重算；
3. 时间戳与版本变更语义：
   - 当穿脱/替换导致总分改变时，`character.score` 变动，`equipmentVersion` 自增，`scoreReachedAt` 更新为当前服务端业务提交时刻；
   - 同分保持原时间：若换装后总分完全相同，保留原 `scoreReachedAt` 不予重置刷新；
   - 升降后重回旧分（例如 500 → 600 → 500）：必须重新计时，记录最近一次达到 500 分的时间；
4. 排行投影写入：
   - 角色装备变动同事务写入 `rankingEntries/{characterId}` 实体：包含 `characterId`, `classId`, `score`, `scoreConfigRef: 'score-v1'`, `equipmentVersion`, `scoreReachedAt`, `projectionVersion: equipmentVersion`, `updatedAt`；
   - 投影与角色在同一笔原子事务内提交，保证一致性，不依赖打开排行榜或异步调度。

**Blocked by:** 02。

## Acceptance criteria

- [x] 算例验证精确吻合：
  - 装等 10 白武器 +0 无词条：单件评分精确为 2000 分；
  - 装等 10 绿武器 +0 单词条达上限：单件评分精确为 2600 分；
  - 装等 10 白武器 +10 无词条：单件评分精确为 3000 分；
  - 13 槽各部位权重与品质系数严格符合公式。
- [x] 0 耐久评分不降（P01 证据）：装备磨损为 0 耐久后，总评分依然与满耐久一致，不触发排行投影重算。
- [x] 同分换装保留原时间：更换同评分装备后，`scoreReachedAt` 时间戳不更新，保持原达到时间。
- [x] 500 → 600 → 500 刷新时间戳：由高分降回原分数时，`scoreReachedAt` 刷新为最新时间。
- [x] 同事务原子写入：穿脱装备成功后，`rankingEntries/{characterId}` 中 `score`, `equipmentVersion`, `scoreReachedAt` 与角色实体完全一致。

## Tests and evidence

测试入口：评分计算纯函数单元测试与 MemoryStore 事务集成测试。
- 公式基线算例覆盖（白/绿/蓝/紫武器、防具、饰品、强化等级与词条组合）。
- 0 耐久装备穿戴与磨损前后评分对比。
- 同分替换与不同分替换的 `scoreReachedAt` 行为验证。
- 角色更新与 `rankingEntries/{characterId}` 投影写入的一致性断言。
