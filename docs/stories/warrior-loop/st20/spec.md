---
artifact_kind: specification
artifact_id: spec:warrior-loop-st20
status: accepted
spec_hash: 3a92a12e437bc97ece2d0dd9a740afa85517fedbb6dfcde7ba78e787c61afd2a
accepted_revision: 3a92a12e437bc97ece2d0dd9a740afa85517fedbb6dfcde7ba78e787c61afd2a
approval_kind: human
approval_evidence: '好的，先开始01吧'
stories: [ST20]
---
# ST20 实施规格草案：查看当前装备评分排行榜

2026-11-03；基点 feat-1.0.0 / 28febae。实施规格草案提案，待用户审核确认；未批准任务图、未编码；仅本地文档，无 Jira。

## 来源与依赖

遵循[原业务故事](../st20.md)、[主规格](../../../spec.md) US14（查看排名）、AC13 及 [QA覆盖图](../../reviews/eng-review-coverage-2026-10-22.md) 组 35。
权威设计合同为：
- [排行查询与评分依赖基线 v1](../../../backend/ranking-query-baseline-v1.md)
- [当前穿戴评分的物理映射候选 v1](../../../backend/scoring-projection-mapping-v1.md)
- [资产协议定义与校验 v2](../../../../shared/src/protocol/asset-v2.ts)（`ranking.list` 请求与响应形状）
- [资产物理映射与原子操作 v1](../../../backend/asset-physical-mapping-v1.md)
- [开发真相源索引](../../../backend/source-of-truth.md)

### 故事级依赖说明

- **ST05（穿脱装备、属性与套装生效）**：已在本地交付（commit `5bbcaa5`），建立 13 槽位穿戴模型，提供初始固有评分计算，并在穿脱时同步更新 `character.score`、`character.scoreReachedAt` 及 `rankingEntry`；
- **ST18（玛丽强化、纪念品与会话记忆）**：已在本地交付（commit `5731b10`），强化成功改变穿戴装备固有属性时同笔更新 `rankingEntry` 与 `equipmentVersion`；
- **P01 已确认不变量**：装备评分仅基于 13 槽位穿戴装备的固有价值（装等、品质、强化等级、合法词条归一值），耐久磨损与修理不影响装备评分，单纯清房/死亡磨损不写评分投影。

## 验收准则（AC20-1 ～ AC20-8）

- **AC20-1：固有穿戴评分排名与三元组稳定排序**
  - 评分仅依赖当前 13 槽穿戴实例的固有属性（装等、品质系数、强化等级、词条归一值），背包、金库、基础属性、临时 buff 与当前耐久不影响评分；
  - 排名严格遵循三元组稳定排序：`(score DESC, scoreReachedAt ASC, characterId ASC)`；
  - 同分保持先到达者排在前面；分值变动（例如 500 → 600 → 500）按最新达到时刻重新计时；同分同秒按 `characterId` 字典序升序确定唯一确定性名次。

- **AC20-2：全榜与分职业榜单范围隔离**
  - 支持 `scope = 'all'`（全服总榜）、`scope = 'warrior'`（战士榜）与 `scope = 'hunter'`（猎人榜）；
  - 评分配置版本（`scoreConfigRef`）严格隔离，不同公式版本分榜存储，严禁新旧公式混杂。

- **AC20-3：有界游标分页与客户端幂等去重**
  - 单页拉取数量 `pageRequest` 限制为 1 ~ 50 条（默认 20 条）；
  - 游标 `cursor` 包含范围、排序锚点与签名信息，支持向后稳定翻页；
  - 翻页非全服冻结快照，允许并发换装引起跨页重复/遗漏，客户端协调器按 `characterId` 进行唯一性去重展示。

- **AC20-4：独立首屏缓存、TTL 新鲜期与短租约 CAS 抢锁**
  - 首屏数据采用独立确定键缓存（`rankCaches`）；
  - 缓存参数：新鲜期为 15 秒（`ttlMs: 15000`）；允许显式返回旧数据的最大过期时间为 60 秒（`maxStaleMs: 60000`）；
  - 缓存过期时采用 3 秒短租约与版本 CAS 抢锁刷新；抢锁失败者直接读取旧缓存或有界直读，不发生全服高并发击穿。

- **AC20-5：本人名次三段式精准计数与优雅降级**
  - 本人准确名次通过三段互斥索引计数求和（比本人分高 + 同分但先达到 + 同分同秒但 ID 较小，三数相加 + 1）；
  - 返回本人名次 `ownRank`、达到时间 `scoreReachedAt` 及快照时刻 `rankAsOf`；
  - 当聚合计数能力不足或超时时，`ownRank` 字段优雅降级返回 `null`（标识暂不可用），但榜单列表与本人当前分数正常返回，严禁伪造“未上榜”或整表拖拽。

- **AC20-6：查询只读与无副作用不变量**
  - 打开或查询排行榜为完全只读操作，严禁修改任何角色的 `scoreReachedAt` 或评分数据；
  - 缓存写入或失败绝不反写角色事实，绝不触发任何资产回滚。

- **AC20-7：纯模型协调器与 Cocos 排行榜面板**
  - 客户端构建纯模型协调器（`RankingCoordinator.ts`），涵盖关闭、加载、就绪、失败等生命周期状态机；
  - 具备代次计数器（`generation`）与窗口隔离：页面关闭立即停止轮询并屏蔽在途迟包；
  - Cocos 界面（`RankingPanel.ts`）展示排行榜列表、本人专属条目、三元组排位明细、缓存新鲜度标识及异常恢复提示。

- **AC20-8：端到端联合验收、物理预算与两轴评审**
  - 换装/强化即时刷新评分与排行榜的端到端大闭环；
  - 物理事务与缓存读写预算实测（满足单文档 $\le 16$ KiB、传输 $\le 64$ KiB 预算）；
  - 100% 满足 Standards 与 Spec 独立两轴双向评审规范。

## 范围与测试边界

- **纯规则与服务层**：排序算法、游标编解码、三段计数、缓存租约与 CAS 并发控制、`ranking.list` 协议解析校验；
- **真实传输与协调器层**：`RankingCoordinator` 状态机、多页拉取与去重、页面代次隔离、网络丢包与错误码恢复；
- **Cocos 表现层与联合验收**：`RankingPanel` 面板打开、榜单切换（全榜/职业榜）、滚动翻页、本人排名置顶/悬浮、自动化离线构建。
- **不包含**：他人装备检视、好友/公会社交、排行奖励发放、赛季结算重置、云端分布式数据库集群搭建。
