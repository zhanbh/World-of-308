# ST14 死亡、复活与失败退出联合验收、极端竞争预算与两轴独立评审报告

## 1. 任务背景与交付综述

- **功能模块**: `ST14` 死亡、复活与失败退出（`warrior-loop-st14`）
- **对应规格**: `docs/stories/warrior-loop/st14/spec.md` 及全部 5 项子任务（ST14-01 至 ST14-05）
- **评审对象**: 当前工作树代码 HEAD 及完整回归状态
- **验收原则**:
  - 遵循 `AGENTS.md` 工程约束：本地文档管理规格、任务与验收，无 Jira、无外部发布、无依赖安装、无云操作；
  - 一切证据、测试与决定保留在本地文档内；
  - 严禁打开或自动化外部浏览器，全流程纯无头 Node 24.22.1 CLI 执行；
  - 真实 MemoryStore 读写与两阶段乐观并发控制，严禁合成假 mock；
  - Standards 轴与 Spec 轴分别独立审查，归档未覆盖的平台与设备 GAP。

---

## 2. 两轴独立评审详细核对

### 2.1 Standards 轴（架构一致性、工程规范与契约）

| 审核项 | 规范要求 | 实际实现与证据 | 评审结论 |
| :--- | :--- | :--- | :--- |
| **权威判定单向流动** | 死亡状态必须由服务端战斗判定唯一决定；客户端只读展示，严禁前端虚报或伪造死亡 | 战斗内核伤害计算直接触发 `lifeState: 'dead'`、`deathIndex` 递增与 10.0s 物理 deadline 锚定，客户端输入被强行切断 | **PASS** |
| **时钟与倒计时确定性** | 倒计时以逻辑时钟 / 权威时间戳为准，客户端平滑差值插值，严禁纯本地计时导致错位 | 服务端以 `deathDeadline = now + 10000` 强校验；客户端由 `DeathReviveHUDModel` 统一驱动 `remainingSec` | **PASS** |
| **资产与事务守恒** | 复活纹章扣除必须与复活状态变更、CD 重置在同笔事务内原子完成，严禁只扣不活或活了不扣 | `ChallengeService.revive` 事务内完成 `chosen.quantity -= 1`、`cp.role` 全满重置、`paidRevives` 递增与 `assetOp` 幂等凭证落盘 | **PASS** |
| **幂等回放保证** | 重复请求、超时请求必须记录确定性凭证，再次发送返回一致结果，严禁重复扣费 | `assetOp` 缓存成功与拒绝收据；跨 deadline 请求被拒绝并缓存，重放时返回同一 `DEADLINE_EXPIRED` 拒绝且零扣款 | **PASS** |
| **敏感数据与无头测试** | Cocos UI 模型纯逻辑解耦，无 DOM/引擎硬依赖；离线无头测试 100% 覆盖 | `DeathReviveHUDModel` 纯 TypeScript 实现，通过 `check-ui-model.cjs`、`check-model.cjs` 纯无头执行，无任何浏览器启动 | **PASS** |
| **代码与分支规范** | 中性 Git 分支名（严禁 `codex/`），提交信息中性可读 | 采用 `feat/st14-05-joint-acceptance`，提交前全部通过 7/7 门禁检查 | **PASS** |

### 2.2 Spec 轴（ST14 业务规格全集核验）

| 规格条款 | 业务规则 | 验证用例与证据 | 评审结论 |
| :--- | :--- | :--- | :--- |
| **01 权威死亡判定与物理10s倒计时** | 致命伤害立即死；死亡禁止移动/普攻/技能/药品/自然回蓝；残留出血继续跳字；10s deadline 锚定 | `death-window-joint.test.mjs` (4/4)<br>`check-model.cjs` CombatModel death check | **PASS** |
| **02 手动复活与纹章事务** | 背包优先扣角色绑定再账号绑定；满血满蓝；2.0s 无敌；战士 4 技能 CD 重置；药品/饰品 CD 保持 | `challenge-revive.test.mjs` (9/9)<br>`challenge-death-joint-acceptance.test.mjs` | **PASS** |
| **03 倒计时超时判败与主动放弃** | 超时或主动放弃使挑战置为 `failed`；场景关闭；体力落盘不退还入场费；保留已有经验与掉落；回城传送门落点 | `challenge-leave-timeout.test.mjs` (8/8)<br>`scene-v2.test.mjs` (6/6) | **PASS** |
| **04 Cocos 死亡复活 HUD** | 居中 10s 倒计时条；实时纹章与次数上限展示；【立即复活】与【放弃退出】；金色神圣光环；黑屏渐隐转场 | `check-ui-model.cjs` Test 9 (100% SUCCESS)<br>`DeathReviveHUDModel.ts` | **PASS** |
| **05 极端竞争用例全量覆盖** | 1. 跨 deadline 1ms 拒绝且零扣款<br>2. 死亡 8s 残留杀 Boss 通关免费复活且不扣纹章<br>3. 死亡升级保持死亡不隐式回血<br>4. 特殊副本 3 次限制拒绝第 4 次<br>5. 0 纹章阻断提示<br>6. 断线重连剩余时间恢复 | `challenge-death-joint-acceptance.test.mjs` (6/6 全部通过) | **PASS** |

---

## 3. 极端竞争用例与预算度量实测

在 `backend/test/challenge-death-joint-acceptance.test.mjs` 中对 ST14 规定的 6 大极端并发与边界场景进行了严格测试：

1. **极端竞争 1：最后一毫秒复活请求跨越 deadline**
   - 死亡时间 `t = 5000`，deadline `t = 15000`；请求到达时间 `t = 15001`。
   - 实测：响应返回 `status: 'rejected', code: 'DEADLINE_EXPIRED'`；纹章数量保持 5 不变（零扣款）；重放返回相同拒绝凭据；角色保持死亡。
2. **极端竞争 2：死亡窗口第 8 秒残留击杀 Boss 与手动复活请求并发**
   - 玩家死亡进入 10s 倒计时；在 `t = 13000`（第 8 秒）Boss 被残留伤害击杀，副本完成通关。
   - 并发手动复活请求在 `t = 13050` 到达；实测：拒绝复活（`CHALLENGE_TERMINAL` 或 `NOT_DEAD`），纹章保持 3 不变（零扣款），杜绝副本已通关时误扣纹章。
3. **极端竞争 3：死亡期间击杀小怪升级**
   - 玩家处于死亡状态（`hp: 0, lifeState: 'dead'`），残留伤害杀死小怪奖励 1000 XP 触发角色升级（Level 1 -> 2）。
   - 实测：角色等级正确升至 2，但玩家状态严格保持 `lifeState: 'dead'` 且 `hp: 0`，绝不隐式复活或回血。
4. **极端竞争 4：特殊副本 3 次复活后第 4 次死亡拒绝**
   - 特殊副本已复活 3 次（`paidRevives = 3`）；在第 4 次死亡时发起复活请求。
   - 实测：响应拒绝并返回 `REVIVE_LIMIT_REACHED`；纹章数量保持 10 不变（零扣款）。
5. **极端竞争 5：背包无纹章时的阻断与提示**
   - 背包内无任何复活纹章；发起复活请求。
   - 实测：响应拒绝并返回 `EMBLEM_NOT_ENOUGH`；角色与副本状态未发生任何污染，客户端 HUD 置灰按钮并展示“纹章不足”。
6. **极端竞争 6：断线重连处于死亡窗口中的状态同步与倒计时剩余时间恢复**
   - 玩家在 `t = 5000` 阵亡，deadline 为 `t = 15000`；客户端断线，在 `t = 11000`（过去 6s）重连。
   - 权威快照读取：`lifeState: 'dead', deathDeadline: 15000, now: 11000`。
   - HUD 重建计算：`remainingMs = 4000ms (4.0s)`，进度条精准恢复至 40%，继续平滑推进并在剩余 4 秒后触发超时退出。

---

## 4. 剩余平台与环境 GAP 归档（明确保留）

根据 ST14 规格边界，以下非本地自动化范畴项作为独立 GAP 归档，后续由专门的平台/数值切片承接：

1. **GAP-1: 微信小游戏 SDK 运行时与网络层**
   - 包含 `wx.request`、本地缓存文件大小限制、真机小游戏冷热启动切换等。本地以 Node.js 24 无头 CLI 协议驱动。
2. **GAP-2: 真实生产数据库与跨机房网络延迟**
   - 包含真实 DynamoDB/Redis 网络 IO 抖动、分布式锁 lease 失效、高丢包弱网长连接断线重连。本地以确定性 `MemoryStore` 验证事务语义。
3. **GAP-3: 三星 Galaxy Note20 Ultra 硬件性能与物理触控手感**
   - 包含 120Hz 屏幕触控采样率、双拇指握持阻挡盲区、高温降频帧率稳定性。本地以 Cocos 纯逻辑热区模型验证。
4. **GAP-4: 正式商业化数值平衡表**
   - 包含复活纹章商城售价、特殊副本产出概率。当前使用显式 `local-test` 候选表。

---

## 5. 评审决定

- **评审结论**: **联合验收全部通过（APPROVED）**
- **建议动作**:
  1. 将 `docs/stories/warrior-loop/st14/execution.json` 中的 `ST14-05` 标记为 `verified`，并将全特性 `status` 推进为 `completed`；
  2. 合并工作树分支 `feat/st14-05-joint-acceptance` 至主集成分支 `feat-1.0.0`；
  3. 执行 `git push origin feat-1.0.0` 推送交付。
