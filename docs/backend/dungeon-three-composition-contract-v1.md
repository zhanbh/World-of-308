# ST12-06 三本组合与可玩战斗联调执行合同

2026-10-27。承接已批准ST12-06；规范后两本（失落工坊、裂隙遗址）怪物组合、种族抗性、可玩Cocos客户端联调、8敌群并发与完整检查点预算。它不是正式运营数值平衡、ST13-16内容或平台端验收。

## 版本与来源

- 规范来源：[ST12-06实施票据](../stories/warrior-loop/st12/issues/06-playable-integration.md)、[ST12主规格](../stories/warrior-loop/st12/spec.md)。
- 设计来源：`docs/design/warrior-three-dungeon-baseline-v1.md`、`docs/design/dungeon-first-proposal-v1.md`。
- 候选来源：`docs/backend/monster-tactics-combat-contract-v1.md`、`docs/backend/encounter-clear-contract-v1.md`、`docs/backend/monster-elite-boss-contract-v1.md`、`docs/backend/monster-roar-charge-contract-v1.md`。

## 一、三本遭遇布局与怪物配置规范

三本均遵循7房间序列结构（房间号0..6，对应R1..R7），空间边界严格遵守标准战斗区域 `[-218000, 218000] x [-35000, 78000]`，安全进出口距离门禁 `>= 24000`（出生点距入口 `(-180000, 20000)` 与出口 `(200000, 20000)` 均不低于24000 milli-pixels）。

### 1. 首本（猛毒矿道 / first-dungeon-v1）
- 怪物总数：27只基础怪物 + 1只可选额外紫名怪物（紫名仅在R1..R6即房间0..5随机出现，R7 Boss房严格排除紫名）；
- 结构分布：
  - R1: 3只 (melee 3)
  - R2: 4只 (melee 3, ranged 1)
  - R3: 4只 (melee 3, ranged 1)
  - R4: 5只 (melee 3, ranged 1, charge 1)
  - R5: 5只 (melee 3, ranged 1, elite 1)
  - R6: 5只 (melee 3, ranged 1, charge 1)
  - R7: 1只 (boss 1, 牛头巨兽)
- 种族构成：人形生物（`humanoid`）与野兽（`beast`）。

### 2. 失落工坊（lost-workshop-v1）
- 怪物总数：34只（32只普通怪 + 1只精英怪位于R5 + 1只Boss位于R7）；
- 单房间峰值并发：<= 8只；
- 结构分布：
  - R1: 4只 (ordinary 4: mechanical 2, humanoid 2)
  - R2: 5只 (ordinary 5: mechanical 3, humanoid 2)
  - R3: 5只 (ordinary 5: mechanical 3, humanoid 2)
  - R4: 6只 (ordinary 6: mechanical 4, humanoid 2)
  - R5: 6只 (ordinary 5 + elite 1, 机械工头)
  - R6: 7只 (ordinary 7: mechanical 4, humanoid 3)
  - R7: 1只 (boss 1, 发条巨像)
- 种族构成：机械（`mechanical`）与人形奴工（`humanoid`）。

### 3. 裂隙遗址（rift-ruins-v1）
- 怪物总数：41只（39只普通怪 + 1只精英怪位于R5 + 1只Boss位于R7）；
- 单房间峰值并发：R6达到8只满额并发集群；
- 结构分布：
  - R1: 5只 (ordinary 5: undead 3, beast 2)
  - R2: 6只 (ordinary 6: undead 4, beast 2)
  - R3: 6只 (ordinary 6: undead 4, beast 2)
  - R4: 7只 (ordinary 7: undead 4, beast 3)
  - R5: 8只 (ordinary 7 + elite 1, 裂隙恶灵)
  - R6: 8只 (ordinary 8: undead 5, beast 3，满编8怪并发集群)
  - R7: 1只 (boss 1, 虚空领主)
- 种族构成：亡灵（`undead`）与裂隙异兽（`beast`）。

## 二、种族抗性与发布前严格校验

### 1. 种族流血与控制规则
- `humanoid`（人形）：可承受流血（`bleed: true`），受控打断（`control: true`）；
- `beast`（野兽）：可承受流血（`bleed: true`），受控打断（`control: true`）；
- `undead`（亡灵）：免疫流血（`bleed: false`），受控打断（`control: true`）；
- `mechanical`（机械）：免疫流血（`bleed: false`），受控打断（`control: true`）；
- 默认所有种族怪物均可承受标准控制（硬直、倒地、眩晕），霸体状态除外。

### 2. 发布前严格配置拒绝
- 未知怪物种族（category）：必须抛出 `INVALID_MONSTER_CATEGORY` 异常，拒绝装载；
- 未知行为/技能类型（tactics kind / skill kind）：必须抛出 `UNKNOWN_MONSTER_KIND` 异常，拒绝装载；
- 严禁容默默认回退掩盖脏配置。

### 3. 技能跨种族复用边界
- 基础与精英招式（`melee`, `ranged`, `charge`, `cleave`, `sweep`, `smash`, `stomp`）可在不同种族怪物间按角色策略无缝复用；
- 牛头巨兽二阶段专属机制（连续践踏锁向冲撞 `combo` 与全域扇形多段中距离吼叫 `roar`）严格为该Boss特有，后两本不复制此专属机制。

## 三、可玩 Cocos 客户端战斗联调规范

客户端以 `client/assets/scripts/Prototype.ts` 与 `client/assets/scripts/EnemyModel.ts` 承接本地战斗演示：

1. **清场与换房完整闭环**：
   - 房间内所有敌人生命降为0判定为击杀，当前房间清场（`roomCleared = true`）；
   - 清场瞬间解锁出口绿门，门体位于 `(185..210, 0..40)`；
   - 战士移动进入出口门感应区域，触发自动推进至下一房间（`roomNo = (roomNo + 1) % 7`）；
   - 换房后根据当前副本（首本/工坊/裂隙）与房间号重新初始化该房间遭遇布局与怪物实例。
2. **身份与状态视觉反馈**：
   - 身份铭牌：顶部以独立标签清晰标识怪物身份：`[普通]`、`[精英]`、`[BOSS P1]`、`[BOSS P2]`、`[紫名]`；
   - 种族区分：本体依据种族着色渲染（机械银灰、亡灵幽紫、野兽棕褐、人形肉色）；
   - 动作预兆与预警区域：
     - 远程攻击：绘制指示弹道的虚线与落点椭圆预警圈；
     - 冲锋攻击：绘制高亮冲刺轨迹预警带；
     - 精英顺劈/横扫与Boss重槌/践踏：绘制大范围重型扇形/矩形危险框。
   - 霸体与受击：
     - 霸体生效期间（施招起手至出招完毕），怪物外轮廓呈现金色霸体光环，免疫受控硬直与位移，但正常承受生命与护甲伤害；
     - 眩晕/倒地期间显示受控阻滞标记；
     - 血条区分角色着色（Boss红底黄纹、精英橙底、普通灰白）。
3. **离线 H5 构建**：
   - 支持通过离线 Cocos Creator 3.8.8 CLI 执行构建（`client/tools/build-inventory.cjs`），产出轻量离线包；
   - 支持首本、工坊、裂隙三本随时一键切换联调。

## 四、8敌群并发与检查点（CP）完整预算

1. **8敌群并发**：
   - 裂隙遗址第6房（R6）8只怪同时处于活跃模拟与空间碰撞更新；
   - 判定循环采用确定性顺序，无竞争冒险与死锁。
2. **效果槽位与快照容量**：
   - 6个效果分块包含 912条怪物状态效果 + 2736条玩家技能效果，共计 3648条状态效果；
   - 快照数组包含 57条怪物快照 + 171条玩家快照，共计 228个快照条目；
   - 必须通过检查点分块打包与反序列化验证。
3. **UTF-8 字节预算边界**：
   - 单个内容块（chunk）UTF-8 编码体积 <= 81920 字节（80 KiB）；
   - 头信息与回执（header / receipt）体积 <= 16384 字节（16 KiB）；
   - 单次完整检查点全量体积 <= 655360 字节（640 KiB）。
4. **事务与向后兼容性**：
   - MemoryStore 支持多条目读写原子隔离（begin -> set/append -> commit），失败或回滚不污染原状态；
   - 严格保留对 `first-dungeon-v1` 协议、`profile4/5/6` 与 `earthFixture` 历史基线的向后兼容，清单生成工具 `buildEncounterRoomSpawns` 维持返回5字段无多余脏属性。
