# 加载与切房握手合同 v1

2026-10-21。待eng-review的工程候选，无实现/网络测试。依据[API](api-contract-v2.md)、[恢复](recovery-timeline-proposal-v1.md)。不增加手动暂停、入场无敌或退体力规则。

## 状态与命令

挑战创建C23锁定角色、难度、配置和体力快照，创建挑战但不生成已付费首房。增加roomPhase=preparing/awaitingReady/active/cleared/closed；连接/生死/挑战终态仍为独立维度。首次与后续房间使用同一C24协议。

C24拆成prepare和activate两个明确步骤，原单次enterRoom不再同时承担资源加载与开战。prepare输入challengeId、nextRoomNo、expectedRevision、operationId；校验首房或上一房全灭、活着、连接有效及出口合法位置（首房无需上一出口），预留唯一roomAttemptId，返回绑定release/map/资源摘要的manifest。此步不扣房费、不推进战斗、不删除旧房。相同意图返回同一manifest，不能重新随机紫名或刷站位。

客户端预加载并校验必需资源后activate，携带roomAttemptId、manifestHash及expected版本。服务端不相信ready能证明客户端实际加载，只把它作为开始权威场景的意图。事务内重验全部条件，创建确定room记录、一次扣本局体力至最低0、初始化检查点、递增sceneEpoch及timelineEpoch，设置awaitingReady与就绪票据、暂不启动敌方活动锚点；旧房地面随场景转换失效。prepare票据不另设玩法倒计时，仍受原会话/恢复租约和挑战终态约束。

activate提交后先读取完整公开状态并校验资源，scene.ready成功才建立活动锚点并允许本地预测，不补报加载前输入。往返延迟造成的差异沿允许秒级修正处理，不增设免费攻击延迟。首次activate尚未完成时无活动怪物；这是场景尚未开始，不是可反复手动暂停。后续prepare只允许前房cleared，不能在战斗中调用以冻结敌人。

## 故障与原子性

| 情况 | 权威结果/客户端动作 |
| --- | --- |
| prepare前或资源加载失败 | 留原状态，可重试加载/主动退出；不自动退既付房费，不新建挑战 |
| prepare成功、客户端离线 | 原恢复租约处理，不因加载页面重新给10秒；未activate不扣下一房 |
| activate成功丢响应 | 先查原operation，再取当前挑战/检查点；不换ID重扣或重新初始化 |
| 同房两次activate | H/currentRoom+确定room键竞争，后者读取原状态；不能把旧activate用于新roomAttempt |
| 旧房拾取与activate竞争 | 共写A/H；拾取先提交则物品保留，切房先提交则旧地面失效；不两边成功领同来源 |
| 活动房资源失效/前后台 | 停止预测并走原恢复合同；不把资源错误当可免损回城或清CD |
| 武器途中归零/体力快照0 | 不阻止下一房；C23新挑战入口仍检查可用武器与至少1体力 |
| activate与接管/退出/到期竞争 | 同栅栏重验；先终止则不扣下一房，先activate则按已开房状态关闭，无退款 |

prepare原结果只保存manifest引用/attempt，不存资源文件；activate原结果只存场景版本/游标引用，不复制完整CP。prepare/activate都执行旧代次拒绝。所有资源下载失败均不得让已确认资产回滚。

## 数据与验收

H保存pendingRoomAttempt{roomNo,attemptId,manifestHash,configRef,preparedRevision}，至多1个；CP选择独立头和分片，见[并发与编码](simulation-content-envelope-v1.md)。manifest绑定挑战创建时的内容，不因prepare跨发布切latest。客户端LoadingCoordinator只负责缓存和当前异步流程标识，资产决定只由在线协调器接收。

待实现验收：首次资源失败零房费、后续失败保留前房收益、activate重放、旧资源回调、上一房仍有紫名拒绝、出口位置伪造、跨刷新体力快照、激活/拾取/接管三方竞争、旧场景输入及恢复截止。未执行这些测试。


## 2026-10-22评审决定2A：联网加载继续角色计时

用户同意2A。换房不是新角色初始化：从上一房最后确认状态继承等级/XP、装备与耐久、当前HP/MP、职业/药品/饰品CD及有效增益。只有场景侧敌人、出生坐标、房间作用域效果、场景代次与时间锚点按新房初始化；不清CD、不满血蓝，不把旧房技能残留移到新房。

正常联网加载期间，职业技能、两组药品、饰品冷却、饰品增益有效时间及既有自然回复继续推进。例：某技能剩5秒、有效联网加载3秒，则新房剩2秒；同增益剩5秒则剩2秒。自然回复按已绑定规则和每个增益到期节点分段应用，溢出舍弃，不改已释放攻击快照，不临时增加回复率。切房本身没有额外回血/回蓝奖励。

H独立保存至多一个transitionClock{settledAt,connectedElapsedMs,timeRemainder,transitionRevision}；角色原状态来自上一确认CP，不能以客户端加载秒数覆盖。prepare先落实前房最后合法进度并建立转场计时基点；pending期间不接受前房新攻击/用药/饰品或继续模拟敌人，资源预加载意图只在上房清场且到出口后进入该阶段。普通拾取仍按旧房合法场景与来源规则处理，不因此推进一套独立角色时钟。

转场计时由服务端根据已记录connected/recovery分段结算：正常有效连接段累计；显式暂停/静默缺口进入恢复后排除，截止与暂停前沿沿恢复合同，不接受客户端倒填物理断线时刻。加载阶段保活仍走现有租约（不套战斗2秒输入缺口），心跳不直接给CP写回血；进入恢复/恢复成功时将转场计时边界与H/头同事务保存。真实断网瞬间不可观测，不承诺零误差计时，也不延长10秒期限。

activate一次将未结算的有效联网时长折算为角色计时/资源变化，和场景、房费、CP及原结果同笔提交；已结算累计与transitionRevision同笔推进，重试不重复回复或多减CD。新房活动锚点从scene.ready提交时刻开始，activate到ready期间有效联网角色计时仍按转场合同累计并在ready同笔结清，已计入的加载时段不再以补输入形式重放；逻辑游标/时间余数延续，不把角色CD变成永久墙钟截止。状态查询若展示倒计时可计算只读预测，不能另外写一笔回血。

资源重试不重建transitionClock基点或刷新buff；activate成功但响应丢失，原结果/当前CP恢复，不再补算从首次prepare到重试的全部时长。旧房拾取若引发资产版本冲突则重验重算，但转场计时只能消费原尚未结算区间。新房sceneEpoch变更使原房效果失效，旧释放快照只作来源审计，不跨房继续打新怪。

待实现验收：5秒CD/3秒联网加载→2秒；buff在加载中途到期且回复分段正确；血蓝未满不自动补满；9秒加载中4秒recovery仅累计合法connected段；暂停/恢复边界重试与activate丢响应不重复计时；旧房输入拒绝；原地拾取/换房并发；体力刷新不进入本局快照。以上不是运行测试结果。


## 2026-10-22批准4A

activate先扣费并建立awaitingReady状态，就绪前不模拟敌人、不套2秒战斗输入缺口；客户端完整状态/资源就绪后scene.ready才转active。activate响应丢失查原operation，不重复初始化/扣费。ready丢响应查同票据回执、不重启时钟；其后再断线仍沿恢复协议。加载/恢复租约与原死亡截止不延长，详见[批准合同](../reviews/eng-review-approved-contracts-2026-10-22.md)4A。


## FR01闭环：转场时钟的唯一持久归属

transitionClock只存H.transitionClock，含attemptId、phase=prepared/awaitingReady、settledAt、connectedElapsedMs、timeRemainder、transitionRevision；pendingRoomAttempt仅保存下一房manifest/attempt引用，不内嵌时钟。prepare创建唯一时钟；activate同事务消费已累计联网区间并推进settledAt/版本，清pending但保留H.transitionClock且phase=awaitingReady。ready结清activate后的未消费联网区间、把CD/buff/资源及余数写新CP，再在同笔删除H.transitionClock并转active。短恢复保留该时钟且不累计recovery段；恢复ready若回到加载阶段只恢复加载计时，不启动敌人活动。退出/到期/接管按既定结束规则关闭并清转场时钟，不补未确认战斗或额外奖励。

不保留第二份可写时钟，不因重试重设prepare基点。prepare0秒/技能剩5秒，activate2秒消费2秒，ready3秒仅再消费1秒，最终剩2秒。任一步提交丢响应按原回执/当前版本恢复，不再次消费已结清区间。时钟是H内常数大小字段，不新增物理键；ready导致CP变化块按实际d计量。
