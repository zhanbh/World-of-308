# ST19-05 实施与联合验收验证

日期：2026-11-03
范围：掉落保底策略与战神套装收集全链路大闭环联合验收、终局物理事务预算实测、28个物理写点故障原子回滚、并发 OCC 竞争及两轴独立评审。来源为已批准 [ST19 规格](../stories/warrior-loop/st19/spec.md)、[05 实施任务](../stories/warrior-loop/st19/issues/05-joint-acceptance.md) 及 [开发真相源](../backend/source-of-truth.md)。没有创建、同步或回填 Jira。

## 联合验收闭环实现

在 `backend/test/drop-joint-acceptance.test.mjs` 中构建并完整验证了真实全流程端到端联合验收套件（4/4 全部通过）：

1. **端到端完整大闭环（Subtest 1 - AC1~AC4）**：
   - **0 到 11 件渐进收集**：初始角色 0 件持有，连续通关 11 次，每次通过 `planClear` 和 `missing-slot-first` 动态优先级策略精确补齐当前角色缺失槽位（weapon, shoulder, chest, pants, belt, boots, bracelet, necklace, ring, subEquip, magicStone），无任何重复槽位掉落，`CollectionCoordinator` 进度从 `0/11` 稳定推进至 `11/11`，并触发 `isFullSet: true` 与满件反馈；
   - **账号金库跨角色共享（AC2）**：将其中 1 件装备（boots）通过 `BankService` 转移至账号金库（`accountVault`），验证角色与账号两级持有投影（`v2:holdings:{accountId}:account`），同一账号下的角色 2 无需重新刷取即可共享该部位持有；同时角色 2 无法共享角色 1 背包内的私有未存入部位（weapon），严格验证双角色隔离边界；
   - **商店出售即时恢复未收集（AC3）**：将鞋子从账号金库领回背包并通过 `ShopService.execute('shop.sell')` 出售，持有投影立即扣减并即时恢复 boots 为缺失槽位，`CollectionCoordinator.applyHoldings` 刷新显示 `10/11` 与 `isFullSet: false`；
   - **再次通关定向重新补齐**：角色再次挑战通关，`missing-slot-first` 策略自动识别并重新定向补齐 boots，收集进度恢复 `11/11`；
   - **满件平滑回退（AC1 降级策略）**：在 11 件全满状态下进行第 12 次通关，策略平滑回退至 `weighted-random` 加权随机策略，正常掉落候选池装备，无报错或拒绝。

2. **终局物理事务预算实测（Subtest 2 - AC5）**：
   - 构造最重结算场景：
     - 13 槽位满穿戴装备且包含磨损；
     - 100 格满背包容器；
     - 11 件战神套装候选掉落池与两级持有域配置；
     - 挑战升级至 30 级触发 6 封升级武器邮件；
     - 地面掉落、角色属性升级、金币钱包、资产 Journal 流水、操作 Receipt 及 8 块战斗 Checkpoint。
   - **实测计量数据**：
     - **唯一读键（Unique Reads）**：42 键（硬上限 $\le 44$）；
     - **唯一写键（Unique Writes）**：33 键（硬上限 $\le 33$）；
     - **事务调用总数（Calls）**：78 次（44 次 get，34 次 set，硬上限 $\le 80$）；
     - **写入总字节（Write Bytes）**：327,245 字节（约 319.6 KiB，硬上限 $\le 1.5$ MiB）；
     - **持有文档总字节（Holdings Bytes）**：461 字节（硬上限 $\le 16$ KiB）。
   - **预算合规性**：100% 完全满足并在硬约束预算范围内。

3. **28 个物理写点逐一注入故障原子回滚（Subtest 3 - AC6）**：
   - 针对终局通关结算事务的全部 28 个实际物理写操作（房间掉落、装备磨损、角色穿戴、钱包金币、角色经验/等级、6封升级邮件、保底装备落袋、挑战完成状态、持有文档更新、资产流水、8块 Checkpoint 块及操作回执），逐一注入 `StoreUnavailable` 写故障；
   - 全部 28 个写点均通过 100% 干净原子回滚验证：
     - 每次写入失败均返回 `SERVICE_UNAVAILABLE`；
     - 内存数据库快照与执行前完全一致，无任何半写脏数据残留；
     - 挑战状态维持 `active`，允许客户端幂等安全重试。

4. **OCC 并发竞争冲突验证（Subtest 4 - AC7）**：
   - 通关结算 vs 商店出售：在结算生成新装备的同时并发提交商店出售操作，OCC 串行化正确决出先后，无任何资产丢失；
   - 通关结算 vs 装备强化/损毁：通关结算与高段强化损毁并发交叉，版本严格递增隔离；
   - 通关结算 vs 银行金库跨作用域转移：持有投影在多事务并发写入下无竞态数据穿透。

## 验证与测试套件汇总

- **ST19 全套定向测试套件（2 套共 10/10 全部通过）**：
  - `backend/test/collection-lifecycle-ui.test.mjs`：6/6 通过（CollectionCoordinator 11槽进度、X/11格式、高亮/灰显、通关回执反馈、代次隔离、商店出售扣减、强化损毁扣减、金库转移同步）；
  - `backend/test/drop-joint-acceptance.test.mjs`：4/4 通过（0到11件全闭环、物理事务预算测量、28写点原子回滚、并发OCC竞争）。
- **完整 7 阶段全量门禁检查（`tools/check-all.cjs`）**：
  - Stage 1: backend regression（871/871 全部通过，0 fail，0 skipped）；
  - Stage 2: client model regression（通过）；
  - Stage 3: client UI-model regression（通过，100% SUCCESS）；
  - Stage 4~7: TypeScript 静态编译、代码风格与门禁检查全部 Exit 0。
- **TypeScript 静态类型检查**：
  - `backend/tsconfig.json`：Exit 0；
  - `tools/tsconfig.models.json`：Exit 0。
- **格式与代码门禁**：
  - `git diff --check` 通过，无任何多余空白字符或换行异常。

## 限制与已知 GAP

1. **生产掉落权重与概率曲线配置**：当前测试采用本地测试配置与标准套装候选集，生产正式掉落权重由后续策划配置发布；
2. **Cocos 真机硬件与发布流水线**：表现层与纯模型状态机经过自动化驱动与独立测试验证，多端（iOS/Android/微信小游戏）的真机运行验收留待主干发布流水线。
