---
artifact_kind: specification
artifact_id: spec:warrior-loop-st07
spec_hash: 1fceb0768f1fea2f27e60b3fdbc411f767da432d47cebf065626d01c6aee3a13
tracker: local-markdown
plan_status: approved
approval_kind: human
approval_evidence: "好的，开始"
stories:
  - slug: st07-mail-and-pending-rewards
    title: 单项邮件与永久待领领取
    covers: [US6, US11, US13, AC5, AC8, AC12]
---
# ST07：单项邮件与永久待领领取实施规格

2026-10-23。承接 ST06 商店买卖与钱包兑换交付，当前工作分支 `feat-1.0.0`。
本文件为 ST07 实施任务图提案与规格边界，不包含 Jira 操作、SDK 安装、云资源或外部发布。
来源为[业务故事卡](../st07.md)（SHA-256：`1fceb0768f1fea2f27e60b3fdbc411f767da432d47cebf065626d01c6aee3a13`）、[API 合同](../../backend/api-contract-v2.md)（C18, C19, C21, C22, R08, R09, R10）、[物理映射](../../backend/asset-physical-mapping-v1.md)、[数据字典](../../backend/data-dictionary-v2.md)与[真相源索引](../../backend/source-of-truth.md)。

## 玩家可验证结果

在合法会话与邮箱服务上下文（`contextId`）下，玩家进行邮件阅读、删除、单项附件领取与永久待领装备领取：
1. **邮件时效与阅读（mail.markRead）**：
   - 邮件具备 30 天有效期（`expiresAt = createdAt + 30 * 24 * 60 * 60 * 1000`）；精确到期按 `now >= expiresAt`，已到期邮件状态视为 `expired`；
   - 玩家可对邮件标记已读，记录 `readAt = now`，不改变邮件生成时间 `createdAt`，不影响附件领取资格；
   - 标记已读操作幂等且版本自增。
2. **防手删规则与逻辑删除（mail.delete）**：
   - 只要邮件中存在尚未完全领取的附件（`attachment.quantityClaimed < attachment.quantityGranted`），玩家手动删除一律严格拒绝（`UNCLAIMED_ATTACHMENTS`）；
   - 全部附件领完后允许删除，删除后从玩家活跃列表移除，但保留同键来源存根（`sourceKey`），防止同一节点邮件重复触发发放。
3. **单项附件按容量领取（mail.claimAttachment）**：
   - 玩家单项领取邮件中的附件：
     - 若邮件已过期（`now >= expiresAt`），拒绝并报错 `MAIL_EXPIRED`；
     - 若附件已全额领取（`quantityClaimed >= quantityGranted`），拒绝 `ALREADY_DELIVERED`；
     - 若为堆叠道具：根据背包当前剩余容纳量（已有同模板未满堆叠的剩余空间 + 空闲背包格 * 20）计算可领数量；若空间为 0 则拒绝 `BAG_FULL`；若空间不足全部交付，则按可容纳量部分领取，更新 `attachment.quantityClaimed += deliveredQuantity`，余量继续保留在邮件中；
     - 若为装备道具：校验背包是否至少有 1 个空格；若无空格拒绝 `BAG_FULL`；若有空格则整件领取，在背包中物化为确定 `itemId` 的 `equipment` 实例（`location: { kind: 'container', containerId: backpackId }`），更新 `attachment.quantityClaimed = 1`；
   - 邮件更新、背包入包、资产流水（`assetJournal`）与原操作凭据（`operation`）原子提交。
4. **永久待领装备领取（reward.claim）**：
   - 满包通关等来源生成的待领装备保存在 `rewardGrants`，其装备实例预先存在且 `location: { kind: 'pending', grantId }`；
   - 待领装备永久有效，绝不套用 30 天到期规则，不设拒领硬上限；
   - 玩家在邮箱待领页签发起 `reward.claim`：
     - 校验背包是否有可用空格，若满包拒绝 `BAG_FULL`；
     - 领取后将装备实例物化转移入背包（`location: { kind: 'container', containerId: backpackId }`），`grant.deliveryState` 置为 `delivered`；
     - 同角色交付，严禁跨角色转交，单次确定物化，绝不再造第二份实例。
5. **查询与交付提醒**：
   - `mail.list`：按生成时间倒序返回非删除邮件，提供到期状态与附件摘要；
   - `reward.list`：按生成时间倒序返回当前角色未领取的永久待领记录，无到期时间；
   - `delivery.summary`：返回未读/有未领附件的有效邮件数与永久待领数，供 HUD 徽标提醒。
6. **客户端纯模型协调器**：
   - 纯模型 `MailCoordinator.ts` 提供完整的邮件列表、待领列表、摘要拉取、单项领取、标记已读与删除状态流转，支持世代隔离与未知结果恢复。

## 本轮实施范围

- 后端受控 MemoryStore 事务实现 `mail.markRead`、`mail.delete`、`mail.claimAttachment`、`reward.claim` 命令。
- 实现 `mail.list`、`reward.list`、`delivery.summary` 查询及邮箱服务上下文校验。
- 客户端纯模型 `MailCoordinator.ts`。
- 本地 100% 自动化测试与门禁验证，不调用外部云数据库，不发外部单据。

## 公开测试边界

1. **时效与阅读边界**：30天到期时间精确判定、到期附件拒领（`MAIL_EXPIRED`）、已读时间记录且绝不篡改创建时间、重复标记已读幂等。
2. **删除与存根边界**：有未领附件强制拒绝手删（`UNCLAIMED_ATTACHMENTS`）、全领后成功删除、删除后来源存根保留且不重发礼包。
3. **部分领取与整件领取边界**：堆叠道具满包拒绝（`BAG_FULL`）、部分空间只领可装下数量且余量留在附件中、完全容纳一次领完；装备满包拒绝、有空格整件物化。
4. **永久待领边界**：永久待领永不过期、满包拒绝、入包后 pending 变 delivered、不改变装备属性、跨角色越权拒绝。
5. **并发与幂等边界**：同一 `operationId` 结果重放、旧代次会话与跨账号越权拒绝、并发领取原子互斥。
6. **门禁与评审边界**：`tools/check-all.cjs` 全量 7/7 门禁通过、Standards 与 Spec 双轴独立评审归档。
