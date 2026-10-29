# ST15-04 Cocos 掉落物展示、拾取交互与通关结算面板本地实施验证

2026-10-29。范围仅 ticket:warrior-loop-st15-04；遵循 AGENTS.md 约束，未创建 Jira 单据，未安装新依赖，无云端操作、真机或自动化浏览器启动。

## 已交付

1. **纯模型解耦与视图数据模型**：
   - `LootVictoryHUDModel.ts`：纯 TypeScript 实现，脱离 Cocos 引擎硬依赖。管理白/绿/蓝/紫/橙不同品级地面掉落物图标与光柱渲染状态；判定玩家当前权威 CP 坐标与掉落物欧氏距离（<= 32px）；满包时弹出“背包已满”浮动提示；通关专属装备翻牌进度计算（`flipProgress`）；展示 direct 路由（“已放入背包”）与 pending 路由（“背包已满，已暂存至待领奖励”）；黑屏渐隐退出状态机。
2. **终局与离开协调器**：
   - `TerminalCoordinator.ts`：负责向服务端查询权威通关凭证（`clearReceipt`），管理离开副本指令（`challenge.leave(reason: 'finishLoot')`）提交、本地持久化与掉线重试（通过 `operation.get` 幂等恢复原提交结果），并在离开完成后触发安全渐隐退出（`fadeReady`）。
3. **场景联合调度与网络状态机**：
   - `LootSceneCoordinator.ts`：统一编排 `MovementCoordinator`、`DropCoordinator` 与 `TerminalCoordinator`。保证拾取与离开的互斥与顺序性；在拾取或离开前自动刷新并排空帧动作队列（`flushQueued`）；通关后强行阻断攻击技能，但允许继续纯位移移动走位拾取地面剩余掉落。
4. **Cocos 面板与预览接线**：
   - `LootVictoryPanel.ts`：Cocos 视图组件，绑定 `LootVictoryHUDModel` 数据驱动界面展示。
   - `client/tools/challenge-preview-server.mjs` & `client/assets/scripts/Prototype.ts`：提供 `--loot` 参数启动显式末房真实 Boss 结算预览（`createLootChallengePreview`），无 mock 伪造 RPC 端点。

## 实际测试与门禁验证证据

1. **专项客户端集成回归测试**：
   - `backend/test/loot-victory-client.test.mjs`：**6/6 全部通过**（执行时间 ~750ms）。
     1. 终局协调器严格读取真实 Boss 提交收据，丢响应后 operation.get 安全恢复；
     2. 掉落物模型 32px 严格判定半径、满包留地提示与翻牌结算同步；
     3. 通关后阻断战斗输入、保留纯位移 CP 提交与在途拾取等待；
     4. 场景协调器串行化拾取与离开，正确展示 pending 路由待领提示；
     5. 帧位移队列排空与即时拾取刷新，无需等待空队列时间窗口；
     6. 显式隔离奖励预览模式驱动真实 Boss 输入、收据与拾取全流程。
2. **Cocos H5 离线项目构建验证**：
   - 日志文件：`docs/reviews/st15-04-cocos-build.log`。
   - 结果：`PASS: Cocos H5 inventory build produced D:\IdeaProjects\World-of-308\.worktrees\st15-04-cocos-loot-hud\client\build\web-mobile-inventory`，构建耗时 12s，100% 离线编译通过。
3. **全量 7/7 门禁检查**：
   - 日志文件：`docs/reviews/st15-04-check-all.log`。
   - 阶段结果：
     - tooling contracts: PASS
     - shared/backend types: PASS
     - shared value contracts: PASS
     - client pure-model types: PASS (包含新增 LootVictoryHUDModel、TerminalCoordinator、LootSceneCoordinator 等)
     - backend regression (legacy and v2): PASS (682/682 测试通过)
     - client model regression: PASS (21/21 测试通过)
     - client UI-model regression: PASS (9/9 测试通过)
   - 总结：**SUMMARY: 7/7 checks passed**。

## 预算与平台 GAP

- 本任务为纯客户端与视图模型交付，不改变服务端终局事务读写预算（仍为 R36/W27，最坏设计目标 R44/W33）；
- 所有模型无头测试与 Cocos H5 离线构建通过，微信真机环境、移动端触屏真实触摸事件及正式美术资产保留为独立平台 GAP。
