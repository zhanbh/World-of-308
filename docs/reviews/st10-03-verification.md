# ST10-03 activate/ready 验证证据

2026-10-24。Accepted 规格/任务来源：`docs/stories/warrior-loop/st10/spec.md`、`issues/03-activate-ready.md`、`task-plan.md`（均只读）。工作树 `.worktrees/st10-03-activate`、分支 `feat/st10-03-activate`，基线及提交前 integration tip `e61761994f60fbf3f201d50a1c626379a985fd2f`。沿 build/implement-spec/TDD 工作流，已确认真实服务/MemoryStore/strict DTO 与客户端 transport/persistence/resource seams；本票内部客户端与摘要子任务并行，无另立故事/任务。未操作 Jira、push/MR、安装、云、GUI/Cocos 构建或父执行状态。

## 结果与实际边界

真实 Identity/Login/Character/Town/Equipment→start→prepare→资源字节校验→activate→完整公开证明→ready 路径打通，演示止于 active。activate 同事务写 A 栅栏、H、确定 room、CP 头、两个实际非空块、O 共七个写点；扣本局快照至最低 0 一次，不因中途武器为零额外暂停。严格预期版本/身份/连接/原截止、确定 attempt/manifest、相同意图竞争和原操作重放均有验证。O 保留规范命令摘要及小型原状态/票据，无完整 CP/expected 数组。

CP 外层沿 login-handoff 原 cpHeader/cpChunk 键、归属和 canonical(data) SHA-256。内层 schemaVersion=1 明确角色/场景层；非空玩家、固定 manifest 敌人、七组 CD、装备修订、分开的 HP/MP 余数、真实技能解锁和发布来源可恢复。等级1只解锁 cross。只有实际两个块，不预建空块；ready 仅改逻辑时间与锚点时保持角色/场景块修订及摘要不变。头→全部引用块→头一致性读取；接管关闭后头整体修订可以高于保存的最后模拟视图修订，当前只读投影采用关闭头修订，不篡改旧块。

**支持域限制**：初始 v1 明确不接受非空 buffs/effects/snapshots 或未知 schema，不静默删除数据。E01 未配置自然回复率，regenerationRef=null，不添加默认回复。该票没有实现 ST11 战斗或全部3648效果/228快照编码；这里只证明当前支持的非空玩家/最多8敌/CD域预算，未来战斗 schema/最多8块的完整包络仍须另验。后续 ST10-05 不得重用首房初始化重置已有角色；必须继承可识别状态或拒绝未知域。

唯一 H.transitionClock 增加 consumedElapsedMs 水位；activate 消费累计合法联网前缀并保留时钟，ready 消费累计量减水位的后缀再删除。timeRemainder 单位是不足一个10ms tick的约分分数；CP logicalTimeMs 为角色精确毫秒游标，acceptedTick=floor(ms/10)、timeRemainderMs=ms%10。5秒绝对 CD、2秒前缀+1秒后缀后剩2秒；此测试明确通过存储边界注入已确认受伤/CD状态，不宣称首房会自然携带未冷却技能。6ms+7ms 保留1tick+3ms。awaitingReady 没有活动锚点/inputGapBaseAt/输入接收；ready 一次建立锚点并保存有界原控制回执。

完整公开摘要覆盖有序公开记录数组（规范对象键，保留数组顺序），客户端自行重算，不只比较语法元数据。删/改/重排、缺页、混票据/修订、私有字段均受现有严格解析及摘要约束。客户端持久化原 activate、原 ticket、原 ready controlSeq/leaseRevision 与已验证基础页；未知结果先查原结果，不存在才原请求重发。重载重验资源/基础页，并隔离旧异步回调。已提交 ready 的原页可能不再由服务端基础分页接口提供，重验持久页仅用于原基线证明；原回执之后还须读取当前 challenge.get，过期/撤销/换代/摘要变化均不能启用预测。

## TDD 与验证命令

- 首个 red：activate 经过现有入口抛 `UNSUPPORTED_PROTOCOL`；实现原子激活后 green。
- 时钟 red：6ms 激活后 timeRemainder 仍0/1，预期3/5失败；明确10ms tick分数并保存后 green。
- strict CP red：数值 attackPower 被当作字符串资源接受；加内层字符串校验后 green。
- 接管回归 red：关闭头 revision 已递增，内层最后模拟 state revision 未变，当前 closed 查询失败；显式区分关闭头与历史模拟视图后 green。
- 共享证明/客户端先有缺模块 red；后续删除当前状态门禁使历史 ready→已过期场景回归失败，恢复门禁后 green；迟到回复/已提交日志重载也有独立断言。

Focused：`node --test backend/test/challenge-activate-v2.test.mjs backend/test/room-checkpoint-v2.test.mjs backend/test/activation-coordinator-v2.test.mjs shared/test/public-state-proof.test.mjs shared/test/scene-v2.test.mjs`，**26/26通过**，日志 `/tmp/st10-03-focused.log`。

覆盖激活7个/ready3个写点原子回滚、两次提交丢响应、精确 operation.get/原 ready 查询、同ID异参、同房不同ID竞争、旧身份/角色/修订/场景票据、原 lease/recovery/death 截止、真实接管两种顺序及关闭后读取、快照0/破损途中不加门禁、CD/受伤资源/余数保留、亚tick精度、严格内层/schema/公开摘要、客户端资源/完整证明/当前状态/迟到回调门禁。

全量：`node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`，**7/7通过**（Node24.9.0/TypeScript5.8.2），日志 `/tmp/st10-03-checks-final.log`。新 ActivationCoordinator 已加入纯模型类型项目。

可重复 demo：`node backend/tools/demo-challenge-activate.mjs`，日志 `/tmp/st10-03-demo.log`；输出 resources verified → activate reply lost → operation.get → complete digest → ready reply lost → reload/reverify → scene.status original → active/prediction enabled/one fee。仅 E01 contract-fixture-only JSON 资源，非真实 Bundle/图片加载。没有正式 SDK 事务/费用、Cocos GUI/build、真机、正式三本发布或 ST11/16 整体验收声明。

## 实际 JSON UTF-8 字节

所有数字包含实际外层字段及 JSON 转义；不是对象内存估算。激活 O 测试包含32条最大 expected（原数组仅摘要，不膨胀 O）。

| 对象 | 实测字节 | 应用上限 |
| --- | ---: | ---: |
| activate 后 H | 2823 | 131072 |
| CP 头 | 1594 | 16384 |
| 真实非空 role / scene chunk | 1830 / 2305 | 每块81920 |
| activate 响应 / 原 O | 1513 / 1783 | 32768 / 16384 |
| 公开基础页 | 2470 | 32768 |
| ready 响应 / H内原ready回执 | 746 / 924 | 响应32768；回执计入H |
| ready 后 H | 3177 | 131072 |
| 当前严格内层最大8敌/7CD/escaped长ID/u64资源 role / scene chunk | 4451 / 16032 | 每块81920 |

最大夹具覆盖128字符 actorId、64字符动作/配置/技能引用（含双引号/反斜线真实转义）、8敌每敌8技能、uint64最大资源、最大安全tick/版本、32位最大合法约分余数。未来效果包络和SDK额外字段不由这些数字推断通过。

## ST10-04 交接

- H 已有 controlSeq、heartbeatSeq、lease；start 初始化 connected/10秒 lease/revision0，activate和查询/重放不续租，ready 新成功才设 lastEvidenceAt/leaseUntil 并递增 leaseRevision；H业务version不与独立心跳混用。完整 heartbeat/suspend/resume/到期终局仍由04接入。
- H.readyTicket 是唯一原基线票据；H.lastReadyReceipt 仅最后一个成功ready，含原意图摘要/controlSeq/ticket/result，不开 assetOp。`queryOriginalReady`/execute(scene.status)以**原**controlSeq和ticket读取原 scene.ready 响应，不消耗新序号。04扩展一般status时保留精确原查询分支；原回执永远只证明历史结果。
- `transitionClock.connectedElapsedMs` 累计已保存合法联网ms；`settledAt`为累计边界；`consumedElapsedMs`为已写入CP角色时间的水位。04进入recovery先累计到合法边界并移动settledAt；恢复只移动边界、不累计recovery；ready取累计+当前connected差值减水位，非负/安全整数校验后一次消费。禁止第二时钟/CP内消费水位。
- CP header logicalTimeMs/timeRemainderMs 与acceptedTick一致。头整体revision可变而未变chunkRevision不动。04必须沿 readCheckpoint 的完整引用校验，并保留当前严格初始schema；需要新字段时同步严格codec/DTO/预算。
- 当前查询在已有截止到达时返回DEADLINE_EXPIRED并禁止客户端预测；04负责原合同的原子失败/关闭/结算，不能将查询时刻作为新10秒起点。
- 当前仅首房prepare/activate；后续cleared/出口/角色继承和分段regen在05。不可用新room初始化补满血蓝或清CD。
