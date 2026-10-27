# ST12-05 本地验证报告

日期：2026-10-27。分支`feat/st12-05-boss-roar-charge`；初始基点`ab0f5d5`（合入ST12-04后的`feat-1.0.0`）。本记录为实施者证据，不代表整包ST12/平台/设备验收。

只读来源：spec accepted_revision `26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7`；ST12-05 accepted_revision `901b4c5ce7f00843cabf5ec817dbc0b33f84983ba97f04ab7a2000e6b12b863b`。

## 实际交付

1. **二阶段连续践踏接锁向冲撞与撞墙虚弱 (`combo`)**：
   - 3段践踏命中判定：位于80, 140, 200 tick（0.8s, 1.4s, 2.0s），圆形接触判定半径 72000（72px），每段造成 2.5x AP 伤害与 40 tick 僵直；
   - 锁向节点：240 tick（2.4s）锁定玩家当前方向（`facing = player.x >= boss.x ? 1 : -1`）；
   - 冲撞起步：320 tick（3.2s），速度 1800 milli-pixels/tick（180 px/s），最大位移 320000（320px），本体阻挡半径 14000（14px），接触扫掠判定半径 22000（22px），扫掠触碰玩家结算 3.0x AP 伤害与 40 tick 僵直；
   - 霸体保护：践踏与冲撞全程霸体，直至冲撞终止（撞墙或位移结束）；
   - 撞墙虚弱与无撞墙规则：
     - 地图边界基于`movementConfig.bounds`（[-218000, 218000]），左右墙体位于`-204000`与`204000`；
     - 碰墙即停：冲撞接触墙体瞬间停止位移，霸体立即解除（`superArmorEndTick = tick`），进入3秒虚弱（`weakUntilTick = tick + 300`，`action.endTick = tick + 300`）；
     - 未撞墙不虚弱：走满320000未碰墙时，严格不进入虚弱（`weakUntilTick`不设置），解除霸体进入80 tick收招（`action.endTick = tick + 80`）；
     - 虚弱交互守则：虚弱期间不可移动或起手新招式；虚弱不因受击续期，不擅加增伤。

2. **牛头Boss两阶段中距离扇形吼叫 (`roar`)**：
   - 空间判定：reach 140000（140px），以锁定朝向为基准的前方扇形，半角为`Math.PI / 6`（30度）；
   - 严格6节点结构：位于起手后 150, 200, 250, 300, 350, 400 tick（起手100 tick，后续每50 tick一跳）；
   - 霸体与收招：起手至末跳处于施招霸体（`superArmorEndTick = startTick + 400`），收招400..480 tick（80 tick）恢复受控打断；
   - 两阶段独立冷却：基准CD 1200 tick（12.0s），一阶段（`boss_0_roar_p1`）与二阶段（`boss_0_roar_p2`）独立键跟踪，切阶段互不锁定；
   - 动态出入判定：每节点实时检验玩家当前坐标，离开扇形不承受作用，重入继续承受，已累计伤害不重置；
   - 伤害与击退：每节点造成 0.45x AP 伤害，推离玩家 12px（12000 milli-pixels），受边界墙体阻挡；
   - 累计伤害倒地：以正式起手快照玩家最大生命值`maxHp`，累计伤害达到15%阈值时触发且仅触发一次倒地（`controlledUntilTick = tick + 80`，0.8s）；
   - 倒地维持与死亡取消：玩家倒地后若仍在范围内继续承受伤害与击退；施法者死亡立即取消后续剩余声波节点。

## 测试证据

本机Node **24.22.1**，TypeScript **5.8.2**，复用Creator安装离线运行。

1. 专项测试：`shared/test/monster-roar-charge.test.mjs` **9/9 全部通过**：
   - `Test 1: P2 combo sequence (3 tramples -> lock -> charge -> wall crash -> 3s weakness)`: PASS
   - `Test 2: combo charge max distance without wall hit does NOT trigger weakness; recovery restores vulnerability`: PASS
   - `Test 3: weakness is not refreshed by player attacks and does not amplify damage`: PASS
   - `Test 4: roar sector geometry and escaping range`: PASS
   - `Test 5: roar cumulative 15% max HP knockdown once per roar; ongoing roar continues through down`: PASS
   - `Test 6: roar super armor 0..400 and recovery vulnerability 400..480`: PASS
   - `Test 7: caster death cancels future roar soundwaves`: PASS
   - `Test 8: two-phase independent roar cooldowns`: PASS
   - `Test 9: sliced checkpoint test preserves roar and combo exact states across arbitrary slices`: PASS

2. 全量怪物套件：`shared/test/` **37/37 全部通过**：
   - `monster-tactics.test.mjs`: 16/16 PASS
   - `monster-elite-boss.test.mjs`: 8/8 PASS
   - `monster-joint.test.mjs`: 13/13 PASS
   - `monster-roar-charge.test.mjs`: 9/9 PASS

3. 全量门禁：`tools/check-all.cjs` **7/7 全部通过**：
   - tooling contracts: PASS
   - shared/backend types: PASS
   - shared value contracts: PASS (199/199 tests, including 9/9 roar-charge tests)
   - client pure-model types: PASS
   - backend regression (legacy and v2): PASS (578/578 tests)
   - client model regression: PASS
   - client UI-model regression: PASS
   - 完整日志记录于 `docs/reviews/st12-05-check-all.log`。
