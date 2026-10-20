# 状态维度与转换表 v2

更新：2026-10-20。状态：E04提案，非已实现状态机；与[API v2](api-contract-v2.md)、[挑战流程](../challenge-flow.md)、[数据字典](data-dictionary-v2.md)配套。保留产品规则未闭合处，不用工程状态默认值代替用户决定。

## 1. 状态分维度

最新覆盖说明：用户纠正武器耐久归0不暂停，相关家中改动待同步。本稿weaponBroken暂停限制/进房拦截/时钟待定等旧分支暂停收敛，不作为有效规则；其他生死/连接状态继续适用，完整归0行为等待同步后修订。

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| 会话 | active/revoked | 当前epoch有效；断线不是新会话，重启是新launch |
| 角色位置 | inn/town/challenge | 角色隔离旅店、城镇锚点、挑战引用；非每帧可信坐标 |
| 挑战结果 | active/completed/failed | completed/failed不反转 |
| 玩家生命 | alive/dead | 升级属性不解除dead，复活是独立合法转换 |
| 挑战场景 | combat/looting/closed | town不存作challenge.sceneState，与角色location分开 |
| 连接 | connected/recovery | 短暂恢复独立于alive/dead和结果 |
| 行动限制 | none/weaponBroken等 | 武器0暂停不是死亡、失败或断线；暂停时钟仍待定 |
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
| 进入下一房 | alive/active/connected、前房全灭、无weaponBroken | room processed、manifest、扣快照至0、推进roomNo | 本局0被拒、跨刷新补快照、分波当默认 |
| 玩家死亡 | active/alive且合法事件顺序 | dead、deathIndex+1、10秒截止、死亡磨损−5；残留来源有限记录 | 连点/重复报告延长截止或重复磨损 |
| 普通残留击杀升级 | active/dead、合法已有来源且未到截止 | 收益/等级节点邮件，lifeState仍dead | 满HP/属性重算免费复活 |
| 手动复活 | active/dead/connected、未到两个截止、有纹章/次数 | alive、消费/次数+1、满HP/MP、2秒保护、职业CD清 | 药品/饰品CD顺带清零、取过期deathIndex重复扣 |
| 最终首领合法死亡 | active，顺序/截止有效 | completed/alive/looting，小怪间接收益、通关奖励、必要免费复活；清active指针 | 省略剩怪收益、清空在线拾取、再次收费 |
| 非末房清场武器磨损归0 | active | 房清成立、weaponBroken限制、暂停提示自行退出 | 自动回城/判败、进下一房 |
| 末房通关后磨损武器归0 | completed | 保留通关/奖励，下一开本前修理 | 用破损覆盖completed为failed |
| suspend/静默租约恢复中 | 有效未关闭场景 | recovery及固定截止，不滚动延期，模拟暂停 | 将dead改alive、刷新本局体力 |
| resume | 同launch/epoch，所有有效期限未过 | connected，保留原dead/结果/快照/CD | 重连重新给死亡窗口、重新随机怪物 |
| active到期/放弃 | active，合法截止或leave | failed/closed、一次体力回城结算、指针清除、满状态/清CD | 退体力、撤已保存收益、迟报首领改判成功 |
| completed退出/恢复超时 | completed/looting | completed/closed、失效地面物、一次加载体力/回城 | 转failed、撤通关奖励 |
| 新launch/设备接管 | 可信登录 | 旧会话撤销、旧场景按终态结束结算、新会话上线旅店 | 跨设备续关、旧会话通过历史请求抢写权 |

C23锁快照后尚未enterRoom期间也有租约/关闭路径，避免卡唯一active。资源加载失败不隐式退款或续关；与用户选择放弃及重试加载的交互在协议时序补齐，不新增另一个“自动成功”终态。

## 4. 时钟和优先顺序

- 业务截止使用服务端墙钟now≥deadline，事务重试重新取now；simulationTick不回拨截止。
- 动作/CD/DOT采用模拟时钟，死亡继续、recovery暂停；武器0暂停与死亡/残留并发细则未定，不能擅自当无限暂停保护。
- 先合法提交的终态有权威性；completed不降failed，failed后迟报首领不能改判。到期转移已成立时拒绝迟来付费复活且不消费。
- 同模拟步玩家/首领同死，客户端有序先死再首领；服务端最终收益/免费复活仍依合法序号与截止确认。
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

玩法/协议仍待关闭：药品/饰品动作状态证据、武器破损暂停时钟、服务位置许可、单附件拆领及一键跳过规则、报价/加载握手时序和部分入口。UI新的检视/社交/手动暂停有独立对齐记录，未纳入现有状态转换。

后续状态测试按事件排列验证不变量，至少含重复/乱序、截止−1/正好/＋1、已通关退出、未知提交再查询、切账号/会话、旧结算碰新挑战。当前未执行这些测试。E04已有设计交付但未冻结，后续与E06/E07和产品清单共同收敛，再eng-review，不编码。
