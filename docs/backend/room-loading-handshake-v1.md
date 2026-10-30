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

## ST10-02 本地实施补充：固定manifest与未付首房（2026-10-24）

首房prepare在H.sceneEpoch=0、currentRoomNo=-1、roomPhase=preparing且无CP时执行。H.connection=connected、lifeState=alive、active/openScene指针、角色reservation/location、session/rolePlayEpoch和challenge/character预期版本均从权威记录重验。首房生成后不同operationId的相同房意图可带原prepare前版本或当前H版本复用同一attempt；伪造expectedRevision、异房、终态和旧身份上下文拒绝。后续房出口/清场校验在ST10-05接入，当前本地实现拒绝后续房而非假定其合法。

manifest严格字段：roomAttemptId、challengeId、roomNo、releaseRef、releaseHash、mapRef、preparedRevision、resources、spawns、manifestHash。resources包含1..128个唯一ref及sha256、byteLength(1..81920)、mediaType=application/json、purpose=contract-fixture-only；spawns包含1..8个唯一spawnId及templateRef/role/x/y。manifest整体JSON UTF-8至多24KiB。manifestHash为除自身字段外正文的递归键排序JSON UTF-8 SHA-256（数组顺序保留）；每个资源摘要覆盖resolver实际返回字节，客户端必须重算摘要并核对长度，不能接受布尔“已加载”。确定位置及已锁紫名安排在manifest中不可重抽。

本地resolver只支持经verifyTestRelease验证的E01 level1/normal，资源是publicRelease公开节点的规范JSON字节，不包含private节点，不冒充Cocos贴图/Bundle加载或三本正式内容。每个ref含发布节点版本，releaseRef/hash绑定创建时快照；缺历史发布/资源即失败，不取latest替代。

独立roomManifest记录保存原manifest；H.pendingRoomAttempt增加manifestRef，仅保存roomNo/attemptId/manifestHash/configRef/preparedRevision/manifestRef，不保存第二份时钟。H.transitionClock按已有合同唯一创建一次，phase=prepared，settledAt=提交事务当前服务端时间，connectedElapsedMs=0、timeRemainder=0/1、transitionRevision=0。失败/取消/重载/同意图重试均不重建它。H.timelineEpoch初始0仅表示未付房，无模拟锚点；后续activate/恢复负责其相应递增。

prepare成功原子写H、独立manifest、O三键，拒绝只写O；不写CP、不扣房费、不写资源文件或额外资产流水。O以命令规范SHA-256绑定原意图，保存manifest引用/attempt/hash和原版本/原serverTime；queryOriginal/operation.get从该原引用hydrate，而非读取当前H.pending。资源失败不能回滚已确认资产。

## ST10-03 本地激活与就绪实施（2026-10-24）

首房 `challenge.activateRoom` 使用已保存的 manifest/attempt，不重抽站位；重验身份、预期 C/H 版本、角色预留和 A 指针、connection、生死及已有 lease/recovery/death 截止。确定 `room(challengeId,0)`、H、CP 头/实际使用的两个块、A 写栅栏与 O 同事务提交，快照扣至最低 0；不在途中新增武器破损/体力不足门禁。O 只保存原小型状态/票据/游标，绝不复制 CP 或完整 expected 数组。相同原操作恢复精确原结果；不同操作的同房竞争仍只生成一个房间和一次房费。

H.transitionClock 增加常数大小 `consumedElapsedMs` 水位（prepare 初始 0）。`connectedElapsedMs` 为已保存的累计有效联网毫秒，`settledAt` 为该累计的墙钟边界；在 connected 时，当前 eligible = connectedElapsedMs + now - settledAt。activate 消费 eligible、保存累计和 consumed 水位，phase=awaitingReady；ready 消费 eligible-consumedElapsedMs，再删除整个时钟。恢复阶段由 ST10-04 累计边界，不能累计 recovery 时间或另建时钟。`timeRemainder` 明确表示累计联网时长不足一个 **10ms 逻辑 tick** 的约分分数（6ms=3/5），不是 HP/MP 自然回复余数。CP.logicalTimeMs 是角色的精确整数毫秒逻辑游标；timeRemainderMs 必须等于 logicalTimeMs%10，acceptedTick=floor(logicalTimeMs/10)。首房 6ms+7ms 得 1 tick 及 3ms，不能每阶段舍弃。

activate 创建 awaitingReady，CP.acceptingInputs=false、anchorWallAt/anchorTick/inputGapBaseAt=null；不运行敌人、不启用战斗输入缺口。scene.ready 校验原票据的场景/时间代次、CP 基础修订、manifest/publicState hash 和全部原截止，结清后缀，CP.acceptingInputs=true，首次建立活动锚点和 inputGapBaseAt。绝对逻辑 tick CD 不被重置；角色资源/余数不凭转场设满。E01 没有自然回复率配置，当前初始版本不假定任何回复率。

完整公开状态摘要为完整**有序公开记录数组**的递归键排序 JSON UTF-8 SHA-256；记录顺序 player、manifest 顺序敌人、固定七组 CD。分页边界不进入摘要；客户端在语法/完整分页/引用检查后自行重算，删/改/重排记录都不能沿用旧 hash。ready 绑定此基础状态；其后服务端逻辑后缀可形成新修订。资源验证、全量摘要和 ready 成功都满足后，客户端还读取当前 challenge.get 检查可预测状态；历史原 ready 回执不能授权已过期、换代或关闭场景。

客户端 ActivationCoordinator 持久化原 activate 命令、票据、原 ready controlSeq/leaseRevision 和已验证公开分页。未知结果重载先 operation.get/原 ready 回执查询；不存在才重发原命令，不换 ID/序号/票据。重载重新验证资源和完整摘要；已提交 ready 后服务端基础页不可再读取时，可以重验持久化的原基础页，但仍必须查询原回执及当前场景。异步流程代次隔离迟到回调。

## ST10-05 本地实现边界（2026-10-24）

后续prepare为严格currentRoomNo+1，旧CP玩家存活、旧room manifest完整敌人集合（含紫名）全部死亡，且权威玩家位置在旧manifest绑定地图出口交互范围内。E01没有出口交互半径，必须显式注入与锁定release相同rulesRef的local-test exitInteraction；缺配置返回CONFIG_NOT_READY，不借用城镇半径。prepare保留旧CP与已确认收益，H进入preparing并拥有唯一transitionClock；控制恢复投影同一preparing阶段，activate才替换旧场景。角色沿CP逻辑毫秒及10ms步余数推进，H只消费未消费联网水位，恢复段排除。

客户端连续下一房仅在前房完整资源/公开证明/ready及当前场景已确认后退役旧持久意图，并先禁用预测及失效异步代次；unknown意图不能因此退役。旧资源回调和旧operation原结果不覆盖新房。ST15尚无实际v2拾取服务，本轮竞争验证仅用拥有真实归属/来源/背包的有界测试事务，与实际activate共用A/H冲突检测；不将其称为生产掉落协议或完整发奖组合。

## ST10 ready 后当前公开证明（2026-10-24）

本节收敛 ready 后缀改变 HP/CD/buff 时的公开证明，替代前文“重验持久化原基础页即可恢复预测”的过渡表述。ready 前仍须已验证资源和完整基础分页；ready 必须在原票据及原恢复/死亡截止之前成功。普通 ready 或恢复 ready 成功进入 active 时，同笔保存 `H.lastReadyReceipt.proofDeadline=min(本次成功建立的 connected lease.leaseUntil, deathDeadline或最大安全整数)`。这是新连接阶段已提交的固定证明截止，不沿用已消费票据的旧加载截止，也不增加宽限或第二份计时权威。

ready 后 `scene.recoveryPage` DTO不变：当前身份、原成功 readyTicketId、相同 sceneEpoch/timelineEpoch/manifestHash及**当前** CP revision/publicStateHash精确匹配，且当前 connected、acceptingInputs，且 active/result=active（含dead）或 cleared/result=completed/sceneState=looting 及适用租约/终态检查通过，才返回当前完整有界 actor/CD/buff 页。第一页携带服务端已签发的 proofDeadline；后续所有页及完整摘要必须绑定同一截止和当前快照。分页不得返回私有CP字段。客户端在原资源/完整基础证明/ready成功之外，还须验证这些新完整记录并在其后再次查询当前状态，精确核对场景/时间代次、修订/hash、manifest和可预测状态，才允许预测；不能仅删除旧hash比较或沿用旧HP/buff。

回执仅保存小型原响应及固定 proofDeadline，不嵌CP。读取、原ready回放、心跳都不移动该证明截止或重启锚点；新的时间代次不能使用旧回执。旧记录缺proofDeadline时，active分页证明拒绝；这不宣称已提供旧数据迁移或更长时间后的完整恢复能力。原结果仍仅作历史证据。H.transitionClock唯一权威及ready后缀只消费一次的规则保持。

预算仍为H 128KiB、响应/公开页各32KiB、CP头16KiB、块各80KiB、最近控制回执8条。实际32buff后缀证明页15081B、ready746B、H5111B、小回执946B，实际8回执H10163B；字节、截止−1/+1重开、篡改/缺页、换代及最终全套验收见[修复验证](../reviews/st10-build-review-fixes.md)。
