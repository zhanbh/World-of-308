# ST11-02 普攻执行合同

2026-10-25。本地训练能力；实际验证见[实施证据](../reviews/st11-02-verification.md)。沿用[移动输入](movement-input-contract-v1.md)、[精确算术](combat-arithmetic-contract-v1.md)及当前恢复/加载合同。

`ChallengeContent.combat`严格声明`schemaVersion:1/profile:local-test-basic/capabilities:[basic,no-rewards]`。必须同时提供movement、三段config、attributes及完整模板targets规则；配置缺失不推定生产数值。声明正式收益或未知能力的combat内容在入口及执行拒绝CONFIG_NOT_READY；未声明combat的既有ST10/E01移动配置保持原能力。训练死亡只生成稳定事实，不发XP/金币/掉落/通关收益。正式收益遭遇必须等待同笔原子死亡消费者；不得先确认击杀后补奖。

config.version=`training-basic-v1`、rewardPolicy=`none`，comboWindowUs、bufferWindowUs、rangeX/Y、knockdownThreshold、knockdownDurationUs、恰好三段`durationUs/impactUs/moveUnlockUs/coefficient`全部显式配置。各段duration至少240000us，2倍急速后起手间隔至少120ms；这是本地包络适用校验。原型迁移训练时长为280000/300000/420000us，节点112000/136364/163333us，解锁移动238000/259091/361667us；系数1、窗口300000/120000us仅为可重复测试表，未发布为平衡值。配置与完整profile进入SHA256摘要；已初始化CP的同名配置被改写也拒绝。原manifest尚未列入这些新增训练资源，客户端必须显式取得同摘要本地训练profile，不声称原E01 manifest已覆盖战斗规则。

attributes含30个等级的显式基础AP（按当前C.level索引）、haste/damageBonus/hit/crit/critMultiplier有理数。当前穿戴装备沿既有aggregateCombatAttributes（含0耐久失效和套装）汇总，AP以内部资源单位相加；其他同名属性以千分率相加，急速最终封顶2、命中/暴击封顶1；精通不进入普攻。C.statsVersion及equipmentVersion记录当前修订，不使用entry审计快照。动作起手冻结攻端属性；后续等级/装备变更只改变新起手。目标mitigation/evasion/damageImmune来自显式训练模板并持久化，控制免疫每片读当前敌人状态。后续AI/成长服务应在合法事件点更改当前权威字段，不能更改旧施放快照。

普攻先几何（面向半平面、整数X/Y矩形距离）再逐目标独立hit，命中后独立crit；几何无效不抽样，miss只抽hit并有独立结果。公式AP×stageCoefficient×(1+G)，再乘本击暴击及当前目标减伤，最后向下取整，无隐藏1伤害。死亡优先于倒地；普通倒地累计出现/起身后所有直接伤害，DOT不进入该计数；起身清零。当前片不实现DOT/AI/技能资产效果。

逻辑区间为[fromTick,toTick)，恰落右边界的节点留给下一片处理，使同刻release先于自动新动作；非整除时间仍从施放原点独立有理映射，不逐段累加取整步数。共享编排逐10ms采样该步起点位置，动作移动锁到moveUnlockUs，期间仍保留移动意图。三个动作循环、松手、120ms缓冲及300ms衔接窗口均持久化；非法技能/物品/饰品在本片明确按序ACTION_NOT_SUPPORTED，不取消普攻。结构/代次/版本/时间前沿错误整片失败。

role内层schema4兼容1/2/3，保留movement与回复字段，新增`combat:{configHash,attributesRevision,state}`。state保存held/buffered/nextStage/comboExpiresUs/castSequence/randomCursor，以及nullable cast的stage/sequence/原始origin/impact/end/moveUnlock有理时刻/impacted/攻端snapshot。scene内层schema2兼容1，新增server-private seed及逐目标直接伤害计数、倒地期限、当前防御/免疫；敌人HP/生死必须与actor一致，role随机游标等于scene.randomCursor。当前实际只用role/scene两块，变化块才写；完整效果块增长由ST11-03接续，不据此声明3648效果包络通过。换房重建场景动作及移动意图，保留角色HP/MP/CD/回复余数及既有成长。

权威随机在场景初始化以服务端crypto生成私有32字节seed；HMAC-SHA256(seed,`combat-v1:cursor`)首uint32为抽样，概率通过整数交叉乘积比较。seed仅在私有CP；与掉落/强化分离，operationId/requestId/客户端种子不参与。两阶段计算在事务外保留同基线样本；提交重验完整C/装备/CP/时钟/身份，OCC重试不抽新样本。原意图重放和查询不抽样、不刷新缺口。

公开证明增加combatAction（动作状态及原始调度，不含攻端私有概率、seed/cursor/snapshot）和targetControl（累计直接伤害、倒地期限）；它们进入完整公开hash。客户端显式配置独立display stats/RNG，可有秒级命中差异，完整当前公开证明与权威结果纠正后再启预测；旧ready hash、旧页、旧回包不能开战。

战斗submit的小型回复保持原字段，events为空的含义是完整结果在actionResultsRef。`simulation.actionResults`严格query请求：protocolVersion=2、query/requestId/sessionId/sessionEpoch、payload={operationId,pageIndex}。当前合法会话/账号先授权，再读该账号原O及关联页；历史小型结果与当前CP证明分开。每页≤32个严格事件、≤32KiB、最多64页，固定operationId/actionResultsRef/pageIndex/totalPages；事件字段固定kind/eventId/actorId/tick/seq/targetId/damage/critical/code，nullable字段显式null，kind为actionAccepted/actionRejected/damage/miss/death/knockdown/rise。事件ID按challenge/scene/actor/castSequence/节点目标或死亡来源确定，不依赖operationId；客户端校验全部页与唯一事件ID。所有页、变化CP块、A/H/header/O同笔写，失败整笔回滚；不截断已处理动作，不把CP塞进O。
