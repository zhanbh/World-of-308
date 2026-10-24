# 状态维度与转换表 v2

更新：2026-10-20。状态：E04提案，非已实现状态机；与[API v2](api-contract-v2.md)、[挑战流程](../challenge-flow.md)、[数据字典](data-dictionary-v2.md)配套。保留产品规则未闭合处，不用工程状态默认值代替用户决定。

## 1. 状态分维度

2026-10-21同步：武器途中归零不暂停、不强退，仅武器属性失效，同挑战可继续攻击和换房；新挑战入场仍要求武器耐久大于0。破损是属性有效性状态，不是独立暂停维度。

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| 会话 | active/revoked | 当前epoch有效；断线不是新会话，重启是新launch |
| 角色位置 | inn/town/challenge | 角色隔离旅店、城镇锚点、挑战引用；非每帧可信坐标 |
| 挑战结果 | active/completed/failed | completed/failed不反转 |
| 玩家生命 | alive/dead | 升级属性不解除dead，复活是独立合法转换 |
| 挑战场景 | combat/looting/closed | town不存作challenge.sceneState，与角色location分开 |
| 连接 | connected/recovery | 短暂恢复独立于alive/dead和结果 |
| 装备有效性 | 可含weaponBroken | 失效贡献与套装按耐久重算；破损不暂停模拟或截止 |
| 本局体力结算 | unsettled/settled | 通关还在拾取仍unsettled，真正回城只结算一次 |

## 2. 合法组合与指针

| result／scene | lifeState | 账号指针与位置 | 允许动作 |
| --- | --- | --- | --- |
| active/combat | alive | activeChallengeId与openSceneChallengeId指本局，location=challenge | connected且无限制时合法战斗/进房/拾取；leave/查询始终按截止判断 |
| active/combat | dead | 指针仍本局 | 合法残留事件、有效窗口复活/离开；不创建新的直接攻击 |
| completed/looting | alive | active清除，openScene仍本局，location=challenge | connected可拾取/结束；无新增战斗收益、无付费复活 |
| completed/closed | alive | 不保留本局active/openScene，角色已合法回城或新上线 | 查询旧结果；不能重进拾取/重发奖励 |
| failed/closed | 可保留终止生命事实 | 本局指针清除，角色回城满HP/MP | 只能查旧结果，不能复活续关 |

禁止组合：active/looting、completed/combat、failed但可战斗场景、completed仍dead、closed仍占本局有效场景指针。失败记录里的终止生命事实是历史，不应让角色城镇仍不可行动；当前状态与历史字段在DTO明确区分。

recovery可叠加active/combat和completed/looting，期间模拟暂停；期限到达时前者失败/关闭，后者仅关闭。已closed不靠迟到心跳恢复。

## 3. 事件转换与一致性

| 事件 | 前置 | 同笔决定/后置 | 不能发生 |
| --- | --- | --- | --- |
| 新挑战创建 | 当前会话、城镇、无active或looting、至少1体力及可用武器 | active/alive/combat，roomNo=-1，快照锁定；指针/角色reservation/location一致 | 重复start建第二挑战或打开选择页扣费 |
| 准备/激活下一房 | alive/active/connected、前房全灭/出口合法；本局武器归零不拦截 | prepare保留旧房；activate一次扣快照至0、推进roomNo/场景代次与CP | prepare扣费、激活重放重置CP、本局0被拒、分波 |
| 玩家死亡 | active/alive且合法事件顺序 | dead、deathIndex+1、10秒截止、死亡磨损−5；残留来源有限记录 | 连点/重复报告延长截止或重复磨损 |
| 普通残留击杀升级 | active/dead、合法已有来源且未到截止 | 收益/等级节点邮件，lifeState仍dead | 满HP/属性重算免费复活 |
| 手动复活 | active/dead/connected、未到两个截止、有纹章/次数 | alive、消费/次数+1、满HP/MP、2秒保护、职业CD清 | 药品/饰品CD顺带清零、取过期deathIndex重复扣 |
| 最终首领合法死亡 | active，顺序/截止有效 | completed/alive/looting，小怪间接收益、通关奖励、必要免费复活；清active指针 | 省略剩怪收益、清空在线拾取、再次收费 |
| 非末房清场武器磨损归0 | active | 房清成立、武器属性失效、非阻断破损提示；允许继续本局 | 自动回城/判败、因本局武器归零拒绝下一房 |
| 末房通关后磨损武器归0 | completed | 保留通关/奖励，下一开本前修理 | 用破损覆盖completed为failed |
| suspend/静默租约恢复中 | 有效未关闭场景 | recovery及固定截止，不滚动延期，模拟暂停 | 将dead改alive、刷新本局体力 |
| resumePrepare / scene.ready | 同launch/epoch，所有有效期限未过；完整版本化视图/资源就绪 | prepare保持recovery并固定前沿；ready才connected/重建锚点，保留原dead/结果/快照/CD | 分页未齐先开战、重新给死亡窗口、重新随机怪物 |
| active到期/放弃 | active，合法截止或leave | failed/closed、一次体力回城结算、指针清除、满状态/清CD | 退体力、撤已保存收益、迟报首领改判成功 |
| completed退出/恢复超时 | completed/looting | completed/closed、失效地面物、一次加载体力/回城 | 转failed、撤通关奖励 |
| 新launch/设备接管 | 可信身份，C01票据commit通过epoch比较；prepare不接管 | 同事务撤旧会话、旧场景按终态结束结算、建立新会话上线旅店，消费票据及保存open回执 | 跨设备续关、prepare关闭旧挑战、旧会话通过历史请求抢写权 |

C23锁快照后尚未enterRoom期间也有租约/关闭路径，避免卡唯一active。资源加载失败不隐式退款或续关；与用户选择放弃及重试加载的交互在协议时序补齐，不新增另一个“自动成功”终态。

## 4. 时钟和优先顺序

- 业务截止使用服务端墙钟now≥deadline，事务重试重新取now；simulationTick不回拨截止。
- 动作/CD/DOT采用模拟时钟，死亡继续、recovery暂停；武器0不暂停。恢复重建锚点、递增timelineEpoch而不改sceneEpoch/掉落；死亡截止沿原墙钟不重置。
- 先合法提交的终态有权威性；completed不降failed，failed后迟报首领不能改判。到期转移已成立时拒绝迟来付费复活且不消费。
- 同模拟步玩家/首领同死，由权威规则内核先处理死亡、再处理首领击杀/通关及免费复活；客户端不能通过自排事实授权收益。
- 旧查询/重放只能返回其历史结果，不能重写已推进版本。状态查询若需落实到期，按结束业务来源去重。

## 5. 体力状态专表

| 时点 | 权威数据 | 变化 |
| --- | --- | --- |
| 城镇/上线加载 | character.stamina及最新固定窗口 | 若应补满按既定308；不伪造多次累加 |
| C23入场 | challenge.staminaSnapshot | entryValue≥1，remaining=entryValue，锁窗口 |
| C24逐房 | 只扣remaining | min(remaining,房费)，可0；每房实际/零扣费都processed |
| 副本跨固定刷新/短暂重连 | 原快照 | 不更新、不从角色新余额恢复扣费 |
| 通关仍在线拾取 | 原快照，unsettled | 例如仍显示0，无拾取倒计时 |
| 场景真正结束/回城 | settlement+角色余额 | 同窗口remaining，跨窗口加载308；一次结算且防旧结果覆盖新挑战 |

## 6. 资产、面板与来源状态

| 对象 | 转换 | 约束 |
| --- | --- | --- |
| 装备位置 | container↔equipped，container↔合法vault，pending→backpack，active→sold/destroyed | 原子改全部引用，绑定不洗；满包同槽原格替换/卸下空格 |
| 邮件 | active→deleted或expired，附件available→delivered | 未领附件不能手删；过期不重发，旧来源保留；时间排序不变 |
| 永久待领 | available→delivered | 原角色，满包保留，不设置30天到期 |
| 一阶段解锁 | stage n→n+1 | 20格一档至100，二币一次只扣一种，同档不重复 |
| 面板 | loading→ready→submitting→committed/rejected或resultUnknown | 关闭只停展示，不撤已提交请求；unknown先查原结果，不新建意图 |
| 服务上下文 | open→closed/invalidated | 切角色/接管使旧上下文无新写权，已提交结果不回滚 |

虚拟物品“过期”只按已有具体生命周期，不自创装备到期玩法。地面sceneEpoch失效不等于待领奖励失效。个人/账号金库页签只影响显示和目标选择，不改变存储归属。

## 7. 待闭合项及证据

工程仍待关闭：药品/饰品动作字段、地点许可/物理预算、报价/加载握手与确定性精度/上界。单附件拆领及一键跳过、途中武器0继续、社交后置已确认，不重列为玩法待决；恢复的具体候选见恢复时序第6节，尚未评审/实现。

后续状态测试按事件排列验证不变量，至少含重复/乱序、截止−1/正好/＋1、已通关退出、未知提交再查询、切账号/会话、旧结算碰新挑战。当前未执行这些测试。E04已有设计交付但未冻结，后续与E06/E07和产品清单共同收敛，再eng-review，不编码。


2026-10-21用户确认：本期在线闭环按服务端可验证行为设计。客户端即时表现，服务端分段验证移动/碰撞、战斗、药品/饰品与NPC地点，不只信任客户端击杀/HP；不引入实时多人或常驻逐帧服务器。输入、检查点及原子提交候选见[可验证动作协议](verified-action-protocol-v1.md)。方向已定，但确定性、时间容差、性能/事务与平台验证未完成，不宣称编码就绪。

## 恢复体验最新确认（2026-10-21）

用户明确战斗表现不要求强一致，允许秒级回溯；短恢复先查询原请求结果，再以服务端最新确认检查点恢复，未确认移动/攻击表现允许修正。这不放松钱包、消费、发奖与原操作结果的原子性，已确认资产和收益不撤销。

持续无法恢复时显示「网络中断，请重新进入游戏」，停止继续战斗并要求重新进入；沿用既有10秒恢复窗口，不另增宽限或自动续关。未通关超时失败/关闭并保留已保存收益，已通关仅关闭拾取场景、不撤成功；新launch默认旅店，不重启续关。客户端提示不单独改服务端结果，下一请求/清理仍按原持久截止处理。

此前为减少修正提出的持久输入收据不作为本期必需方案；采用原操作结果和权威检查点恢复。秒级是体验尺度，不保证任何弱网都只退1秒；必须限制未确认预测积压，超上界先暂停等待，不允许无限本地刷怪或离线补报。具体积压上界和时间锚点待工程验证。


当前roomPhase维度为preparing/active/cleared/closed，独立于挑战sceneState；创建后roomNo=-1且preparing不推进战斗，后续准备只允许前房cleared。完整转换及失败路径见[加载握手](room-loading-handshake-v1.md)；同刻节点分层见[精度合同](combat-arithmetic-contract-v1.md)。均为当前待审候选，无状态机执行通过记录。


2026-10-22评审决定2A：roomPhase=preparing仅在已清房后正常加载时推进角色CD/增益/自然回复，不推进旧房敌人或接受攻击；recovery排除计时。activate继承角色状态并结算未计入的加载区间，不清CD/满血蓝，旧房效果和敌人不迁移。


## FR01/FR02设计修订

转场唯一计时存H.transitionClock，activate清pending但保留时钟，ready结清未消费联网区间后删除。活动段首次scene.ready原子设置inputGapBaseAt与活动锚点，后续仅新合法输入提交刷新缺口基点；ready重放/心跳不刷新，历史lastAcceptedInputAt不充当首次输入计时起点。活动态差值≥2000ms进入recovery，加载态不判2秒缺口，原死亡/恢复截止不延长。详见加载与恢复权威合同。

## ST09 银行与扩容实施状态（2026-10-23）

- 银行面板closed→loading→ready；单一personalVault/accountVault页签，切页清选择/拖动并换读取代次；旧页签/角色/关闭后的迟到响应不得重新应用。成功提交后再读同事务双容器/钱包快照，不乐观移动物品。
- 堆叠拖动→quantity确认（默认整叠）→submitting；取消不产生写请求。装备整件直接提交；目标空间不足整笔rejected并显示availableCapacity，不部分扣源。
- 扩容ready→报价读取→确认币种→submitting；取消不支付。背包仅城镇金币，个人库仅银行金币/点券择一；stage n→n+1且n<4，每次+20，账号库固定100。报价版本变化必须重新报价，不按旧金额猜测扣款。
- submitting→unknown时持久化原请求不丢失，关闭只隐藏；重开沿原operationId恢复。operation.get未找到仍unknown，只有原结果明确后才解除写锁，显式继续也只重发原请求。角色/会话改变使旧响应代次失效；服务端每次重验当前授权，不把本地持久化当身份凭据。
- 提交成功同笔移动双容器及装备唯一归属，跨账号库套装同步相关scope持有增减；同角色包↔个人库保持持有。实例/钱包/容器任一写失败回滚全部资产；已提交但响应丢失查询原O，不第二次转移/扣款。

该状态已落到本地内存服务和平台无关协调器；Cocos运行时、真实微信SDK、真机弱网及正式价格配置的证据分别记录，不以状态表声明上线通过。

## ST10-01 未激活创建的实现补充（2026-10-24）

实际城镇位置→dungeon.entry只签发绑定当前位置修订的选项/入口证明，不改变C.location、不建H。主动challenge.start经身份、选角、原入口、expected、等级/共享难度、至少1体力和有效已穿武器重验后，同事务写A双指针、C挑战位置/体力保留及H/O/J。H为active/combat/alive、sceneEpoch0/currentRoomNo-1/preparing；无已付房间、CP、transitionClock或战斗锚点。新launch沿现有handoff可关闭该无CP状态并结算一次；原结果重放不能复活旧H或覆盖新位置。prepare/activate/ready另由ST10-02～03交付。
