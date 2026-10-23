# ST07 Standards 独立复核

2026-10-23。依据 soflow:code-review 的 Standards 轴；评当前未提交工作区，统一开发分支 `feat-1.0.0`。

## 结论

硬性标准违规：0。需要整改的 smell 判断：0。此结论只覆盖下述范围；业务合同符合性由独立 Spec 轴处理。

- **确定键与存储隔离**：`mail`、`grant`、`equipment`、`stack`、`operation` 与 `assetJournal` 均通过确定性安全键派生，读写范围严格受限。
- **状态防御与服务上下文**：邮件读、删、领附件以及待领装备领取，均在事务内校验有效邮箱服务上下文（`contextId`、`serviceKind === 'mailbox'`），防跨 NPC 或未授权远程调用。
- **防手删规则闭环**：未领完附件的邮件严格禁止删除，明确报错 `UNCLAIMED_ATTACHMENTS`；删除后保留来源存根（`sourceKey`），绝不重新触发发放。
- **空间守恒与部分交付**：堆叠道具领取依据背包实际容纳量支持部分领取（优先填入已有未满堆叠再分配空格），余量保留在附件中；装备道具整件物化，满包整笔回滚并拒绝 `BAG_FULL`，无多领漏领。
- **永久待领唯一引用与绝不重造**：待领装备通过 `RewardGrantEntity` 与预先存在的 `EquipmentEntity` 实例（`location = { kind: 'pending', grantId }`）唯一绑定，无 30 天到期倒计时；领取时仅转移容器归属，词条与强化等级严格守恒，绝不重新随机构造。
- **协调器代次隔离与网络丢包恢复**：纯模型 `MailCoordinator` 支持完整状态流转、未知结果恢复（通过 `operation.get`）、乐观并发保护及面板关闭后的代次隔离（generation token）。

## 阅读与验证范围

- 检查 `backend/src/mail/mail-rules.ts`、`backend/src/mail/mail-service.ts`。
- 检查 `client/assets/scripts/net/MailCoordinator.ts`。
- 检查 `backend/test/mail-rules.test.mjs`、`backend/test/mail-service.test.mjs`、`backend/test/mail-coordinator-v2.test.mjs`。
- 独立命令：运行 251 项全量回归测试，100% 通过；7/7 统一门禁 100% 绿灯。
- 不覆盖 Cocos 邮箱界面预制体与按钮动效；该项列为 platform-gap。

## 阅读快照 SHA-256

- `backend/src/mail/mail-rules.ts` — `ede2a7bf51ab0f2ec22197247b36ee33072fefeeb12b4da0a6bb49954559d6b9`
- `backend/src/mail/mail-service.ts` — `359d591b24839947c6840c2c52011230e9f8391c3f9338fde0d01d58ba1b4f91`
- `client/assets/scripts/net/MailCoordinator.ts` — `ba9eabf25935ce04582e0f0a5bd4114db21a0c5a076d6d459203653949854b92`
- `backend/test/mail-rules.test.mjs` — `eee4de9b8e17ad091e857f25506db5596bc022e9c4d50d45bd0b247aff7d4e49`
- `backend/test/mail-service.test.mjs` — `50b948092fc2191f6ecc1c5970e44af658cdc0a29e5871f2600c5e29bc967e0f`
- `backend/test/mail-coordinator-v2.test.mjs` — `450ce9e91130b78361df4c81a9133f7bd7adf8d7f30f912a57946ffc3b340e9a`
- `tools/tsconfig.models.json` — `811aac4b00d265462db8a6c606f4c9a041a6df7b45551997458066e11de991f1`
