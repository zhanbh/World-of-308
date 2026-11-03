# ST20 实施准备与状态

2026-11-03，feat-1.0.0 / 28febae。用户已指示推进 ST20（查看当前装备评分排行榜）。

- [实施规格](spec.md)
- [五项任务图与测试边界](task-plan.md)
- [本地草案检查](plan-check.json)
- [任务批准记录](plan-approval.json)
- [执行状态追踪](execution.json)

## 当前批准（2026-11-03）

用户“好的，先开始01吧”批准规格与五项任务图及测试边界，**本次仅启动 ST20-01**。
`spec.md` 更新批准 frontmatter，正文 hash 保持与草案一致；5 项独立 issues 已发布 accepted；接受任务不代表本次授权实施 02～05。

## 任务列表

1. [ST20-01: 评分排行服务核心、索引排序与分页查询协议](issues/01-ranking-service-query.md)（进行中）
2. [ST20-02: 短租约原子刷新缓存、TTL 新鲜度机制与并发抢锁](issues/02-cache-lease-ttl.md)（已计划）
3. [ST20-03: 本人名次三段式精准计数与大容量降级熔断](issues/03-own-rank-counter.md)（已计划）
4. [ST20-04: Cocos 排行榜面板与纯模型协调器](issues/04-cocos-ranking-panel.md)（已计划）
5. [ST20-05: 换装/强化即时刷新联合验收、物理预算与两轴评审](issues/05-joint-acceptance.md)（已计划）

## 约束与设计真相源

本工程仅保留仓库文档、不创建或同步 Jira。按 AGENTS 保留任务粒度/依赖的一次人工确认；确认后生成 accepted 独立任务并按图实施。
业务与协议真相源遵循：
- `docs/backend/source-of-truth.md`
- `docs/backend/ranking-query-baseline-v1.md`
- `docs/backend/scoring-projection-mapping-v1.md`
- `shared/src/protocol/asset-v2.ts`

他人装备检视、好友/公会榜单、排行榜赛季奖励结算及云端分布式数据库集群保持独立 GAP。
