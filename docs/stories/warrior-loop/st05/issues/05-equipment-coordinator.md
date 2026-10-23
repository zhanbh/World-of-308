---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st05-05
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st05
    revision: d14286fc282f25df7cccf4ae35e5159b6f90fbc9115963a487f65dc934f73930
    path: docs/stories/warrior-loop/st05/spec.md
implements: [st05-equipment-attributes-sets]
blocked_by: [3, 4]
---
# 05：客户端纯模型 EquipmentCoordinator 与状态流转

**What to build:**
在客户端实现不依赖 Cocos 引擎 UI 渲染的纯模型协调器 `EquipmentCoordinator.ts`：
1. 本地状态管理：
   - 维护 13 个槽位的装备映射状态、角色战斗属性摘要、当前总装备评分；
   - 具备清晰的状态机：`idle`, `submitting`, `error`, `unknown`；
2. 穿脱命令封包与乐观调度：
   - 提供 `equip(itemId, targetSlot)` 与 `unequip(itemId, slot)` 方法；
   - 检查客户端本地前置规则（如饰品在 CD 中直接拒绝、无空位且非替换的卸下拒绝），减少无效网络往返；
   - 发起请求进入 `submitting` 状态；
3. 响应处理与回滚：
   - 成功时（`committed`）：接收服务端的权威装备与背包版本更新，同步本地槽位与属性；
   - 失败时（`rejected`）：如 `BAG_FULL`, `ITEM_NOT_ELIGIBLE` 等，产生明确错误回执，本地状态维持原样；
   - 未知状态（`RESULT_UNKNOWN` / 网络超时）：标记为 `unknown` 状态，支持基于原 `operationId` 幂等重试恢复；
   - 版本落后防护：忽略版本号低于本地当前版本的迟到响应，防止旧状态覆盖新视图。

**Blocked by:** 03, 04。

## Acceptance criteria

- [x] 协调器状态流转：正常穿脱经历 `idle -> submitting -> idle`，失败经历 `idle -> submitting -> error`。
- [x] 乐观交互与失败回滚：当服务端返回拒绝（如 `BAG_FULL` 或 `ITEM_NOT_ELIGIBLE`）时，协调器状态正确还原为操作前状态。
- [x] 结果未知恢复：当网络中断模拟 `unknown` 响应时，协调器保存原 `operationId` 并提供恢复查询。
- [x] 低版本响应拦截：在本地版本为 3 时收到版本为 2 的迟到响应，协调器予以静默忽略，不破坏当前界面数据。
- [x] 纯模型类型检查通过：纳入 `tools/tsconfig.models.json`，纯 TypeScript 编译 0 报错。

## Tests and evidence

测试入口：客户端纯模型单元测试与断网/异常模拟测试。
- 模拟后端成功与各种错误码（`BAG_FULL`, `ITEM_NOT_ELIGIBLE`, `LOCATION_NOT_ALLOWED`）下协调器状态验证。
- 原操作未知与重放恢复测试。
- 乱序响应与旧版本迟到包忽略测试。
- `tools/check-all.cjs` 阶段 4 / 6 编译与测试通过。
