# ST19-03 实现与验证

日期：2026-11-02
实现分支：`feat/st19-03-fixed-sample-fallback`，基点 `03fe4a9`。
范围：固定样本重映射、全齐平滑回退与提交不可变性。包含 `sourceKey` 与配置哈希确定性样本生成；并发 OCC 冲突重试未提交候选重映射且基础样本不漂移；11 部位全齐平滑回退机制；首次事务提交后装备实例、pending grant 与原回执 `clearReceipt` 绝对不可变及丢包重试幂等返回。
来源：[ST19 实施规格](../stories/warrior-loop/st19/spec.md)、[03 实施任务](../stories/warrior-loop/st19/issues/03-fixed-sample-fallback.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **确定性基础样本生成与重映射（`backend/src/challenge/drop-strategy.ts`）**：
   - 导出 `deriveDropSample(sourceKey: string, configRefOrHash: string): Promise<number>`：由 `sourceKey` 与配置 ref/hash 经 SHA-256 确定性生成无符号 32 位整型随机样本，保证无论重试多少次基础随机样本绝对固定；
   - 导出 `remapCandidate(profile: DropStrategyProfile, fixedSample: number, context: DropStrategyContext): DropCandidate`：在并发 OCC 冲突重试时，同笔持有版本变化时重算 `missingCandidates`，并利用完全固定的 `fixedSample` 进行重映射，严禁重新抽样（防止样本漂移）；
   - 更新 `selectCandidateByStrategy`：对 `missing-slot-first` 与 `weighted-missing-first` 均实现 11 部位全齐平滑回退，当 `missingCandidates.length === 0` 时，安全降级调用 `fallbackStrategy`（默认 `weighted-random`）均匀发放合法套装部位，绝不报错、卡死或拒发。

2. **终局结算提交后绝对不可变性（`backend/src/challenge/terminal-settlement.ts`）**：
   - 更新 `planClear(tx, c, bag, challengeId, config, now, source, fixedSample?)`：
     - 查询已存在的 `itemId`（`loginKey('equipment', [challengeId, 'clear-equipment'])`）；
     - 若已存在，判定为首次事务提交已物化，幂等读取既有装备实体，计算 `route`（`direct` 或 `pending`），直接返回原有装备快照，不产生二次写入、不重复插入背包、不重复创建待领；
     - 若不存在，使用 `fixedSample ?? await deriveDropSample(sourceKey, config.ref)` 执行确定性物化；
   - 配合 `ChallengeService` 的 actionReceipt 与 `EntryChallenge.clearReceipt`，确保网络丢包与重复重试时幂等返回原回执（`replayed: true`）。

3. **定向独立测试套件（`backend/test/drop-fixed-sample-fallback.test.mjs` 6/6 全部通过）**：
   - `deriveDropSample: deterministically generates identical base sample from sourceKey and configRef without drift`：验证同源同配多轮计算完全一致，异源或异配计算结果确定性不同；
   - `OCC conflict retry: base sample stays strictly fixed, candidate remaps smoothly to remaining missing slot`：模拟并发 OCC 事务，在第一轮未提交且持有版本更新后，传入相同的固定样本成功重映射至剩余缺件；
   - `11-piece full set smooth safe fallback: delegates to fallbackStrategy without error or rejection`：验证集齐全部 11 个部位时，`missing-slot-first` 与 `weighted-missing-first` 均平滑降级至 `weighted-random` 并覆盖全部 11 部位；
   - `End-to-end full 11-piece collection progression followed by 12th clear smooth fallback`：模拟从 0 件逐轮通关收集至 11 件全齐，第 12 轮通关安全触发平滑回退并正常发放套装部件；
   - `Terminal settlement immutability: planClear returns cached receipt idempotently on repeat calls`：验证首次物化后，对同一 challengeId 再次调用 `planClear` 幂等返回既有装备与路由，无二次写入；
   - `ChallengeService submission idempotency: packet replay returns exact clearReceipt with replayed: true`：验证重复提交 simulation.submit 时原样返回原回执快照，且 `replayed: true`。

## 验证证据

1. **定向测试套件（`backend/test/drop-fixed-sample-fallback.test.mjs` 6/6 全部通过）**：
   - `deriveDropSample` 稳定性与异构性断言通过；
   - OCC 并发冲突重试时基础样本无漂移且候选重映射断言通过；
   - 11 件全齐平滑回退随机策略发放通过；
   - 0 到 11 件逐轮收集及第 12 轮全齐回退大闭环通过；
   - 终局结算计划 `planClear` 幂等不可变通过；
   - 服务级网络丢包重放幂等断言通过。

2. **跨模块关联回归套件（37/37 全部通过）**：
   - `backend/test/drop-strategy.test.mjs`：8/8 通过；
   - `backend/test/drop-fixed-sample-fallback.test.mjs`：6/6 通过；
   - `backend/test/holdings-multi-scope.test.mjs`：6/6 通过；
   - `backend/test/repair-cocos.test.mjs`：8/8 通过；
   - `backend/test/boss-clear.test.mjs`：9/9 通过。

3. **全量 7 阶段门禁检查（`tools/check-all.cjs` 7/7 全部通过）**：
   - Stage 1: TypeScript backend compilation (TS 5.8.2) - Exit Code 0
   - Stage 2: TypeScript tools compilation - Exit Code 0
   - Stage 3: Code formatting check (`git diff --check`) - Pass
   - Stage 4: Tooling tests (`tools/test/*.test.cjs`) - Pass
   - Stage 5: Backend regression tests - 861/861 passed, 0 failed
   - Stage 6: Client model regression - Pass
   - Stage 7: Client UI-model regression - 100% Pass

## 边界与已知限制

- 仅交付固定样本重映射、全齐平滑回退与提交不可变性。
- 套装变动生命周期联动（出售/损毁恢复缺件）与客户端套装收集展示留待 ST19-04；
- 全链路大闭环联合验收、预算实测与两轴独立评审留待 ST19-05；
- 无 Jira、未向远程 push。
