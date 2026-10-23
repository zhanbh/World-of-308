---
artifact_kind: specification
artifact_id: spec:warrior-loop-st08
spec_hash: e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d
tracker: local-markdown
plan_status: approved
approval_kind: human
approval_evidence: "好的开始"
stories:
  - slug: st08-batch-mail-claim
    title: 邮件与待领的可恢复批量领取
    covers: [US11, US13, AC5, AC8, AC12]
---
# ST08：邮件与待领的可恢复批量领取实施规格

2026-10-23。承接 ST07 单项邮件与永久待领领取交付，当前工作分支 `feat-1.0.0`。
本文件为 ST08 实施任务图提案与规格边界，不包含 Jira 操作、SDK 安装、云资源或外部发布。
来源为[业务故事卡](../st08.md)（SHA-256：`e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d`）、[API 合同](../../backend/api-contract-v2.md)（C20 mail.claimAvailable）、[城镇地点授权与有界批领合同](../../backend/town-authority-and-batch-delivery-v1.md)、[物理映射](../../backend/asset-physical-mapping-v1.md)与[真相源索引](../../backend/source-of-truth.md)。

## 玩家可验证结果

在合法会话与邮箱服务上下文（`contextId`）下，玩家发起“一键尽可能领取”（`mail.claimAvailable`）：
1. **有界扫描与候选固定（Batch Planning）**：
   - 服务端单批最多固定 20 个未领完附件，扫描最多 100 封有效未删除邮件；
   - 来源按既定生成时间倒序与稳定 ID 遍历固定，新到达邮件留待下次刷新，不混入本次已建立的候选批次；
   - 为批次中的每个候选附件生成确定性的 `childOperationId`，保证重试时不随机生成新 ID。
2. **单请求至多 4 项分步执行（Step Execution）**：
   - 一键领取是可部分成功的批处理，绝不把全部 20 项强行捆绑成一个不可拆分的单一超大事务；
   - 每次服务端服务请求最多处理 4 项候选附件；
   - 满包项跳过继续尝试后续项（例如某装备满包装不下则跳过，后续可堆叠药剂如果背包有空位仍可继续合堆领取）；
   - 执行前实时校验真实截止时效：执行时已到期的附件拒绝 `MAIL_EXPIRED`，不按扫描时未到期强行领取；
   - 发生 `RESULT_UNKNOWN` 提交异常时，暂停该批次执行并返回 `unknown`，不得标为跳过，待查询原操作结果后再继续。
3. **跨请求游标恢复与持久进度（Batch Resumption）**：
   - 持久化记录批次状态 `DeliveryBatchEntity`，返回当前处理项（≤4项）、批次状态（`pending | partial | completed`）与下一批处理游标 `nextCursor`；
   - 客户端沿游标连续发起后续请求，逐步完成整批 20 项的处理；
   - 客户端中途关闭面板或断网，已提交的子项绝不回滚；重开后必须重新提供当前合法邮箱上下文才能继续执行后续子项，不允许凭借旧批次绕过地点授权；
   - 两个并发批次如果包含同一附件，依托底层附件的 `quantityClaimed` 与版本号原子互斥，严禁重复交付。
4. **客户端协调器驱动（MailCoordinator）**：
   - `MailCoordinator` 增加 `claimAvailable()` 驱动逻辑，自动循环调度分步批次直至完成，实时汇总实际交付总量与跳过项，支持中途未知结果恢复。

## 本轮实施范围

- 后端受控 MemoryStore 事务实现 `mail.claimAvailable` 命令（支持 `cursor` 与 `selection` 模式）。
- 实现 `DeliveryBatchEntity` 的持久化、4项有界步进执行与断点游标推进。
- 扩展客户端纯模型 `MailCoordinator.ts` 支持一键批领全自动分步驱动与状态恢复。
- 本地 100% 自动化测试与门禁验证，不调用外部云数据库，不发外部单据。

## 公开测试边界

1. **有界扫描与规划边界**：扫描上限 100 封、附件上限 20 项、确定性 `childOperationId` 生成、游标分页切片。
2. **单步执行与满包跳过边界**：单次请求最多执行 4 项、装备满包跳过后堆叠药剂仍成功合堆领取、真实截止时效拦截。
3. **断网未知与恢复边界**：单项抛出异常转 `unknown` 阻断后续项并保留断点、通过 `operation.get` 恢复后继续批次。
4. **关窗重验与并发排他边界**：关闭面板后需重新校验合法邮箱上下文、两批次并发争抢同一附件互斥不重复发放。
5. **门禁与评审边界**：`tools/check-all.cjs` 全量 7/7 门禁通过、Standards 与 Spec 双轴独立评审归档。
