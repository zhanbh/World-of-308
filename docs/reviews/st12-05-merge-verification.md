# ST12-05 独立合入核验报告

2026-10-27。核验者为独立merger。集成分支`feat-1.0.0`以`git merge --ff-only feat/st12-05-boss-roar-charge`快进合入至 **`e277ffa`**；未推送。

## 来源、范围与契约核验

1. **正文与修改范围**：
   - 依赖ST12-04已验证基线（`ab0f5d5`）；
   - spec SHA256 与 ST12-05 accepted_revision（`901b4c5ce7f00843cabf5ec817dbc0b33f84983ba97f04ab7a2000e6b12b863b`）完全一致，未修改正文；
   - 范围聚焦ST12-05：牛头Boss连续践踏、锁向冲撞、撞墙虚弱、前方扇形中距离吼叫、阶段独立霸体与累计倒地；未越界进入ST12-06首本可玩收口与验收。

2. **核心机制验证**：
   - **二阶段践踏冲撞连招与撞墙虚弱 (`combo`)**：
     - 3段践踏命中判定：80, 140, 200 tick（0.8s, 1.4s, 2.0s），圆形接触判定半径 72000（72px），每段造成 2.5x AP 伤害与 40 tick 僵直；
     - 锁向节点：240 tick（2.4s）锁定玩家当前方向（`facing = player.x >= boss.x ? 1 : -1`）；
     - 冲撞起步：320 tick（3.2s），速度 1800 milli-pixels/tick（180 px/s），最大位移 320000（320px），本体阻挡半径 14000（14px），接触扫掠判定半径 22000（22px），扫掠触碰玩家结算 3.0x AP 伤害与 40 tick 僵直；
     - 霸体保护：践踏与冲撞全程霸体，直至冲撞终止（碰墙或位移结束）；
     - 撞墙虚弱与无撞墙规则：
       - 地图边界基于`movementConfig.bounds`（[-218000, 218000]），左右墙体位于`-204000`与`204000`；
       - 碰墙即停：冲撞接触墙体瞬间停止位移，霸体立即解除（`superArmorEndTick = tick`），进入3秒虚弱（`weakUntilTick = tick + 300`，`action.endTick = tick + 300`）；
       - 未撞墙不虚弱：走满320000未碰墙时，严格不进入虚弱（`weakUntilTick`不设置），解除霸体进入80 tick收招（`action.endTick = tick + 80`）；
       - 虚弱交互守则：虚弱期间不可移动或起手新招式；虚弱不因受击续期，不擅加增伤。
   - **牛头Boss两阶段中距离扇形吼叫 (`roar`)**：
     - 空间判定：reach 140000（140px），以锁定朝向为基准的前方扇形，半角为`Math.PI / 6`（30度）；
     - 严格6节点结构：位于起手后 150, 200, 250, 300, 350, 400 tick（起手100 tick，后续每50 tick一跳）；
     - 霸体与收招：起手至末跳处于施招霸体（`superArmorEndTick = startTick + 400`），收招400..480 tick（80 tick）恢复受控打断；
     - 两阶段独立冷却：基准CD 1200 tick（12.0s），一阶段（`boss_0_roar_p1`）与二阶段（`boss_0_roar_p2`）独立键跟踪，切阶段互不锁定；
     - 动态出入判定：每节点实时检验玩家当前坐标，离开扇形不承受作用，重入继续承受，已累计伤害不重置；
     - 伤害与击退：每节点造成 0.45x AP 伤害，推离玩家 12px（12000 milli-pixels），受边界墙体阻挡；
     - 累计伤害倒地：以正式起手快照玩家最大生命值`maxHp`，累计伤害达到15%阈值时触发且仅触发一次倒地（`controlledUntilTick = tick + 80`，0.8s）；
     - 倒地维持与死亡取消：玩家倒地后若仍在范围内继续承受伤害与击退；施法者死亡立即取消后续剩余声波节点。

## 实际执行证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**，全过程离线无下载。

- 实施专项测试：`shared/test/monster-roar-charge.test.mjs` **9/9 通过**；
- 继承测试：`shared/test/monster-elite-boss.test.mjs` **8/8 通过**；`shared/test/monster-tactics.test.mjs` **16/16 通过**；`shared/test/monster-joint.test.mjs` **13/13 通过**；`backend/test/encounter-clear.test.mjs` **5/5 通过**；
- 集成目录全量门禁：`tools/check-all.cjs` **7/7 全部通过**（shared 199项、backend 578项全数通过），日志已归档至 [st12-05-merged-check-all.log](st12-05-merged-check-all.log)；
- backend 与 client 模型 TypeScript 类型检查通过（0 error）；
- `git diff --check` 通过。

结论：**ST12-05满足规格与工程约束，已独立核验通过并合入主开发分支`feat-1.0.0`**。
