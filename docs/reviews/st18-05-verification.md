# ST18-05 实施与联合验收验证

日期：2026-11-02
范围：玛丽强化、纪念品与会话记忆联合闭环验收、最大终局预算实测、11写点原子故障注入回滚、并发 OCC 竞争及两轴独立评审。来源为已批准 [ST18 规格](../stories/warrior-loop/st18/spec.md)、[05 实施任务](../stories/warrior-loop/st18/issues/05-joint-acceptance.md) 及 [开发真相源](../backend/source-of-truth.md)。没有创建、同步或回填 Jira。

## 联合验收闭环实现

在 `backend/test/enhancement-joint-loop.test.mjs` 中构建并完整验证了真实全流程端到端联合验收套件（4/4 全部通过）：

1. **端到端完整闭环（Subtest 1）**：
   - 低段 +1～+10 强化：正常消耗金币与强化石，验证成功率判定与属性/评分同步更新；
   - 高段 +11～+13 强化：选用角色绑定战神纪念品，重报价并验证额外概率加成；
   - 目标 14 级失败损毁：验证装备永久损毁、穿戴与背包引用彻底解除、适用套装持有贡献递减及评分同步下降；
   - 战神纪念品返还与背包堆叠合并：返还 5 战神纪念品，背包原存 16 个（上限 20），严格按照规则先合并 4 个至背包达到满叠 20，溢出的 1 个自动生成 30 天有效期的角色溢出邮件；
   - 真实邮件附件领取：通过真实 `MailService.execute('mail.claimAttachment')` 将邮件内纪念品领取回背包；
   - 再次强化闭环：使用领回的纪念品对另一件武器进行强化，验证资源流转无断点；
   - 模拟网络丢包未知恢复：通过 `EnhancementCoordinator.recover()` 与服务端 `operation.get` 幂等对齐，原意图安全重试，零重复扣费。

2. **最大终局物理预算实测（Subtest 2）**：
   - 构造最重极限场景：
     - 13 槽位满穿戴装备；
     - 100 格满背包容器；
     - 20 个来源等级的会话记忆数组；
     - 目标装备为套装装备（触发套装持有投影计算与排行榜评分计算）；
     - 目标 13 级以上强化失败永久损毁；
     - 战神纪念品返还且满包溢出生成邮件；
     - 记录完整资产 Journal 流水与原操作 Receipt。
   - 实测计量数据（已同步写入 [docs/backend/enhancement-terminal-budget-v1.md](../backend/enhancement-terminal-budget-v1.md)）：
     - **唯一读键（Unique Reads）**：26 键；
     - **唯一写键（Unique Writes）**：11 键（`equipment`、`rankingEntry`、`enhancementMemory`、`container`、`wallet`、`character`、`account`、`holdings`、`mail`、`assetJournal`、`assetOp`）；
     - **事务调用总数（Calls）**：37 次（26 次 get，11 次 set）；
     - **写入总字节（Write Bytes）**：29,466 UTF-8 字节；
     - **最大单文档字节（Max Document Bytes）**：16,622 字节（100格满背包容器文档）。
   - **预算合规性**：严格符合 `enhancement-terminal-budget-v1.md` 预设的 `R26 / W11` 理论模型，且远低于预算安全上限（R ≤ 30、W ≤ 15、调用 ≤ 80、字节 ≤ 65536、单文档 ≤ 32768）。

3. **11 个物理写点逐一注入故障原子回滚（Subtest 3）**：
   - 针对高段损毁写集的全部 11 个实际物理写操作，逐一进行原子写故障模拟（模拟数据库写入异常抛错）；
   - 11 个写点均通过原子回滚验证：
     - 金币未被扣除；
     - 强化材料未减少；
     - 战神纪念品未被消耗或返还；
     - 装备未被损毁且等级/耐久维持原样；
     - 会话记忆未发生变动；
     - 邮件未被创建；
     - 套装持有与排行榜评分未被篡改；
     - 无半完成脏数据残留在 MemoryStore。

4. **OCC 并发竞争验证（Subtest 4）**：
   - 强化 vs 装备脱下：双向交叉竞争，后提交方因版本冲突或条件不符严格被 OCC 拒绝，零穿戴状态幽灵扣款；
   - 强化 vs 商店出售：背包内装备出售与强化双向竞争，已被强化的装备无法被旧报价出售，已被出售的装备强化立即被拒绝；
   - 强化 vs 林纳克斯单件修理（ST17-02）：同一装备修理与强化之间版本递增严格保护，无脏读脏写；
   - 注：ST17-03 一键全修竞争因 ST17-03 尚未实现，按照真实工程事实记录为待后续补齐（GAP）。

## 验证与测试套件汇总

- **ST18 强化全套定向测试套件（5 套共 56/56 全部通过）**：
  - `backend/test/enhancement-low.test.mjs`：24/24 通过（低段报价、授权、成功/保级、AP更新、评分）；
  - `backend/test/enhancement-high.test.mjs`：8/8 通过（高段降级/损毁、纪念品消耗、损毁返还合堆与邮件溢出、套装持有同步）；
  - `backend/test/enhancement-memory-recovery.test.mjs`：10/10 通过（跨装备相似记忆复用、衰减权重、上限封顶、代次隔离、OCC固定样本、原意图幂等恢复）；
  - `backend/test/enhancement-cocos.test.mjs`：10/10 通过（Cocos EnhancementPanel 状态机、费用/风险展示、纪念品开关、信息隐匿门禁、迟包隔离）；
  - `backend/test/enhancement-joint-loop.test.mjs`：4/4 通过（端到端大闭环、终局预算计量、11写点原子回滚、并发OCC竞争）。
- **客户端纯模型与 UI 模型测试**：
  - `client/tools/check-model.cjs`：通过；
  - `client/tools/check-ui-model.cjs`：通过（100% 成功）。
- **TypeScript 静态类型检查**：
  - `backend/tsconfig.json`（TS 5.8.2）：Exit 0，无任何类型诊断错误；
  - `tools/tsconfig.models.json`（TS 5.8.2）：Exit 0，无任何类型诊断错误。
- **代码与格式门禁**：
  - `git diff --check` 通过，无空白字符与换行异常。

## 限制与已知 GAP

1. **生产概率与经济定价校准**：当前采用隔离的 local-test 配置与测试常量，正式强化成功率曲线、材料费用及经济平衡需待运营与策划正式配置签署；
2. **Cocos 原生场景构建与真机验证**：当前为 Cocos TypeScript 表现层组件与自动化适配驱动，真机环境（微信小游戏真机、iOS/Android）及 WebGL 构建留待后续发布流水线验证；
3. **真实分布式云端 SDK 事务**：当前实测基于内存存储驱动 `MemoryStore`，不代表云端分布式数据库的事务延迟、网络传输字节或生产账单；
4. **ST17-03 一键全修竞争**：ST17-03 尚在开发中，一键全修与强化的交叉并发验证待 ST17-03 交付后闭环。
