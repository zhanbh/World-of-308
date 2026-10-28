# ST14-01 本地验证报告

- 日期：2026-10-28
- 分支：`feat/st14-01-death-window`
- 基础基线：`7448d78`
- 实施提交：`7fdc856`
- 来源规格：`docs/stories/warrior-loop/st14/spec.md` (SHA256: `185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12`)
- 对应票据：`docs/stories/warrior-loop/st14/issues/01-authoritative-death-window.md` (SHA256: `67ff75d2f28b0491209d326df01740a8dc6f3cd95e167ca12b541b644eb3bdb4`)

---

## 1. 实际交付内容

1. **权威死亡事件与 10 秒截止时间锚定 (`shared/src/monster-simulation.ts`)**：
   - 扩展 `MonsterPlayer` 支持 `deathIndex`、`deathDeadline`、`deathAtTick` 状态。
   - 实现 `markPlayerDead(events, tick, m)`，在受到致命伤害（HP 归零）时刻权威判定玩家死亡：
     - `player.hp = '0'`，`player.lifeState = 'dead'`；
     - 递增 `deathIndex`；
     - 锚定 `deathDeadline = deathTime + 10_000ms`（严格以死亡发生的绝对时间为基准，不受客户端汇报延迟影响）；
     - 抛出死亡事件：`{ kind: 'death', code: 'DEATH_INDEX_${player.deathIndex}' }`。
   - 覆盖所有 6 处伤害生效点（近战普通/蓄力、远程投射物、战吼、翻滚/冲撞判定）。

2. **死后输入全面拦截与资源恢复挂起 (`shared/src/earth-simulation.ts`)**：
   - 自然 MP/HP 回复：在刻步循环与后置结算中受 `!jointDead?.(tick)` 保护，死亡期间 HP/MP 自然回复完全停滞，回调跳过。
   - 移动输入完全锁定：位移速度强制归零 (`walkSpeed: 0, runSpeed: 0, ySpeed: 0`)，禁止死后移动。
   - 基础攻击输入：死亡状态下直接抛出 `actionRejected`，拒绝码 `DEAD`。
   - 技能输入：硬控/死亡统一清理预备与施法队列 (`s.cast = null`, `g.cast = null`, `d.cast = null`, `e.cast = null`)，后续按键拦截。
   - 补给品/主动饰品使用：死亡时拦截并返回 `actionRejected`，拒绝码 `DEAD`。

3. **残余伤害判定独立性 (`shared/test/death-window-joint.test.mjs`)**：
   - 玩家死亡并不抹除场上已经释放的投射物、流血 DOT（`bleed`）或地裂波动剑（`ground`）等特效。
   - 怪物在玩家死后因残余流血跳数致死，正常触发击杀事件与掉落物判定，玩家保持死亡状态不复活。

4. **客户端纯模型状态同步 (`client/assets/scripts/CombatModel.ts`)**：
   - 新增 `lifeState: 'alive' | 'dead'`、`deathIndex`、`deathDeadline` 与 `isDead` getter。
   - `takeHit` 受到致命伤害即时切换为 `dead`，清除位移与普攻段位状态。
   - `press()` 与 `update()` 在死亡状态下拦截按键与位移。
   - `reset()` 彻底还原血量与生还状态。

5. **后端协议与服务对齐 (`shared/src/protocol/types.ts`, `backend/src/application/game-service.ts`, `backend/src/application/validation.ts`)**：
   - `BattleEvent` 中的 `playerDied` 增加可选 `deathOccurredAt?: number` 字段。
   - `GameService.reportEvents` 支持从事件中锚定真实的死亡绝对时间戳计算 10 秒复活窗口截止期。

---

## 2. 自动化验证证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**（无头运行，**完全未打开浏览器**，符合用户明确约束）。

### 专项测试 (`shared/test/death-window-joint.test.mjs`)
- `✔ ST14-01: lethal hit triggers player death, deathIndex, and 10s deadline anchor (81ms)`
- `✔ ST14-01: dead player cannot move, press basic attacks, or use supply items (29ms)`
- `✔ ST14-01: dead player pauses natural MP and HP resource recovery (24ms)`
- `✔ ST14-01: lingering bleed DOT continues ticking and kills monster after player death (29ms)`
- **结果：4/4 全部通过，0 失败**。

### 客户端纯模型回归 (`client/tools/check-model.cjs`)
- `PASS: ST14-01 CombatModel death state, deathIndex tracking, input blocking, and reset`
- **结果：21/21 全部通过**。

### 全量 7 门禁回归 (`tools/check-all.cjs`)
1. `tooling contracts`: PASS (7/7)
2. `shared/backend types`: PASS (TypeScript 无类型错误)
3. `shared value contracts`: PASS (227/227)
4. `client pure-model types`: PASS
5. `backend regression (legacy and v2)`: PASS (616/616)
6. `client model regression`: PASS
7. `client UI-model regression`: PASS (100% SUCCESS)
- **结果：SUMMARY: 7/7 checks passed**。

---

## 3. 平台差异说明 (GAP)

- 本切片为 ST14-01 仿真内核与服务端时间戳基线。
- 复活币扣除与手动复活事务由 ST14-02 承接。
- 10秒超时退出与结算由 ST14-03 承接。
- Cocos 倒计时 HUD 表现与弹窗由 ST14-04 承接。
- 遵循无头自动化约束，未打开任何浏览器。
