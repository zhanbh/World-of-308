# ST12-03 首本七房、额外紫名与权威清场执行合同

2026-10-27。承接已批准ST12-03；规范首本7房遭遇生成、额外紫名规则、击杀事实记录与权威清场门禁。

## 版本与来源

- 规范来源：[ST12-03实施票据](../stories/warrior-loop/st12/issues/03-encounter-clear.md)、[ST12主规格](../stories/warrior-loop/st12/spec.md)。
- 候选来源：`docs/design/analysis/spatial_growth_encounter_trial.py`。
- 坐标缩放系统：设计像素标准千倍整数坐标（milli-design-pixel，1 design pixel = 1000 internal units）。

## 遭遇生成合同

1. **首本七房基础怪物布局**：
   - 房间总数：7房（协议roomNo 0..6，对应展示R1..R7）；
   - 各房基础怪数量：`[3, 5, 5, 4, 3, 6, 1]`，总计**27只**；
   - 终局Boss房（roomNo 6）：固定1只Boss怪（`role: 'boss'`），占位坐标`(150000, 20000)`。

2. **额外紫名生成与资格规则**：
   - 候选位置：固定坐标`(105000, 20000)`；
   - 出现范围：仅限前六房（协议roomNo 0..5，展示R1..R6）；
   - **Boss房严格排除**：Boss房（roomNo 6）严格不接受紫名怪物生成；
   - 实例分配：每个挑战创建时随机选定前6房之一，分配单只额外紫名怪（`spawnId: 'purple-extra'`, `role: 'purple'`）；
   - 挑战全生命周期固定：选定后持久化记录于挑战根实体（`EntryChallenge.purpleRoomNo`, `EntryChallenge.purpleEncounter`），切房与重载/断线恢复严格保持一致，禁止重抽或漏生。

3. **几何与边界约束**：
   - 地图物理包络：`bounds = { left: -218000, right: 218000, bottom: -35000, top: 78000 }`；
   - 入口保护区：`entrance = (-180000, 20000)`，怪物出生点距入口必须大于 24000（24px）；
   - 出口保护区：`exit = (200000, 20000)`，怪物出生点距出口必须大于 24000（24px）；
   - 房间怪物容量：每房最大怪物上限严格 `<= 8`。

## 清场与击杀事实合同

1. **权威清场判断**：
   - 房内门禁开启仅由权威服务端依据怪物生命状态判定；
   - 当房内所有怪物（包括基础怪与额外紫名）全部死亡（`hp === '0'` 且 `lifeState === 'dead'`）时，房间状态转为清场（`roomPhase = 'cleared'`）；
   - 若紫名怪或任意一只普通怪存活，房间严格禁止开启或转入下一房，切房请求拒绝（`ROOM_NOT_AVAILABLE`）；
   - 禁止第二波刷新，不保留客户端单方面声明清场的旁路。

2. **稳定击杀事实记录（ConfirmedKillFact）**：
   - 结构字段：
     ```ts
     export interface ConfirmedKillFact {
         spawnId: string;
         role: 'ordinary' | 'elite' | 'boss' | 'purple';
         templateRef: string;
         roomNo: number;
         xpMultiplier: number;
     }
     ```
   - 紫名经验倍率：`xpMultiplier = 2`，独立于怪物品质与角色等级；
   - 普通怪经验倍率：`xpMultiplier = 1`；
   - 事实记录保真：随仿真步进原子写入挑战根实体（`EntryChallenge.confirmedKills`），支持按房与spawnId去重；
   - 职责边界：本阶段仅产出后续结算所需的稳定击杀事实，不提前发放金币、物品或经验（待ST15统一结算）。

3. **ST10转场门禁对接**：
   - `prepareRoom`向下一房推进时执行`nextRoomAllowed`核验；
   - 权威条件：
     1. 当前房间已清场（`roomPhase === 'cleared'`）；
     2. 检查点中所有敌人生命为0且死亡（`scene.enemies.every(e => e.actor.lifeState === 'dead' && e.actor.hp === '0')`）；
     3. 玩家存活（`role.player.lifeState === 'alive' && BigInt(role.player.hp) > 0n`）；
     4. 玩家位于出口交互半径内（`Math.hypot(player.x - exit.x, player.y - exit.y) <= exitRule.radius`）；
     5. 怪物集合与当前房间Manifest完全吻合，防伪造注入。
