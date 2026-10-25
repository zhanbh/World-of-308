# ST11-03 十字斩与独立流血执行合同

2026-10-25。本地无奖励训练能力，沿[算术](combat-arithmetic-contract-v1.md)、[普攻](basic-combat-contract-v1.md)、[移动](movement-input-contract-v1.md)及加载/恢复合同。实际验收见[证据](../reviews/st11-03-verification.md)。

`ChallengeContent.combat`新增严格schemaVersion=2、profile=`local-test-cross`、capabilities=`[basic,cross,no-rewards]`；其余basic字段原样，额外必需cross与有理数mastery。schema1仍只支持普攻。配置及完整profile进入原输入digest/CP configHash；未声明、未知字段/能力/收益策略均不补默认。原E01 manifest不含新增战斗配置；调用者须显式取得同摘要本地profile，不能将训练能力发布为正式收益遭遇。正式入口仍因缺同笔XP/奖励消费者而阻断。

cross.version=`training-cross-v1`、rewardPolicy=`none`、unlockLevel固定1；mpCost、cooldownUs、durationUs、两个严格递增nodeOffsetsUs、meleeRangeX/rangeY、projectileSpeed/projectileDurationUs/projectileHalfWidth、damage `{base,growth,coefficient,nodeWeights:[w0,w1]}`、bleed `{coefficient,nodeWeights:[w0,w1],jumps,intervalUs}`、倒地阈值/期限全部显式。CD至少100000us，流血最多20跳/10秒，投射持续最多10秒；本地模板以最慢1/4到最快2倍急速的保守寿命/CD界估计并发cast数，`ceil((duration+projectileDuration+bleedInterval*jumps)*8/CD)+2`乘17不得超过2048。该守卫限定当前训练域，非平衡值或正式最大技能混合图证明。

当前C等级及装备属性来自真实读取；技能等级`1+floor((C.level-1)/2)`，AP/G/haste/hit/crit沿普攻当前汇总，精通为显式mastery加当前有效装备同名千分率，旧施放不变。合法等级、控制、正在施法、CD、MP依次拒绝后，才扣MP、登记CD并取消当前普攻。低蓝/CD等拒绝保留普攻；同tick输入按seq先后处理。技能施法期间保留移动意图但锁位移，已释放效果独立于施法体存续。

直接总预算先按`(base+(skillLevel-1)*growth+AP*coefficient)*(1+M)*(1+G)`冻结并取内部整数；流血总预算为`AP*bleedCoefficient*(1+M)*(1+G)`。两者分别按配置权重分配，第一段floor，第二段承接余数；101、权重1:2固定33/68。第一节点近身面向矩形，第二节点释放投射，按前次到本次位置区间扫掠，各目标只尝试一次，稳定actorIndex顺序。急速缩放持续且等比缩放投射速度，保留总路径。各段/目标独立hit，再独立crit；几何不合格不抽样，miss不补预算给其他节点。

命中且存活、非流血免疫目标才附着本节点独立流血，跨招/两节点不覆盖旧实例。每实例预算按固定跳数早跳floor、末跳余数，逐跳独立crit而不再hit。攻端快照保留，防端每次结算读取当前mitigation/damageImmune，仅减伤一次。DOT不计直接倒地累计；死亡优先，目标死亡后清其流血。未释放投射属于cast，释放后独立effect。所有原始微秒时刻从原点有理映射，10ms步不重复累计取整，右边界留下一片；MP自然回复在每个输入边界之前推进并保留原余数，不能先结算整个片尾回复再判断前面的起手。

scene内层schema3兼容1/2，新增cross；role维持schema4。内存cross保存castSequence/randomCursor/readyAtUs/cast/effects；私有场景seed仍不公开，跨普攻/十字共用提交cursor。schema2训练的私有抽样使用AES-256-CTR(seed, domain=`cross-v1`, absolute cursor)批量生成uint32；schema1普攻仍HMAC，不混改旧流。样本上界由当前残留、未完成cast及本片技能输入计算，OCC和原意图重放不改样本，不以operationId/client seed抽样。

CP外层不变。ordinal0角色、1场景核心，scene.cross用`{version:1,controller,snapshots,effects}`紧凑数组：controller为`[castSequence,cursor,readyFraction,nullableCastRow]`；snapshot为`[AP,haste,G,hit,crit,critMultiplier,x,y,facing,mastery,level]`，分数均`[n,d]`。cast行`[seq,origin,end,nodes,node,snapshotIndex,bleedBudget]`。效果行：投射`[0,seq,origin,end,processed,hitIndices,snapshotIndex,bleedBudget]`；流血`[1,seq,node,targetIndex,origin,nextJump,snapshotIndex,budget]`。每行实际编码守卫effect≤128B、snapshot≤192B；反解必须严格往返且拒绝多余字段/重复实例。

效果首次出现才增长ordinal2..7，每块最多350行及去重快照池；外层完整chunk≤80KiB，header≤16KiB。核心只放cast和controller，效果块保存独立压缩状态、cursor=0/ready=0、局部最大seq，避免全局cursor改变强制重写不变块。已分配空块保留至换场景，修订不倒退，只有hash实际变化才写。读所有引用块、验元数据/hash再重组并校验；多余块不忽略。完整3648效果/228快照混合图仍由ST11-06后验，当前不据此宣称通过。

公开hash新增crossAction与逐个crossEffect，避免把全部效果塞入一个32KiB记录。action携带controller/cast、空effects；effect携带连续index及单个效果，各页最多64记录。冻结公开snapshot只含x/y/facing/haste，不含AP/mastery/命中暴击概率/seed/cursor；客户端显式提供独立display stats与当前等级/控制，完整proof验证后恢复冻结空间/时序。动作完整结果沿原actionResults严格分页，同笔写CP/A/H/header/O/所有页；旧代次、丢回包、重复operation均不能重抽或重复伤害。

换房清旧scene/cast/效果，保留cross CD、角色HPMP和自然回复余数。短恢复不推进逻辑效果；resume后沿同一cast与cursor继续，旧timeline拒绝。UI/Cocos构建/真机、SDK事务和正式发布表仍未验证。
