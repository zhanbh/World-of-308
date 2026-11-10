# 战斗内 HUD（补给栏、复活弹窗、血条）UI 样式切片落地验证记录

2026-11-10。分支 `feat/combat-hud-slices`，基线 `feat-1.0.0` / `3dcd6e9`。接续 ST13 战斗补给、ST14 死亡复活与 HUD 视觉规范，遵循本地文档管理与离线交付约束，不创建或同步 Jira 单据，不在会话窗口内嵌图片展示。

---

## 一、本轮交付范围与切片改造

1. **玩家左上角状态栏 (`PlayerStatusHUD.ts`)**：
   - 移除原有临时矢量框与硬编码圆角矩形；
   - 采用 214×54 的 `ui/slices/panel_well_inner` 凹槽切片底板；
   - HP/MP 进度条升级为 `ui/slices/bar_track_bg` 标准轨道背景；
   - HP 填充使用 `ui/slices/bar_fill_hp`，MP 填充使用 `ui/slices/bar_fill_mp`；
   - 增加高对比度等宽文字叠加（`HP 100 / 100`，`MP 100 / 100`）及战士等级与职业徽章（`Lv.1 狂战士`）。

2. **战斗补给与饰品 4 槽位 HUD (`CombatSupplyHUD.ts`)**：
   - 彻底废除 `ui.circle` 临时矢量画线，升级为 56×56 标准槽位组件；
   - 4 个槽位（药剂0/1/2与饰品T）统一挂载 56×56 `ui/slices/slot_grid_base` 底模；
   - 品质外框动态自适应：普通药水挂载 `slot_border_rough`，高级/强效药水挂载 `slot_border_fine`，饰品挂载 `slot_border_epic`；
   - 饰品生效中动态激活金色光效边框 `ui/slices/slot_border_legendary` 并实时倒计时；
   - 冷却状态下覆盖半透明暗色遮罩并精准显示毫秒级倒计时（如 `3.0s`），耗尽显示红色 `0` 警示；
   - 底部保留快捷键与键位提示（`1 药`、`2 药`、`3 药`、`饰品 T`），触控热区与几何尺寸与 `SUPPLY_BUTTON_LAYOUT` 1:1 严丝合缝。

3. **死亡复活与放弃退出弹窗 (`DeathRevivePanel.ts`)**：
   - 抽取独立组件封装 `DeathReviveHUDModel` 视图逻辑；
   - 弹窗外框采用 340×230 的 9-Patch `ui/slices/panel_window_frame`，内嵌 `ui/slices/panel_well_inner` 凹槽；
   - 10秒倒计时进度条采用 `ui/slices/bar_track_bg` 轨道底与 `ui/slices/bar_fill_exp` / `bar_fill_hp`（剩余3秒内变红预警）；
   - “立即复活”与“放弃退出”按钮采用 3 态标准切片（`button_normal`、`button_pressed`、`button_disabled`），纹章不足时优雅呈现灰色禁用态与说明；
   - 原地金光复活光环与战败全屏渐隐黑幕平滑过渡，热区映射 `hitTest` 完美兼容。

4. **单测套件交付**：
   - 交付 [`backend/test/combat-hud-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/combat-hud-cocos.test.mjs)，包含 12 组自动化用例，完整覆盖状态栏布局与文字、补给槽底板/品质边框/倒计时遮罩、饰品激活金框、复活弹窗层级、倒计时换肤、按钮状态机、复活光环/全屏黑幕渲染、坐标热区命中与安全销毁。

---

## 二、实际验证记录与证据

1. **类型检查门禁**：
   - `client/tsconfig.json`：0 错误；
   - `backend/tsconfig.json`：0 错误；
   - `tools/tsconfig.models.json`：0 错误。

2. **单元与交互测试**：
   - 运行 [`backend/test/combat-hud-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/combat-hud-cocos.test.mjs) 12 组用例 100% 全部通过；
   - 回归全量 8 套 Cocos UI 单测（combat-hud、dungeon-select、mail、shop、repair、enhancement、ranking、loot-victory）共 68 组用例 100% 全部通过。

3. **客户端模型与业务回归**：
   - `client/tools/check-ui-model.cjs`：UI 模型测试 100% 通过（包含 `SupplyHUDModel` 与 `DeathReviveHUDModel` 验证）；
   - `client/tools/check-model.cjs`：动作与连段模型测试全部通过；
   - `backend/test/supply-hud-coordinator.test.mjs`：补给输入上报与协调器同步测试 100% 通过。
