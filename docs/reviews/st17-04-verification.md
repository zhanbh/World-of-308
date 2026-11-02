# ST17-04 实施与验证

日期：2026-11-02
范围：Cocos 城镇林纳克斯修理面板（`RepairPanel`）、单件与穿戴一键全修交互、状态机映射、报价明细呈现、提交与防重复点击、丢包未知结果恢复、切角/迟包隔离、以及战斗副本装备破损非阻断警告提示。来源为已批准 [ST17 规格](../stories/warrior-loop/st17/spec.md)、[04 实施任务](../stories/warrior-loop/st17/issues/04-cocos-repair.md) 及 [开发真相源](../backend/source-of-truth.md)。本报告只记录 ST17-04。没有创建、同步或回填 Jira。

## 实现

1. **`RepairPanel` Cocos 表现层修理面板**（`client/assets/scripts/ui/RepairPanel.ts` 及 `.meta`）：
   - 单向数据驱动：严格基于 `RepairCoordinator` 权威视图与报价状态构建 UI；
   - 状态机全覆盖：`closed`、`loading`、`empty`、`ready`、`submitting`、`unknown`、`failed`；
   - 双模式交互：
     - **一键全修（全部穿戴模式）**：完整展示 7 个可磨损槽位（主手武器、护肩、上衣、下装、腰带、鞋子、耳环）的当前耐久、最大耐久、三色状态梯级（正常/警告/破损）、缺失点数、单件金币及总费用；
     - **单件修理模式**：展示选定装备的部位、装等、品质、当前与最大耐久度、缺失点数、单价及总修理金币；
     - 支持面板内一键切换全修与单件模式，刷新与重报价平滑衔接；
   - 费用与扣款反馈：
     - 零费用与全满集合提示：“所有穿戴装备完好无损，无需修理 (0 金币)”；
     - 成功横幅：“【修理成功】扣除 X 金币，已成功修满 Y 件装备！”；
   - 错误友好提示：准确映射 `CURRENCY_NOT_ENOUGH`（金币不足以支付全部修理费用）、`STALE_REPAIR_VIEW`（装备状态已变动）、`REPAIR_VIEW_CHANGED` 等业务拒绝码；
   - 未知网络结果恢复：进入 `unknown` 状态时，正常修理按钮禁用，自动激活【确认操作结果】恢复按钮，调用 `coordinator.recover()` 幂等推进原操作；
   - 提交防重防刷：提交中状态（`submitting`）严格禁用操作按钮，防止并发重入或重复扣款；
   - 迟包与切角隔离：关闭面板递增内部代次，退休所有在途网络回调；面板销毁（`dispose()`）注销事件监听与 Cocos `game.off`。

2. **`Prototype.ts` 城镇与战斗集成**：
   - 引入 `attachRepair(coordinator, contextId, labels)` 与 `toggleRepair()`，支持通过 M 键或点击修理按钮唤起面板；
   - 增加非阻断装备破损警告提示（`brokenEquipmentNotice`）：当武器或穿戴防具耐久降为 0 时在界面显示破损警告，但绝对不暂停游戏、不阻塞移动与技能施放、不阻碍通过关卡传送门（满足 AC17-2 / Issue 04 约束）。

## 验证证据

- **定向 Cocos 修理面板测试套件**：`backend/test/repair-cocos.test.mjs` **8/8 全部通过**：
  1. `RepairPanel` 初始化关闭、打开全部穿戴模式、完整渲染 7 槽位装备明细与总费用；
  2. 全部穿戴一键全修执行、原子扣除 240 金币、耐久修满至 60/60、渲染成功横幅并触发 `onResult`；
  3. 平滑切换全部穿戴与单件修理模式、单件装备信息与单价准确呈现；
  4. 金币不足（`CURRENCY_NOT_ENOUGH`）拦截状态、按钮禁用与友好提示；
  5. 丢包未知状态下恢复按钮激活、`coordinator.recover()` 幂等安全恢复；
  6. 面板关闭与销毁生命周期隔离、迟到网络包不污染已关闭 UI；
  7. **副本非阻断装备破损警告**：武器耐久归零时触发警告提示，但战斗与移动逻辑完全不阻断；
  8. **输入安全性**：提交中禁用按钮，忽略重复点击与并发交互。
- **全量 7 阶段自动化门禁 `check-all.cjs`**：**7/7 全部通过**：
  - 工具链约束（tooling contracts）：PASS
  - 共享与后端类型（shared/backend types）：PASS
  - 共享值契约（shared value contracts）：PASS
  - 客户端模型类型（client pure-model types）：PASS
  - 后端全量回归（backend regression）：**855/855 项测试全部通过（0 fail）**
  - 客户端模型回归（client model regression）：PASS
  - 客户端 UI 模型回归（client UI-model regression）：PASS
- **代码与格式门禁**：`git diff --check` 通过，无空白字符与换行异常。

## 边界说明

本片交付 Cocos 客户端林纳克斯修理面板、状态映射、事件监听、输入安全与非阻断破损提示。全故事联合大闭环与两轴独立评审留待 ST17-05 执行。
