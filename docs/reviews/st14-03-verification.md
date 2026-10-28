# ST14-03 本地验证报告

- 日期：2026-10-28
- 分支：`feat/st14-03-timeout-exit`
- 基础基线：`3d638c8`
- 来源规格：`docs/stories/warrior-loop/st14/spec.md` (SHA256: `185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12`)
- 对应票据：`docs/stories/warrior-loop/st14/issues/03-failure-timeout-and-exit.md` (SHA256: `0f854820d62e43545cfd9c7ffcbc38b47853214e4c624dbb6c1a09db826bcb32`)

---

## 1. 实际交付内容

1. **协议层原因扩充与校验一致性**：
   - 更新 `shared/src/protocol/types.ts` 与 `shared/src/protocol/scene-v2.ts`：`challenge.leave` 请求载荷的 `reason` 扩充为 `'abandon' | 'finishLoot' | 'deathTimeout'`。
   - 更新 `backend/src/application/validation.ts` 与 `backend/src/application/game-service.ts`：校验逻辑同步支持 `'deathTimeout'`。

2. **真实 ChallengeService 退出处理与终态流转 (`backend/src/challenge/challenge-service.ts`)**：
   - 接入 `challenge.leave` 业务命令路由，包含 `assetOp` 操作幂等收据保护和写冲突重试。
   - 场景关闭与不可逆失败终态：
     - 主动放弃（`reason: 'abandon'`）或倒计时超时（`reason: 'deathTimeout'`）时：
       若 `h.result === 'active'`，原子流转为 `result = 'failed'`；
       `sceneState = 'closed'`，`roomPhase = 'closed'`；
       清除死亡倒计时、准备尝试与过渡时钟；
       若已激活房间，将 `RoomCheckpointHeader` 标记 `acceptingInputs = false, closedAt = now`。
     - 拾取完成（`reason: 'finishLoot'`）：要求挑战必须已处于 `h.result === 'completed'`，否则拒绝 `INVALID_ARGUMENT`；正常退出时保持 `result = 'completed'`。

3. **体力不退还与收益保留规则**：
   - 在挑战过程中扣减的房间入场体力（`staminaSnapshot.remaining`）在退出结算时不作退还。
   - 结算体力时将 `challenge.staminaSettlement` 原子标记为 `state = 'settled'`，生成持久结算凭据 `staminaSettlementRef`。
   - 挑战期间击杀怪物已累加的角色经验（XP）与已拾取的背包掉落物全额保留在角色实体中。
   - 自然跨时间窗口（4小时刷新窗口）时，遵循全局规则恢复至 308 体力。

4. **落点分流（在线正常退出 vs 离线/重新登录）**：
   - **在线正常退出**（调用 `challenge.leave`）：角色落回城镇对应副本传送门坐标（`location = { kind: 'town', mapId: d.mapId, anchorId: 'dungeon:' + d.dungeonId }`），位置同步至 `d.anchor.x, d.anchor.y`，递增 `locationRevision`，清除体力锁定与饰品临时冷却。
   - **离线/重新登录**（会话中断/过期/断线重连）：通过 `LoginService.login` 触发 `login-handoff`，角色落点安全回退至个人旅店空间（`location = { kind: 'inn', characterId }`），重置为 `roleState.kind = 'inn'`。
   - 关闭场景后清除账号实体的 `openSceneChallengeId` 与 `activeChallengeId`。

5. **倒计时超时判败与生命周期拦截**：
   - 在 `this.expire` 检查中，当物理时钟跨越 `deathDeadline`（`now >= h.deathDeadline`）时，自动触发场景关闭并将挑战标记为 `failed` 与 `closed`。
   - 超时后调用 `challenge.revive` 直接返回 `DEADLINE_EXPIRED`，零扣除复活纹章，并在存储中持久化该拒绝收据保证幂等重放。

6. **严格的状态机与不可逆屏障**：
   - 失败终态不可逆：一旦挑战关闭，后续发送新的复活请求拒绝 `CHALLENGE_TERMINAL`，发送新的退出请求拒绝 `SCENE_CLOSED`，发送新的换房/激活请求均阻断。
   - 幂等重放：同一 `operationId` 的重放请求幂等返回原提交/拒绝响应，标记 `replayed: true`。

---

## 2. 自动化验证证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**（无头运行，**严格未打开任何浏览器**）。

### 专项测试套件 (`backend/test/challenge-leave-timeout.test.mjs`)
- `✔ 1. explicit challenge.leave with reason abandon safely terminates challenge as failed, sets town portal location, and preserves loot/xp without refunding stamina (58ms)`
- `✔ 2. explicit challenge.leave with reason deathTimeout safely transitions dead player to failed/closed and returns to town (16ms)`
- `✔ 3. death countdown timeout: challenge.revive at or after deathDeadline returns DEADLINE_EXPIRED, transitions challenge to failed/closed, and zero emblems deducted (16ms)`
- `✔ 4. idempotency: replaying challenge.leave or expired revive with same operationId returns original response with replayed: true (15ms)`
- `✔ 5. terminal barrier: once challenge is closed, subsequent illegal actions are blocked (16ms)`
- `✔ 6. offline / re-login scenario hands off character to inn space, not town portal (15ms)`
- `✔ 7. challenge.leave with reason finishLoot requires result completed, and preserves completed status (13ms)`
- `✔ 8. stamina natural window rollover: if refill window passed during challenge, stamina refills to 308 on leave (14ms)`
- **全部 8/8 通过，耗时 425ms**。

### 协议测试套件 (`shared/test/scene-v2.test.mjs`)
- `✔ challenge and ground commands express intent and cannot supply drops or revive outcomes`（覆盖 `abandon`, `deathTimeout`, `finishLoot`）
- **全部 6/6 通过**。

### 全量门禁套件 (`tools/check-all.cjs`)
- TypeScript 类型检查：PASS
- Backend 回归测试：PASS（**633 个测试用例全部通过，0 失败**）
- Client Model 回归测试：PASS
- Client UI-Model 回归测试：PASS
- **7/7 门禁全绿通过**。

---

## 3. 两轴独立复核与声明

- **Spec 轴**：逐项对照 `docs/stories/warrior-loop/st14/spec.md` 及 03 票据全部验收标准，包括死亡超时判败、主动放弃原因分流、零扣款/零返还体力、在线回城传送门落点与离线回旅店落点、终态屏障与幂等重放，全部满足。
- **Standards 轴**：
  - 无 Jira 产生、无外部发布调用、无云端或外部依赖安装。
  - 纯无头 Node CLI 自动化运行，严格未调用任何浏览器操作。
  - 符合设计真相源（`docs/backend/source-of-truth.md`）中的挑战生命周期与落点合同。
  - 交付证据如实记录，无降级为批准代替验证。
