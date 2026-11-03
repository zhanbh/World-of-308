# ST20-05 实施与联合验收验证

日期：2026-11-03
范围：换装/强化即时刷新联合验收、物理读写与网络传输预算实测、防击穿并发抢锁与熔断降级、OCC 安全竞争及两轴独立评审。来源为已批准 [ST20 实施规格](../stories/warrior-loop/st20/spec.md)、[05 实施任务](../stories/warrior-loop/st20/issues/05-joint-acceptance.md) 及 [开发真相源](../backend/source-of-truth.md)。没有创建、同步或回填 Jira。

## 联合验收闭环实现

在 `backend/test/ranking-joint-acceptance.test.mjs` 中构建并完整验证了真实全流程端到端联合验收套件（4/4 全部通过）：

### 1. 端到端大闭环（Subtest 1 - AC20-1, AC20-2, AC20-5, AC20-7）
- **初始多职业榜单查询与作用域隔离**：
  - 种子角色包含神箭手（猎人，评分 2500，达成时间 1000）、重剑士（战士对手，评分 2200，达成时间 1050）与战士主角（银行，穿戴白装初始评分 2040，达成时间 1000）；
  - Scope `all`：神箭手 #1、重剑士 #2、战士主角 #3，主角 `ownRank === 3`；
  - Scope `warrior`：重剑士 #1、战士主角 #2，主角 `ownRank === 2`；
  - Scope `hunter`：仅神箭手 1 人，战士主角 `ownRank === null`（跨职业作用域严格隔离，异职业不伪造“未上榜”）；
- **真实玛丽强化（ST18）评分与达到时间变动**：
  - 通过 `EnhancementService.execute` 进行 +1 至 +10 连续真实强化；
  - 武器强化等级提升至 +10，角色固有属性穿戴评分从 2040 升至 3040；
  - 事务同笔写入 `character.score` 与 `RankingEntryEntity` 投影；
- **15 秒缓存新鲜期内本人名次即时刷新（AC20-5）**：
  - 在首屏缓存 15 秒 TTL 新鲜期内（`stale: false`），客户端 `RankingCoordinator` 刷新请求；
  - 本人名次采用三段式互斥统计求和算法实时计算：
    - $C_1$（比本人 3040 分高者）= 0；
    - $C_2$（同分先达成者）= 0；
    - $C_3$（同分同秒字典序较小者）= 0；
    - 实时计算得出 `ownRank === 1`；
  - 即使缓存首屏仍展示历史快照条目，本人名次横幅（`OwnRankBanner`）即时登顶 #1；
- **缓存 TTL 过期穿透与榜单全量置顶**：
  - 时钟推进 16 秒（超过 15 秒 fresh TTL），下一次请求触发短租约原子刷新；
  - 首屏榜单数据刷新，战士主角（3040）跃居榜首第 1 名，神箭手（2500）降至第 2 名，重剑士（2200）降至第 3 名；
- **真实脱装（ST05）评分归零与名次跌落**：
  - 通过 `EquipmentService.execute('equipment.unequip')` 卸下武器进入背包；
  - 角色穿戴评分降为 0，达到时刻重置为当前时刻；
  - 即时查询本人名次立即跌落至第 3 名；缓存过期刷新后条目列表主角以 0 分排在第 3 名；
- **重新穿装与三元组同分同秒精准裁决（AC20-1）**：
  - 通过 `EquipmentService.execute('equipment.equip')` 重新穿戴 +10 武器，评分恢复至 3040，达成时间更新为 `t_reequip`；
  - 注入老练战士对手（评分同样为 3040，但达成时刻为 `t_reequip - 1000`）；
  - 查询战士榜：老练战士先达到（`scoreReachedAt ASC`）居第 1 名，主角排在第 2 名（`ownRank === 2`），完美验证 `(score DESC, scoreReachedAt ASC, characterId ASC)` 稳定三元组排序。

### 2. 物理读写与网络传输预算实测（Subtest 2 - AC20-4, AC20-6, AC20-8）
在 50 条条目（满页满额）极限场景下实测物理文档与传输开销：
- **`rankCaches` 首屏缓存文档物理尺寸**：
  - 实测：**12,604 字节**（约 12.3 KiB）；
  - 硬约束上限：$\le 16,384$ 字节（16 KiB）；
  - 预算合规率：100%（预留 23% 安全裕量）；
- **`RankingEntryEntity` 角色排行条目实体尺寸**：
  - 实测：**335 字节**；
  - 硬约束上限：$\le 16,384$ 字节（16 KiB）；
  - 预算合规率：100%（远低于 1 KiB）；
- **`ranking.list` 单页响应网络传输体积**：
  - 实测：**12,532 字节**（约 12.2 KiB）；
  - 硬约束上限：$\le 65,536$ 字节（64 KiB，`assetQueryMaxBytes` 契约）；
  - 预算合规率：100%（仅占预算上限约 19%）；
- **事务读写次数与纯只读零副作用门禁（AC20-6）**：
  - 缓存命中（Cache Hit）：**写操作 = 0 次**，读操作 $\le 5$ 次；
  - 缓存刷新（Cache Refresh）：**唯一写键 = 1 键**（仅限 `v2:rankCache:...`），写调用 = 2 次（CAS 租约写入 + 缓存条目提交），角色/装备/背包/钱包/邮件写操作 = 0 次；
  - 严格证明排行查询 100% 具备纯只读属性，绝不反写角色事实或触发资产回滚。

### 3. 防击穿并发抢锁与熔断优雅降级（Subtest 3 - AC20-4, AC20-5）
- **10 并发防击穿回退验证（Stampede Protection）**：
  - 在 15s~60s 过期平滑降级期内，持有 3 秒 CAS 活跃租约下并发执行 10 笔查询；
  - 全部 10 笔查询 100% 返回成功，其中处于租约锁定期安全回退至旧缓存并显式附带 `stale: true`，无任何阻塞、重叠全量扫描或服务崩溃；
- **3 秒租约超时接管（Lease Takeover）**：
  - 推进时间超过 3 秒租约失效期，后续新请求成功识别过期租约并接管刷新，返回 `stale: false` 并清理租约标志；
- **大容量超额熔断与优雅降级（Graceful Degradation）**：
  - 配置 `countCapacityLimit: 5` 且存在 10 条条目；
  - 触发容量熔断保护，`ownRank` 优雅降级返回 `null`，而前 10 条榜单条目与快照时间正常返回，绝不抛出未捕获异常或伪造未上榜；
- **底层写存储故障资产零污染（Fault Injection）**：
  - 注入缓存写入物理故障（`StoreUnavailable`）；
  - 排行服务自动降级为有界直读并正常返回列表数据，角色资产、装备评分与达成时间未受任何脏数据污染。

### 4. 并发换装/强化与排行查询 OCC 安全竞争（Subtest 4 - AC20-8）
- 模拟换装脱下武器与排行列表查询同时并发执行；
- OCC 乐观并发控制串行化安全裁决，脱装成功提交后，后续排行查询稳定读取穿戴变更后状态，无死锁、无幽灵读、无资产丢失。

## 验证与测试汇总

- **ST20 全套自动化测试（3 套共 33/33 全部通过）**：
  - `backend/test/ranking-service.test.mjs`：23/23 通过（三元组稳定排序、分职业隔离、HMAC 游标编解码、15s TTL/60s stale 缓存机制、3s 租约 CAS 抢锁、三段互斥计数算法、熔断降级与只读不变量）；
  - `backend/test/ranking-cocos.test.mjs`：6/6 通过（纯模型协调器状态机、generation 代次迟包过滤、角色 ID 跨页去重、Cocos 排行榜面板全服/战士/猎人 Scope 切换、OwnRankBanner 金色置顶悬浮、前三名奖牌色与网络重试）；
  - `backend/test/ranking-joint-acceptance.test.mjs`：4/4 通过（换装/强化端到端大闭环、物理存储与传输预算测量、防击穿并发与降级、OCC 安全竞争）。
- **关联回归套件验证**：
  - `backend/test/equipment-v2.test.mjs`：通过；
  - `backend/test/equipment-rules.test.mjs`：通过；
  - `backend/test/enhancement-joint-loop.test.mjs`：通过；
  - `backend/test/repair-joint-acceptance.test.mjs`：通过；
  - `backend/test/drop-joint-acceptance.test.mjs`：通过。
- **TypeScript 静态类型检查**：
  - `backend/tsconfig.json`：Exit Code 0；
  - `tools/tsconfig.models.json`：Exit Code 0。
- **客户端纯模型与 UI 模型门禁**：
  - `node client/tools/check-model.cjs`：通过；
  - `node client/tools/check-ui-model.cjs`：通过（100% SUCCESS）。
- **代码格式与风格门禁**：
  - `git diff --check`：通过，无多余空白行或缩进异常。

## 结论

ST20-05 端到端联合验收、物理预算与并发竞争实测全部合规，全套自动化门禁 100% 通过。
