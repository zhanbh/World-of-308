# 正式杂货商店与货币兑换面板 UI 样式切片落地验证记录

2026-11-10。分支 `feat/shop-ui-style`，基线 `feat-1.0.0` / `f547cb7`。接续 ST06 旅行商人德利拉、药剂初级装备购买、背包物品回收与法定 10000:1 货币双向兑换能力，遵循本地文档管理与离线交付约束，不创建或同步 Jira 单据，不在会话窗口内嵌图片展示。

---

## 一、本轮交付范围与设计规范对齐

1. **底板与切片改造**：
   - 主窗口背景使用深色半透明遮罩与 912×500 的 `ui/slices/panel_window_frame` 9-Patch 外框；
   - 目录与明细区底板使用 `ui/slices/panel_well_inner` 凹槽切片，统一内嵌视口层次感；
   - 物品槽位采用 56×56 / 44×44 标准规格的 `ui/slices/slot_grid_base` 与品质边框 `ui/slices/slot_border_*`；
   - 关闭按钮、模式切换 Tab 标签（购买/回收/兑换）、步进调量控制、确认操作按钮、自愈恢复按钮均升级为 9-Patch 切片（`ui/slices/button_normal`、`ui/slices/button_pressed`、`ui/slices/button_disabled`），剔除临时矢量代码。

2. **核心业务与交互三模式**：
   - **商人货架 (购买)**：展示消耗品药剂与各职业基础武器装备目录，支持数量调节（+/-/MAX），实时同步金币/点券余额与总价计算，防连击与超额拦截；
   - **物品回收 (出售)**：展示背包可出售物品，严格标记与拦截 `[已穿戴]` 装备与 `[绑定禁售]` 商城道具，防误售与无损回收估值；
   - **法定货币双向平价兑换 (10000:1)**：金币与点券严格按法定 10,000 金币 ⇋ 1 点券无损双向兑换，支持步进调整兑换份数，余额实时校验；
   - **未知网络状态自愈**：超时或网络瞬断时置为 `unknown`，显示警告横幅并点亮自愈按钮，通过 `operation.get` 自动核对落地状态，杜绝双花或吞金。

3. **城镇 NPC 与场景集成**：
   - `Prototype.ts` 城镇模式在 `(-80, 20)` 绘制德利拉商贩摊位（条纹雨棚、木制展示柜与彩色药剂陈列），顶部导航栏增设 `商店 P` 快捷胶囊；
   - 支持键盘 `P` 键与 `Esc` 键快捷切换/关闭，支持触摸热区点击商贩摊位交互；
   - 沙盒协调器 `createSandboxShopCoordinator` 覆盖协议层 `account.get`、`character.get`、`shop.buy`、`shop.sell`、`wallet.exchange` 及 `operation.get`。

4. **单测套件交付**：
   - 交付 [`backend/test/shop-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/shop-cocos.test.mjs)，包含 8 组纯 Node / VM 自动化用例，完整覆盖生命周期、UI 层级标签、Tab 模式切换、购买/出售/兑换执行、热区命中几何、断网自愈与安全销毁。

---

## 二、实际验证记录与证据

1. **类型检查门禁**：
   - `client/tsconfig.json`：Cocos 客户端代码（包含 `ShopPanel.ts`、`Prototype.ts`、`PrototypePreview.ts`、`UISkin.ts` 等）编译通过，0 错误；
   - `backend/tsconfig.json`：后端与协议层编译通过，0 错误；
   - `tools/tsconfig.models.json`：纯模型层编译通过，0 错误。

2. **单元与交互测试**：
   - 回归 [`backend/test/shop-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/shop-cocos.test.mjs) 8 组用例全部通过（100% 通过）：
     - `ShopPanel: initializes closed, opens in buy mode, and shows Delilah title and balances`；
     - `ShopPanel: tab switching between buy, sell, and exchange modes`；
     - `ShopPanel: buy mode action updates coordinator state and displays success banner`；
     - `ShopPanel: sell mode filters non-sellable items and executes recycling`；
     - `ShopPanel: exchange mode calculates 10,000:1 parity and switches directions`；
     - `ShopPanel: hitTest accurately resolves interactive hotspots`；
     - `ShopPanel: unknown network state exposes recovery button and resolves cleanly`；
     - `ShopPanel: close and dispose cleanup safely`。
   - 回归 [`backend/test/shop-coordinator-v2.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/shop-coordinator-v2.test.mjs) 7 组协调器单测全部通过。
   - 回归全量面板交互单测（`repair-cocos.test.mjs`、`enhancement-cocos.test.mjs`、`ranking-cocos.test.mjs`、`loot-victory-cocos.test.mjs`）共 28 组用例 100% 通过。

3. **客户端模型回归**：
   - `client/tools/check-ui-model.cjs`：UI 模型测试 100% 通过；
   - `client/tools/check-model.cjs`：动作与连段模型测试全部通过。
