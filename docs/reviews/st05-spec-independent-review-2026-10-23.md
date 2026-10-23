# ST05 独立规格轴评审

2026-10-23。依据 soflow:code-review 的 Spec 轴；核对批准规格 `spec:warrior-loop-st05`（源故事 SHA-256：`d14286fc282f25df7cccf4ae35e5159b6f90fbc9115963a487f65dc934f73930`），以及 `docs/backend/source-of-truth.md` 索引的 `scoring-projection-mapping-v1.md`、`ranking-query-baseline-v1.md`、`asset-physical-mapping-v1.md` 与 `asset-v2.ts`。

## 规格符合性核对

1. **13 槽位资格限制与紫装绑定 (`equipment.equip`)**：
   - 校验目标槽位必须在 13 槽枚举内，且与装备 `slotKind` 完全匹配；跨部位穿戴拒绝（`ITEM_NOT_ELIGIBLE`）；
   - 角色等级严格检查 `character.level >= item.itemLevel`，跨职业限制阻断；
   - 紫色/橙色品质装备首次穿戴时原子更新为角色绑定（`binding: { kind: 'character', characterId }`），其他角色绑定拒绝（`BINDING_RESTRICTED`）。
2. **穿脱装备与满包原格同部位置换 (`equipment.equip`, `equipment.unequip`)**：
   - 空槽穿戴：背包装备顺利入槽，背包对应格释放；
   - 满包（20/20）置换：向已有装备槽位发起穿戴，原装备退回新装备腾出的原背包格，总背包数量与容量维持 20/20，不报 `BAG_FULL`；
   - 满包卸下：背包 20 格全满时执行 `equipment.unequip` 严格拒绝 `BAG_FULL`；有空格时移入首个可用空格。
3. **耐久度、战斗属性与套装生效**：
   - 7 磨损槽位（武器、五防具、耳环）具备耐久属性；6 首饰/特殊槽位 `durability.wearEnabled = false`，不显示 0/0；
   - 0 耐久装备的词条在战斗属性汇总时完全排除；0 耐久装备不计入套装激活件数（3 件套降为 2 件套加成）；
   - 饰品冷却锁止：饰品在 CD > 0 时禁止卸下或换装替换（`LOCATION_NOT_ALLOWED`），CD 结束后恢复正常。
4. **固有装备评分事实与排行投影 (`rankingEntries/{characterId}`)**：
   - 13 槽固有评分公式精确实现：单件分 = `floor(100 × 装等 × 部位权重 × [品质系数 + 0.05×强化级 + 0.1×Σ词条归一值])`；部位权重（武器 2、五防具 1、其他 0.75）与品质系数严格吻合；
   - **P01 证据**：0 耐久不降低装备评分（固有价值），不读写/不重算评分投影；
   - 同分换装保留原 `scoreReachedAt` 达到时间；分值改变或 500→600→500 回退时刷新时间戳；
   - 角色属性与 `rankingEntries/{characterId}` 在同一笔原子事务内提交。
5. **客户端纯模型协调器 (`EquipmentCoordinator`)**：
   - 驱动穿脱请求与本地视图乐观/回滚流转；
   - 结果未知保存原 `operationId` 支持 `retryOriginal` 与 `recover`；
   - 代次升级与重置后丢弃迟到响应。

## 结论

- 阻断性发现：0。
- 业务规格覆盖 100%，新增 20 项 ST05 专项测试（规则 5 项、集成 9 项、协调器 6 项）100% 通过（全量回归 214 项通过）。
- Cocos 装备面板实际渲染与触控拖拽列入 platform-gap。
