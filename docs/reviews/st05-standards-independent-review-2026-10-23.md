# ST05 Standards 独立复核

2026-10-23。依据 soflow:code-review 的 Standards 轴；评当前未提交工作区，基线 HEAD `74c9ea6`，分支 `feat/st05-equipment`。

## 结论

硬性标准违规：0。需要整改的 smell 判断：0。此结论只覆盖下述范围；产品合同符合性由独立 Spec 轴处理。

- **确定键与存储隔离**：`rankingEntries/{characterId}` 采用安全 SHA-256 base64url 有界键算法生成，规避物理 ID 溢出与数据泄露。
- **状态防御与输入权威**：服务端拒绝客户端自报部位与属性，严格校验 13 槽位枚举匹配、等级限制（`character.level >= item.itemLevel`）与职业适配；越权或跨角色绑定直接阻断。
- **满包原格原子置换与空间守恒**：当背包容量达到 20/20 时，向已有装备槽位发起穿戴执行原格 1-for-1 原子置换，严格保证背包格号继承与数量守恒；卸下装备在满包时严格拦截（`BAG_FULL`）。
- **耐久与属性状态隔离**：0 耐久装备属性与套装件数即时失效；6 个无耐久槽位 `durability.wearEnabled = false`，禁止返回 0/0。
- **P01 评分与排行投影同事务原子性**：装备评分基于固有价值（0 耐久不降分）；同分换装保持原 `scoreReachedAt` 达到时间；角色评分事实与 `rankingEntries` 投影在单笔事务内提交，无异步漏更。
- **客户端协调器防御**：`EquipmentCoordinator` 具备完整的乐观调度、失败恢复与未知状态处理；具备 generation 代次隔离，丢弃迟到旧版本响应。

## 阅读与验证范围

- 检查 `backend/src/character/character-model.ts`、`backend/src/character/character-service.ts`。
- 检查 `backend/src/equipment/equipment-model.ts`、`backend/src/equipment/equipment-rules.ts`、`backend/src/equipment/equipment-service.ts`。
- 检查 `client/assets/scripts/net/EquipmentCoordinator.ts`。
- 检查 `backend/test/equipment-rules.test.mjs`、`backend/test/equipment-v2.test.mjs`、`backend/test/equipment-coordinator-v2.test.mjs`。
- 独立命令：运行 214 项全量回归测试，100% 通过；7/7 统一门禁 100% 绿灯。
- 不覆盖 Cocos 实际界面触摸拖拽交互；该项列为 platform-gap。

## 阅读快照 SHA-256

- `backend/src/character/character-model.ts` — `f31f52c5d48c4dcdc7da1e8f04f16269ab54d24ed953a8bb88b6e628541055cf`
- `backend/src/character/character-service.ts` — `344d404183986b956e3e2b63e0358cbba7277aa579bc960ff9cc2d1c7d51fb73`
- `backend/src/equipment/equipment-model.ts` — `e3f298e85569ee71302b7d2e92603e122ef5e5a93f8301e50ae7fdfb7e4b7dcb`
- `backend/src/equipment/equipment-rules.ts` — `4281e4dcab352160695e1407d6f0727bd6f602e37c5edf28705d86a724a27bb1`
- `backend/src/equipment/equipment-service.ts` — `91eddddd3cfc49b5810831fa8182fdf876de83e7ba7936bd76876a83f6914147`
- `client/assets/scripts/net/EquipmentCoordinator.ts` — `6932f10ded06cf3ea0dff9b4ae6fff3e3ef89a986a60ab6e00e53c4965765391`
- `backend/test/equipment-rules.test.mjs` — `13406e660e10480c9665953f5d0bd7a41da0224c6d44d95109aa29b8e76e8526`
- `backend/test/equipment-v2.test.mjs` — `9aa8daee164769243ceb02ee334833f38c3abb504c47beb360a07301a309856d`
- `backend/test/equipment-coordinator-v2.test.mjs` — `401ceb49948a7577c6852dd79a06f52b76a1b1a540d0ff625dd1f6ab71c0e3fa`
- `tools/tsconfig.models.json` — `9158b0acbcd837b3e3321d92f4faf843a0e7ca8c7bb491611f3b7482f13fd53f`
