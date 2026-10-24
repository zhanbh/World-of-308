# ST10-04 加载恢复验证

2026-10-24。范围为已批准 ST10-04；基线 `7ab61844f02364182f12285358aec64eac23bfe7`。本地规格/任务与加载、恢复、CP合同为真相源；未修改冻结spec/任务图或父execution记录，无Jira/推送/云资源/安装/GUI/Cocos构建。

## 实际交付与红绿证据

- 原先scene.suspend执行进入challenge解析器，首个公开服务测试以UNSUPPORTED_PROTOCOL失败；接通独立控制与epoch0无CP分支后通过。未付首房恢复保留原attempt/manifest/紫名，无假CP/hash/分页、无房费。
- 到期查询原来仍返回connected，deadline equality反例失败；同事务关闭/体力结算/A指针/角色旅店交接后通过。paid/unpaid均测截止−1、相等、+1，显式suspend固定now+10000，静默恢复沿原leaseUntil，deathDeadline不重置。completed仅关闭并保留成功。
- heartbeat原来错误推进H.version，反例2≠1失败；独立heartbeatSeq/lease.revision后通过。重复原控制/心跳不续期或重置锚点，同序号异意图拒绝，旧序号/旧timeline/旧角色与接管session不能新写。
- 实际客户端重开/原ready查询集成一度因旧scene.status路由吞掉null当前状态分支失败；保留精确非null原查询并接通null当前查询后通过。恢复准备和两次ready均模拟已提交丢响应、重开、查询原结果，最后读取新鲜当前状态才允许预测。

当前12个服务/预算测试和3个客户端持久化/真实服务组合测试，均位于backend/test并进入正常check-all。测试缝为已确认的公开服务、MemoryStore事务故障/竞争、严格wire和durable客户端，不对未来战斗内核造假。

## 原子性、真实组合与字节

逐写点故障覆盖heartbeat、suspend、resumePrepare、recovery-ready和expiry，paid/unpaid两分支：

| 路径 | 实际写集合/数量 |
| --- | --- |
| 未付heartbeat/suspend/resume/ready | A、H：2 |
| 已付heartbeat | A、H：2 |
| 已付suspend/resume/recovery-ready | CP header、A、H：3，未变块不重写 |
| 未付expiry | character、H、handoffJournal、A：4 |
| 已付expiry | character、H、CP header、handoffJournal、A：5 |

每个故障点整事务回滚；丢响应读取原回执不写、不重复计时。控制不创建assetOp，H只保留最近8个回执，未付manifest保存不可变引用并复原原响应，淘汰/未找到不解释为未提交。真实LoginService在恢复前/后接管均关闭旧场景、已付体力仍307且旧session连原结果也不能读取；expiry保持原session active，日志为scene.expire，真实TownService随后可退出旅店到城镇。旧03原ready查询行为保留；其旧“当前到期仅报错”断言已按04关闭合同更新。

| 实测UTF-8，包含wrapper | 字节 | 上界 |
| --- | ---: | ---: |
| 未付H，8个控制回执 | 10250 | 131072 |
| 未付控制响应（含真实manifest） | 3570 | 32768 |
| 已付suspend后H / header | 3663 / 1594 | 131072 / 16384 |
| 已付suspend响应 | 985 | 32768 |

CP仍沿03完整ref/hash/schema校验与既有非空actor/CD块，恢复只改头，不重新抽怪、清CD或补满HPMP。以上是本地当前严格支持状态的编码证据，不替代未来效果包络或真实SDK预算。

## 验证命令和演示

`node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`：7/7通过，含共享/后端/客户端纯模型类型及回归；RecoveryCoordinator已加入正常纯模型类型项目。

`node --test backend/test/loading-recovery-v2.test.mjs backend/test/recovery-coordinator-v2.test.mjs`：15/15通过。

`node backend/tools/demo-challenge-recovery.mjs`：实际Identity/Login/Character/Town/Equipment/start/prepare/资源摘要/activate服务夹具，付费awaitingReady→suspend→resumePrepare丢响应重开→完整CP公开证明→recovery-ready丢响应重开（仍加载，无敌人锚点）→新基线最终ready丢响应重开→原结果加当前状态许可预测。房费一次、原attempt和紫名不变。

固定时间夹具以1000为prepare/activate边界，4000暂停，8000恢复ready，10000最终ready：9000ms墙钟中4000ms recovery排除，acceptedTick=500，最终锚点10000；恢复ready阶段anchor/inputGapBaseAt仍null。Node直接加载既有client TS目录出现MODULE_TYPELESS_PACKAGE_JSON提示，不影响测试；未改变客户端模块设置。

## ST10-05 接口与边界交接

H.transitionClock仍是唯一转场消费所有者：`settledAt`为最后合法联网累计边界，`connectedElapsedMs`为累计联网ms，`consumedElapsedMs`为已写入CP角色时间水位，`timeRemainder`为10ms tick分数，`transitionRevision`为边界修订。suspend累计connected段并移动边界，resume准备/恢复ready只移动边界、不计recovery；回到awaitingReady后联网段继续。最终普通ready的delta=`connectedElapsedMs + now-settledAt - consumedElapsedMs`，仅消费一次并删除H时钟。05应复用该水位/边界，不在CP或新模块另设消费所有者。

有CP的resumePrepare递增timeline与header revision，公开hash仍是已验证基线；恢复ready回到加载发新普通票据，客户端须重新核对该基线。`readCheckpoint`保留完整分片引用/hash/字段检查；未变角色/场景块不写。05的后续房、清场/出口、角色继承与分段regen仍未实现，当前严格CP支持空buff/effects、非空actor/CD，不假称ST11/12/15/完整ST16或真机/SDK已通过。授权未包含的旧Cocos构建未重试。
