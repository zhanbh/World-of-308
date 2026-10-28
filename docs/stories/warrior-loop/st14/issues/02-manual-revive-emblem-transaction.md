---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st14-02
status: accepted
revision: "4b4010b47eca258b3d4f263a1cf1c3a691bd22dce0c32b5e56bbcab50d82f13a"
accepted_revision: "4b4010b47eca258b3d4f263a1cf1c3a691bd22dce0c32b5e56bbcab50d82f13a"
derived_from:
  - artifact_id: spec:warrior-loop-st14
    revision: "185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12"
    path: docs/stories/warrior-loop/st14/spec.md
implements: [ST14]
blocked_by: [1]
approval_kind: human
approval_evidence: "好的，开始"
---
# ST14-02 手动复活、纹章扣除与冷却/状态重置事务

依赖 01。交付：通过真实 ChallengeService 事务接收 `challenge.revive`，校验有效期限与次数，原子扣除复活纹章并重置角色状态。

- 校验 `challenge.result === 'active'`、`lifeState === 'dead'`、`deathIndex` 一致性以及 `now <= deathDeadline`；超时严格拒绝 `DEADLINE_EXPIRED` 且零扣费。
- 消费背包中 1 枚 `resurrection-emblem`，按角色绑定→账号绑定→未绑定优先级扣除；无可用纹章报 `EMBLEM_NOT_ENOUGH`。
- 校验特殊副本挑战累计复活上限（`paidRevives < config.reviveLimit`，上限为 3 次），超限拒绝 `REVIVE_LIMIT_REACHED`。
- 原子重置状态：`lifeState = 'alive'`、`paidRevives++`、清除 `deathDeadline`、赋予 2.0 秒保护（`protectionUntil = now + 2000`）、恢复满血满蓝（`restore: 'fullHpMp'`）。
- 技能与道具 CD 分流：重置 4 个职业主动技能 CD（`bengshan`, `badao`, `cross`, `earth`），保留战斗药水与主动饰品的现有 CD。
- 幂等重放与并发安全：同 operationId 幂等返回原结果，并发复活请求只扣 1 枚纹章，写冲突时自动重试。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
