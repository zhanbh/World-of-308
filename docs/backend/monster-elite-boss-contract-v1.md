# ST12-04 精英与牛头Boss基础阶段执行合同

2026-10-27。承接已批准ST12-04；规范牛头守卫（精英）、首Boss技能与施招霸体机制，以及50%最大生命值（半血）阶段平滑交接。

## 版本与来源

- 规范来源：[ST12-04实施票据](../stories/warrior-loop/st12/issues/04-elite-boss-phase.md)、[ST12主规格](../stories/warrior-loop/st12/spec.md)。
- 候选来源：`docs/design/analysis/spatial_growth_encounter_trial.py`。
- 坐标缩放系统：设计像素标准千倍整数坐标（milli-design-pixel，1 design pixel = 1000 internal units）。

## 角色与技能定义合同

1. **种族与基础抵抗属性**：
   - 牛头守卫（`elite`）与牛头Boss（`boss`）类型统一为人形（`humanoid`）；
   - 平时具备完全人形可控性（可受硬直`stagger`、击倒`knockdown`、流血`bleed`），默认抗性：
     ```ts
     resist: { bleed: false, stagger: false, knockback: false, knockdown: false }
     ```
   - 战术角色分配：
     - 牛头守卫：`role: 'heavy_guard'`，优先技能池 `[cleave, sweep]`；
     - 牛头Boss：`role: 'area_controller'`，优先技能池 `[smash, stomp]`。

2. **招式参数规范**：
   - **精英顺劈 (`cleave`)**：
     - 起手前摇（`windupTicks`）：60 ticks (0.6s)；
     - 收招后摇（`recoveryTicks`）：70 ticks (0.7s)；
     - 动作总长（`endTick - startTick`）：130 ticks (1.3s)；
     - 冷却时间（`cooldownTicks`）：300 ticks (3.0s)；
     - 判定包络：`rangeX = 64000` (64px), `rangeY = 26000` (26px)；
     - 伤害系数：`{ n: '25', d: '10' }` (2.5x AP)；
     - 命中硬直：24 ticks (0.24s)；
     - **霸体配置：无霸体**（施招全周期均可被合法控制打断，打断不返还CD）。
   - **精英横扫 (`sweep`)**：
     - 起手前摇（`windupTicks`）：100 ticks (1.0s)；
     - 收招后摇（`recoveryTicks`）：100 ticks (1.0s)；
     - 动作总长：200 ticks (2.0s)；
     - **施招霸体（`superArmorTicks`）**：前 115 ticks (1.15s，即起手与打击点 0..115 ticks 具备霸体)；
     - 收招可控期：115..200 ticks 恢复人形可控状态，期间受控合法打断收招；
     - 冷却时间：600 ticks (6.0s)；
     - 判定包络：`rangeX = 64000` (64px), `rangeY = 32000` (32px)；
     - 伤害系数：`{ n: '25', d: '10' }` (2.5x AP)；
     - 命中硬直：30 ticks (0.3s)。
   - **Boss重槌 (`smash`)**：
     - 起手前摇（`windupTicks`）：100 ticks (1.0s)；
     - 收招后摇（`recoveryTicks`）：100 ticks (1.0s)；
     - 动作总长：200 ticks (2.0s)；
     - **施招霸体（`superArmorTicks`）**：前 115 ticks (1.15s)；
     - 收招可控期：115..200 ticks 恢复受控；
     - 冷却时间：400 ticks (4.0s)；
     - 判定包络：`rangeX = 72000` (72px), `rangeY = 32000` (32px)；
     - 伤害系数：`{ n: '25', d: '10' }` (2.5x AP)；
     - 命中硬直：35 ticks (0.35s)。
   - **Boss践踏 (`stomp`)**：
     - 起手前摇（`windupTicks`）：130 ticks (1.3s)；
     - 收招后摇（`recoveryTicks`）：100 ticks (1.0s)；
     - 动作总长：230 ticks (2.3s)；
     - **施招霸体（`superArmorTicks`）**：前 150 ticks (1.5s)；
     - 收招可控期：150..230 ticks 恢复受控；
     - 冷却时间：500 ticks (5.0s)；
     - 判定包络：`rangeX = 72000` (72px), `rangeY = 36000` (36px)；
     - 伤害系数：`{ n: '25', d: '10' }` (2.5x AP)；
     - 命中硬直：40 ticks (0.4s)。

## 施招霸体（Super Armor）行为合同

1. **伤害与流血完全承受**：
   - 霸体不等于无敌，霸体期间怪物受到的伤害、命中判断及流血伤害完全按数值结算，正常扣减生命值。
2. **免疫击退与控制打断**：
   - 当 `tick < action.superArmorEndTick` 时：
     - 动作保持继续执行，到达 `action.hitTick` 正常向玩家释放打击；
     - 击退位移被阻断（`displacement = 0`），位置不被强制漂移；
     - 硬直/倒地控制状态仍如实记录于运行时（供收招后或状态展示读取），但不触发动作打断。
3. **收招期恢复可控**：
   - 当 `tick >= action.superArmorEndTick`（例如 sweep/smash 的 115..200 ticks，stomp 的 150..230 ticks）：
     - 霸体保护结束；
     - 受到任何合法直接伤害硬直或击倒将立即打断收招动作（`action = null`）；
     - 招式进入冷却并不返还CD。

## 50% HP 半血阶段交接合同

1. **半血触发阈值**：
   - 判定条件：`BigInt(hp) * 2n <= BigInt(maxHp)` 且 `phase === 1`。
2. **动作等待与平滑交接**：
   - 若当前怪物处于空闲（idle）或处于受控等待状态，直接切换至 `phase = 2`；
   - 若当前怪物正在施招（含起手、打击与收招）：
     - **不强行打断当前动作**；
     - 将阶段暂存入待切阶段状态（`pendingPhase = 2`），保持 `phase = 1`；
     - 待动作正常收招结束（`tick >= action.endTick`）时，原子转入 `phase = 2` 并清空 `pendingPhase = null`。
3. **合法受控打断立即交接**：
   - 若在待切阶段期间（`pendingPhase === 2`），当前动作被玩家合法控制打断（如无霸体前摇或收招期受控）：
     - 动作立即打断（`action = null`）；
     - 待切阶段立即生效交接（`phase = pendingPhase = 2`, `pendingPhase = null`）；
     - 冷却时间如实保留，不返还。
4. **禁止重置CD、回血与无敌**：
   - 阶段切换仅改变行为阶段标志（`phase: 1 -> 2`）；
   - 严禁重置任何技能冷却（`cooldowns` 保持原值）；
   - 严禁自动回复生命值（HP 严格保持当前受伤值）；
   - 严禁在阶段交接点赋予无敌帧。
5. **死亡优先（Death Supersedes Pending Phase）**：
   - 若受到致死伤害（`hp === '0'` 且 `lifeState === 'dead'`），直接判定死亡；
   - 清除当前动作与待切阶段（`action = null, pendingPhase = null`）；
   - 保持死亡状态下的原始阶段，严禁在死后触发幽灵切阶段。
6. **受控状态保持**：
   - 切阶段时不清除身上原有的受控状态（`staggerUntilTick`、`downUntilTick` 严格保持至到期）。
7. **确定性统一执行顺序**：
   - 每个时钟周期内部判定顺序严格确定：
     `伤害结算 -> 死亡判定 -> 控制状态判定 -> 施招与霸体打断判定 -> 阶段交接检查与更新 -> 动作移动推进`；
   - 同时刻共同释放打击保真（`same-boundary attacks released by both actors resolve even when both die`）。
