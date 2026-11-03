# ST20-01 实现与验证

日期：2026-11-03
实现分支：`feat/st20-01-ranking-service`，合入基点 `a8304ae`，源码提交 `2805636`。
范围：评分排行服务核心、索引排序与分页查询协议，支持稳定三元组排序、全榜与职业榜隔离、公式配置隔离、有界签名游标分页与查询纯只读。
来源：[ST20 实施规格](../stories/warrior-loop/st20/spec.md)、[01 实施任务](../stories/warrior-loop/st20/issues/01-ranking-service-query.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **排行领域模型与协议类型（`backend/src/ranking/ranking-model.ts`）**：
   - 定义排行榜范围枚举 `RankingScope = 'all' | 'warrior' | 'hunter'`；
   - 定义有界游标荷载结构 `RankingCursorPayload`：包含版本（`v: 1`）、榜单范围 `scope`、公式配置 `configRef`、排序锚点（`rank`、`score`、`reachedAt`、`charId`）及签发时间 `iat`；
   - 定义榜单列表对外视图 `RankingEntryView` 与 `RankingListResult`；
   - 实现实体守卫函数 `isRankingEntryEntity`：严格校验 `RankingEntryEntity` 必须具备 `schemaVersion: 2`、合法 `classId`、`scoreConfigRef` 及时间字段。

2. **核心评分排行服务（`backend/src/ranking/ranking-service.ts`）**：
   - **稳定三元组排序（`compareRankingEntries`）**：严格遵循 `(score DESC, scoreReachedAt ASC, characterId ASC)`；
     - 固有评分高者在前；
     - 同分保持先到达时刻者在前（达到时刻小者排前）；
     - 同分同秒按 `characterId` 字典序升序确定唯一确定性名次，绝无平局漂移。
   - **榜单范围与公式版本严格隔离**：
     - `scope === 'all'`：全服总榜（战士 + 猎人）；
     - `scope === 'warrior'`：战士专榜；
     - `scope === 'hunter'`：猎人专榜；
     - `scoreConfigRef`（默认 `'score-v1'`）严格隔离，不同公式版本分榜存储，严禁新旧公式混杂。
   - **有界安全游标编解码（`encodeCursor` / `decodeCursor`）**：
     - 使用 Web Crypto API（HMAC-SHA256）对 URL 安全 Base64 荷载签名；
     - 游标字符严格受限于 512 字节（`asset-v2.ts` 协议上限）；
     - 防篡改：对荷载篡改、签名损坏、格式破坏严格拒绝；
     - 防跨域混用：当游标中的 `scope` 或 `configRef` 与当前请求不匹配时立即拒绝；
     - 防重放过期：默认 10 分钟 TTL 过期拒绝（`CURSOR_EXPIRED` -> `INVALID_ARGUMENT`）。
   - **协议接入与只读不变量（`RankingService.query`）**：
     - 接入标准协议请求 `ranking.list`（`{ scope, cursor, pageRequest }`）；
     - 严格只读（AC20-6）：全流程 0 次调用 `tx.set`，绝不修改角色的 `scoreReachedAt` 或评分数据；
     - 关联已登录会话识别 `ownRank`：已登录且有选角返回 1-based 名次，未登录或未上榜返回 `null`。

## 验证证据

1. **定向排行服务测试套件（`backend/test/ranking-service.test.mjs` 8/8 全部通过）**：
   - `AC20-1 三元组稳定排序`：验证多维度组合（分高优先、先到优先、字典序保底）排序 100% 符合预期；
   - `AC20-1 分数波动时间重置`：验证角色分数经历 500 → 600 → 500 波动后，最新达到时刻重置，排名正确落后于同为 500 分但更早达到的其他角色；
   - `AC20-2 范围与公式隔离`：验证全服榜、战士榜、猎人榜精确过滤，且 `score-v2` 异版本配置被完全排除；
   - `AC20-3 有界游标翻页`：验证使用 `pageRequest: 3` 连续翻 3 页遍历 7 个条目，跨页数据 0 重复且总集合 100% 覆盖，末页 `nextCursor === null`；
   - `AC20-3 游标安全校验`：验证荷载篡改、签名篡改、范围错配、10分钟超时及非法格式均被严格拒绝并返回 `INVALID_ARGUMENT`；
   - `AC20-6 查询纯只读`：在查询前后捕获存储全部文档快照，验证键数量与全部文档内容 100% 一致无修改，`scoreReachedAt` 绝对不变；
   - `ownRank 判定`：验证已登录当前角色准确返回本人名次，未知会话安全返回 `null`；
   - `协议边界防护`：验证不支持的 query 名抛出 `UNSUPPORTED_QUERY`，非法 scope、超出 1~50 限制的页大小均被协议解析器拦截。

2. **跨模块关联回归套件（26/26 全部通过）**：
   - `backend/test/ranking-service.test.mjs`：8/8 通过；
   - `backend/test/equipment-v2.test.mjs`：9/9 通过；
   - `backend/test/equipment-rules.test.mjs`：5/5 通过；
   - `backend/test/repair-joint-acceptance.test.mjs`：4/4 通过。

3. **TypeScript 类型安全与模型门禁**：
   - `backend/tsconfig.json` 与 `tools/tsconfig.models.json` 使用 TS 5.8.2 检查 Exit Code 0；
   - 客户端纯模型回归（`check-model.cjs`）与 UI 模型回归（`check-ui-model.cjs`）全部 PASS（100% SUCCESS）；
   - 代码格式门禁：`git diff --check` 通过。

## 边界与已知限制

- 本次仅交付排行核心算法、排序规则、游标分页协议与纯只读服务。
- 首屏短租约 15s/60s 缓存与 CAS 抢锁机制留待 ST20-02；
- 本人名次三段式精准计数与容量降级留待 ST20-03；
- Cocos 排行榜面板与纯模型协调器留待 ST20-04；
- 全链路大闭环联合验收与两轴评审留待 ST20-05。
- 无 Jira、未向远程 push。
