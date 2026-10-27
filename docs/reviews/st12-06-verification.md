# ST12-06 本地验证报告

> 当前状态补注（2026-10-27）：以下保留原实施记录。本次后续代码核对发现，Cocos本地战斗与权威服务联调、真实最大状态业务路径的结论证据不足，不能将本报告作为ST12完整端到端完成证明；见[收尾交接](handoff-st12-closeout-st13-2026-10-27.md)。本补注未重跑或否定所有历史测试。

日期：2026-10-27。分支 `feat/st12-06-playable-integration`；初始基点 `e277ffa`（合入ST12-05后的 `feat-1.0.0`）。本记录为实施者证据，不代表整包ST12/平台/真机设备验收。

只读来源：spec accepted_revision `26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7`；ST12-06 accepted_revision `efab9da3e74dfa5b185e58edc16157ffddad7663cc47ee8e78b1333577a666c7`。

## 一、实际交付

1. **三本7房遭遇布局与怪物组合进入真实链路**：
   - **首本（猛毒矿道 / first-dungeon-v1）**：27只基础怪物 + 1只可选额外紫名怪物（紫名怪只在R1..R6即房间0..5随机生成，R7 Boss房严格排除紫名）；
   - **失落工坊（lost-workshop-v1）**：34只怪物（32只普通怪 + R5 1只机械工头精英 + R7 1只发条巨像Boss），单房间峰值并发 <= 8只；
   - **裂隙遗址（rift-ruins-v1）**：41只怪物（39只普通怪 + R5 1只裂隙恶灵精英 + R7 1只虚空领主Boss），R6达到8只怪满额并发集群；
   - 所有房间生成点严格满足安全几何门禁：位于 `[-218000, 218000] x [-35000, 78000]`，距入口 `(-180000, 20000)` 与出口 `(200000, 20000)` 均 `>= 24000`。
2. **种族抗性规则与发布前严格校验**：
   - 种族流血与控制规则：
     - 人形（`humanoid`）与野兽（`beast`）：承受流血（`bleed: true`），受控打断（`control: true`）；
     - 亡灵（`undead`）与机械（`mechanical`）：免疫流血（`bleed: false`），受控打断（`control: true`）；
     - 默认所有种族怪物均可承受控制（非霸体下）；
   - 发布前校验拒绝脏配置：
     - 未知怪物种族抛出 `INVALID_MONSTER_CATEGORY`；
     - 未知技能/战术类型抛出 `UNKNOWN_MONSTER_KIND`；
   - 招式跨种族复用：`melee`, `ranged`, `charge`, `cleave`, `sweep`, `smash`, `stomp` 跨种族按角色策略复用；牛头Boss专属机制（`combo`践踏冲撞与`roar`扇形吼叫）严格不复制到后两本。
3. **可玩 Cocos 客户端战斗联调与离线 H5 构建**：
   - 清场换房闭环：房间怪物全部击杀后触发清场（`roomCleared = true`），出口绿门解锁（坐标 `(185..210, 0..40)`），战士移动至绿门感应区自动换房并生成下一房间遭遇；
   - 视觉与反馈：
     - 怪物身份标识铭牌：清晰显示 `[普通]`、`[精英]`、`[BOSS P1]`、`[BOSS P2]`、`[紫名]`；
     - 种族着色：机械银灰、亡灵幽紫、野兽棕褐、人形肉色；
     - 动作预警区域：远程弹道指示线与落点椭圆、冲锋轨迹预警带、精英/Boss重型范围预警框；
     - 金色霸体轮廓光环、受控硬直/倒地标记与角色分级血条；
     - 支持界面一键切换三本（`首本`、`工坊`、`裂隙`）；
   - 离线 H5 构建：通过本地 Creator 3.8.8 CLI 执行 `client/tools/build-inventory.cjs`，脱网成功构建 `web-mobile-inventory` 离线分包。
4. **8敌群并发、检查点（CP）及事务预算签署**：
   - 裂隙R6 8怪集群并发模拟无竞争与死锁；
   - 6个效果分块共存 912条怪物效果 + 2736条玩家效果（合计 3648条状态效果）；
   - 快照数组包含 57条怪物快照 + 171条玩家快照（合计 228个快照）；
   - 单块 UTF-8 字节 <= 81920B，头信息/回执 <= 16384B，全量体积 <= 655360B；
   - MemoryStore 事务具备读写原子隔离（失败不污染原状态）；
   - 严格向下兼容 `first-dungeon-v1`、`profile4/5/6` 与 `earthFixture`，`buildEncounterRoomSpawns` 维持返回5字段无多余脏属性。

## 二、测试证据

测试环境：Node **24.22.1**，TypeScript **5.8.2**，Cocos Creator **3.8.8** CLI，全过程离线无网络依赖。

1. **ST12-06 专项测试**：`backend/test/dungeon-three-composition.test.mjs` **4/4 全部通过**：
   - `three-dungeon layout definitions, monster counts, room numbers, and spatial clearance`: PASS
   - `category bleed and control resistance rules and rejection of unknown category/kind`: PASS
   - `8-enemy concurrency, 3648 slots (2736 player + 912 monster), 228 snapshots, <=81920B chunks, <=655360B total, MemoryStore atomic transaction`: PASS
   - `backward compatibility with first-dungeon-v1 profile and earthFixture baseline`: PASS

2. **客户端纯模型测试**：`client/tools/check-model.cjs` **19/19 全部通过**。

3. **离线 Cocos H5 构建**：`client/tools/build-inventory.cjs` **构建成功**：
   - 产出目录：`client/build/web-mobile-inventory`；
   - 构建用时：17s，无外部网络依赖。

4. **全量门禁**：`tools/check-all.cjs` **7/7 全部通过**：
   - tooling contracts: PASS
   - shared/backend types: PASS
   - shared value contracts: PASS (199/199 tests)
   - client pure-model types: PASS
   - backend regression (legacy and v2): PASS (582/582 tests)
   - client model regression: PASS (19/19 tests)
   - client UI-model regression: PASS (7/7 tests)
   - 完整日志记录于 `docs/reviews/st12-06-check-all.log`。

## 三、两轴独立评审

1. **规格符合性（Spec Compliance）**：
   - 后两本怪物组合与遭遇候选符合 `warrior-three-dungeon-baseline-v1.md` 与 ST12 规格；
   - 未知种族与技能配置在发布前严格拒绝，不容默降级；
   - 牛头专属机制（践踏冲撞与中距离吼叫）未复制到后两本；
   - Cocos 客户端可玩演示实现了开房、操作、AI、受击/击杀、清场换房、身份/血条与预警指示；
   - 8敌群与3648条效果共存、UTF-8块与全量预算、MemoryStore事务隔离及历史兼容性均经端到端测试验证。
2. **仓库工程标准（Repository Standards）**：
   - 无 Jira 单据引用、无外部同步、无伪造 key；
   - 分支命名符合中性规范（`feat/st12-06-playable-integration`）；
   - 更新了设计真相源 `docs/backend/source-of-truth.md` 并产出新合同 `docs/backend/dungeon-three-composition-contract-v1.md`；
   - 严格遵循零网络依赖门禁。

## 四、平台与设备 GAP 说明

以下项目按规格设计不在本地 ST12-06 验收范围内，保持 GAP：
- 真实移动真机及微信小游戏 SDK 运行时环境；
- 云端发布管线与真实计费/存储事务；
- 完整死亡复活（ST14）、副本掉落结算（ST15）、平台断线恢复（ST16）。
