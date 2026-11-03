# ST20 Spec 独立规格轴评审

日期：2026-11-03。
评审者：独立 Spec 评审 Agent（独立于 ST20 开发实施过程）。
评审分支：`feat/st20-05-joint-acceptance`，准备合入主干 `feat-1.0.0`。
评审依据：[ST20 实施规格](../stories/warrior-loop/st20/spec.md)、[任务分解图](../stories/warrior-loop/st20/task-plan.md) 及 [原业务故事](../stories/warrior-loop/st20.md)。

## 验收准则（AC20-1 ～ AC20-8）逐项核验

### AC20-1：固有穿戴评分排名与三元组稳定排序
- **规格要求**：
  - 评分仅依赖当前 13 槽穿戴实例固有属性（装等、品质系数、强化等级、词条归一值），背包、金库、临时 buff、当前耐久磨损不参与评分；
  - 排名严格遵循三元组稳定排序：`(score DESC, scoreReachedAt ASC, characterId ASC)`；
  - 同分保持先到达者排在前面；分值变动（例如 500 → 600 → 500）按最新达到时刻重新计时；同分同秒按 `characterId` 升序确定唯一确定性名次。
- **核验证据**：
  - `backend/src/ranking/ranking-service.ts` 中 `compareRankingEntries` 实现了严格的三元组比较器；
  - `ranking-service.test.mjs` 测试 1、2、17 验证同分同秒字典序排位、同分先到达排位以及 500 → 600 → 500 分数变动时达成时刻重置；
  - `ranking-joint-acceptance.test.mjs` Subtest 1 在真实换装/重新穿戴大闭环中验证两名战士同为 3040 分时，较早达成者排名第 1，重穿者排第 2（`ownRank === 2`）。
- **核验结论**：**PASS**。

### AC20-2：全榜与分职业榜单范围隔离
- **规格要求**：
  - 支持 `scope = 'all'`（全服总榜）、`scope = 'warrior'`（战士榜）与 `scope = 'hunter'`（猎人榜）；
  - 评分配置版本（`scoreConfigRef`）严格隔离，不同公式版本分榜存储，严禁新旧公式混杂。
- **核验证据**：
  - `RankingService.collectEntriesFromStore` 按 `scope` 严格过滤职业分类，并按 `scoreConfigRef` 进行配置版本隔离；
  - `ranking-service.test.mjs` 测试 3、22 验证总榜与职业分榜过滤无渗漏，旧配置条目被完全剔除；
  - `ranking-joint-acceptance.test.mjs` Subtest 1 验证战士主角在猎人榜中 `ownRank` 返回 `null`（异职业隔离）。
- **核验结论**：**PASS**。

### AC20-3：有界游标分页与客户端幂等去重
- **规格要求**：
  - 单页拉取数量 `pageRequest` 限制为 1 ~ 50 条（默认 20 条）；
  - 游标 `cursor` 包含范围、排序锚点与 HMAC-SHA256 签名，支持向后稳定翻页；
  - 客户端协调器按 `characterId` 进行唯一性去重展示。
- **核验证据**：
  - `RankingService` 实现了基于 WebCrypto HMAC-SHA256 的签名游标与超时/篡改防御；
  - `ranking-service.test.mjs` 测试 4、5 验证了 15 条条目按页大小 4 稳定遍历 4 页、篡改密文/作用域不匹配/跨配置/过期游标均返回 `INVALID_ARGUMENT`；
  - `RankingCoordinator.executeQuery` 在加载后续页时通过 `existingIds` 集合进行 `characterId` 去重（`ranking-cocos.test.mjs` 测试 2）。
- **核验结论**：**PASS**。

### AC20-4：独立首屏缓存、TTL 新鲜期与短租约 CAS 抢锁
- **规格要求**：
  - 首屏数据采用独立确定键缓存（`rankCaches`）；
  - 缓存参数：新鲜期为 15 秒（`ttlMs: 15000`）；允许显式返回旧数据的最大过期时间为 60 秒（`maxStaleMs: 60000`）；
  - 缓存过期时采用 3 秒短租约与版本 CAS 抢锁刷新；抢锁失败者直接读取旧缓存或有界直读，不发生全服高并发击穿。
- **核验证据**：
  - `rankCacheKey(scope, configRef)` 构建确定性缓存主键，实体包含 CAS `version`、`cachedAt`、前 50 条条目及 `lease`；
  - `ranking-service.test.mjs` 测试 9~16 覆盖了冷启动建缓存、15s 内新鲜命中（`stale: false`）、15~60s 租约持有时旧缓存回退（`stale: true`）、大于 60s 强制直读刷新、3s 租约超时接管与防击穿并发；
  - `ranking-joint-acceptance.test.mjs` Subtest 3 验证了 10 并发查询在租约期内 100% 安全回退至旧缓存无击穿。
- **核验结论**：**PASS**。

### AC20-5：本人名次三段式精准计数与优雅降级
- **规格要求**：
  - 本人准确名次通过三段互斥索引计数求和（比本人分高 + 同分但先达到 + 同分同秒但 ID 较小，三数相加 + 1）；
  - 返回本人名次 `ownRank`、达到时间 `scoreReachedAt` 及快照时刻 `rankAsOf`；
  - 当聚合计数能力不足或超时时，`ownRank` 字段优雅降级返回 `null`，榜单列表与本人当前分数正常返回，严禁伪造“未上榜”或整表拖拽。
- **核验证据**：
  - `RankingService.computeThreePartTriadRank` 计算 $C_1 + C_2 + C_3 + 1$，在 `ranking-service.test.mjs` 测试 17 中实测验证与全量三元组排序排位 100% 严格一致；
  - 换装即时响应：换装或强化修改分数后，本人名次在 15 秒缓存延迟内即时反映（Subtest 1）；
  - 容量超额或统计失败时优雅降级返回 `ownRank: null`，列表与快照时间正常返回（`ranking-service.test.mjs` 测试 19~21、`ranking-joint-acceptance.test.mjs` Subtest 3）。
- **核验结论**：**PASS**。

### AC20-6：查询只读与无副作用不变量
- **规格要求**：
  - 打开或查询排行榜为完全只读操作，严禁修改任何角色的 `scoreReachedAt` 或评分数据；
  - 缓存写入或失败绝不反写角色事实，绝不触发任何资产回滚。
- **核验证据**：
  - `ranking-service.test.mjs` 测试 6、15、23 验证：无论查询成功、失败还是缓存写入异常，角色事实数据、评分、达到时刻完全不变；
  - `ranking-joint-acceptance.test.mjs` Subtest 2 实测计量：缓存命中写操作为 0 次，缓存刷新写操作仅限 `rankCaches` 文档，角色/装备/背包/钱包/邮件写操作全部为 0；
  - Subtest 3 注入缓存物理写入故障，服务安全降级，资产 0 污染。
- **核验结论**：**PASS**。

### AC20-7：纯模型协调器与 Cocos 排行榜面板
- **规格要求**：
  - 客户端构建纯模型协调器（`RankingCoordinator.ts`），涵盖关闭、加载、就绪、失败等生命周期状态机；
  - 具备代次计数器（`generation`）与窗口隔离：页面关闭立即停止轮询并屏蔽在途迟包；
  - Cocos 界面（`RankingPanel.ts`）展示排行榜列表、本人专属条目、三元组排位明细、缓存新鲜度标识及异常恢复提示。
- **核验证据**：
  - `client/assets/scripts/net/RankingCoordinator.ts` 实现状态机与代次隔离；
  - `client/assets/scripts/ui/RankingPanel.ts` 实现了全榜/战士榜/猎人榜 Tab 切换、金色置顶本人条目（`OwnRankBanner`）、前三名奖牌色标识、缓存快照/新鲜度文本及重试按钮；
  - `ranking-cocos.test.mjs` 6 项测试完整验证协调器状态机、代次隔离丢包、去重、UI 层次结构与渲染。
- **核验结论**：**PASS**。

### AC20-8：端到端联合验收、物理预算与两轴评审
- **规格要求**：
  - 换装/强化即时刷新评分与排行榜的端到端大闭环；
  - 物理事务与缓存读写预算实测（满足单文档 $\le 16$ KiB、传输 $\le 64$ KiB 预算）；
  - 100% 满足 Standards 与 Spec 独立两轴双向评审规范。
- **核验证据**：
  - `backend/test/ranking-joint-acceptance.test.mjs` 4 项端到端联合验收测试全部通过；
  - 物理预算实测数据：
    - `rankCaches` 文档：12,604 字节 $\le 16,384$ 字节（通过）；
    - `RankingEntryEntity` 实体：335 字节 $\le 16,384$ 字节（通过）；
    - `ranking.list` 网络传输：12,532 字节 $\le 65,536$ 字节（通过）；
  - Standards 与 Spec 独立两轴评审报告已归档并审核通过。
- **核验结论**：**PASS**。

## 规格评审总结

ST20 的实施与联合验收全面满足 AC20-1 至 AC20-8 所有的功能性与非功能性要求，**0 项规格偏离（0 Spec Deviations）**。
同意关闭 ST20 实施任务。
