# ST12-03 独立合入核验报告

2026-10-27。核验者为独立merger。集成分支`feat-1.0.0`以`git merge --ff-only feat/st12-03-encounter-clear`快进合入至 **`c352d3f`**；未推送。

## 来源、范围与契约核验

1. **正文与修改范围**：
   - 依赖ST12-02已验证基线（`f10bb42`）；
   - spec SHA256 与 ST12-03 accepted_revision（`f76b8673f8a11b175263b7dbc70f59f948b39c7e57d414f6e7e5acc4acb8f487`）完全一致，未修改正文；
   - 范围聚焦ST12-03：首本七房遭遇布局（基础27怪+1只额外紫名怪）、紫名候选位置与排除Boss房规则、独立2倍经验事实、防第二波刷新的全怪死权威清场门禁、安全几何与ST10换房校验；未越界实现04/05牛头Boss或06 Cocos构建。

2. **核心机制验证**：
   - **首本七房几何与容量**：各房基础怪数量为`[3, 5, 5, 4, 3, 6, 1]`，总计27只基础怪；每房怪数 `<= 8`；所有怪物坐标位于地图包络`left: -218000, right: 218000, bottom: -35000, top: 78000`内，距入口与出口距离均 > 24000（24px）。
   - **额外紫名怪物生成与资格**：
     - 固定候选坐标`(105000, 20000)`；
     - 仅在前六房（room 0..5，展示R1..R6）随机分配1房出现；Boss房（room 6，展示R7）严格排除；
     - 实例分配随挑战根实体持久化（`EntryChallenge.purpleRoomNo`, `purpleEncounter`），切房与重载/断线恢复严格保持一致，禁止重抽或漏生。
   - **权威清场与击杀事实（ConfirmedKillFact）**：
     - 房间开启严格由服务端权威裁定；当房内所有怪全部死亡（`hp === '0'` 且 `lifeState === 'dead'`）时标记`roomPhase = 'cleared'`；
     - 紫名或任意普通怪存活时拒绝切房（`ROOM_NOT_AVAILABLE`）；没有第二波，不保留客户端单方面声明清场旁路；
     - 击杀事实记录结构完整，紫名怪 `xpMultiplier = 2`，普通怪 `xpMultiplier = 1`；不提前发放奖励。
   - **ST10换房门禁对接**：
     - `prepareRoom`与`nextRoomAllowed`核验全房怪物死亡、房间Phase、玩家存活与出口交互半径，与ST10转场无缝闭环。

## 实际执行证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**，全过程离线无下载。

- 实施worktree专项测试：`backend/test/encounter-clear.test.mjs` **5/5 通过**；
- 继承测试：`shared/test/monster-tactics.test.mjs` **8/8 通过**；`shared/test/monster-joint.test.mjs` **12/12 通过**；
- 集成目录全量门禁：`tools/check-all.cjs` **7/7 全部通过**（shared 182项、backend 578项全数通过），日志已归档至 [st12-03-merged-check-all.log](st12-03-merged-check-all.log)；
- backend 与 client 模型 TypeScript 类型检查通过（0 error）；
- `git diff --check` 通过。

结论：**ST12-03满足规格与工程约束，已独立核验通过并合入主开发分支`feat-1.0.0`**。
