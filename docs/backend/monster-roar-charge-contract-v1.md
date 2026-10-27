# ST12-05 牛头Boss连续践踏、冲撞与吼叫执行合同

2026-10-27。承接已批准ST12-05；仅显式`local-test-monsters`候选配置。它不是正式数值表、ST12全部交付或平台验收。

## 版本与来源

- 规范来源：[ST12-05实施票据](../stories/warrior-loop/st12/issues/05-boss-roar-charge.md)、[ST12主规格](../stories/warrior-loop/st12/spec.md)。
- 候选来源：`docs/design/analysis/spatial_growth_encounter_trial.py`、`enemy_action_nodes_trial.py`、`spatial_dodge_trial.py`。
- 候选配置：`MonsterConfig.version = 'local-melee-v1' | 'local-tactics-v1'`。
- 招式定义与配置：
  - `combo`: P2二阶段连续践踏接锁向冲撞
    - 3段践踏判定节点：80, 140, 200 tick（0.8s, 1.4s, 2.0s），圆形伤害判定半径 72000（72px），伤害系数 2.5x AP，僵直 40 tick；
    - 锁向节点：240 tick（2.4s）锁定玩家当前方向（`facing = player.x >= boss.x ? 1 : -1`）；
    - 冲撞起步节点：320 tick（3.2s），冲撞速度 1800 milli-pixels/tick（180 px/s），最大位移 320000（320px），本体阻挡半径 14000（14px），接触判定半径 22000（22px），扫掠接触玩家时结算 3.0x AP 伤害与 40 tick 僵直；
    - 霸体边界：践踏与冲撞全程霸体，直至冲撞终止（撞墙或达到最大距离）；
    - 撞墙虚弱与无撞墙规则：
      - 地图边界以`movementConfig.bounds`为准（默认[-218000, 218000]），左墙位置`-204000`，右墙位置`204000`；
      - 碰墙即停：冲撞到达墙体立即停住，霸体立即解除（`superArmorEndTick = tick`），进入3秒虚弱（`weakUntilTick = tick + 300`，`action.endTick = tick + 300`）；
      - 未撞墙不触发虚弱：若冲撞走满320000未碰墙，严格不进入虚弱（`weakUntilTick`不设置），解除霸体进入80 tick收招（`action.endTick = tick + 80`）；
      - 虚弱交互：虚弱期间Boss不可移动、不可起手新招式；虚弱不因受击续期，不擅加增伤。
  - `roar`: 两阶段独立冷却中距离前方扇形吼叫
    - 判定距离：reach 140000（140px）；
    - 判定形状：以Boss当前锁定朝向为基准的前方扇形，半角为`Math.PI / 6`（30度）；
    - 节点结构：严格6个声波候选节点，位于`startTick`后 150, 200, 250, 300, 350, 400 tick（起手100 tick，之后每50 tick一跳）；
    - 霸体与收招：起手至末跳处于施招霸体（`superArmorEndTick = startTick + 400`），末跳后进入80 tick收招（`endTick = startTick + 480`），收招恢复正常受控打断；
    - 冷却管理：基准冷却 1200 tick（12.0s）。一阶段与二阶段拥有完全独立的冷却跟踪键（`boss_roar_p1`与`boss_roar_p2`），切阶段不继承或重置冷却；
    - 动态逐节点判定：每个声波节点按玩家当前实时坐标判定是否处于扇形内部。离开范围停止承受伤害与击退；重新进入范围继续承受剩余节点作用，已累计伤害不重置；
    - 伤害与击退：每节点造成 0.45x AP 伤害，并将玩家沿远离Boss方向推离 12px（12000 milli-pixels），受地图边界碰撞阻挡；
    - 累计伤害倒地判定：以吼叫正式起手时快照玩家最大生命值`maxHp`。当本次吼叫对玩家造成的累计实际伤害达到15%阈值时（`accumulated * 100n >= maxHp * 15n`），触发且最多触发一次倒地（`controlledUntilTick = tick + 80`，0.8s）；
    - 倒地维持：玩家倒地后若仍处于扇形范围内，后续声波节点继续对其造成伤害与击退；
    - 施法者死亡：施法者在吼叫期间死亡，后续尚未结算的声波节点立即全部取消。

## 状态与确定性保证

1. **分片切片保真**：
   - 吼叫与冲撞的所有进度字段（`contactTicks`, `contactsDone`, `maxHpSnapshot`, `accumulatedRoarDamage`, `roarKnocked`, `chargeLocked`, `chargeHit`, `chargeEndTick`, `travelled`, `wallHit`, `trampleDone`, `weakUntilTick`）完全由`MonsterRuntime`自包含；
   - 任意时间点（如践踏中、锁向前、冲撞中、撞墙虚弱中、吼叫第1/3/5跳）切片保存并恢复执行，与整段单次执行严格产生完全相同的状态与事件流。
2. **确定性与无界防止**：
   - 严格限定6声波节点与3践踏节点，不私增隐藏判定；
   - 虚弱窗口受到受击时不重置虚弱时间，伤害采用标准护甲减免公式计算，不附加非规格增伤倍率。
