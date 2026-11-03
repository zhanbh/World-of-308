# ST19 实施记录与跟踪

2026-11-02；实施规格草案与五项任务图已获用户确认并正式冻结。不开 Jira、不同步 Jira、不伪造 Jira 状态。

- [实施规格](spec.md)
- [五项任务图](task-plan.md)
- [原业务故事](../st19.md)

已核对硬依赖：ST15（通关结算）、ST09（银行金库）、ST07（邮件领取）、ST18（强化与损毁），四项前置能力均已在本地主干交付。

## 批准与当前范围（2026-11-02）

用户“好的，开始吧”确认任务图并授权本地实施。ST19-01、ST19-02、ST19-03、ST19-04、ST19-05 已全部完成实现并合入主干 `feat-1.0.0`。

## ST19-01 本地交付

源码 `a7967f00d2380f2d87e009ee59292395d98fa65e`：策略引擎算法与配置 Profile 解耦，支持 `weighted-random`、`missing-slot-first`、`weighted-missing-first` 调度分发、不可变 Profile 固化与 30 级特殊副本严格门禁；`TerminalConfig` 扩展支持 `strategyProfile`。独立定向测试 8/8 通过，跨模块关联测试 36/36 通过，两项 TypeScript 编译 exit 0，`git diff --check` 通过。见[01验证报告](../../../reviews/st19-01-verification.md)及[01合入核验](../../../reviews/st19-01-merge-verification.md)。

## ST19-02 本地交付

源码 `b8d42ebe96fab98e344ec41706b2dd804d869650`：全口径持有聚合检测（穿戴/背包/个人库/账号库/有效邮件/待领全 6 类存储源）、严格双角色私域隔离、公共账号金库联动共享、毫秒级邮件时效性判定、地面未拾取物排除与损坏摘要原子拒绝完整性保护。独立多口径与隔离测试 6/6 通过，关联回归测试 71/71 通过，两项 TypeScript 编译 exit 0，`git diff --check` 通过。见[02验证报告](../../../reviews/st19-02-verification.md)及[02合入核验](../../../reviews/st19-02-merge-verification.md)。

## ST19-03 本地交付

源码 `ba18c584508e769edc77e49a1946d39aa6e72c6c`：确定性基础样本生成（`deriveDropSample` 基于 `sourceKey` 与配置哈希）、并发 OCC 冲突重试未提交候选重映射且基础样本不漂移（`remapCandidate`）、11 部位全齐平滑安全回退至 `fallbackStrategy`（`weighted-random` 正常发放绝不卡死拒发）、终局结算 `planClear` 提交后绝对不可变性与网络丢包幂等返回原回执。独立定向测试 6/6 全部通过，全量 7 阶段门禁检查 7/7 全部通过（861 项测试 0 失败），TypeScript 编译 Exit Code 0，`git diff --check` 通过。见[03验证报告](../../../reviews/st19-03-verification.md)及[03合入核验](../../../reviews/st19-03-merge-verification.md)。

## ST19-04 本地交付

源码 `583e655a6d5103a8d56bdfa29796e626e38ea8f3`：资产全生命周期联动与客户端套装收集展示协调器。涵盖商店出售（`shop.sell`）、强化损毁（+13~+20 在 `EnhancementService`）及公共金库跨作用域转移（`BankService`）即时同步持有摘要并在移出最后一件时即时恢复未持有（缺失件）状态；客户端纯模型协调器（`CollectionCoordinator.ts`）跟踪 11 部位套装进度（`X/11`）、高亮/灰显、通关回执解析反馈（`latestAwardedSlot`、`isNewCompletion`）、未知状态防御降级及 generation 异步隔离。独立定向测试 6/6 全部通过，全量 7 阶段门禁检查 7/7 全部通过（867 项测试 0 失败），TypeScript 静态检查两项均 Exit Code 0，`git diff --check` 通过。见[04验证报告](../../../reviews/st19-04-verification.md)及[04合入核验](../../../reviews/st19-04-merge-verification.md)。

## ST19-05 本地交付与故事完工

源码 `c33a0bd8b90ba4bdb2f672798543478528d30926`：掉落保底策略与战神套装收集全链路大闭环联合验收、终局物理事务预算实测、28个物理写点故障原子回滚、并发 OCC 竞争及两轴独立评审。在 `backend/test/drop-joint-acceptance.test.mjs` 中构建全流程验收套件（4/4 全部通过）：
1. 0 到 11 件渐进收集，每次通关精准补齐当前角色缺失部位，无重复掉落；账号金库跨角色共享与私域隔离；商店出售/强化损毁即时恢复未收集；满件平滑回退加权随机；
2. 终局结算物理事务实测满足硬限制（R42 <= 44, W33 <= 33, calls 78 <= 80, writeBytes 327,245 <= 1.5 MiB, holdings 461 <= 16 KiB）；
3. 28 个物理写点逐一注入写故障，全部 100% 干净原子回滚无残留；
4. 通关结算 vs 出售 / 强化损毁 / 金库转移并发 OCC 竞争串行化安全裁决。
全量 7 阶段门禁套件全部通过（871 测试 0 失败），两轴独立评审（Standards 轴与 Spec 轴）全部 PASS，0 阻断性问题。见[05验证报告](../../../reviews/st19-05-verification.md)、[05合入核验](../../../reviews/st19-05-merge-verification.md)、[Standards独立评审](../../../reviews/st19-standards-independent-review.md)及[Spec独立评审](../../../reviews/st19-spec-independent-review.md)。ST19 全部 5 项子任务完整交付并合入 `feat-1.0.0`。