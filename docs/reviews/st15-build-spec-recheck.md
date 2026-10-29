# ST15 Spec 定向复核 — bb916d809

2026-10-29。独立固定快照：`bb916d809f8d9dcd04b8f2bc2477fa66fbb7dcb3`；修复范围为 `git diff 0639c097fd8f2da0465ace41e16a06ee127d1dd7..bb916d809f8d9dcd04b8f2bc2477fa66fbb7dcb3`。原始 `st15-build-spec-review.md` 保留不变。

**结论：原 P1 定向复核通过，本次范围内未发现新问题。**

服务 `live(..., true)` 只放宽 active 挑战的 dead 状态；两次 submit 事务随后均执行 `deadTail`，要求空 inputs、现有联合怪物场景、已保存死亡节点和 CP 内已释放效果。可信身份、角色/场景/代次、在线连接、租约、原死亡截止、2秒输入间断、版本及时间前沿仍校验。无尾效果或任何新动作均拒绝，公开查询只恢复证明、不推进模拟。H 的死亡节点与原截止传回内核，后续尾片不延长截止；首次 deathIndex 递增扣死亡磨损，通关尾片仅扣末房磨损。

客户端恢复 dead 权威状态后禁止 enqueue；Prototype 在既有帧循环仅对有尾效果的 dead 状态提交空片，效果耗尽停止推进，免费复活后恢复移动。没有扩展成离线补算或后台结算。

独立执行并通过：

- `node --test backend/test/boss-death-tail.test.mjs shared/test/boss-terminal.test.mjs backend/test/loot-victory-client.test.mjs backend/test/monster-client.test.mjs`：19/19，包括新增5项。
- `node --test backend/test/boss-clear.test.mjs backend/test/terminal-settlement.test.mjs`：20/20。

真实两片 cross 流血和 earth 地面尾伤与未切片的 terminalFact 相同；HP/MP、技能CD、动作与相关余数恢复，耐久50→45→44，死亡与尾片原操作重放不重复扣损或发奖。负测覆盖五类动作、旧身份、未来前沿、输入间断进入 recovery、原截止到期与无尾效果。该验证未重复 ST15-05 最大联合夹具34写点，也未重复全量门禁。

完整最大到期域预算仍 **BLOCKED**；上述通过仅关闭原 P1，不代表 ST15 全部完成、最大预算通过或平台验收完成。
