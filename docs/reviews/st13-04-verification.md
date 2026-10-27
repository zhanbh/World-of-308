# ST13-04 Cocos战斗补给HUD与可操作联调验证报告

## 1. 任务背景与验收标准

- **任务编号**: `ST13-04`
- **对应规格**: `docs/stories/warrior-loop/st13/spec.md` Section 04
- **实现范围**:
  1. **战斗补给HUD布局与热区互斥**:
     - 在战斗控制区布局 3 个快捷药位（QuickSlots: 0, 1, 2）和 1 个独立主动饰品按钮（Trinket）。
     - 几何热区严格互不重叠（间距 > 半径和），且与战斗摇杆（-345, -150, 半径95）、普攻（345, -150, 半径68）、四技能（150~345, -65, 半径31）空间完全隔离。
  2. **状态机与权威状态投影**:
     - 药位支持 `unbound`（未绑定）、`empty`（耗尽但保留绑定模板）、`cooldown`（冷却中，精确到0.1s倒计时）、`ready`（合法可用，显示数量）、`submitting`（提交待决中）、`disabled`（死亡或场景未激活）。
     - 饰品支持 `unbound`（未装备）、`waiting`（60s 换装等待中）、`cooldown`（120s 冷却中）、`active`（增益生效中，持续15s）、`ready`（合法就绪）、`submitting`（激活待决中）、`disabled`（死亡或场景未激活）。
  3. **可操作联调与输入调度**:
     - 触屏点击 `hitTest` 精确命中药位与饰品按钮。
     - 键盘支持战斗快捷键映射：数字键 `1`, `2`, `3` 对应 3 个快捷药位，键 `T` 对应激活主动饰品。
     - 触发时生成符合权威规范的 `ActionInput`（`kind: 'item'` 与 `kind: 'trinket'`），通过 `MovementCoordinator.enqueue` 提交给权威服务；用药不打断普攻与移动。
     - 在本地沙盒模式与权威连接模式下均支持流畅操作与视觉反馈。

---

## 2. 验证证据与测试覆盖

1. **纯逻辑 UI 状态模型测试**（`client/tools/check-ui-model.cjs`）:
   - 几何距离断言：4 个补给按钮相互间距均大于半径和（互不重叠）。
   - 控制区隔离断言：与四技能按钮、普攻按钮、虚拟摇杆均保持独立间距（无相交冲突）。
   - `hitTest` 精确命中测试：各热区正确识别目标，超出范围返回 `null`。
   - 快捷药位状态流转：`unbound` -> 绑定耗尽 `empty` -> 存入库存 `ready` -> 触发提交 `submitting` -> 冷却生效 `cooldown` -> 角色死亡 `disabled`。
   - 主动饰品状态流转：`unbound` -> 换装等待 `waiting` -> 就绪 `ready` -> 触发提交 `submitting` -> 增益生效 `active` -> 冷却倒计时 `cooldown`。
2. **端到端协调器联动测试**（`backend/test/supply-hud-coordinator.test.mjs`）:
   - 测试 1：`SupplyHUDModel` 生成的 `item` 输入压入 `MovementCoordinator` 队列，与移动动作共同提交到权威服务，返回后更新快照，数量从 5 扣减至 4，HUD 显示 10s 冷却倒计时。
   - 测试 2：饰品激活生成 `trinket` 动作并由 `MovementCoordinator` 成功提交，HUD 呈现 15s 激活状态（`active`），超过持续时间后平滑回退至 CD 倒计时（`cooldown`）。
3. **Cocos 样板交互装配**（`client/assets/scripts/Prototype.ts`）:
   - 集成 `SupplyHUDModel`，通过 Graphics 绘制带状态颜色的补给按钮（就绪红/蓝/紫、冷却灰、耗尽暗红、生效金、提交金光）。
   - 动态更新按钮文本与倒计时，接入触屏 `touchSupplyButton` 与键盘按键 `1/2/3/T` 调度。

---

## 3. 全量回归结果

- 全量检查脚本：`node tools/check-all.cjs --typescript ...`
- 结果：**7/7 checks passed**
  - 后端回归测试（全部新旧业务测试）：**612 / 612 passed**
  - 客户端模型与 UI 模型回归：**100% SUCCESS**
