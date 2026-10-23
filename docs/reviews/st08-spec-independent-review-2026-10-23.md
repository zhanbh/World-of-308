# ST08 Spec 独立评审

2026-10-23。依据 soflow:code-review 的 Spec 轴；核对当前工作区对 [ST08 规格](../stories/warrior-loop/st08/spec.md)（源规格卡 SHA-256：`e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d`）的符合性。

## 评审结论

阻断性发现：0。主要需求（US11、US13、AC5、AC8、AC12、C20）实现完全符合已确认设计合同与真相源要求。

### 1. 扫描与候选边界规划（US11, C20）
- **实现核对**：`planBatchFromMails` 严格扫描最多 100 封非删除邮件，倒序收集最多 20 个未领附件；`planBatchFromSelection` 支持精准定向选择（最多 20 项）；每个候选项按序号派生确定性子操作 ID `${batchIntentId}-c${index}`。
- **自动化断言**：`backend/test/batch-planning.test.mjs` 中 3 项规划算法测试用例全部通过，验证了 100 封扫描上限截断、20 个候选上限截断、倒序优先级以及切片计算。

### 2. 单请求最多 4 项切片与事务步进（C20）
- **实现核对**：`mail.claimAvailable` 服务端请求接收游标或初始意图，单次事务严格只执行 4 个候选项，返回 `nextCursor` 与当前步执行项（≤4项）。严格对齐公共协议 `list(..., 4)` schema 契约，避免长事务与单次大包压力。
- **自动化断言**：`backend/test/mail-batch-service.test.mjs` 中“batch execution limits each request to at most 4 items with cursor progression”断言通过，多批次切片推进符合预期。

### 3. 满包安全跳过与后续合堆（AC8）
- **实现核对**：在背包空间无法容纳某装备或堆叠物时，不回滚不打断批次，将该子项置为 `status: 'rejected'`（`deliveredQuantity = 0`）并记录独立操作凭据，跳过继续处理后续项；后序若有可合并入已有未满堆叠的道具，依然能够成功领取交付入包。
- **自动化断言**：`backend/test/mail-batch-service.test.mjs` 中“full bag equipment is skipped while subsequent stack item merges successfully (AC8)”测试通过，满包装备被跳过，后序生命药水成功合入未满槽位（17->20）。

### 4. 实时到期拦截（AC5）
- **实现核对**：执行阶段实时检查真实系统时间，若邮件已到期，立即标记 `status: 'rejected'`（`deliveredQuantity = 0`）及 `MAIL_EXPIRED`，杜绝因初次扫描时未到期而引发的延迟偷渡。
- **自动化断言**：`backend/test/mail-batch-service.test.mjs` 中“real-time expiry intercept skips expired mail item during step execution”断言通过。

### 5. 跨请求断点恢复与关窗地点重验（C20）
- **实现核对**：批次状态通过 `DeliveryBatchEntity` 持久化在 `v2:batch:${accountId}:${batchIntentId}`；关窗或离开 NPC 后再次提交必须提供新签发的有效邮箱服务上下文（`contextId`），严禁凭旧批次 `batchIntentId` 绕过授权。
- **自动化断言**：`backend/test/mail-batch-service.test.mjs` 中“location re-verification blocks batch advancement after service closed and resumes on reopen”断言通过。

### 6. 并发批次互斥与数量守恒
- **实现核对**：同一附件被两个并发批次争抢时，底层基于附件剩余数量原子扣减；后提交者感知到余量为 0，标记跳过，绝无超领、重复交付或负数。
- **自动化断言**：`backend/test/mail-batch-service.test.mjs` 中“concurrent batches competing for same attachments preserve quantity conservation”断言通过。

### 7. 客户端协调器一键批领驱动（US11）
- **实现核对**：纯模型协调器 `MailCoordinator.claimAvailable()` 自动驱动跨请求游标分段递进，准确累加全批次交付数与跳过数，支持中途关窗立即终止（世代隔离）以及网络中断进入 `unknown` 后的原子恢复。
- **自动化断言**：`backend/test/mail-coordinator-batch.test.mjs` 全部 3 项断言通过。

## 遗留平台缺口（Platform Gaps）

- Cocos 邮箱界面一键领取按钮与连续交付飘字动画：列为后续客户端表现层集成责任，不阻塞当前网络、存储、规则与纯模型协调器交付。
