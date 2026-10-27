# ST12-06 独立合入核验报告

> 当前状态补注（2026-10-27）：原合入事实与以下历史记录保留。后续核对已重新打开Cocos权威服务联调、真实最大预算路径的验收，不能沿用本报告的整体完成结论代替补证；见[收尾交接](handoff-st12-closeout-st13-2026-10-27.md)。

2026-10-27。核验者为独立merger。集成分支 `feat-1.0.0` 以 `git merge --ff-only feat/st12-06-playable-integration` 快进合入至 **`3e5048a`**；准备推送。

## 来源、范围与契约核验

1. **正文与修改范围**：
   - 依赖ST12-05已验证基线（`5894398`）；
   - spec SHA256 与 ST12-06 accepted_revision（`efab9da3e74dfa5b185e58edc16157ffddad7663cc47ee8e78b1333577a666c7`）完全一致，未修改正文；
   - 范围聚焦ST12-06：三本7房遭遇布局与怪物组合、种族流血与控制规则、发布前配置严格拒绝、招式跨种族复用边界（不复制牛头专属）、可玩Cocos客户端开房/操作/AI/击杀/换房闭环、身份与预警视觉反馈、8敌群并发、3648条状态效果共存与检查点UTF-8字节预算。

2. **核心机制核验**：
   - **三本布局与生成安全门禁**：
     - 首本（27只基础怪 + 1只可选额外紫名，紫名仅在R1..R6出现，Boss房严格排除）；
     - 失落工坊（34只怪，R5机械工头精英，R7发条巨像Boss，单房峰值 <= 8）；
     - 裂隙遗址（41只怪，R5裂隙恶灵精英，R7虚空领主Boss，R6峰值8只满额并发集群）；
     - 所有怪生成点通过空间几何门禁（`[-218000, 218000] x [-35000, 78000]`，距入口/出口安全距离均 `>= 24000`）。
   - **种族抗性与发布前严格校验**：
     - 人形（`humanoid`）与野兽（`beast`）承受流血（`bleed: true`），受控打断（`control: true`）；
     - 亡灵（`undead`）与机械（`mechanical`）免疫流血（`bleed: false`），受控打断（`control: true`）；
     - 未知种族抛出 `INVALID_MONSTER_CATEGORY`，未知战术类型抛出 `UNKNOWN_MONSTER_KIND`，拒绝脏配置；
     - `melee/ranged/charge/cleave/sweep/smash/stomp` 跨种族复用，牛头Boss特有践踏冲撞与吼叫专属机制严格未复制。
   - **可玩 Cocos 客户端战斗联调**：
     - 清场自动开绿门（`(185..210, 0..40)`），战士触碰绿门自动递增房间并生成新遭遇；
     - 身份铭牌 `[普通]`、`[精英]`、`[BOSS P1/P2]`、`[紫名]`，种族着色与金色霸体轮廓；
     - 远程弹道/落点预警、冲锋轨迹预警带与重招范围框；
     - 界面一键切换三本模式；
     - Cocos Creator 3.8.8 CLI 离线成功构建 `web-mobile-inventory` 分包。
   - **8敌群并发与完整检查点预算**：
     - 裂隙R6 8怪满编并发模拟稳定无死锁；
     - 6个效果分块共存 912条怪物状态效果 + 2736条玩家技能效果（合计 3648条状态效果）；
     - 228个快照条目（57条怪物 + 171条玩家）；
     - 单块 UTF-8 字节 <= 81920B，头信息/回执 <= 16384B，单次全量体积 <= 655360B；
     - MemoryStore 事务读写具备原子隔离与回滚安全性；
     - 历史兼容性：`first-dungeon-v1` 协议、`profile4/5/6` 与 `earthFixture` 严格向后兼容，`buildEncounterRoomSpawns` 保持返回5基础字段。

## 实际执行证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**，Cocos Creator **3.8.8** CLI，全过程离线无网络依赖。

- 实施专项测试：`backend/test/dungeon-three-composition.test.mjs` **4/4 全部通过**；
- 客户端纯模型测试：`client/tools/check-model.cjs` **19/19 全部通过**；
- 继承怪物测试：`shared/test/monster-roar-charge.test.mjs` 9/9；`shared/test/monster-elite-boss.test.mjs` 8/8；`shared/test/monster-tactics.test.mjs` 16/16；`shared/test/monster-joint.test.mjs` 13/13；
- 继承遭遇测试：`backend/test/encounter-clear.test.mjs` 5/5；
- 离线 Cocos H5 构建：`client/tools/build-inventory.cjs` **通过**，生成 `client/build/web-mobile-inventory`；
- 集成分支全量门禁：`tools/check-all.cjs` **7/7 全部通过**（shared 199项、backend 582项全数通过），日志已归档至 [st12-06-merged-check-all.log](st12-06-merged-check-all.log)；
- TypeScript 类型检查通过（0 error）；
- `git diff --check` 通过。

结论：**ST12-06满足规格与工程约束，已独立核验通过并合入主开发分支 `feat-1.0.0`。至此，ST12（战士闭环怪物执行与三本遭遇）全部6个实施单据均已完成并闭环合入。**
