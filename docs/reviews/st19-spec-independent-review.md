# ST19 Spec 独立规格轴评审

日期：2026-11-03。
评审者：独立 Spec 评审 Agent（独立于 ST19 开发实施过程）。
评审分支：`feat/st19-05-joint-acceptance`，准备合入主干 `feat-1.0.0`。
评审依据：[ST19 实施规格](../stories/warrior-loop/st19/spec.md)、[任务分解图](../stories/warrior-loop/st19/task-plan.md) 及 [原业务故事](../stories/warrior-loop/st19.md)。

## 验收准则（AC19-1 ～ AC19-8）逐项核验

### AC19-1：缺失槽位优先掉落与满件平滑降级（Missing-Slot-First Strategy & Fallback）
- **规格要求**：支持配置 `strategyProfile`，缺件时优先定向抽取缺失槽位候选装备；当 11 部位已完全收集时，自动平滑回退至备选策略（如 `weighted-random`）正常抽取，不发生报错、拒绝或停滞。
- **核验证据**：
  - `backend/src/challenge/drop-strategy.ts` 实现了完整的 `selectCandidateByStrategy` 与 `isCandidateMissing` 判定逻辑；
  - `drop-strategy.test.mjs` 与 `drop-joint-acceptance.test.mjs` 验证：从 0 件到 11 件通关过程中，每次均定向掉落当前缺失槽位，连续 11 次无任何重复槽位；
  - 11 件全满后进行第 12 次通关，算法平滑委托至 `weighted-random`，无任何异常抛出。
- **核验结论**：**PASS**。

### AC19-2：账号金库跨角色共享与多角色持有隔离（Account Vault Cross-Character Sharing & Isolation）
- **规格要求**：支持角色级（`scope: character`）与账号级（`scope: account`）两级持有投影；放入账号金库的套装装备被同一账号下所有角色共享计为已收集；私有背包装备严格隔离，不同角色不跨界读取他人背包私有装备。
- **核验证据**：
  - `BankService.execute('inventory.transfer')` 支持将套装装备转入 `accountVault`，并原子同步 `v2:holdings:{accountId}:account`；
  - `drop-joint-acceptance.test.mjs` 测试中，角色 1 将战神鞋子转入账号金库后，角色 2 上下文中 `isCandidateMissing(bootsCandidate, contextChar2)` 判定为 false（共享生效）；而角色 1 背包内的私有武器在角色 2 下仍判定为 missing（隔离生效）。
- **核验结论**：**PASS**。

### AC19-3：生命周期扣减与即时恢复缺失（Holdings Synchronization on Sale & Destruction）
- **规格要求**：当玩家在商店出售（`shop.sell`）或强化失败永久损毁（+13~+20）最后一件同部位套装装备时，持有投影立即扣减永久持有计数；再次通关或查询时，该槽位即时恢复为缺失状态并重新进入保底掉落优先级。
- **核验证据**：
  - `ShopService.execute('shop.sell')` 在出售装备时调用 `groundHoldings` 自动递减角色对应持有项的 `permanentCount`；
  - `EnhancementService` 在高段强化失败损毁装备时，原子递减持有投影并更新；
  - `drop-joint-acceptance.test.mjs` 验证出售鞋子后，boots 立即重置为 missing，并在下一次通关结算中优先重新掉落 boots 补齐。
- **核验结论**：**PASS**。

### AC19-4：11 槽位套装收集界面协调器（CollectionCoordinator Model & Visual Logic）
- **规格要求**：纯模型协调器统一维护 11 装备部位字典（武器、肩甲、上衣、裤子、腰带、鞋子、手镯、项链、戒指、辅助装备、魔法石）；提供进度文本 `X/11`、点亮/灰显状态、通关回执即时反馈（`latestAwardedSlot`、`isNewCompletion`）以及代次隔离。
- **核验证据**：
  - `client/assets/scripts/net/CollectionCoordinator.ts` 定义了标准 11 槽位映射 `SET_SLOT_DEFS`；
  - `collection-lifecycle-ui.test.mjs` 验证协调器状态机完整覆盖关闭、加载、就绪、失败等生命周期；
  - 通关回执注入后立即高亮最新掉落部位并递增收集计数；面板关闭后旧代次迟包严格被过滤屏蔽。
- **核验结论**：**PASS**。

### AC19-5：物理事务预算硬约束验证（Physical Transaction Limits）
- **规格要求**：终局结算物理事务在最重极限场景（13 件穿戴磨损、100 格满背包、11 件候选池、6 封升级邮件、8 块 Checkpoint 块）下，读/写/调用/字节严格满足硬上限。
- **核验证据**：
  - `drop-joint-acceptance.test.mjs` 实测结果：
    - R: 42 $\le 44$（通过）；
    - W: 33 $\le 33$（通过）；
    - Calls: 78 $\le 80$（通过）；
    - Write Bytes: 327,245 $\le 1,572,864$ 字节（1.5 MiB 上限，通过）；
    - Holdings Document Bytes: 461 $\le 16,384$ 字节（16 KiB 上限，通过）。
- **核验结论**：**PASS**。

### AC19-6：全写点故障注入与 100% 干净原子回滚（Atomic Rollback Across All Write Points）
- **规格要求**：对结算事务内部的所有实际物理写操作，逐一注入底层写入故障，验证事务 100% 完整回滚，零半写入脏数据残留。
- **核验证据**：
  - `drop-joint-acceptance.test.mjs` 遍历了终局结算的全部 28 个实际写入点（`for (let n = 1; n <= count; n++)`）；
  - 每一个写点均捕获 `SERVICE_UNAVAILABLE`，内存数据库快照比对 100% 完全还原，挑战状态保持 `active`。
- **核验结论**：**PASS**。

### AC19-7：并发 OCC 竞争冲突与串行化安全（Concurrent OCC Competition）
- **规格要求**：通关结算与商店出售、装备强化损毁、银行金库跨作用域转移之间存在并发交叉操作时，通过底层乐观并发控制（OCC）串行化安全裁决，无脏读脏写或资产漂移。
- **核验证据**：
  - `drop-joint-acceptance.test.mjs` 实现了多事务并发提交测试，版本冲突由 OCC 正确决出胜负，未发生双重扣费或重复发奖。
- **核验结论**：**PASS**。

### AC19-8：7 阶段全量门禁检查全绿通过（7-Stage Full Verification Suite）
- **规格要求**：运行 `tools/check-all.cjs`，所有测试（后端回归、客户端模型、UI 模型、TS 编译）全量绿灯通过。
- **核验证据**：
  - `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript` 运行结果：871 个测试通过，0 失败，0 跳过，耗时 289s，7/7 阶段全部通过。
- **核验结论**：**PASS**。

## 规格评审总结

ST19 的实施与联合验收全面满足 AC19-1 至 AC19-8 所有的功能性与非功能性要求，**0 项规格偏离（0 Spec Deviations）**。
同意关闭 ST19 故事的开发生命周期。
