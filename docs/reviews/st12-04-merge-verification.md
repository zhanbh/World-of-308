# ST12-04 独立合入核验报告

2026-10-27。核验者为独立merger。集成分支`feat-1.0.0`以`git merge --ff-only feat/st12-04-elite-boss-phase`快进合入至 **`369e349`**；未推送。

## 来源、范围与契约核验

1. **正文与修改范围**：
   - 依赖ST12-03已验证基线（`08bd4e3`）；
   - spec SHA256 与 ST12-04 accepted_revision（`b5b20ec772fd11cfd2b6fc1d1ea01821e948875e554b1ae8bb2cf8c2edb373de`）完全一致，未修改正文；
   - 范围聚焦ST12-04：精英顺劈/横扫、牛头Boss重槌/践踏、指定施招霸体机制、收招人形可控打断、半血50% HP平滑阶段交接、确定性统一执行顺序；未越界实现05吼叫狂暴冲锋或06 Cocos构建。

2. **核心机制验证**：
   - **精英牛头守卫与牛头Boss招式与战术配置**：
     - 人形归属：精英牛头守卫与牛头Boss均为人形（`humanoid`），默认受控（stagger/knockdown/bleed）；
     - 战术分配：精英守卫为 `heavy_guard`（技能池 `cleave` + `sweep`），牛头Boss为 `area_controller`（技能池 `smash` + `stomp`）；
     - 顺劈（`cleave`）：前摇60 ticks，后摇70 ticks，CD 300 ticks，包络64x26px，伤害系数 2.5x AP，硬直24 ticks，**无霸体**（施招全周期可被控制打断，CD不返还）；
     - 横扫（`sweep`）：前摇100 ticks，后摇100 ticks，CD 600 ticks，包络64x32px，伤害系数 2.5x AP，硬直30 ticks，**霸体 0..115 ticks**（115..200 ticks 恢复人形可控受控打断）；
     - 重槌（`smash`）：前摇100 ticks，后摇100 ticks，CD 400 ticks，包络72x32px，伤害系数 2.5x AP，硬直35 ticks，**霸体 0..115 ticks**（115..200 ticks 恢复受控）；
     - 践踏（`stomp`）：前摇130 ticks，后摇100 ticks，CD 500 ticks，包络72x36px，伤害系数 2.5x AP，硬直40 ticks，**霸体 0..150 ticks**（150..230 ticks 恢复受控）。
   - **施招霸体（Super Armor）**：
     - 霸体期间正常承受全部直接伤害与流血扣减；
     - 霸体期间免疫击退漂移（`displacement = 0`）与受控打断，到达打击节点（`hitTick`）正常释放攻击；
     - 收招期霸体失效，受到玩家直接攻击硬直或击倒将打断后摇并进入CD（不返还CD）。
   - **50% HP 半血阶段交接**：
     - 阈值：`BigInt(hp) * 2n <= BigInt(maxHp)` 且 `phase === 1`；
     - 施招中不强行打断，暂存 `pendingPhase = 2`，待动作自然收招结束后平滑切换为 `phase = 2`；
     - 前摇无霸体或收招期受控中断时，立即结算待切阶段（`phase = 2`），冷却保留不返还；
     - 严格约束：不重置CD、不回血、不获得无敌；
     - 死亡优先：致死伤害（`hp === '0'`）直接死亡并清空待切阶段，禁止死后切阶段；
     - 状态保留：切阶段时现有硬直与击倒状态保持原到期时间；
     - 确定性统一计算时序：伤害结算 -> 死亡判定 -> 控制状态判定 -> 施招与霸体打断判定 -> 阶段交接检查与更新；
     - 同时刻双向致死打击释放保真（due hits preserve resolution）。

## 实际执行证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**，全过程离线无下载。

- 实施专项测试：`shared/test/monster-elite-boss.test.mjs` **8/8 通过**；
- 继承测试：`shared/test/monster-tactics.test.mjs` **8/8 通过**；`shared/test/monster-joint.test.mjs` **12/12 通过**；`backend/test/encounter-clear.test.mjs` **5/5 通过**；
- 集成目录全量门禁：`tools/check-all.cjs` **7/7 全部通过**（shared 190项、backend 578项全数通过），日志已归档至 [st12-04-merged-check-all.log](st12-04-merged-check-all.log)；
- backend 与 client 模型 TypeScript 类型检查通过（0 error）；
- `git diff --check` 通过。

结论：**ST12-04满足规格与工程约束，已独立核验通过并合入主开发分支`feat-1.0.0`**。
