# ST16 backend 只读预检（2026-10-30）

性质：实施准备的源码探索，不是正式 code review、ST16 完成验收或新合同。仅新增本文；没有修改游戏代码、测试、Git、Jira、云或依赖。基线由主任务提供：feat-1.0.0 / 361ea7b。本文不据测试名宣称通过。

## 权威与范围

已读根 AGENTS.md、GLOSSARY.md、source-of-truth.md、st16.md，并沿索引读取恢复时序、加载握手、CP schema、内容包络和保留合同。产品原10秒、严格截止、同会话短恢复与新 launch 回旅店规则不变。ST16 的硬依赖是 ST15 已确认资产/真实终局能力，不要求先完成其全部平台门禁；所有 SDK、真实网络和生产包络结论另记。

## 可复用实现及证据强度

| 能力 | 源码与实际已有断言 | 本轮结论 |
| --- | --- | --- |
| 固定恢复截止 | challenge-service.ts:532 的 `expired` 使用 `now >= (recoveryUntil ?? leaseUntil)` 并独立核对 deathDeadline；564 起 suspend 固定 now+10000；569 起 resumePrepare 沿旧截止且递增 timelineEpoch | 基础已存在。loading-recovery-v2.test.mjs 实际循环检查10999/11000/11001静默边界及13999/14000/14001 ready边界；死亡截止用人工置入5000验证，不能代替真实死亡映射联合验收 |
| 时间段与输入缺口 | challenge-service.ts:621 起 movementGap 以 inputGapBaseAt 差值 `<2000` 放行，否则冻结 CP、沿旧 leaseUntil 进入 recovery；613 普通 ready 和586恢复 ready 首次设新活动段基点；838新输入更新事实 | 原语不是待重写功能。仍需在真实战斗 ready 后证明1.9秒可校验、2.0秒到期、心跳与 ready 重放不移动基点、旧输入不能推进 |
| 准备/分页/ready | 569起 resumePrepare 冻结头、票据绑定 revision/hash/manifest/timeline；489起 recoveryPage 验票据、当前头及全量公开 hash；582起 ready才恢复连接 | 已有加载恢复用例实际取页并 verifyRecoveryPages，但场景仍 awaitingReady，不能据此宣称真实 active/dead/looting 恢复完整 |
| CP完整性 | room-checkpoint.ts 的 readCheckpoint 验头/每块 sceneEpoch、chunkRevision、hash及实际data摘要，再复读头 canonical 一致；只依当前头引用，不要求块版本都等于头 | 读路径符合混块保护方向；ST16应覆盖8块、合法未变化旧revision块、已退役ordinal缓存和分页混版。不可把8块编码压力用例自动算成恢复用例 |
| 原控制结果 | sceneControl先授权再按 command/seq+tuple查8条控制回执，重放不进入新执行；queryOriginalReady/Control独立历史查询 | loading-recovery-v2 实际注入每写点失败/响应丢失；recovery-coordinator-v2 实际保留未知意图、先查原请求且拒绝替换序号。历史回执不是当前预测许可；控制8条窗口与长期 O 保留是两种机制 |
| 原场景不重建 | 恢复只写H/CP头而未调用initialCheckpoint，sceneEpoch、roomAttempt/掉落来源不变，timelineEpoch递增 | 现有 recovery-demo 实际断言同付费attempt、体力仅一次及purple spawn；尚未串真实ST15装备/地面来源/奖励再恢复 |
| 新launch关闭旧关 | login-handoff.ts:125回旅店并重置角色态，139起active→failed、completed保留成功，只关闭场景和CP写权；不删除权威room来源 | loading-recovery-v2实际执行LoginService接管，在suspend前后两顺序拒绝旧会话回放；其completed过期测试通过人工置result，真实终局交叉仍需补 |

## ST15 的真实接点与优先风险

1. **死亡映射已有实装，应保留再联合验证。** shared/src/monster-simulation.ts:484–489 将死亡tick映射为 `context.serverTime + tick*10`，服务层727传入 `anchorWallAt-anchorTick*10`，783继承内核deadline。boss-death-tail.test.mjs:29实际断言11133，34断言空输入不延期，35–36断言缺口不推进残留、到期失败；这比人工死亡夹具更强。但真实dead→suspend→prepare→ready在deadline−1/equality两侧、原提交unknown与恢复争用还缺专门联合证据。服务层783仍有now+10000兜底；应验证正式可达死亡总有内核deadline，而不是未经证明删除或依赖兜底。
2. **looting是高优先联合边界。** ST15提交801写completed/looting，boss-death-tail:18真实断言免费复活、deathDeadline清除、stamina仍unsettled；831写真实clearReceipt。输入缺口入口仅roomPhase=active，需确认真实terminal的nextRoomPhase与所有控制/查询接线；recoveryPage无当前票据时明确要求result=active且alive（499附近），不能用旧成功ready回执直接读取completed当前证明。应以真实Boss结算→悬停超过2秒但未过租约→拾取/恢复→到原10秒关闭作demo，保留成功及已确认资产，未拾取地面不补成待领。
3. **未知O与控制竞争未被现有加载demo覆盖。** recovery-demo只模拟resume及两次ready响应丢失；它没有一个真实ST15 submit/collect处于unknown后与suspend/resumePrepare抢同CP/A/H的两提交顺序。需证明旧O先提交则确认资产保留，prepare先提交则旧timeline无新写权；notFound不能清意图或换operationId。
4. **恢复不是奖励重算入口。** ground-drop-collect及terminal-settlement已提供固定来源/原结果、装备物化、奖励路由和原子事务。ST16应消费这些现成事实，禁止重新调用入场初始化或重抽奖励。保留合同要求首版不自动TTL operations、来源终态和资产流水；关闭只移出玩家视图，不物理删去重事实。

## 建议送用户确认的三条垂直切片

- **ST16-01 活动战斗原状态恢复：** 真实ST12战斗+ST15来源fixture，合法新输入→suspend→prepare→完整分页/资源→ready→新输入；同时展示原sceneEpoch/dropId/CD/HP/MP/余数/敌人效果/随机游标保留、timeline换代、1.9/2.0秒与旧包拒绝。依赖现有CP读取/公开证明/控制协调器；完成点须是可重复命令demo而非只添数据库字段。
- **ST16-02 unknown、死亡与截止竞争：** 基于01串真实submit/collect丢响应和两提交顺序；真实死亡节点映射→暂停→截止−1/equality/+1，ready重放/心跳不续命，新launch接管回旅店。依赖真实MemoryStore OCC/故障注入及ST15持久原结果；以资产、来源、游标和期限不变量展示结果。
- **ST16-03 通关拾取与最大视图恢复：** 基于01/02串真实Boss通关/免费复活/奖励route→looting恢复→拾取→超时仅关闭；小CP与最大8块分页的丢页、乱页、混版本、旧块、迟到原结果隔离联合demo。依赖ST15最新结果包v2与真实终局fixture；不将合成499页样本视为任意高熵1024页或生产包络通过。

这些是任务图输入，不是已批准颗粒度或编码授权；不创造新编号合同替代权威正文。

## 本轮执行与未执行

已逐段读取上述服务、CP、handoff、真实死亡映射、loading/recovery测试正文及ST15死亡/终局断言。未新增测试。尝试 `node --test backend/test/loading-recovery-v2.test.mjs backend/test/recovery-coordinator-v2.test.mjs backend/test/boss-death-tail.test.mjs`，当前受限环境在测试文件派生时全部 `spawn EPERM`，业务测试体未执行；尝试 `--test-isolation=none` 被当前node以bad option拒绝。因此本轮无新增测试通过证据，也没有把环境失败判为业务失败。未运行SDK/真实传输/浏览器或手机E2E、云、安装、部署、迁移与全套测试；以上均不得由静态探索代替。
