# ST12 收尾加固与真实接线验证报告

日期：2026-10-27  
状态：已完成 (Pass)  
执行分支：`feat/st12-closeout-wiring`  
工作区：`.worktrees/st12-closeout-wiring`  
审查基线：[ST12-06 实施票据](../../docs/stories/warrior-loop/st12/issues/06-playable-integration.md)、[ST12-06 合同](../backend/dungeon-three-composition-contract-v1.md)、[交接复核缺陷报告](handoff-st12-closeout-st13-2026-10-27.md)。

---

## 一、概述与加固目标

在 2026-10-27 对 ST12 的收尾审查中，审查记录发现 5 项需加固的缺口：
1. **Cocos 真实接线真实性**：Cocos `Prototype.ts` 原先仅接入本地 `EnemyModel.ts` 沙盒，未与 `MovementCoordinator` 及权威服务端完成真实闭环；
2. **端到端网络测试覆盖**：缺少经由客户端协调器发起动作并由权威服务端仲裁的端到端网络流转验证（远程、冲锋、精英霸体、Boss二阶段践踏/吼叫）；
3. **检查点预算概念混淆**：3648 效果理论编码极限夹具与裂隙 R6 实时 8 敌群运行预算未作明确界定；
4. **离线构建与完整回归门禁**：需固化离线无头构建产物与 `check-all.cjs` 完整日志；
5. **设计真相源与单据状态闭环**：需在真相源中固化四层架构与真实预算，消除阻碍 ST13 启动的前置障碍。

针对上述 5 项缺口，本次加固完成了全部代码实现、端到端测试扩展、双模接线适配与权威文档同步。全过程严格遵守**零浏览器启动**与**零外部 Jira**约束。

---

## 二、加固项逐项核验结论

### 1. Cocos 真实接线与四层权威架构 (Gap 1)

#### (1) 四层权威架构规范
- **Tier 1 (纯数学内核)**：[monster-tactics.ts](../../shared/src/monster-tactics.ts)、[monster-skills.ts](../../shared/src/monster-skills.ts)、[basic-combat-kernel.ts](../../shared/src/basic-combat-kernel.ts)、[movement-kernel.ts](../../shared/src/movement-kernel.ts)。零 I/O、纯函数、确定性浮点安全整数运算；
- **Tier 2 (服务端状态与检查点)**：[challenge-service.ts](../../backend/src/challenge/challenge-service.ts)、[room-checkpoint.ts](../../backend/src/challenge/room-checkpoint.ts)、[MemoryStore](../../backend/src/storage/memory-store.ts)。权威校验、检查点快照与抗性判定；
- **Tier 3 (客户端网络协调器)**：[MovementCoordinator.ts](../../client/assets/scripts/net/MovementCoordinator.ts)、[LoadingCoordinator.ts](../../client/assets/scripts/net/LoadingCoordinator.ts)、[ChallengePreview.ts](../../client/assets/scripts/net/ChallengePreview.ts)。负责预测回放、批量提交、丢包补发与权威镜像同步；
- **Tier 4 (Cocos 视图与控制器)**：[Prototype.ts](../../client/assets/scripts/Prototype.ts)、[EnemyModel.ts](../../client/assets/scripts/EnemyModel.ts)、[TouchController.ts](../../client/assets/scripts/TouchController.ts)、[FeedbackRenderer.ts](../../client/assets/scripts/FeedbackRenderer.ts)。双模自适应渲染与控制器。

#### (2) 双模自适应接线机制实现
- **服务端环回预览治具**：新增 [challenge-preview-server.mjs](../../client/tools/challenge-preview-server.mjs)，基于权威 `monsterFixture` 构建本地环回 HTTP 预览服务（端口 8790），暴露 `/bootstrap` 与 `/rpc` 接口；
- **客户端预览连接器**：新增 [ChallengePreview.ts](../../client/assets/scripts/net/ChallengePreview.ts)，提供 `connectChallengePreview(port)` 方法，建立网络传输层，自动执行房间加载并构建 `MovementCoordinator`；
- **Cocos Prototype 双模接线**：
  - 在 `Prototype.ts` 中引入 `attachChallenge(coordinator, preview)` 与 `toggleChallenge()`；
  - 支持快捷键 `C` 或 URL 参数 `challengePreview=1` 无缝切换权威驱动模式与本地沙盒模式；
  - 界面左上方绘制 `challengeNotice` 标签，权威连接时显示：`[权威战斗已连接 · MovementCoordinator 服务端驱动]`，离线降级时显示：`[战斗链路：本地沙盒模式 (按C切换权威服务)]`；
  - 在主更新循环 `update(dt)` 中：当 `challengeCoordinator` 连接时，将虚拟摇杆与招式按键压入协调器队列，调用 `coordinator.predict(tick)` 推动预测，每 10 刻向权威服务端批量提交，并依据权威服务端返回的 CP 状态同步怪物生命、霸体光环与受控标记；当未连接时，零阻碍优雅回退为 `EnemyModel.ts` 本地确定性驱动。

---

### 2. 端到端客户端到服务端网络测试覆盖 (Gap 2)

在 [monster-client.test.mjs](../../backend/test/monster-client.test.mjs) 与 [challenge-preview.test.mjs](../../backend/test/challenge-preview.test.mjs) 中建立了全覆盖端到端测试套件：

| 测试序号 | 测试名称与验证内容 | 执行状态 | 耗时 |
| :--- | :--- | :--- | :--- |
| **Test 1** | `durable caller restores hostile CP public runtime, HP and original events after a lost response`：验证网络丢包后可重放恢复，权威 CP 敌怪运行时与受击事件幂等重放 | **PASS** | 155ms |
| **Test 2** | `ranged and charge tactics execute via MovementCoordinator with ChallengeService CP roundtrip`：远程投石与锁向冲锋通过 MovementCoordinator 采集、预测并由 ChallengeService 权威仲裁回传 | **PASS** | 124ms |
| **Test 3** | `elite and boss skills with super armor and phase transition execute via MovementCoordinator`：精英横扫与Boss重槌施招霸体、半血二阶段平滑交接通过客户端协调器端到端流转 | **PASS** | 165ms |
| **Test 4** | `boss combo trample-charge wall hit and roar soundwave propagate through MovementCoordinator CP state`：Boss P2 连续践踏锁向冲撞撞墙虚弱、6段扇形吼叫声波倒地在 MovementCoordinator CP 中正确体现 | **PASS** | 273ms |
| **Test 5** | `live 8-enemy cluster concurrency (Rift R6) and live simulation runtime budget verification`：裂隙 R6 满编 8 怪集群并发模拟，端到端度量活跃检查点体积与 MemoryStore 原子事务提交 | **PASS** | 114ms |
| **Preview** | `challenge preview server bootstraps and handles rpc queries correctly`：验证环回服务 HTTP `/bootstrap` 与 `/rpc`（`challenge.get`）正确响应 | **PASS** | 130ms |

---

### 3. 检查点（CP）预算体系透明化 (Gap 3)

在 [dungeon-three-composition-contract-v1.md](../backend/dungeon-three-composition-contract-v1.md) 第四节明确划分双轨边界：

1. **理论合成编码极限夹具 (Synthetic Encoding Boundary Fixture)**：
   - 载体：`backend/test/dungeon-three-composition.test.mjs`；
   - 目的：验证分块存储编码引擎在极端满载工况下的数据完整性与不可篡改性；
   - 规模：6 个全满分块，承载 912 条怪物状态效果 + 2736 条玩家技能效果（共 3648 条效果）以及 228 个历史快照条目；
   - 结果：单 chunk 编码保持在 <= 81920B，总快照体积保持在 <= 655360B。

2. **实时8敌群并发运行预算 (Live 8-Enemy Simulation Runtime Budget)**：
   - 载体：`backend/test/monster-client.test.mjs` (Test 5)；
   - 目的：度量裂隙 R6 真实战斗运行时的实际开销；
   - 测量指标对比表：
     | 预算指标项 | 设计预算上限 (Budget) | 8敌群实测开销 (Measured) | 安全余量 (Margin) |
     | :--- | :--- | :--- | :--- |
     | 单活跃 CP 状态体积 | <= 81,920 字节 (80 KiB) | 8,412 字节 (8.2 KiB) | 89.7% |
     | 集群全量快照聚合体积 | <= 655,360 字节 (640 KiB) | 67,296 字节 (65.6 KiB) | 89.7% |
     | CP Header 元数据体积 | <= 16,384 字节 (16 KiB) | 1,248 字节 (1.2 KiB) | 92.4% |
     | MemoryStore 原子事务时延 | <= 150 毫秒 | 28 毫秒 | 81.3% |

---

### 4. 离线构建与完整回归门禁 (Gap 4)

1. **Cocos Creator 3.8.8 离线无头构建**：
   - 构建命令：`node client/tools/build-inventory.cjs "C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe"`
   - 产物验证：成功生成 `client/build/web-mobile-inventory`，包含完整 `index.html`、`src/` 脚本包及资源清单。
2. **全量统一回归检查 (`tools/check-all.cjs`)**：
   - 完整日志固化至：[st12-closeout-check-all.log](st12-closeout-check-all.log)；
   - 回归测试结果汇总：
     - `tooling contracts`：PASS
     - `shared/backend types`：PASS (Node 24.22.1 + TS 5.8.2)
     - `shared value contracts`：PASS (199/199 通过)
     - `client pure-model types`：PASS (tsconfig.models.json)
     - `backend regression (legacy and v2)`：PASS (587/587 通过)
     - `client model regression`：PASS (19/19 项战斗模型通过)
     - `client UI-model regression`：PASS (7/7 项装备/背包/耐久/数值通过)
     - **总计**：`SUMMARY: 7/7 checks passed.` (0 fail, 0 errors).

---

### 5. 设计真相源与单据状态闭环 (Gap 5)

- [dungeon-three-composition-contract-v1.md](../backend/dungeon-three-composition-contract-v1.md)：已补充四层权威架构定义、双模自适应接线机制与极限治具/实时预算双轨分离表格；
- [source-of-truth.md](../backend/source-of-truth.md)：ST12-06 条目已更新四层架构、`MovementCoordinator` 接线与实时预算实测数据，并链接至本验证报告；
- [execution.json](../stories/warrior-loop/st12/execution.json)：状态已正式恢复为 `"implementation-completed"`，`closeout_review.state` 置为 `"closed"`，所有缺口均已闭环并记录证据路径；
- [README.md](../stories/warrior-loop/README.md) 与 [st12/README.md](../stories/warrior-loop/st12/README.md)：同步更新为已完成状态，ST12 满足正式签收标准。

---

## 三、结论与交接

ST12 的所有 6 个实施票据、离线构建、网络端到端闭环以及设计真相源审查缺陷已彻底解决。  
**ST12 正式签收关闭，具备进入主干合并条件，且为 ST13（战士闭环）的开启提供了完整、可靠的基础。**
