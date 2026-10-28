# ST14-02 本地验证报告

- 日期：2026-10-28
- 分支：`feat/st14-02-revive-transaction`
- 基础基线：`f46f97b`
- 来源规格：`docs/stories/warrior-loop/st14/spec.md` (SHA256: `185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12`)
- 对应票据：`docs/stories/warrior-loop/st14/issues/02-manual-revive-emblem-transaction.md` (SHA256: `4b4010b47eca258b3d4f263a1cf1c3a691bd22dce0c32b5e56bbcab50d82f13a`)

---

## 1. 实际交付内容

1. **真实 ChallengeService 复活事务 (`backend/src/challenge/challenge-service.ts`)**：
   - 接入 `challenge.revive` 命令处理路由，接入 Store 乐观并发事务与 `assetOp` 幂等收据保护。
   - 校验前置条件：
     - `h.result === 'active'` 且场景非关闭；
     - `h.lifeState === 'dead'` 且 `deathIndex` 与请求载荷严格一致；
     - 物理截止判定：`now <= h.deathDeadline`，超时或过期严格拒绝 `DEADLINE_EXPIRED` 且零扣款；
     - 校验特殊副本复活上限：`paidRevives < 3`（`d.kind === 'special'`），超限拒绝 `REVIVE_LIMIT_REACHED`。

2. **背包复活纹章优先级扣除 (`backend/src/challenge/challenge-service.ts`, `backend/src/character/character-model.ts`, `backend/src/application/game-service.ts`)**：
   - 检查角色背包（`ContainerEntity`），定位模版为 `resurrection-emblem` 的堆叠槽位。
   - 严格按绑定等级优先级排序扣除：
     - `character`（角色绑定，权重 0）优先于
     - `account`（账号绑定，权重 1）优先于
     - `none`（未绑定，权重 2）。
   - 槽位数量归零时物理移除槽位，递增背包 `version`；无可用纹章拒绝 `EMBLEM_NOT_ENOUGH`。

3. **角色与场景检查点原子重置 (`backend/src/challenge/challenge-service.ts`, `backend/src/challenge/challenge-model.ts`)**：
   - `Challenge` 实体原子重置：
     - `lifeState = 'alive'`；
     - `paidRevives++`；
     - 清除 `deathDeadline`；
     - 赋予 2.0 秒无敌受击保护：`protectionUntil = now + 2000`。
   - `RoleCheckpoint` 与 `SceneCheckpoint`（存在已激活房间时）：
     - 满血满蓝完全恢复：`role.player.hp = role.player.maxHp`, `role.player.mp = role.player.maxMp`；
     - 重置战斗输入状态：`role.player.actionId = 'idle'`, `role.player.phase = 0`, `role.combat.state = initialCombatState()`；
     - 怪物控制状态重置：`scene.monsterControlUntilTick = 0`。

4. **CD 冷却精准分流**：
   - 重置 4 个战士职业主动技能 CD：`role.cooldowns` 中的 `cross`, `bengshan`, `badao`, `earth` 恢复为 `readyAtTick = logicTick(0)`；场景技能 `readyAtUs = { n: '0', d: '1' }`，`cast = null`。
   - 严格保留现有战斗药水与主动饰品 CD：`hpPotion`, `mpPotion`, `trinket` 保持原有 `readyAtTick` 与 `c.trinketCooldownUntil`，严禁隐式重置。

5. **死亡状态向服务层与检查点权威传播 (`submitMovement`)**：
   - 战斗内核致死时，将 `role.player.lifeState === 'dead'`、`deathIndex`、`deathDeadline` 真实落入 `EntryChallenge` 与 `RoomCheckpointHeader.state`。
   - Boss 房间残余伤害击杀判定：在玩家死亡窗口内击杀首领触发通关免纹章复活。

---

## 2. 自动化验证证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**（无头运行，**严格未打开任何浏览器**）。

### 专项测试套件 (`backend/test/challenge-revive.test.mjs`)
- `✔ successful revive within deadline deducts 1 emblem, restores full HP/MP, grants 2s protection, resets warrior CDs while preserving potion/trinket CD (71ms)`
- `✔ priority deduction: consumes character-bound before account-bound and unbound emblems (26ms)`
- `✔ no emblems in bag rejects with EMBLEM_NOT_ENOUGH and zero deduction (16ms)`
- `✔ deadline expired: now > deathDeadline rejects with DEADLINE_EXPIRED and zero deduction (14ms)`
- `✔ special dungeon: paidRevives >= 3 rejects with REVIVE_LIMIT_REACHED (14ms)`
- `✔ not dead: living player calling revive rejects with NOT_DEAD (12ms)`
- `✔ stale deathIndex: mismatched deathIndex rejects with NOT_DEAD (13ms)`
- `✔ idempotent replay of same operationId returns original result with replayed true and single deduction (18ms)`
- `✔ concurrent write conflict / double revive: second distinct operationId fails with NOT_DEAD (17ms)`
- **结果：9/9 全部通过，耗时 469ms**。

### 全量 7/7 门禁回归 (`tools/check-all.cjs`)
1. **CHECK: source contract freshness** -> PASS
2. **CHECK: backend types** -> PASS
3. **CHECK: shared value contracts** -> PASS (227 tests passed)
4. **CHECK: client pure-model types** -> PASS
5. **CHECK: backend regression (legacy and v2)** -> PASS (625 tests passed, +9 from ST14-02)
6. **CHECK: client model regression** -> PASS (21 checks passed)
7. **CHECK: client UI-model regression** -> PASS (8 checks passed)
- **总体结论：SUMMARY: 7/7 checks passed (100% SUCCESS)**。

---

## 3. 验收标准与差异分析 (GAP)

| 规格验收标准 | 实施验证情况 | 状态 |
| :--- | :--- | :---: |
| 校验 active/dead/deathIndex/deadline | `challenge-revive.test.mjs` 测试 1、4、6、7 通过 | 已达成 |
| 纹章扣除优先级（角色->账号->未绑定） | `challenge-revive.test.mjs` 测试 2 通过 | 已达成 |
| 特殊副本累计复活 <= 3 次上限 | `challenge-revive.test.mjs` 测试 5 通过 | 已达成 |
| 原子重置生还、满血满蓝、2s 保护 | `challenge-revive.test.mjs` 测试 1 通过 | 已达成 |
| CD 分流：重置 4 个职业技能，保留药水与饰品 CD | `challenge-revive.test.mjs` 测试 1 通过 | 已达成 |
| 幂等重放与并发安全（写冲突、二次复活零扣款） | `challenge-revive.test.mjs` 测试 8、9 通过 | 已达成 |

- **已知平台 GAP**：微信小游戏真机环境、真实云端数据库提交与 Cocos 场景 HUD 弹窗视觉留待 ST14-04 与平台适配层。
