# ST20-02 实现与验证

日期：2026-11-03
实现分支：`feat/st20-02-cache-lease`，合入基点 `c74d0fd`，源码提交 `e13ad34`。
范围：短租约原子刷新缓存、TTL 新鲜度机制与并发抢锁，包含 `rankCaches` 首屏独立确定键缓存、15 秒 TTL 新鲜期、60 秒最大过期回退、3 秒短租约与 CAS 抢锁防击穿。
来源：[ST20 实施规格](../stories/warrior-loop/st20/spec.md)、[02 实施任务](../stories/warrior-loop/st20/issues/02-cache-lease-ttl.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **确定键独立缓存与租约实体（`backend/src/ranking/ranking-model.ts`）**：
   - 定义 `rankCacheKey(scope, scoreConfigRef)`：基于 `characterKey('rankCache', [scope, scoreConfigRef])` 生成确定的物理主键；
   - 定义租约数据结构 `RankCacheLease`：包含 `token: string` 与 `expiresAt: number`；
   - 定义首屏缓存实体 `RankCacheEntity`：
     - `schemaVersion: 2`；
     - `version: number`（CAS 乐观并发递增版本号）；
     - `cachedAt: number`（缓存快照业务时刻）；
     - `entries: RankingEntryView[]`（首屏条目，默认缓存前 50 条）；
     - `totalAvailable: number` 与 `hasMore: boolean`；
     - `lease: RankCacheLease | null`（短租约占位与锁信息）。

2. **短租约与 TTL 新鲜度状态机（`backend/src/ranking/ranking-service.ts`）**：
   - **新鲜期命中（`age <= 15s`）**：
     - 直接从缓存返回首屏数据，0 次全表扫描；
     - 返回 `stale: false`，`rankAsOf: time(cachedAt)`；
   - **旧数据回退与并发抢锁（`15s < age <= 60s`）**：
     - 若已有其他工作者持有活跃租约（`lease != null && now < lease.expiresAt`），当前调用直接安全返回旧数据并显式标识 `stale: true`，`rankAsOf: time(cachedAt)`，有效阻断高并发击穿（Cache Stampede）；
     - 若租约空闲或已超时，当前调用原子占领 3 秒短租约（`expiresAt = now + 3000`），执行底层数据计算，递增 `version`、更新 `cachedAt` 并原子释放租约（`lease: null`），返回新数据（`stale: false`）；
   - **强制刷新（`age > 60s`）**：
     - 超过 60 秒禁止再返回旧数据；
     - 若其他工作者占锁则直读底层索引返回最新快照；若锁空闲则占锁刷新；
     - 确保返回数据为最新实时事实（`stale: false`，`rankAsOf: time(now)`）；
   - **3秒租约过期接管与防慢写覆盖**：
     - 超时后其他调用可合法接手过期租约；
     - 提交新缓存时通过 CAS 校验租约 token 与版本，防慢工作者写覆盖；
   - **游标翻页直读**：
     - 后续翻页（`cursor != null`）按设计直读稳定三元组索引，不占用首屏缓存，单文档严格处于预算内；
   - **只读与资产保护（AC20-6）**：
     - 缓存写入或失败绝不修改任何角色的 `scoreReachedAt` 或装备资产，非致命捕获保证只读查询高可用。

## 验证证据

1. **定向排行服务测试套件（`backend/test/ranking-service.test.mjs` 16/16 全部通过）**：
   - `AC20-4 冷启动写入`：验证首屏查询自动创建 `RankCacheEntity`，`version: 1`，`lease: null`，`stale: false`；
   - `AC20-4 15s 新鲜命中`：在 15s 内无论底层是否有新角色加入，均极速命中缓存返回 `stale: false`；
   - `AC20-4 15~60s 旧数据回退`：在租约被占用时立即返回旧缓存，`stale: true`，`rankAsOf: 1000`；
   - `AC20-4 15~60s 空闲刷新`：租约空闲时成功占锁刷新并释放锁，`version: 2`，`stale: false`；
   - `AC20-4 超60s强制刷新`：超 60s 禁止返回陈旧数据，强制刷新最新事实；
   - `AC20-4 3秒过期接管`：租约超时后后续查询顺利接手刷新，清空租约；
   - `AC20-4 并发防击穿`：并发双查询不发生死锁或崩溃，两查询均顺利完成且租约干净释放；
   - `AC20-6 资产不变量`：缓存无论读写或失败，角色属性、评分及达到时刻 100% 保持只读未修改。

2. **跨模块关联回归套件（34/34 全部通过）**：
   - `ranking-service.test.mjs`：16/16 通过；
   - `equipment-v2.test.mjs`：9/9 通过；
   - `equipment-rules.test.mjs`：5/5 通过；
   - `repair-joint-acceptance.test.mjs`：4/4 通过。

3. **TypeScript 类型安全与模型门禁**：
   - `backend/tsconfig.json` 与 `tools/tsconfig.models.json`：Exit Code 0；
   - 客户端纯模型回归（`check-model.cjs`）与 UI 模型回归（`check-ui-model.cjs`）全部 PASS（100% SUCCESS）；
   - 代码格式门禁：`git diff --check` 通过。

## 边界与已知限制

- 本次仅交付首屏确定键缓存、15s/60s 新鲜度机制与 3s 短租约 CAS 抢锁。
- 本人名次三段式精准计数与大容量降级留待 ST20-03；
- Cocos 排行榜面板与纯模型协调器留待 ST20-04；
- 全链路大闭环联合验收与两轴评审留待 ST20-05。
- 无 Jira、未向远程 push。
