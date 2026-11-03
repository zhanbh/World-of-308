# ST20 实施准备与状态

2026-11-03，feat-1.0.0 / 28febae。用户已指示推进 ST20（查看当前装备评分排行榜）。

- [实施规格](spec.md)
- [五项任务图与测试边界](task-plan.md)
- [本地草案检查](plan-check.json)
- [任务批准记录](plan-approval.json)
- [执行状态追踪](execution.json)

## 当前批准（2026-11-03）

用户已批准规格与五项任务图及测试边界，已完成 ST20-01、ST20-02、ST20-03 与 ST20-04 交付；05 尚未启动。



## ST20-01 本地交付（2026-11-03）

01 已实现并独立核验快进合入主干，固定源码 `2805636`：
- 构建 `RankingService` 核心服务与 `ranking.list` 协议接入；
- 实现 `(score DESC, scoreReachedAt ASC, characterId ASC)` 稳定三元组排序，分数变动 500 → 600 → 500 重新计时；
- 支持全服总榜（`all`）、战士榜（`warrior`）、猎人榜（`hunter`）范围隔离，以及 `scoreConfigRef` 隔离；
- 实现 HMAC-SHA256 签名有界游标编解码（单页 1~50 条，默认 20 条，严格防篡改、防跨域与 10 分钟 TTL 过期保护）；
- 查询全流程纯只读（0 次调用 `tx.set`，存储文档无任何状态修改，角色 `scoreReachedAt` 绝对不变）。
- 定向测试 8/8 通过，关联回归 26/26 通过，两项 TypeScript 编译 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，merger READY。详见[01证据](../../../reviews/st20-01-verification.md)及[独立合入核验](../../../reviews/st20-01-merge-verification.md)。

## ST20-02 本地交付（2026-11-03）

02 已实现并独立核验快进合入主干，固定源码 `e13ad34`：
- 构建 `rankCaches` 独立确定键物理首屏缓存（`v2:rankCache:${b64}`），包含 `version`（CAS版本）、`cachedAt`、`entries`（前50条）与 `lease`；
- 15 秒 TTL 新鲜期：15s 以内直接命中缓存极速返回，`stale: false`，`rankAsOf: time(cachedAt)`；
- 60 秒最大过期回退：15~60 秒之间若租约被占，立即返回旧数据并显式标识 `stale: true`，有效阻断高并发击穿（Cache Stampede）；
- 3 秒短租约与版本 CAS 抢锁：租约空闲时占领 3 秒租约刷新底层计算，递增版本并原子释放租约，防慢写覆盖与支持超时接管；
- 超过 60 秒强制刷新：禁止返回陈旧数据，确保最新事实；
- 缓存写入非致命隔离：缓存操作失败绝不影响角色或装备事实，保持资产完全隔离。
- 定向测试 16/16 通过，关联回归 34/34 通过，两项 TypeScript 编译 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，merger READY。详见[02证据](../../../reviews/st20-02-verification.md)及[独立合入核验](../../../reviews/st20-02-merge-verification.md)。
- 本地工作分支已清理；未 push；03～05 尚未启动。

## ST20-03 本地交付（2026-11-03）

03 已实现并独立核验快进合入主干，固定源码 `ad1de71`：
- 构建 `(score DESC, scoreReachedAt ASC, characterId ASC)` 三段式互斥统计求和算法：$C_1$ 比本人分高 + $C_2$ 同分先达到 + $C_3$ 同分同秒 ID 较小，三段计数相加 + 1 与全量三元组排序排位 100% 严格一致；
- 换装即时响应：换装或脱装改变评分与达到时间后，`ownRank` 即时计算并反映排名升降，不受首屏 15 秒缓存延迟影响；
- 大容量超额熔断与优雅降级：支持 `countCapacityLimit` 容量超限检测、故障注入 `simulateCountFailure` 与自定义外部计数器异常保护，触发时优雅降级返回 `ownRank: null`，榜单列表、快照时间与分页游标完全正常可用，严禁伪造“未上榜”或 0；
- 职业榜单严格隔离：战士角色查询猎人榜单返回 `ownRank: null`，查询战士榜与全榜返回准确排位；
- 只读与资产不变量：查询与统计全程只读，0 次修改角色事实，`scoreReachedAt` 与评分绝对不变。
- 定向测试 23/23 通过，关联回归 41/41 通过，两项 TypeScript 编译 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，merger READY。详见[03证据](../../../reviews/st20-03-verification.md)及[独立合入核验](../../../reviews/st20-03-merge-verification.md)。
- 本地工作分支已清理；未 push；04～05 尚未启动。

## ST20-04 本地交付（2026-11-03）

04 已实现并独立核验快进合入主干，固定源码 `e30bde7`：
- 构建纯模型协调器 `RankingCoordinator.ts`：完备状态机管理（`closed` -> `loading` -> `ready` / `paging` / `failed`），严格 `generation` 代次隔离彻底丢弃在途延迟迟包；
- 游标分页与客户端幂等去重：`loadMore` 携带 `nextCursor` 触底拉取，按 `characterId` 唯一性集合自动去重；
- 异常重试与断网恢复：网络/协议错误进入 `failed` 状态并保留错误码，提供 `retry()` 优雅恢复；
- 构建 Cocos 表现层组件 `RankingPanel.ts`：全榜/分职业榜单切换选项卡、金色高光本人名次置顶横幅（`OwnRankBanner`）、前三名金银铜特殊着色、15 秒缓存快照/实时新鲜度状态显示、触底翻页与错误重试；
- 交互与生命周期保护：统一双端触控/鼠标防误触与防重复提交，`dispose()` 完整注销事件并安全释放节点。
- 定向测试 6/6 通过，关联回归 47/47 通过，两项 TypeScript 编译 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，merger READY。详见[04证据](../../../reviews/st20-04-verification.md)及[独立合入核验](../../../reviews/st20-04-merge-verification.md)。
- 本地工作分支已清理；未 push；05 尚未启动。

## 任务列表

1. [ST20-01: 评分排行服务核心、索引排序与分页查询协议](issues/01-ranking-service-query.md)（已合入）
2. [ST20-02: 短租约原子刷新缓存、TTL 新鲜度机制与并发抢锁](issues/02-cache-lease-ttl.md)（已合入）
3. [ST20-03: 本人名次三段式精准计数与大容量降级熔断](issues/03-own-rank-counter.md)（已合入）
4. [ST20-04: Cocos 排行榜面板与纯模型协调器](issues/04-cocos-ranking-panel.md)（已合入）
5. [ST20-05: 换装/强化即时刷新联合验收、物理预算与两轴评审](issues/05-joint-acceptance.md)（已计划）



## 约束与设计真相源

本工程仅保留仓库文档、不创建或同步 Jira。按 AGENTS 保留任务粒度/依赖的一次人工确认；确认后生成 accepted 独立任务并按图实施。
业务与协议真相源遵循：
- `docs/backend/source-of-truth.md`
- `docs/backend/ranking-query-baseline-v1.md`
- `docs/backend/scoring-projection-mapping-v1.md`
- `shared/src/protocol/asset-v2.ts`

他人装备检视、好友/公会榜单、排行榜赛季奖励结算及云端分布式数据库集群保持独立 GAP。
