# ST10-02 prepare与资源验证证据

2026-10-24。来源：Accepted [规格](../stories/warrior-loop/st10/spec.md)、[任务02](../stories/warrior-loop/st10/issues/02-prepare-resources.md)。实施worktree `.worktrees/st10-02-prepare`，分支`feat/st10-02-prepare`，基线/核对integration tip `cae0f5d8d14eb3853c6d33c5ace21870d21080d4`。未改冻结规格、任务修订或父执行状态；无Jira、push/MR、安装、云操作、GUI或Cocos构建。

## 结果与边界

ChallengeService.execute接入真实challenge.prepareRoom；沿真实身份/Login/Character/Town/Equipment入口创建的H执行首房prepare。一次确定attempt、固定站位与已锁紫名、绑定创建release/hash的资源manifest。生成时只写H/独立manifest/O三键，不扣体力、不生成CP、不启动战斗。H.transitionClock唯一保存计时基点，pending仅保存引用；相同意图不同operationId仍复用原manifest/时钟。

O以规范命令SHA-256绑定意图，只存原manifest引用/attempt/hash与原响应元数据；queryOriginal/operation.get恢复完整原响应，不读取H当前pending替代原结果。重试原命令返回replayed=true/当前serverTime，查询原结果保留原serverTime与replayed值。逐写点失败/提交丢响应、异参、旧身份和真实登录接管已验证。

严格challenge.get新增unpaidLoading/checkpoint=null分支，sceneEpoch0/currentRoom-1；不伪造CP/hash，也未全局放宽ready/模拟/分页的正epoch。H新增connection（初始connected）和timelineEpoch（初始0）。首房时无模拟时间锚点。活跃合同的字段/API/状态/物理/加载视图已同步。

LoadingCoordinator持久化原prepare命令，重新打开/取消/失败重试均保留同一操作/attempt；每次流程代次隔离迟到回调。必须对完整manifest正文及loader返回的实际Uint8Array逐一验证SHA-256/byteLength；缺件、错hash或伪造manifest不能进入loaded。

当前资源resolver只读取经verifyTestRelease验证的E01 publicRelease公开节点规范JSON实际字节（11项/2605字节），是明确level1/normal/contract-fixture-only，非真实Cocos Bundle/贴图加载，也非三本正式发布配置。实际部署需可保留历史release的资源resolver；缺锁定release时失败，不取latest。当前显式拒绝后续房，完整cleared/出口/继承计时留ST10-05；activate/ready留03，加载租约/恢复控制留04。没有ST11/12战斗或奖励冒充。

## TDD与验证

预先批准的公开seam：真实服务execute/query（含真实身份/角色/城镇/装备和MemoryStore边界）及严格DTO/wire；客户端transport/pendingStore/loader边界。

- 第一red：prepareFixture通过challenge.get读取未付房时，现有入口query抛INVALID_ENUM；补明确无CP查询与首房prepare后green。
- 第二red：LoadingCoordinator模块缺失ERR_MODULE_NOT_FOUND；实现实际字节验证/持久原意图后green。
- 第三red：pending房收到伪造expectedRevision=999仍返回manifest；补原prepare前或当前H版本/预期C版本校验后green。
- 真实接管反例发现关闭后角色epoch已更新，旧H.rolePlayEpoch无法读取closed视图；closed查询使用当前已验证角色epoch，仍检查当前账号/选角身份，green。

Focused：`node --test backend/test/challenge-prepare-v2.test.mjs backend/test/loading-coordinator-v2.test.mjs shared/test/scene-v2.test.mjs shared/test/e01-integration.test.mjs`，**21/21通过**。覆盖三写点原子回滚、提交丢响应、同房不同ID竞争、原引用不依赖当前H.pending、同ID异参、过期版本/跳房/死/恢复/终态/外身份、真实接管先后顺序、缺件/错hash/manifest篡改、取消后旧回调、重开原意图、32条最大escaped预期版本编码和epoch0严格拒绝边界。

Demo：`node backend/tools/demo-challenge-prepare.mjs`，输出资源失败→同原attempt重开并loaded；challenge仍epoch0/checkpoint=null/remaining308。仅展示加载状态，不激活战斗。

全量：`node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`，**7/7通过**（Node24.9.0/TS5.8.2）。日志`/tmp/st10-02-checks-final.log`，focused `/tmp/st10-02-focused.log`。本机检查不代表SDK事务/费用、真机或Cocos构建通过。

## 实际UTF-8编码

以下为实际JSON序列化，非对象内存估算：

| 对象 | 字节 | 应用上限 |
| --- | ---: | ---: |
| 首房prepare后H | 2629 | 131072 |
| 原prepare O（含32条最大escaped预期版本仍相同大小） | 1104 | 16384 |
| 独立manifest记录 | 2942 | 32768 |
| 原prepare完整响应 | 3212 | 32768 |
| unpaidLoading challenge.get响应 | 3617 | 32768 |
| 11项公开资源原始字节合计 | 2605 | 单项81920 |

manifest正文另有24576字节上限；资源ref唯一、map/spawn所需ref必须包含、资源1..128、spawns1..8，提交前先完成全部预算验证，避免拒绝路径提交局部H/manifest。上述是当前真实E01资源/首房编码，未声称后续完整CP最大包络已经通过。

## ST10-03接口交接

- ChallengeService路由prepare/private prepare，公开queryOriginal和resolveResource；hydrate始终沿O原ref。新增activate应复用这些manifest，不生成新attempt或复制资源正文进O。
- EntryChallenge.pendingRoomAttempt={roomNo,attemptId,manifestHash,configRef,preparedRevision,manifestRef}；H.transitionClock={attemptId,phase,settledAt,connectedElapsedMs,timeRemainder,transitionRevision}唯一归属，prepare不消费计时。activate需消费prefix、保留phase=awaitingReady；ready结清suffix后删H时钟。
- H.connection和timelineEpoch当前只建立未激活初值；后续在此H字段扩展控制/租约，不能复制进pending或另建第二时钟。CP沿loginKey(cpHeader/cpChunk)及handoff既有wrapper；未付首房继续无CP。
- RoomManifest/parseRoomManifest及shared/room-manifest.ts提供严格字段/规范SHA-256；spawns固定，资源为显式contract-fixture-only公开节点。LoadingCoordinator.state.loaded仅表示资源验证完成，不表示可以预测；后续需activate/完整状态/ready。
- LoadingCoordinator保留持久原prepare。后续在已确认activate完成、可恢复原状态之后再定义其安全退休；取消不删原操作、不换ID。restore(context)按session/role/challenge隔离，并用流程generation拒绝旧回调。
