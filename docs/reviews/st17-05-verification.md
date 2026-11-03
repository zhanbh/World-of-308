# ST17-05 实施与联合验收验证

日期：2026-11-03
实现分支：`feat/st17-05-joint-acceptance`，合入基点 `f8faebe`。
代码提交：`a4db9b5`。
范围：磨损—修理—再入本联合验收与两轴评审。涵盖端到端完整闭环（真实战斗/死亡磨损至0→属性衰减→通关/离开→回城新挑战被拦截→林纳克斯一键全修/单修恢复→重入挑战放行）、终局物理事务预算实测、全部写点逐一注入故障原子回滚、OCC并发竞争与两轴独立评审。
来源：[ST17 实施规格](../stories/warrior-loop/st17/spec.md)、[05 实施任务](../stories/warrior-loop/st17/issues/05-joint-acceptance-and-review.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 联合验收实现内容

在 `backend/test/repair-joint-acceptance.test.mjs` 中构建并完整验证了真实全流程端到端联合验收套件（4/4 全部通过）：

1. **端到端完整大闭环（Subtest 1 - AC17-1~AC17-4, AC17-8）**：
   - **磨损至零与属性扣减**：角色穿戴 7 个磨损槽（武器、肩、胸、裤、腰、鞋、耳环）与 6 个非磨损槽，耐久衰减至 0，0 耐久装备属性加成归零且破损状态显式记录；
   - **城镇入本门禁拦截**：回城后角色查询 `dungeon.entry`，入本门禁严格拦截 0 耐久武器（`canEnter: false`，`reason: 'WEAPON_BROKEN'`）；直接发送 `challenge.start` 严格拒绝并抛出 `WEAPON_BROKEN`；
   - **林纳克斯铁匠铺报价与一键全修**：角色在城镇铁匠铺交互打开修理服务（`service.open`），通过 `service.quote` 精确获取全身 7 件穿戴缺失耐久（总计 240 点）与费用报价（240 金币）；执行 `equipment.repair`（`allWorn` 模式），同笔原子扣减 240 金币，将全部 7 件穿戴装备耐久一次性修满至 60/60；
   - **非磨损槽与背包绝对不受影响**：6 个非磨损槽（戒指、手镯、项链等）保持 `durability: null`，背包及金库物品未被误修；
   - **重入挑战放行与回执幂等**：装备修复后，再次查询 `dungeon.entry` 判定通过（`canEnter: true, reason: null`），`challenge.start` 成功提交创建挑战；重复重放幂等返回原挑战回执。

2. **物理事务预算实测（Subtest 2 - AC17-5, AC17-8）**：
   - 在满 7 槽穿戴磨损、100 格背包容器、满钱包与极限 16 个 UTF-8 词条的极端场景下进行全量计量：
   - **实测计量数据**：
     - **唯一读键（Unique Reads）**：21 键（硬上限 $\le 25$）；
     - **唯一写键（Unique Writes）**：12 键（硬上限 $\le 15$）；
     - **事务调用总数（Calls）**：33 次（21 次 get，12 次 set，硬上限 $\le 40$）；
     - **写入总字节（Write Bytes）**：97,623 字节（约 95.3 KiB，硬上限 $\le 256$ KiB）；
     - **单次最大写入（Max Write）**：12,858 字节（硬上限 $\le 128$ KiB）；
     - **公共查询视图响应（Public View Bytes）**：75,917 字节（硬上限 $\le 128$ KiB）；
     - **防污核验**：未触碰或写入任何排行榜/评分投影。
   - **预算合规性**：100% 完全满足硬上限约束。

3. **逐物理写点注入故障原子回滚与丢包恢复（Subtest 3 - AC17-6, AC17-8）**：
   - 针对一键全修事务的全部 12 个实际写点（7件装备、角色、钱包、账号、流水 Journal 及操作 Op），逐一注入底层写入故障；
   - 全部 12 个写点均通过 100% 干净原子回滚验证：
     - 每次写入失败均返回 `SERVICE_UNAVAILABLE`；
     - 数据库快照与执行前完全一致，无任何半写半扣金币脏状态；
     - 金币保持 1000 未发生扣减；
     - 故障恢复后重试能够顺利提交成功并扣费；
   - 针对单件修理事务的全部 5 个写点逐一注入故障，同样 100% 干净回滚；
   - 丢响应及重放测试通过，幂等返回原回执与金额。

4. **OCC 并发竞争冲突两序验证（Subtest 4 - AC17-6, AC17-7）**：
   - **修理 vs 装备更换（Equip/Unequip）**：并发替换穿戴武器，在两种到达顺序下，先到者成功提交，后到者均被安全拦截并报 `VERSION_CONFLICT`，绝不发生修复错误目标或无端扣费；
   - **修理 vs 商店出售（Shop Sell）**：共享钱包资金写入竞争，先到者成功，后到者抛出 `VERSION_CONFLICT`，钱包余额完全守恒。

## 验证证据

1. **定向联合验收测试套件（`backend/test/repair-joint-acceptance.test.mjs` 4/4 全部通过）**：
   - `ST17-05 AC1-4, AC8: End-to-end full loop: Combat wear to zero -> gate blocked -> Linus all-worn repair -> re-entry succeeded`：通过；
   - `ST17-05 AC5, AC8: Physical Transaction Budget: maximum 7 wear slots, 100-slot bag, wallet, journals and public UTF-8 size bounds`：通过；
   - `ST17-05 AC6, AC8: Atomic fault injection rollback across all write points and idempotent lost response recovery`：通过；
   - `ST17-05 AC6, AC7: Concurrency & OCC conflict serialization between repair and equipment swap/shop sell`：通过。

2. **跨模块关联回归套件（59/59 全部通过）**：
   - `backend/test/all-worn-repair.test.mjs`：8/8 通过；
   - `backend/test/single-repair.test.mjs`：21/21 通过；
   - `backend/test/room-death-wear.test.mjs`：18/18 通过；
   - `backend/test/repair-cocos.test.mjs`：8/8 通过；
   - `backend/test/repair-joint-acceptance.test.mjs`：4/4 通过。

3. **TypeScript 类型安全与模型门禁**：
   - `backend/tsconfig.json` 与 `tools/tsconfig.models.json` 使用 TS 5.8.2 检查 Exit Code 0；
   - 客户端纯模型与 UI 模型回归 100% 通过（`check-model.cjs`、`check-ui-model.cjs`）；
   - 代码格式门禁：`git diff --check` 通过。

## 边界与已知限制

- 仅交付联合验收测试与双轴独立评审闭环。
- 生产环境正式耐久单价与维修成本参数保留由策划配置发布的 GAP。
- Cocos 客户端真机渲染流水线由后续主干打包验证覆盖。
- 无 Jira、未向远程 push。
