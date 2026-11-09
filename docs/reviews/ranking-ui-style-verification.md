# 正式排行榜面板 UI 样式切片落地验证记录

2026-11-09。分支 `feat/ranking-ui-style`，基线 `feat-1.0.0` / `094ca48`。接续 ST20 装备评分排行榜能力，遵循本地文档管理与离线交付约束，不创建或同步 Jira 单据，不在会话窗口内嵌图片展示。

---

## 一、本轮交付范围与设计规范对齐

1. **底板与切片改造**：
   - 主窗口背景使用深色半透明遮罩与 912×500 的 `ui/slices/panel_window_frame` 9-Patch 外框；
   - 居中榜单卡片（LeaderboardCard）与个人排名横幅（OwnRankBanner）底板均升级为 `ui/slices/panel_well_inner` 凹槽切片，统一内嵌视口层次感；
   - 关闭按钮、三大榜单 Tab（全服总榜/战士榜/猎人榜）、加载更多按钮、点击重试按钮均升级为 9-Patch 切片（`ui/slices/button_normal`、`ui/slices/button_pressed`、`ui/slices/button_disabled`），剔除临时矢量代码。

2. **状态与交互反馈**：
   - 榜单 Tab 在当前选中的榜单激活 `button_pressed` 状态与高亮纯白文本（`#ffffff`），非选中态为 `button_normal`（`#b4c3cc`）；
   - 所有按钮挂载单指触摸/鼠标按下态切换（按下变为 `button_pressed`，取消/松开还原对应启用/禁用切片）；
   - 状态更新循环中根据 `canEnable()` 动态更新按钮切片及文字对比度。

3. **测试支持与模块隔离**：
   - 更新 `backend/test/ranking-cocos.test.mjs` 中的 `vm.runInContext` 依赖注入，平滑桩接 `UISkin` 模块，保持纯模型执行。

---

## 二、实际验证记录与证据

1. **类型检查门禁**：
   - `client/tsconfig.json`：Cocos 客户端代码（包含 `RankingPanel.ts`、`UISkin.ts` 等）编译通过，0 错误；
   - `backend/tsconfig.json`：后端与协议层编译通过，0 错误；
   - `tools/tsconfig.models.json`：纯模型层编译通过，0 错误。

2. **单元与交互测试**：
   - 回归 [`backend/test/ranking-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/ranking-cocos.test.mjs) 6 组用例全部通过（100% 通过）：
     - ST20-04: RankingCoordinator 状态机与生命周期（closed -> loading -> ready）；
     - ST20-04: RankingCoordinator 基于 characterId 去重分页；
     - ST20-04: RankingCoordinator 代次隔离废弃迟到数据包；
     - ST20-04: RankingCoordinator 错误处理与重试机制；
     - ST20-04: RankingPanel 初始化、UI渲染、本人排名横幅与新鲜度展示；
     - ST20-04: RankingPanel 榜单 Tab 切换更新 UI 与处理空榜/降级列表。

3. **客户端模型回归**：
   - `client/tools/check-ui-model.cjs`：UI 模型测试 100% 通过；
   - `client/tools/check-model.cjs`：动作与连段模型测试全部通过。
