# ST07 Spec 独立评审

2026-10-23。依据 soflow:code-review 的 Spec 轴；核对当前工作区对 [ST07 规格](../stories/warrior-loop/st07/spec.md)（源故事卡 SHA-256：`1fceb0768f1fea2f27e60b3fdbc411f767da432d47cebf065626d01c6aee3a13`）的符合性。

## 评审结论

阻断性发现：0。主要需求（US6、US11、US13、AC5、AC8、AC12）实现完全符合已确认设计合同。

### 1. 邮件时效与阅读标记（US11, AC5）
- **实现核对**：`mail.markRead` 记录已读时间戳 `readAt`，邮件版本自增，`createdAt` 绝对保持不变，不影响附件领取资格与 30 天到期倒计时。
- **自动化断言**：`mail-service.test.mjs` 中“mail.markRead sets readAt and increments version without modifying createdAt”断言通过，重复标记幂等通过。

### 2. 邮件删除与防手删规则（US11, AC5）
- **实现核对**：`mail.delete` 严格检查附件领取状态，若存在任何未全额领取的附件，整笔拒绝并报错 `UNCLAIMED_ATTACHMENTS`；领完附件后删除状态转为 `deleted`，并保留来源存根，防止重发。
- **自动化断言**：`mail-service.test.mjs` 中“mail.delete rejects UNCLAIMED_ATTACHMENTS and succeeds only when all attachments are claimed”断言通过。

### 3. 单项附件领取与部分交付（US11, AC8）
- **实现核对**：`mail.claimAttachment` 针对堆叠道具，在背包空间不足容纳全部数量时，精确按可容纳量部分领取，余量安全保留在附件中并标记 `partially_claimed`；背包完全满时整笔拒绝 `BAG_FULL`；针对装备道具，满包拒绝，有空格时整件物化入包并标记 `claimed`；到期邮件严格拒领 `MAIL_EXPIRED`。
- **自动化断言**：`mail-service.test.mjs` 中“mail.claimAttachment supports partial delivery for stackables...”与“mail.claimAttachment rejects MAIL_EXPIRED...”断言通过。

### 4. 永久待领装备领取（US13, AC12）
- **实现核对**：`reward.claim` 兑领满包通关时暂存的 `RewardGrantEntity`，其装备实例预先存在且 `location: { kind: 'pending', grantId }`；不受 30 天过期规则限制，无过期时间；领取时校验背包空格，成功后将实例位置直接转移至背包，状态变更为 `delivered`，保持原始词条、强化等级完全不变，严禁重新随机构造。
- **自动化断言**：`mail-service.test.mjs` 中“reward.claim materializes pending equipment into backpack and never expires”断言通过（验证快进 100 天后仍可领取，满包拒绝，清空格后成功入包）。

### 5. 列表倒序、提醒摘要与客户端协调器（US6）
- **实现核对**：`mail.list` 与 `reward.list` 严格按生成时间倒序返回未删除邮件及待领项；`delivery.summary` 准确计算未读/未领邮件数与永久待领数，供 HUD 徽标使用；纯模型 `MailCoordinator` 完整实现状态机流转、未知结果恢复（通过 `operation.get`）与世代隔离。
- **自动化断言**：`mail-service.test.mjs` 中“mail.list, reward.list, and delivery.summary queries accurately report state”与 `mail-coordinator-v2.test.mjs` 全部 8 项断言通过。

## 遗留平台缺口（Platform Gaps）

- Cocos 邮箱与待领界面的面板预制体、邮件列表滚动视图、单个附件领取的 UI 动画与提示框。列为后续客户端 UI 集成责任，不阻塞当前协议、规则与纯模型交付。
