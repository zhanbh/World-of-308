# ST09 客户端独立评审

评审日期：2026-10-23。对象：`BankCoordinator.ts`、`BankPanel.ts`、`BankPreview.ts` 及 `Prototype.ts` 银行接入。依据：已确认 ST09-01～04 本地实施任务及其引用合同。评审者未参与上述客户端实现。本报告不声称真机或微信 SDK 已验收。

## 需要修复

### C01 / P2：锁格点击永远无法进入扩容报价

位置：`client/assets/scripts/ui/BankPanel.ts:123`、`:130`。

`start` 将锁格作为 `sourceKey: null` 传入 `InventoryGesture.pointerStart`；该手势模块仅在存在物品键时保留 `sourceIndex`，否则把它置为 null。`end` 的锁格报价分支却要求 `r.sourceIndex !== null`，因此永远不可达。背包或个人库滚动至第 21 格并点击锁格，不发起报价查询，也不显示确认框；只有独立“扩容 +20”按钮可用。任务 ST09-04 明确要求锁格/扩容入口。

复现实验：以 TypeScript 官方 `transpileModule` 将实际 `BankPanel.ts` 加载到只提供空 `cc` 模块的 Node VM；使用实际 `InventoryGesture` 调用其原型 `start/end`（未修改源码）。20 格背包滚动 240 后，点击本地坐标 `(95,85)`，对应 index20，手势状态 `sourceIndex` 实测为 null，`quote` 探针未调用。应另外记录点击格位，且保留空格不能成为可拖物品的规则。

### C02 / P2：第二根手指覆盖并清空主指针的容器来源

位置：`client/assets/scripts/ui/BankPanel.ts:123`、`:127`。

`InventoryGesture` 正确拒绝非当前指针的开始/结束，但面板在调用它之前写 `this.source = side`，并在任何 `pointerEnd` 后无条件写 `this.source = null`。第一指按住背包物品，第二指按到金库并松开后，主手势仍为第一指，但其容器来源已先变成金库再变成 null；第一指继续拖放不会弹选量或提交。更早释放第一指时也可能按错误来源匹配另侧格位。触摸滚动同样可能误滚另一侧。应仅在真正取得手势所有权时记录来源，仅由拥有者结束时清理。

复现实验：同一原型测试中，主指 id1 在背包 `(95,85)` 开始，次指 id2 在金库 `(-335,85)` 开始；实测手势 `id=1`、面板 `source=vault`。次指结束后手势仍 `id=1`、面板 `source=null`。

## 已核对路径与限制

- `BankCoordinator` 写入前持久化原意图；未知结果查询/重发沿同一个 operationId、数量、expected；关闭/角色初始化通过 generation 排除迟到响应；确认结果后才刷新权威快照。
- 扩容报价检查角色/容器/钱包版本；实际选择金币或点券决定单一支付币种，未发现客户端自行换算价格。
- `BankPreview` 限 localhost/127.0.0.1 且显式 `bankPreview=1`，持久化键含服务实例 ID；`Prototype` 的异步连接取消、面板互斥与关闭接入未发现额外阻断缺陷。
- 本次额外验证为真实源码原型执行，不等于完整 Cocos 渲染/触摸派发；以上两项仍需修复后补实际 Cocos 复验。

## 修复后独立复核（2026-10-23）

原C01/C02发现保留如上；本节记录修复结果，不改写原始评审历史。

- **C01已解决**：BankPanel用独立`tappedIndex`记录真实点击格位，仍让InventoryGesture对空/锁格保留不可拖动规则；原型回归实际点击index20可发起背包报价。
- **C02已解决**：开始前拒绝已有所有者，成功取得手势后才记录来源；结束先检查指针ID且只有有效结束才清理来源。实际类回归证明第二指不能覆盖来源、结束主手势或滚动错误侧，主指可继续弹出默认整叠的数量确认。
- 普通InventoryCoordinator新增背包金币扩容，报价请求不携带伪银行上下文；核验当前角色/背包版本及唯一钱包版本，持久化完整原请求后才发支付。unknown恢复沿原operationId，关闭后恢复不重复扣款；同代次报价才显示，close/init清quote/expected，迟到报价不重开弹框。
- 普通InventoryPanel锁格采用独立点击格位；报价显示实际金币与容量变化，确认才调用支付，取消不调用写入。背包版本变化关闭确认框；报价/提交期间状态门禁阻止再次操作。未发现新增阻断缺陷。

复核运行：`WORLD308_TYPESCRIPT=/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript node --test backend/test/bank-panel-gesture.test.mjs backend/test/inventory-expansion-coordinator.test.mjs backend/test/bank-coordinator-v2.test.mjs backend/test/inventory-coordinator-v2.test.mjs`。**30/30通过**，其中实际类手势回归3项、普通背包扩容真实服务组合3项、银行协调器9项、既有背包协调器15项。实际类测试只stub渲染模块并执行真实方法；不据此宣称完整Cocos触摸派发/微信真机完成。运行时渲染与B入口验收由主任务独立记录。
'''
