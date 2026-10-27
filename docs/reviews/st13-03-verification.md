# ST13-03 混合战斗补给（同刻顺序、换房与原操作恢复）验证报告

## 1. 任务背景与验收标准

- **任务编号**: `ST13-03`
- **对应规格**: `docs/stories/warrior-loop/st13/spec.md` Section 03
- **实现范围**:
  1. **同刻顺序与技能起手**: 同刻先结算到期状态与药品/饰品效果，再结算伤害节点与新技能起手。同刻补蓝使原本 MP 不足的技能可以立即合法起手。
  2. **快照属性保护与到期不反算**: 同刻先激活饰品增强属性，技能起手快照捕获增强后的攻击力（AP）；饰品增益到期恢复基线属性后，原技能快照造成的伤害与流血预算不反算。
  3. **失败动作隔离**: 满血/满蓝用药拒绝（`HP_FULL` / `MP_FULL`）等非法或失效动作生成 `actionRejected`，不扣除库存、不触发 CD，且不吞后续合法的技能与位移输入。
  4. **受控状态补给**: 角色处于硬直/击倒（`knockdown`）受控状态时，允许使用补给（回血、激活饰品属性），但绝不解除受控状态、不取消职业技能锁、不赋免伤。
  5. **换房连续性**: 换房流程（`challenge.prepareRoom` -> `challenge.activateRoom` -> `scene.ready`）完整保留角色的 active buffs 与 cooldowns；联网加载时钟按固定逻辑速率推进耗时，房间重置后增益与冷却完好延续。
  6. **短恢复公开投影**: `scene.recoveryPage` 查询在公开投影中完整暴露 active buffs 与 active cooldowns。
  7. **死亡与回城生命周期**: 角色死亡立即清空 buffs，但保留 CD（CD 生效期间装备卸下被锁守卫拒绝 `LOCATION_NOT_ALLOWED`）；回城进客栈（`handoff`）彻底清空角色饰品 CD。
  8. **原操作幂等重放**: 重放完全相同的原操作（`operationId`）直接返回原始结果，不重复扣除背包库存，不刷新冷却时间。

---

## 2. 验证证据与测试覆盖

集成测试套件：`backend/test/battle-hybrid-supply.test.mjs`（8/8 用例全部通过）

1. `same-tick MP potion restore enables insufficient MP Cross Slash cast`:
   - 玩家初始 MP 为 5（不足十字斩所需的 10 MP）。
   - 同刻输入序列：[MP 药, 十字斩]。
   - 验证：先补蓝 (+40 MP -> 45 MP)，再起手十字斩 (-10 MP -> 35 MP)，十字斩处于释放中状态（`cast !== null`，`castSequence === 1`），MP 药启动 10s CD，背包库存从 5 扣减为 4，两者均生成 `actionAccepted`。
2. `same-tick trinket activation boosts skill cast AP snapshot; expiry retains snapshot damage`:
   - 同刻输入序列：[饰品激活, 十字斩]。
   - 验证：先激活战神荣耀徽记（AP +150），十字斩起手快照成功捕获增强后的 `1150` AP；推进 1600 ticks（16s）跨过 15s 持续时间，buff 自动修剪，面板 AP 恢复基线 1000。
3. `failed supply action (HP_FULL) does not swallow subsequent legal skill and movement`:
   - 玩家满血时输入：[HP 药, 十字斩, 移动]。
   - 验证：HP 药被拒绝并生成 `actionRejected: HP_FULL`，不扣除库存不启动 CD；后续十字斩成功起手并被接受，位移正常推进。
4. `supply is usable during knockdown control without clearing control state`:
   - 玩家处于 `actionId: 'knockdown'` 倒地状态。
   - 输入：[HP 药, 饰品激活]。
   - 验证：生命值提升 (+150)，饰品 buff 成功获得，但玩家依然处于 `knockdown` 状态，不解控。
5. `room transition preserves buffs & CDs and advances duration deterministically`:
   - 在房间 0 击杀所有怪物，激活饰品；执行 `prepareRoom` -> `activateRoom` -> `scene.ready` 换房至房间 1。
   - 验证：进入房间 1 后，初始 Checkpoint 中饰品 buff 仍然存活（`endsAtTick: 1501`），面板属性为 `1150`，CD 完好保留（`readyAtTick: 12001`）。
6. `recoveryPage query exposes active buffs and cooldowns in public projection`:
   - 激活饰品后，调用 `scene.recoveryPage` 查询。
   - 验证：公开投影 records 中包含有效的 `buff` 记录与 `cooldown` 记录。
7. `death clears buffs and keeps CD; return to inn resets character cooldown`:
   - 激活饰品后角色死亡，验证 buffs 清空，但 CD 保留，且 `equipment.unequip` 因冷却未结束而被拒绝；执行 `handoff` 回城后，角色 `trinketCooldownUntil` 被完全清空。
8. `idempotent replay does not double-deduct inventory or refresh cooldown`:
   - 提交补给操作后，重放相同操作；验证 `replayed: true`，背包库存保持 4（无重复扣减），Action Results 稳定返回原结果。

---

## 3. 全量回归结果

- 全量检查脚本：`node tools/check-all.cjs --typescript ...`
- 结果：**7/7 checks passed**
  - 后端回归测试（涵盖新旧系统、战斗、补给、银行、挑战、装备、怪物）：**610 / 610 passed**
  - 客户端与 UI 模型回归：**100% SUCCESS**
