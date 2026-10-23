---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st07-04
status: accepted
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st07
    revision: 1fceb0768f1fea2f27e60b3fdbc411f767da432d47cebf065626d01c6aee3a13
    path: docs/stories/warrior-loop/st07/spec.md
implements: [st07-mail-and-pending-rewards]
blocked_by: [1]
---
# 04：`reward.claim` 永久待领装备领取事务服务

**What to build:**
实现永久待领装备的原子物化入包服务（`backend/src/mail/mail-service.ts` 或 `reward-service.ts`）：
1. **模型定义与永久有效保证**：
   - 待领凭据 `RewardGrantEntity`（`route = 'pending'`, `deliveryState = 'available' | 'delivered'`）；
   - 待领装备实例预先存在，其 `location = { kind: 'pending', grantId }`；
   - 规则保证：永久待领绝不套用 30 天到期规则，不设自动到期时间，不设数量硬上限导致拒领。
2. **`reward.claim` 命令逻辑**：
   - 校验会话、邮箱服务上下文（`contextId`）、角色归属与 `grantId` 存在性；
   - 若 `grant.deliveryState === 'delivered'`，拒绝 `ALREADY_DELIVERED`；
   - 校验角色背包可用空间：若背包无空闲槽位，整笔拒绝 `BAG_FULL`，不改变 grant 与装备状态；
   - 装备入包转移：
     - 将关联装备实例的 `location` 从 `{ kind: 'pending', grantId }` 原子改为 `{ kind: 'container', containerId: backpack.id }`；
     - 在背包 `slots` 中分配空槽位；
     - 保持原有装备的词条、属性、强化与装等完全不变，绝不重新随机构造第二份实例；
     - 更新 `grant.deliveryState = 'delivered'`, `grant.deliveredAt = currentTime`；
     - 装备版本自增、背包版本自增、grant 版本自增；
   - 写入单笔 `assetJournal` 流水与 `operation` 原操作记录。

**Blocked by:** 01。

## Acceptance criteria

- [x] 待领装备无到期倒计时，跨越 30 天后依然处于 `available` 状态且可正常领取。
- [x] 背包满时领取拒绝 `BAG_FULL`，待领状态与装备位置不变。
- [x] 背包有空位时领取成功，装备位置转为背包对应槽位，待领状态变为 `delivered`。
- [x] 绝不重新生成装备实例，保持原始生成的同一实例 `itemId` 与属性不变。
- [x] 严禁跨角色领取他人或本账号其他角色的待领装备。

## Tests and evidence

- 待领领取测试 `backend/test/mail-service.test.mjs`。
- 满包拒绝断言与背包腾出空间后成功领取验证。
- 实例物化指针变更前后一致性断言（itemId、词条守恒）。
- 超过 30 天（如 100 天后时间戳）成功领取断言。
- 已领取待领重领拒绝（`ALREADY_DELIVERED`）与幂等操作恢复测试。
