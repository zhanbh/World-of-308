# 正式地下城入口选择面板 UI 样式切片落地验证记录

2026-11-10。分支 `feat/dungeon-select-panel`，基线 `feat-1.0.0` / `639f30c`。接续 ST10 副本入口、体力快照与三步开房协议规范，遵循本地文档管理与离线交付约束，不创建或同步 Jira 单据，不在会话窗口内嵌图片展示。

---

## 一、本轮交付范围与设计规范对齐

1. **底板与切片改造**：
   - 主窗口背景使用深色半透明遮罩与 912×500 的 `ui/slices/panel_window_frame` 9-Patch 外框；
   - 左侧地下城探索区域与右侧副本详情/准入审核区底板均使用 `ui/slices/panel_well_inner` 凹槽切片，统一内嵌视口层次感；
   - 3 张地下城选择卡片（幽暗密林深处、格兰之森工坊、裂隙深处）与 3 级难度选择标签（普通/冒险/勇士）采用 3 态切片按钮（`ui/slices/button_normal`、`ui/slices/button_pressed`、`ui/slices/button_disabled`），当前选中卡片与激活 Tab 拥有高亮反馈；
   - 主操作按钮“开启挑战 (消耗 8 疲劳)”与异常自愈“状态恢复 / 重试”统一采用 9-Patch 标准切片，剔除矢量代码。

2. **核心业务与准入校验闭环 (ST10)**：
   - **地下城选择卡片**：
     - `first`: 幽暗密林深处 [Lv. 1 ~ 15]（耗费 8 疲劳，推荐物攻 120 / 200 / 350）
     - `workshop`: 格兰之森工坊 [Lv. 8 ~ 20]（耗费 8 疲劳，推荐物攻 280 / 420 / 650）
     - `rift`: 裂隙深处 [Lv. 15 ~ 30]（耗费 8 疲劳，推荐物攻 500 / 750 / 1100）
   - **三步开房与体力快照**：
     - 打开或切换副本时向服务端发起 `dungeon.entry` 查询，获取权威 `options: [{ difficultyId, unlocked, canEnter, reason }]`；
     - 准入硬门禁守门：
       - 0 体力/疲劳不足：拦截并显示“● 准入审核: 拦截进入 [疲劳值不足]”；
       - 未装备主手武器：拦截并显示“● 准入审核: 拦截进入 [未装备武器]”；
       - 武器耐久归零 (0耐久)：拦截并显示“● 准入审核: 拦截进入 [武器已损坏（0耐久）]”；
       - 条件全部满足：点亮绿色“● 准入审核: 条件全部满足，随时可进入地下城”并激活“开启挑战”按钮；
     - 点击“开启挑战”执行 `challenge.start`，锁定疲劳快照，开房成功后通过 `onStart` 回调无缝进入副本并扣减疲劳；
     - **断网或未决自愈**：当响应状态为 `unknown` 时，自动展示“状态恢复 / 重试”按钮，支持调用 `coordinator.retry()` 重试幂等开房。

3. **城镇场景与交互集成**：
   - `Prototype.ts` 城镇模式在 `(198, 72)` 的格兰之森传送门热区（`x >= 175 && Math.abs(y - 20) < 50`）与顶部快捷栏绑定打开 `DungeonSelectPanel`；
   - 支持键盘快捷键 `V` 键打开选择面板，支持 `Esc` 键快捷关闭；
   - 沙盒协调器 `createSandboxChallengeEntryCoordinator` 在 `PrototypePreview.ts` 落地，完美对接 `dungeon.entry` 与 `challenge.start` 协议。

4. **单测套件交付**：
   - 交付 [`backend/test/dungeon-select-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/dungeon-select-cocos.test.mjs)，包含 11 组纯 Node / VM 自动化用例，完整覆盖生命周期、层级结构、入口查询、副本切换、难度选择、门禁校验（0体力/无武器/0耐久）、开启挑战提交、网络未决自愈、热区坐标映射与安全销毁。

---

## 二、实际验证记录与证据

1. **类型检查门禁**：
   - `client/tsconfig.json`：Cocos 客户端代码（包含 `DungeonSelectPanel.ts`、`Prototype.ts`、`PrototypePreview.ts` 等）编译通过，0 错误；
   - `backend/tsconfig.json`：后端与协议层编译通过，0 错误；
   - `tools/tsconfig.models.json`：纯模型层编译通过，0 错误。

2. **单元与交互测试**：
   - 运行 [`backend/test/dungeon-select-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/dungeon-select-cocos.test.mjs) 11 组用例 100% 全部通过：
     - `DungeonSelectPanel: basic layout, 9-patch frame, title, stamina pill, and cards hierarchy`；
     - `DungeonSelectPanel: open queries dungeon.entry and updates options`；
     - `DungeonSelectPanel: switching dungeon queries new dungeon entry`；
     - `DungeonSelectPanel: difficulty selection updates state`；
     - `DungeonSelectPanel: gatekeeper checks - 0 stamina blocks entry and displays human-readable warning`；
     - `DungeonSelectPanel: gatekeeper checks - missing weapon blocks entry`；
     - `DungeonSelectPanel: gatekeeper checks - broken weapon (0 durability) blocks entry`；
     - `DungeonSelectPanel: confirming start sends challenge.start and triggers onStart callback`；
     - `DungeonSelectPanel: unknown state presents retry button and recovers on retry`；
     - `DungeonSelectPanel: hitTest accurate mapping for touch and click coordinates`；
     - `DungeonSelectPanel: close and dispose cleanup safely`。
   - 回归全量 7 套 Cocos 面板单测（dungeon-select、mail、shop、repair、enhancement、ranking、loot-victory）共 56 组用例 100% 全部通过。

3. **客户端模型回归**：
   - `client/tools/check-ui-model.cjs`：UI 模型测试 100% 通过（包含 `dungeon entrance gatekeeper verified`）；
   - `client/tools/check-model.cjs`：动作与连段模型测试全部通过。
