# ST12-02 远程、冲锋与四档协同行为执行合同

2026-10-26。承接已批准ST12-02；仅显式`local-test-monsters`候选配置。它不是正式数值表、ST12全部交付或平台验收。

## 版本与来源

- 规范来源：[ST12-02实施票据](../stories/warrior-loop/st12/issues/02-ranged-charge-ai.md)、[ST12主规格](../stories/warrior-loop/st12/spec.md)。
- 候选来源：`docs/design/analysis/spatial_growth_encounter_trial.py`、`group_attack_coordination_trial.py`、`difficulty_behavior_trial.py`以及`enemy-role-candidates-v1.json`。
- 候选配置：`MonsterConfig.version = 'local-melee-v1' | 'local-tactics-v1'`。
- 支持三类技能：
  - `melee`: 近战打击（起手35 tick、收招50 tick、CD 350 tick、rangeX 48px、rangeY 18px、系数 1.0、僵直 24 tick）。
  - `ranged`: 远程投石（起手80 tick、收招50 tick、CD 400 tick、reach 210px、投射速度 400px/s、扫掠判定半宽 22px / 半高 16px、系数 1.0、僵直 24 tick）。
  - `charge`: 冲锋扫掠（起手70 tick、活跃扫掠35 tick、收招70 tick、CD 500 tick、reach 150px、扫掠速度 428.5px/s、碰撞半径 20px、系数 1.0、僵直 24 tick）。
- 协同职责：
  - `frontline`: 近身牵制；
  - `flanker`: 侧翼机动；
  - `artillery`: 远程输出；
  - `charger`: 直线冲锋。

## 物理与生命周期合同

1. **投射物（独立生命周期）**：
   - 远程怪物起手进入action（windup阶段），若在起手前被受控打断（stagger/knockdown/death），动作取消，不产生投射物。
   - 到达释放节点（`hitTick`，80 tick）时，投射物独立实体注入`m.tactics.effects`；
   - 投射物在飞行过程中拥有自己的空间坐标、速度与朝向，每tick沿初速度向目标点移动并逐tick校验与玩家坐标重叠；
   - 命中玩家或到达目标终点后移除；
   - **分片与检查点保真**：投射物数据完整包含在`MonsterRuntime.tactics.effects`中，任意切片（如81 tick保存切片，再推进至120 tick）与整段推进严格保真，状态与事件完全一致；
   - **宿主独立性**：投射物一经释放，宿主怪物在收招阶段死亡或受控不撤回已飞出的投射物，投射物继续飞行并对玩家结算伤害。

2. **冲锋扫掠（施法者维持生命周期）**：
   - 冲锋怪起手阶段（0..70 tick）朝向玩家，到起手终点（70 tick）锁定方向；
   - 活跃扫掠阶段（70..105 tick）施法怪物按锁定方向高速逐tick推进；
   - 地图碰撞与墙体：遭遇地图边界或墙体碰撞时停止位移；
   - 穿怪不免伤，不以玩家身体当墙：穿行其他怪物不受阻，玩家身体不是硬墙阻挡，扫掠触碰玩家时对玩家结算一次冲锋伤害与受控硬直，冲锋继续扫掠直到位移结束或撞墙；
   - **施法者维持**：冲锋是施法者自身动作，若扫掠期间施法者被受控打断或死亡，冲锋动作立即中止。

3. **四档难度与群怪协同预算**：
   - 侧翼怪（flanker）上限：`normal: 0`, `adventure: 1`, `warrior: 1`, `king: 2`；
   - 同时后撤远程怪（retreater）上限：`normal: 0`, `adventure: 0`, `warrior: 1`, `king: 1`；
   - 重型/特殊技能许可上限（`specialCap`）：`normal: 1`, `adventure: 1`, `warrior: 2`, `king: 2`；
   - 远程后撤规则：当玩家与远程怪距离小于 95px 且处于许可额度内时，远程怪向远离玩家的 120px 目标点后撤；超出距离或无许可时留在有效射程内输出；
   - 重型许可规则：等待重型技能许可期间不预扣冷却时间，保持就绪状态公平轮转；普通近战怪不强加两人攻击上限。

4. **严格数据模式**：
   - `MonsterRuntime.tactics`严格为对象，拒绝`false`, `0`, `""`, `null`等非对象值；
   - 效果列表严格校验`id`, `kind`, `sourceActorId`, 坐标、速度与伤害有理数，非法字段或未知effect类型立即拒绝。
