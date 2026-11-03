# ST20-03 实现与验证

日期：2026-11-03
实现分支：`feat/st20-03-own-rank`，合入基点 `9a9880c`，源码提交 `ad1de71`。
范围：本人名次三段式精准计数与大容量降级熔断，包含 `(score DESC, scoreReachedAt ASC, characterId ASC)` 三段式互斥统计求和（比本人分高、同分先到达、同分同秒字典序小）、换装即时反映名次、大容量超额/异常降级返回 `ownRank: null`、异职业跨榜单隔离及纯只读保护。
来源：[ST20 实施规格](../stories/warrior-loop/st20/spec.md)、[03 实施任务](../stories/warrior-loop/st20/issues/03-own-rank-counter.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **三段式互斥统计核心算法（`backend/src/ranking/ranking-service.ts`）**：
   - 提取三段互斥统计函数，与稳定三元组排序 `(score DESC, scoreReachedAt ASC, characterId ASC)` 严格保持数学 1-to-1 等价：
     - $C_1 = \text{count}(\text{score} > \text{myScore})$（`countHigherScore`）；
     - $C_2 = \text{count}(\text{score} == \text{myScore} \land \text{scoreReachedAt} < \text{myScoreReachedAt})$（`countEarlierReached`）；
     - $C_3 = \text{count}(\text{score} == \text{myScore} \land \text{scoreReachedAt} == \text{myScoreReachedAt} \land \text{characterId} < \text{myCharacterId})$（`countSmallerId`）；
     - 本人排位 $\text{ownRank} = C_1 + C_2 + C_3 + 1$；
   - 组合实现单遍/多段计算工具 `computeThreePartTriadRank`，输出 `OwnRankCountSegments`（`higherScoreCount`, `earlierReachedCount`, `smallerIdCount`, `totalRank`）；
   - 严格保证本人（$E_{\text{own}}$）绝不参与自身排位累加计数，全集合各条目排位无空洞、无重叠。

2. **登录角色与排行条目读取（`RankingService.getOwnRankingEntry`）**：
   - 支持通过物理主键 `characterKey('rankingEntry', [characterId])` 极速读取当前装备评分条目；
   - 支持向后兼容从 `CharacterEntity` 或快照中读取已投影评分，健壮支持未单独落盘或单测环境；
   - 跨版本隔离：若条目 `scoreConfigRef` 与服务当前版本不一致，不参与本版本排位。

3. **换装即时响应与缓存解耦（AC20-5）**：
   - 在 `RankingService.query` 统一入口处即时基于最新事实计算 `ownRank`；
   - 换装或脱装改变评分及达到时间后，即便首屏列表处于 15 秒缓存新鲜期，`ownRank` 也即时反映上升或下降；
   - 解决首屏缓存 50 条与个人排位解耦问题，支持位于 50 名开外的任意角色准确获取自身真实名次。

4. **大容量降级熔断与异常保护（AC20-5）**：
   - 支持 `countCapacityLimit`：当候选规模超出容量预算时，自动触发降级返回 `ownRank: null`；
   - 支持故障注入模拟 `simulateCountFailure`：触发时优雅降级返回 `ownRank: null`；
   - 支持外部定制计数器 `countProvider`：出现超时、数据库过载或抛出异常时，内部捕获并优雅降级返回 `ownRank: null`；
   - 降级熔断时，排行榜条目列表、`rankAsOf`、`stale` 及分页游标完整正常返回，绝不抛出错误，也绝不伪造“未上榜”或 0。

5. **职业榜单与范围隔离（AC20-2）**：
   - 战士查询猎人榜单（`scope: 'hunter'`）时，返回 `ownRank: null`；
   - 战士查询战士榜单（`scope: 'warrior'`）或全服总榜（`scope: 'all'`）时，返回准确排位。

6. **查询只读与资产不变量（AC20-6）**：
   - 排行榜查询与名次聚合全程纯只读，0 次写事务修改角色数据；
   - 角色的 `scoreReachedAt`、`score` 及版本号绝对不变。

## 验证证据

1. **定向排行服务测试套件（`backend/test/ranking-service.test.mjs` 23/23 全部通过）**：
   - `AC20-5 三段互斥精确排位`：6 名包含完全同分、不同达到时间、同分同秒字典序排位角色，三段式计数 $C_1, C_2, C_3$ 与全量三元组排序排位 100% 严格一致；
   - `AC20-5 换装即时响应`：角色初始 Rank 2，换装评分上升即时成为 Rank 1（首屏缓存仍未过期），脱装评分下降即时回落 Rank 2；
   - `AC20-5 模拟失败降级`：`simulateCountFailure: true` 时，`ownRank` 优雅降级返回 `null`，榜单条目 100% 正常返回；
   - `AC20-5 容量超额降级`：`countCapacityLimit: 2` 下 3 条记录触发超额降级返回 `null`，调高阈值后恢复准确排位；
   - `AC20-5 自定义 Provider 异常降级`：外部统计提供器抛出异常被安全吸收，降级返回 `null`；
   - `AC20-2 职业隔离`：战士角色查询猎人榜返回 `ownRank: null`，查询战士榜与总榜返回真实排位；
   - `AC20-6 只读不变量`：多次跨榜单查询后，角色 `scoreReachedAt` 与 `score` 绝对未被修改。

2. **跨模块关联回归套件（41/41 全部通过）**：
   - `ranking-service.test.mjs`：23/23 通过；
   - `equipment-v2.test.mjs`：9/9 通过；
   - `equipment-rules.test.mjs`：5/5 通过；
   - `repair-joint-acceptance.test.mjs`：4/4 通过。

3. **TypeScript 类型安全与模型门禁**：
   - `backend/tsconfig.json` 与 `tools/tsconfig.models.json`：Exit Code 0；
   - 客户端纯模型回归（`check-model.cjs`）与 UI 模型回归（`check-ui-model.cjs`）全部 PASS（100% SUCCESS）；
   - 代码格式门禁：`git diff --check` 通过（0 告警）。

## 边界与已知限制

- 本次交付当前登录角色在排行榜中的精准名次聚合算法与大容量降级熔断。
- Cocos 排行榜面板与纯模型协调器留待 ST20-04；
- 全链路大闭环联合验收与两轴评审留待 ST20-05。
- 无 Jira、未向远程 push。
