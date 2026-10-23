# ST07 本地验证记录

2026-10-23。统一开发分支 `feat-1.0.0`。
针对 ST07 业务需求（单项邮件与永久待领领取，US6、US11、US13、AC5、AC8、AC12）的本地全量门禁与自动化验证结果。

## 1. 验证结果汇总

| 验证项 | 验证内容 | 结果 |
| --- | --- | --- |
| 工具链契约 | Node 24.19.0 与本地 TypeScript 5.8.2 严格离线环境 | PASS |
| 类型安全 | `backend/tsconfig.json` 与 `tools/tsconfig.models.json` 全量类型检查 | PASS |
| 邮件规则引擎 | 时效判定边界、防手删校验、堆叠部分容纳计算、装备整件容纳检查（4项用例） | PASS |
| 邮件与待领服务 | 读删服务、堆叠部分领取、到期拒领、待领100天后入包、查询倒序与操作幂等（7项用例） | PASS |
| 客户端协调器 | 纯模型状态机流转、单项领取、网络丢包转 unknown、operation.get 恢复与世代隔离（8项用例） | PASS |
| 全量门禁回归 | `tools/check-all.cjs` 全量 7/7 门禁（251 项回归测试 100% 通过） | PASS |

## 2. 详细测试证据

```text
CHECK: tooling contracts
✔ an explicit installed toolchain reports its versions without claiming checks ran
✔ the check command reports a missing explicit compiler instead of downloading one
✔ toolchain preflight cannot silently suppress a requested type check
✔ the existing UI check fails locally when the compiler is missing
✔ an unsupported compiler in a path containing spaces fails before running checks
✔ the existing model check never falls back to a package-manager download
✔ a project with a semantic type error fails the type gate instead of passing transpilation
PASS: tooling contracts

CHECK: shared/backend types
Node 24.19.0; TypeScript 5.8.2; compiler C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar.unpacked\node_modules\typescript
PASS: shared/backend types

CHECK: shared value contracts
PASS: shared value contracts

CHECK: client pure-model types
Node 24.19.0; TypeScript 5.8.2; compiler C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar.unpacked\node_modules\typescript
PASS: client pure-model types

CHECK: backend regression (legacy and v2)
✔ isMailExpired evaluates boundaries accurately
✔ canDeleteMail enforces protection when unclaimed attachments exist
✔ calculateStackClaimQuantity computes available capacity and partial delivery
✔ canClaimEquipmentAttachment checks backpack slot availability
✔ mail.markRead sets readAt and increments version without modifying createdAt
✔ mail.delete rejects UNCLAIMED_ATTACHMENTS and succeeds only when all attachments are claimed
✔ mail.claimAttachment supports partial delivery for stackables and full delivery for equipment
✔ mail.claimAttachment rejects MAIL_EXPIRED when now >= expiresAt
✔ reward.claim materializes pending equipment into backpack and never expires
✔ mail.list, reward.list, and delivery.summary queries accurately report state
✔ idempotency: replaying same operationId returns original outcome
✔ mail coordinator initializes and transitions from loading to ready
✔ mail coordinator schedules markRead and updates mail state
✔ mail coordinator schedules claimAttachment and updates attachment status
✔ mail coordinator schedules claimReward and updates reward state
✔ mail coordinator schedules deleteMail and removes mail
✔ mail coordinator transitions to failed on rejected outcome
✔ mail coordinator handles network drop to unknown and recovers via operation.get
✔ mail coordinator generation isolation drops late responses after close
ℹ tests 251, pass 251, fail 0
PASS: backend regression (legacy and v2)

CHECK: client model regression
PASS: client model regression

CHECK: client UI-model regression
ALL UI MODEL TESTS PASSED (100% SUCCESS)
PASS: client UI-model regression

SUMMARY: 7/7 checks passed.
```

## 3. 验收标准与交付物核对

- [x] **AC5**: 邮件具备 30 天到期时效，精确按 `now >= expiresAt` 判定；标记已读记录 `readAt`，严禁篡改 `createdAt`；防手删规则拦截未领完附件删除，保留来源存根。
- [x] **AC8**: 堆叠道具按背包剩余容纳量支持部分领取，余量安全保留在附件中；装备道具满包拒绝（`BAG_FULL`），有空格整件物化入包。
- [x] **AC12**: 满包通关暂存的待领装备永久有效，无到期倒计时；领取时校验背包空格并原子入包，保持原始生成的同一实例 `itemId` 与属性完全不变。
- [x] **US6**: 邮件列表与待领列表倒序排列；HUD 徽标提供未读邮件与待领数量；客户端纯模型协调器提供完整操作与恢复。
