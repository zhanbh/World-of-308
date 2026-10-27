# ST13-02 本地验证

日期：2026-10-27。分支`feat/st13-02-active-trinket`。本记录为实施者证据，不代表整包ST13/平台/设备验收。

只读来源：spec accepted_revision `09bc9716057a26d11b177816d25259d8cfdcee64c6771359a60a2ea158ae278b`；ST13-02 accepted_revision `5935f4175621d2aa0460fd74fb02b3f2d6d8176d7bb96b578a508ed56b36fdde`。未修改spec/票据正文；seam严格沿纯规则内核、仿真属性快照注入、装备换卸锁守卫与真实ChallengeService事务提交。

## 实际交付

1. **纯主动饰品规则内核 (`shared/src/trinket-kernel.ts`)**：
   - 建立了饰品目录 `TRINKET_CATALOG`（含战神荣耀徽记 `item:trinket-warrior-glory-v1`：+150 AP、5% 暴击、20% 暴伤；蛮力护符：+100 AP；疾风结晶：10% 急速；学徒护符：+50 AP；精兵徽章：+75 AP；以及规范别名映射）。
   - 固定 120 秒冷却周期（12000 ticks）、15 秒属性持续时间（1500 ticks）、60 秒换装等待时间（6000 ticks）。
   - 激活规则与错误拒绝：未穿戴/ID不匹配拒绝（`ITEM_NOT_EQUIPPED`）、穿戴未满60秒拒绝（`EQUIP_WAITING`）、CD中拒绝（`COOLDOWN_ACTIVE`）、死亡拒绝（`PLAYER_DEAD`）。
   - 受控可用但不解控：被控制状态（如硬直、倒地）下允许激活饰品并赋予限时属性增益，但严格不清除、不削减控制状态。
   - 属性增益合并与封顶计算：`aggregateTrinketModifiers` 聚合多增益；`applyTrinketStats` 支持泛型属性注入，并严格保证总急速封顶 2.0x、总暴击率封顶 100%。
   - 过期修剪与生命周期：`pruneExpiredBuffs` 泛型修剪到期增益，到期后自动恢复基准面板。
2. **多技能仿真循环同刻供给与属性快照注入 (`shared/src/*-simulation.ts`)**：
   - 在 `earth-simulation.ts`、`badao-simulation.ts`、`bengshan-simulation.ts`、`cross-simulation.ts`、`basic-simulation.ts` 与怪物联调仿真中，扩展 `supply` 钩子支持 `trinket` 输入，并在 tick 循环起始点优先消费饰品。
   - 增加可选 `activeStats(tick, currentStats)` 钩子，使同一 tick 激活饰品后紧随释放的技能在起手判定时立即捕获带增益的面板属性并锁定快照；增益过期后新技能恢复基准属性，已在途的斩击与流血伤害不被反算。
3. **装备卸换锁、回城清理与挑战事务原子提交 (`backend/src/...`)**：
   - 数据模型扩展：`CharacterEntity` 增加 `trinketCooldownUntil` 与 `trinketEquippedAt`；`EntryChallenge` 增加 `trinketEquipWaitUntilTick`。
   - `EquipmentService` 换卸锁守卫：在 `equipment.equip` 与 `equipment.unequip` 操作中，严格校验 `character.trinketCooldownUntil`，若饰品冷却仍在生效中则直接拒绝（`LOCATION_NOT_ALLOWED`）；穿戴与卸下操作原子维护 `trinketEquippedAt` 时间戳以驱动 60 秒等待期。
   - `login-handoff.ts`：回城进入客栈时清空角色的 `trinketCooldownUntil`（回城清 CD）。
   - `ChallengeService` 事务与检查点集成：
     - `challenge.start`：根据入场时角色的 `trinketEquippedAt` 严格计算当前挑战副本的 `trinketEquipWaitUntilTick`。
     - `submitMovement`：`supplyHandler` 接入 `applyTrinketInput`；`activeStatsCallback` 传入所有技能仿真；角色死亡时清除增益（`role.buffs = []`），存活时 `pruneExpiredBuffs` 自动修剪到期增益；将带增益面板属性写回 `role.attackPower`；在提交事务中将激活冷却的绝对毫秒时间戳原子写回 `character.trinketCooldownUntil`。
   - `role-transition.ts`：更新 `advanceRole` 逻辑，明确区分回复药水增益（需校验 `content.regeneration.buffs`）与主动饰品属性增益，保证自然回血回蓝与属性增益共存时不触发 `CONFIG_NOT_READY`。

## 红绿证据

1. **纯内核单元测试 (`shared/test/trinket-kernel.test.mjs`)**：
   - 10/10 项测试全部通过：包含目录合法性、120s CD 与 15s buff、未穿戴拒绝、60s 换装等待拒绝、CD 中重复使用拒绝、死亡拒绝、受控可用不解控、急速与暴击封顶计算、属性快照及过期修剪。
2. **集成与服务测试 (`backend/test/battle-trinket.test.mjs`)**：
   - 6/6 项集成测试全部通过：
     - 测试1：合法激活战神荣耀徽记获得 15s buff、启动 120s CD，装备不消耗，写入 CP buffs 与 cooldowns，回写角色 trinketCooldownUntil，生成 actionAccepted 事件。
     - 测试2：激活后 CP attackPower 动态提升 150 点（由 1000 提升至 1150），持续 15s（1500 ticks）后自动修剪并平滑恢复至 1000。
     - 测试3：穿戴未满 60 秒（10秒前穿戴，剩余50秒/5000 ticks）内尝试使用饰品，严格被动作拒绝（`EQUIP_WAITING`），不增加 buff、不启动 CD。
     - 测试4：120 秒冷却未结束时再次使用饰品，严格被动作拒绝（`COOLDOWN_ACTIVE`），原有 buff 与 CD 不受影响。
     - 测试5：使用的 itemId 与当前实际穿戴的饰品实例不一致时，严格被动作拒绝（`ITEM_NOT_EQUIPPED`）。
     - 测试6：饰品激活启动冷却后，调用 `equipment.unequip` 尝试卸下饰品，被装备服务严格拒绝（`LOCATION_NOT_ALLOWED`），实现冷却中禁卸换守卫。

## 实际命令与结果

本机 Node **24.9.0**，TypeScript **5.8.2**，离线无头执行，无依赖下载：

```bash
node --test shared/test/trinket-kernel.test.mjs backend/test/battle-trinket.test.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```

- 专项测试：**16/16 通过**（内核 10 + 集成 6）。
- 全量回归：**7/7 checks passed**（全量后端测试 602/602、共享纯模型 222/222、客户端纯模型全部通过、UI模型 100% 成功）。0 业务回归。

## 限制

本交付为 ST13-02 主动饰品合法穿戴、固定 CD、换装等待与属性生效内核及事务提交。同刻混合药水与饰品补给、换房与原操作恢复移交 ST13-03；Cocos HUD 前端独立饰品按钮与快捷栏联调移交 ST13-04；联合预算与全量合入移交 ST13-05。未启动浏览器、未涉及 Jira 单据。
