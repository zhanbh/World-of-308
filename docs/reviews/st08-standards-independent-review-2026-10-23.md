# ST08 Standards 独立复核

2026-10-23。依据 soflow:code-review 的 Standards 轴；评当前未提交工作区，统一开发分支 `feat-1.0.0`。

## 结论

硬性标准违规：0。需要整改的 smell 判断：0。此结论只覆盖下述范围；业务合同符合性由独立 Spec 轴处理。

- **确定键与存储隔离**：`DeliveryBatchEntity` 使用确定性安全键 `v2:batch:${accountId}:${batchIntentId}`；所有子项操作凭据通过 `${batchIntentId}-c${index}` 派生确定性子操作键 `op:${accountId}:${childOperationId}` 与流水 `j:${accountId}:${childOperationId}`，无伪造和随机冲突风险。
- **单步 4 项有界与协议 schema 契约对齐**：单个服务请求严格限定执行最多 4 个候选附件，不仅在内部切片算法受限，且返回体 `items: list(..., 4)` 100% 遵守公共协议解析器约束，彻底消除巨型请求引发的超时或单事务锁膨胀。
- **满包安全跳过与空间不变性**：当背包容量不足以容纳某件装备或堆叠道具时，将该子项记录为 `status: 'rejected'`（`deliveredQuantity = 0`）并记录独立拒绝凭据，不中断批次执行，跳过并继续尝试后续候选；后续具备合堆空间的堆叠道具能够成功交付合堆，保证背包利用率最大化。
- **实时到期防御**：在候选分片执行时点严格基于真实系统时钟校验到期边界，对于在扫描后或跨步骤间隔中到期的邮件，实时拦截并拒绝交付，杜绝越权交付。
- **跨步骤断点恢复与关窗地点重验**：持久化保存游标状态；当玩家关窗或离开 NPC 时，后续请求必须重新出示当前合法的邮箱服务上下文（`contextId`），严禁凭旧批次 `batchIntentId` 绕过空间距离校验。
- **客户端协调器自动循环驱动与世代隔离**：纯模型 `MailCoordinator.claimAvailable()` 自动驱动跨请求游标分步递进，准确累加 `totalDelivered` 与 `skippedCount`；支持中途关窗立即终止推进（generation token 隔离）以及网络异常进入 `unknown` 后的安全 `recover()` 恢复。

## 阅读与验证范围

- 检查 `backend/src/mail/batch-planning.ts`、`backend/src/mail/mail-service.ts`、`backend/src/character/character-model.ts`。
- 检查 `client/assets/scripts/net/MailCoordinator.ts`。
- 检查 `backend/test/batch-planning.test.mjs`、`backend/test/mail-batch-service.test.mjs`、`backend/test/mail-coordinator-batch.test.mjs`。
- 独立命令：运行 264 项全量回归测试，100% 通过；7/7 统一门禁 100% 绿灯。
- 不覆盖 Cocos 邮箱“一键批量领取”按钮的 UI 动效与飘字反馈；该项列为 platform-gap。

## 阅读快照 SHA-256

- `backend/src/mail/batch-planning.ts` — `b7f3ebd532c98d3f133a41ae6bd52260bf72369e1d59f3ffa9c5a9a2469d2641`
- `backend/src/mail/mail-service.ts` — `6206f5dd9a381147363de092299b7ba8d3291a569a967501dc402adeb59b911b`
- `backend/src/character/character-model.ts` — `473f9f660a1860d703af5a5862ba5a88a33a79636e3201f61621a82004157ba8`
- `client/assets/scripts/net/MailCoordinator.ts` — `6fe2b2224b2f6c386d609762c76ad9c1c5f06a99108437d573b4ff88b0201936`
- `backend/test/batch-planning.test.mjs` — `2fedac2e70b7e8e08a06ae3eb1d212503156a6f1acea699f289d82abfdd0d2fd`
- `backend/test/mail-batch-service.test.mjs` — `b9d09df38285bcd9b8805c084d71f2f1f006df83ab69500285e40f8005e43d05`
- `backend/test/mail-coordinator-batch.test.mjs` — `ba319a9ae91f9843618a2e7bb17b9d90ad777499a82627c39c278a977070840c`
- `tools/tsconfig.models.json` — `811aac4b00d265462db8a6c606f4c9a041a6df7b45551997458066e11de991f1`
