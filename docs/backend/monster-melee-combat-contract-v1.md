# ST12-01 近战组合执行合同

2026-10-26。承接已批准ST12-01；仅显式`local-test-monsters`、无奖励配置。它不是正式数值、ST12全部交付或平台验收。

## 版本与来源

`BasicTrainingProfile.schemaVersion=6`新增`monsters`，capabilities严格为basic/cross/bengshan/badao/earth/monsters/no-rewards。旧1～5版本仍精确校验原字段，不接收附加monsters。部署端模板、技能、类型、行为、奖励标签和四项抗性分开引用；身份来自权威spawn.role（purple在此按ordinary战斗身份处理），并非模板类型或免控开关。AP来自已验证资源中的monster.attackPower，客户端不能选择spawn、AI结果或随机源。

候选`MonsterConfig.version=local-melee-v1`；最多32模板/32技能，当前只有chase+melee。模板含type、skillRef、behavior、rewardTag及resolved resist：bleed/stagger/knockback/knockdown分别boolean。`defaultMonsterResist`为配置装配提供人形/野兽不免血、亡灵/机械免血的默认值；显式resolved字段可覆盖，不由Boss身份强制免控。后续阶段覆盖须在合法权威节点更改，不能客户端输入任意状态。

时间只接受整数10ms tick，不对任意微秒取整；decisionTicks 1～100，windup/recovery/cooldown各1～10000，CD至少max(50,windup+recovery)，即相邻起手至少500ms。移动速度与范围有界；决策仅修改intent，移动逐tick扫掠地图，不预支整个决策间隔。冷却在正式起手消耗，中断不返还。普通攻击伤害不会隐式打断；技能直接伤害的僵直、击退与击倒分别遵守抗性，DOT不产生控制。

## 联合时序与精度

沿ST11有理候选顺序推进。每个有理玩家节点后立即作用合法控制；敌方节点只有整数tick。在该边界玩家节点前冻结存续敌到期集合与位置；同刻伤害和控制不撤回该集合，严格较早的死亡/控制会取消后续本体节点。随后按actorIndex稳定处理敌节点、新玩家输入、移动。双方同刻致死保留所有已到期伤害事件，玩家死亡只记录一次；奖励不在本票执行。受控持续时间逐tick判断，旧CP受控到期后同批新技能不再被旧整批布尔清空。

敌起手冻结`AP × coefficient`约分有理预算、方向和节点；命中时按当前玩家位置及实时防端结算。防端`armorConstant/(armorConstant+armor) × (1-reduction)`与攻端组合，最后仅floor一次。真实service按当前穿戴装备汇总armor、damageReduction（千分率），零耐久遵循既有汇总；K=100000为此显式本地候选，非正式等级护甲表。敌技能暂为确定命中/非暴击候选，不从客户端提供伤害。回复与敌命中通过同一实时role互通，不在片尾把全部伤害追扣到回复前状态。

## CP、公开证明与恢复

scene schema7在原scene6 compact四lane路径新增monsters[]和monsterControlUntilTick。每怪runtime含稳定actorId/index/templateRef、identity、AP、nextDecisionTick、readyAtTick、sequence、锁向action（start/hit/end/damage/released）、staggerUntilTick、intent及移动余数。HP/位置/倒地仍复用actor/CombatTarget；私有scene验证runtime与enemy的身份、AP、来源一致。

公开proof新增`monsterRuntime`及玩家`playerControl`，参与完整stateHash、分页、去重及actor引用校验。原来role、scene、按需效果块的物理位置不变，scene7继续使用全局compact字典及稳定效果槽。当前客户端恢复这些权威记录和原事件；预测仍是可修正显示，私有随机不公开，装备防御的最终结果以服务端为准。

实际5怪10tick命令样例：baseline事务R12/W0，提交事务R12/W7，1个公开页、5788 UTF-8 bytes（以演示输出为准）。7写点故障逐个验证整体回滚。没有新增每怪数据库记录；含玩家效果时仍依原按需块/结果分页计算，不以本例冒充8怪+912效果最大域、SDK预算或费用验证（ST12-06）。

role玩家HP0/dead会取消后续动作且不自然回复；挑战级死亡、复活、超时与结算衔接由ST14接续。本票不新增奖励、清场换房、Boss或Cocos构建。
