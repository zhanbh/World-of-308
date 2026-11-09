# 正式银行/金库面板 UI 样式落地与装备详情联动

2026-11-09。分支 `feat/bank-ui-style`，基线 `feat-1.0.0` / `267416e`。接续 ST09 银行与金库能力，遵循本地文档管理与离线交付约束，不创建或同步 Jira 单据，不在会话窗口内嵌图片展示。

---

## 一、本轮交付范围与设计规范对齐

1. **底板与切片改造**：
   - 主窗口背景使用深色半透明遮罩与 912×500 的 `ui/slices/panel_window_frame` 9-Patch 外框；
   - 金库侧与背包侧视口底衬分别挂载 308×248 的 `ui/slices/panel_well_inner` 凹槽切片，形成内嵌双视口层次；
   - 关闭按钮、金库标签切换按钮、上下滚动翻页按钮、扩容按钮、操作确认/恢复按钮均升级为 9-Patch 切片（`button_normal`、`button_pressed`、`button_disabled`），具备按下态与禁用态视觉反馈。

2. **槽位与图标资产**：
   - 金库与背包各 100 槽位均升级为 56×56 `ui/slices/slot_grid_base` 切片底板；
   - 物品图标统一采用 48×48 原生透明 PNG，解耦主体与槽位底衬；
   - 装备动态挂载 56×56 品质边框（`slot_border_rough/fine/rare/unique/legendary`）；
   - 强化装备展示黄色 `+N` 强化等级标牌；
   - 启用磨损的装备展示底部 3px 耐久状态条（红/黄/绿状态色阶梯）；
   - 堆叠道具展示右下角半透明底衬 `×N` 数量标牌。

3. **装备详情联动**：
   - 接入双层只读 `EquipmentCard.ts`（轻量浮窗卡 + 可滚动完整卡），点击金库或背包中的装备即弹出详情卡；
   - 详情卡边界检测根据槽位锚点自动计算，右侧背包槽位点击自动向左翻转，全方位防溢出屏幕（960×540 设计视口）；
   - 接入 `InventoryDetails.ts` 只读详情缓存，以金库类型、金库版本及背包版本为联合缓存域，切换金库 Tab 或执行存取后自动废弃迟到或陈旧响应；
   - 键盘 Esc 键支持阶梯关闭：详情卡打开时 Esc 仅关闭详情卡，详情卡关闭时 Esc 关闭整个银行面板。

4. **指针所有权与弹窗隔离**：
   - 严格继承 `InventoryGesture` 指针所有权模型，单指长按或拖拽至对面触发存取转移，点击未解锁格触发扩容报价；
   - 数量转移与金币/点券扩容弹窗挂载 `panel_window_frame` 外框，并在打开时自动置顶；
   - 弹窗按钮增加开启点击指针隔离保护，杜绝因打开弹窗的鼠标尾部释放误触确认按钮的问题。

5. **本地服务与沙盒联调支持**：
   - `createSandboxBankCoordinator`（`PrototypePreview.ts`）补齐 `equipment.get` 查询支持，离线沙盒模式可直接读取并展示试玩武器详情；
   - `createBankPreview`（`bank-preview-server.mjs`）接入 `EquipmentService` 查询通道，真实临时进程服务支持装备详情完整下发。

---

## 二、实际验证记录与证据

1. **类型检查门禁**：
   - `tools/tsconfig.models.json`：纯模型（包含 `BankCoordinator.ts`、`InventoryDetails.ts`、`InventoryPresentation.ts` 等）编译通过，0 错误；
   - `backend/tsconfig.json`：后端与协议层编译通过，0 错误；
   - `client/tsconfig.json`：Cocos 客户端代码（包含 `BankPanel.ts`、`Prototype.ts` 等）编译通过，0 错误。

2. **单元与手势测试**：
   - 新增 [`backend/test/bank-presentation.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/bank-presentation.test.mjs) 8 组用例全部通过：
     - 弹窗开启点击指针隔离；
     - 真实银行预览服务 `equipment.get` 只读查询与属性完整性；
     - 关页或切 Tab 废弃在途响应；
     - 复合容器版本域缓存去重与重置；
     - 双侧各 100 槽位坐标与命中严格对齐；
     - 双侧锚点详情卡四角边界防溢出；
     - 图标映射与自定义映射回退；
     - 沙盒银行协调器只读查询与 DTO 兼容。
   - 回归 [`backend/test/bank-panel-gesture.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/bank-panel-gesture.test.mjs) 3 组手势与所有权用例全部通过；
   - 回归 [`backend/test/inventory-presentation.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/inventory-presentation.test.mjs) 10 组背包用例全部通过。
   - **全量后端回归测试**：108 组共 926 项测试全部通过（0 失败，0 取消）。

3. **客户端模型回归**：
   - `client/tools/check-ui-model.cjs`：UI 模型测试 100% 通过；
   - `client/tools/check-model.cjs`：动作与连段模型测试全部通过。

