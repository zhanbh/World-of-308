# ST12-04 本地验证报告

日期：2026-10-27。分支`feat/st12-04-elite-boss-phase`；初始基点`08bd4e3`（合入ST12-03后的`feat-1.0.0`）。本记录为实施者证据，不代表整包ST12/平台/设备验收。

只读来源：spec accepted_revision `26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7`；ST12-04 accepted_revision `b5b20ec772fd11cfd2b6fc1d1ea01821e948875e554b1ae8bb2cf8c2edb373de`。

## 实际交付

1. **精英牛头守卫与牛头Boss基础招式与战术配置**：
   - 种族归属：牛头守卫（`elite`）与牛头Boss（`boss`）类型统一为人形（`humanoid`），默认受控（stagger/knockdown/bleed）；
   - 战术分配：牛头守卫为重装守卫（`heavy_guard`，技能池 `cleave` + `sweep`），牛头Boss为区域压制（`area_controller`，技能池 `smash` + `stomp`）；
   - 招式规格：
     - **顺劈 (`cleave`)**：windup 60 ticks, recovery 70 ticks (total 130 ticks), cd 300 ticks, rangeX 64000, rangeY 26000, speed 1000, stagger 24 ticks, 伤害系数 2.5x AP，**无霸体**（施招全周期均可被受控打断，打断不返还CD）；
     - **横扫 (`sweep`)**：windup 100 ticks, recovery 100 ticks (total 200 ticks), cd 600 ticks, rangeX 64000, rangeY 32000, speed 1000, stagger 30 ticks, 伤害系数 2.5x AP，**霸体 0..115 ticks**（收招 115..200 ticks 恢复人形可控受控打断）；
     - **重槌 (`smash`)**：windup 100 ticks, recovery 100 ticks (total 200 ticks), cd 400 ticks, rangeX 72000, rangeY 32000, speed 1000, stagger 35 ticks, 伤害系数 2.5x AP，**霸体 0..115 ticks**（收招 115..200 ticks 恢复受控）；
     - **践踏 (`stomp`)**：windup 130 ticks, recovery 100 ticks (total 230 ticks), cd 500 ticks, rangeX 72000, rangeY 36000, speed 1000, stagger 40 ticks, 伤害系数 2.5x AP，**霸体 0..150 ticks**（收招 150..230 ticks 恢复受控）。

2. **施招霸体（Super Armor）机制**：
   - 霸体期间怪物完全承受伤害与流血，生命值如实扣减，不获得免伤；
   - 霸体期间阻断控制动作打断与受击位移（`displacement = 0`），到达打击节点（`hitTick`）正常释放攻击；
   - 收招期霸体解除，受到玩家直接攻击硬直或击倒将合法打断后摇并进入冷却（不返还CD）。

3. **50% HP 半血阶段交接机制**：
   - 触发阈值：`BigInt(hp) * 2n <= BigInt(maxHp)` 且当前为第一阶段（`phase === 1`）；
   - 平滑等待：施招期间不强行打断当前招式，标记待切阶段（`pendingPhase = 2`），待完整动作（含收招）正常结束后原子转入 `phase = 2`；
   - 合法受控中断立即交接：前摇无霸体或收招期受控中断时，动作取消并立即交接为 `phase = 2`；
   - 严格约束：不重置CD、不回血、不获得无敌；
   - 死亡优先：致命伤害（`hp === '0'`）直接判定死亡，清除待切阶段，禁止死后切阶段；
   - 状态保留：切阶段时身上的硬直与倒地控制如实保留至正常到期；
   - 确定性统一时序：伤害结算 -> 死亡判定 -> 控制状态判定 -> 施招与霸体打断判定 -> 阶段交接检查。
   - 同时刻双向致死打击释放保真（due hits preserve resolution）。

## 测试证据

本机Node **24.22.1**，TypeScript **5.8.2**，复用Creator安装离线运行。

1. 专项测试：`shared/test/monster-elite-boss.test.mjs` **8/8 全部通过**：
   - `Test 1: cleave damage does not interrupt; legal control cancels future contact and retains CD`: PASS
   - `Test 2: sweep/smash super armor blocks control, not damage; recovery restores control`: PASS
   - `Test 3: half HP waits current full action including recovery; phase does not reset cooldown`: PASS
   - `Test 4: unarmored windup interrupt resolves pending phase without CD refund`: PASS
   - `Test 5: death supersedes pending phase; posthumous phase transition blocked`: PASS
   - `Test 6: phase transition preserves existing control state (stagger/knockdown)`: PASS
   - `Test 7: sliced checkpoint preserves exact elite & boss combat state, super armor, and pending phase`: PASS
   - `Test 8: boss stomp super armor 0..150 and recovery 150..230 with CD 500`: PASS

2. 全量门禁：`tools/check-all.cjs` **7/7 全部通过**：
   - tooling contracts: PASS
   - shared/backend types: PASS
   - shared value contracts: PASS (190/190 tests, including 8/8 elite-boss tests)
   - client pure-model types: PASS
   - backend regression (legacy and v2): PASS (578/578 tests)
   - client model regression: PASS
   - client UI-model regression: PASS
   - 完整日志记录于 `docs/reviews/st12-04-check-all.log`。
