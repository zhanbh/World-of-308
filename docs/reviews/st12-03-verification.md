# ST12-03 本地验证报告

日期：2026-10-27。分支`feat/st12-03-encounter-clear`；初始基点`f10bb42`（合入ST12-02后的`feat-1.0.0`）。本记录为实施者证据，不代表整包ST12/平台/设备验收。

只读来源：spec accepted_revision `26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7`；ST12-03 accepted_revision `f76b8673f8a11b175263b7dbc70f59f948b39c7e57d414f6e7e5acc4acb8f487`。

## 实际交付

1. **首本七房遭遇与怪物布局**：
   - 提取`spatial_growth_encounter_trial.py`基线，定义标准坐标体系（milli-design-pixel）；
   - 各房基础怪配置：`[3, 5, 5, 4, 3, 6, 1]`，总计**27只**基础怪物；
   - 终局Boss房（roomNo 6）：固定1只Boss怪物，占位`(150000, 20000)`；
   - 几何校验：所有怪物出生点均位于地图包络`left: -218000, right: 218000, bottom: -35000, top: 78000`内，距入口`(-180000, 20000)`及出口`(200000, 20000)`距离均大于24000（24px）；每房怪数严格 `<= 8`。

2. **额外紫名生成与资格规则**：
   - 候选位置：固定坐标`(105000, 20000)`；
   - 出现资格：仅限前六房（协议roomNo 0..5，展示R1..R6）；Boss房（roomNo 6）严格不接受紫名生成；
   - 实例分配：每个挑战创建时随机选定前6房之一，分配单只额外紫名怪（`spawnId: 'purple-extra'`, `role: 'purple'`）；
   - 持久化锁定：选定后随挑战根实体持久化（`EntryChallenge.purpleRoomNo`, `EntryChallenge.purpleEncounter`），切房与重载/断线恢复严格保持一致，禁止重抽或漏生。

3. **权威清场与稳定击杀事实（ConfirmedKillFact）**：
   - 权威判定：仅当房内所有怪物（包括基础怪与额外紫名）全部死亡（`hp === '0'` 且 `lifeState === 'dead'`）时，房间状态转为清场（`roomPhase = 'cleared'`）；
   - 防旁路与无第二波：紫名或任意普通怪存活时切房一律拒绝（`ROOM_NOT_AVAILABLE`）；
   - 击杀事实结构：记录`spawnId`, `role`, `templateRef`, `roomNo`, `xpMultiplier`；
   - 经验倍率：紫名怪物独立2倍经验（`xpMultiplier: 2`），普通怪1倍经验（`xpMultiplier: 1`）；
   - 边界隔离：仅记录事实供ST15结算读取，本阶段不提前发放奖励。

4. **ST10换房门禁对接**：
   - 严格以权威清场结果校验换房条件（`nextRoomAllowed`）；
   - 涵盖怪物全死亡、玩家存活、出口判定半径、挑战生命周期校验。

## 测试证据

本机Node **24.22.1**，TypeScript **5.8.2**，复用Creator安装离线运行。

1. 专项测试：`backend/test/encounter-clear.test.mjs` **5/5 全部通过**：
   - `7-room encounter geometry has exactly 27 base monsters and purple is valid across rooms 0..5`: PASS
   - `prepareRoom produces versioned 7-room manifests with 27 base monsters and single purple monster`: PASS
   - `room cannot open or advance while purple monster or any ordinary monster is still alive`: PASS
   - `simulation step marks room cleared and records confirmed kill facts with 2x xp for purple monster`: PASS
   - `checkpoint recovery and reload preserve spawn identities and confirmed kills without re-roll`: PASS

2. 全量门禁：`tools/check-all.cjs` **7/7 全部通过**：
   - tooling contracts: PASS
   - shared/backend types: PASS
   - shared value contracts: PASS (182/182 tests)
   - client pure-model types: PASS
   - backend regression (legacy and v2): PASS (578/578 tests)
   - client model regression: PASS
   - client UI-model regression: PASS
