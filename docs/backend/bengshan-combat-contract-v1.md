# ST11-04 崩山击、合法地面轨迹与特殊击倒

2026-10-25。继承[十字斩](cross-combat-contract-v1.md)、[移动](movement-input-contract-v1.md)、[算术](combat-arithmetic-contract-v1.md)及加载恢复合同；本增量仅明确无奖励训练。实际证据见[04验证](../reviews/st11-04-verification.md)。

显式`ChallengeContent.combat` schema3、profile=`local-test-bengshan`、capabilities=`[basic,cross,bengshan,no-rewards]`；schema1/2保持原行为。除原字段，必需`bengshan`，并进入完整profile摘要/输入digest/公开combatAction.configHash。未知版本/字段/正式收益策略拒绝，不补生产配置；E01旧manifest不包括此profile，客户端仍须显式取得并校验同摘要训练profile。正式收益入口缺原子消费者仍阻断。

`bengshan.version=training-bengshan-v1`、rewardPolicy=none、unlockLevel固定5；显式mpCost、cooldownUs、durationUs、三个严格递增nodeOffsetsUs、rangeX/rangeY、displacement、damage `{base,growth,coefficient,nodeWeights:[w0,w1,w2]}`、bleed `{coefficient,nodeWeights:[w0,w1,w2],jumps,intervalUs}`、knockdownThreshold/knockdownDurationUs/specialKnockdownDurationUs。位移正整数≤20000000内部坐标单位，CD≥100000us，流血≤20跳且总寿命≤10秒。当前配置守卫`(ceil((duration+bleedInterval*jumps)*8/CD)+2)*24≤2048`仅限制本地训练域；最终四技能混合可达图/最大预算归06。

当前真实C达到5级才解锁，每升2级增长一级；E01训练入口仍为合法1级遭遇，测试通过可信成长夹具更新当前C后执行，没有放宽原发布或prepare门槛。AP、精通、G、命中暴击及急速来自当次当前角色/有效装备；接受后冻结攻端、急速/时序、面向、MP/CD；技能拒绝不取消普攻，接受才取消。同tick输入顺序保留；十字/崩山正在施法时另一技能拒绝，其已释放效果仍继续。

起跳接触、下劈、终段三个节点分别独立几何/hit/crit判定。直接和流血总预算沿原公式各算一次，分别按三个权重分摊，前两份floor，末份承余数；101均权固定33/33/35。命中份额才形成独立流血，逐跳独立crit、不额外hit、实时防御一次减伤、DOT不累计普通倒地。前两段只可触发跨招直接伤害阈值倒地，终段才额外触发特殊倒地；免控/施法霸体服从结算当时目标controlImmune，既有倒地取较晚截止，普通控制不缩短已有倒地，起身清累计、死亡优先且不再起身。怪物AI施法状态接线归ST12。

位移以冻结原点时间到endUs的有理进度，逐10ms取累计目标距离之差；急速最多2倍，终点总距离不因切片/急速丢失。每段增量直接复用移动内核的方形足迹、地图内边界及整个路径slab扫掠；薄墙不能穿过，不把空中表现高度当免碰撞。碰撞后实际合法位置用于同tick节点范围，撞墙未走距离不储存到后续补跳；普通移动在施法期间锁位移但继续接收意图。打断清未生成节点及剩余位移，已附着流血保留。冻结面向不因后续移动输入而改变旧施放轨迹。

scene内层schema4新增`bengshan`并要求cross，role仍schema4。BengshanState保存castSequence/randomCursor/readyAtUs/cast/effects。与普攻/十字共享已提交私有随机cursor；AES-CTR原domain/seed不公开，预取上界增加崩山未完cast、本片输入及残留跳数，OCC/写失败/原意图重放不改变抽样。公有bengshanAction/effect不含私有cursor、seed或完整攻击快照；公开冻结snapshot只有x/y/facing/haste。完整proof与独立display stats恢复预测，最终以新CP公开证明纠正。

CP头与外壳不变。场景核心的bengshan使用紧凑`version=2` `{controller,snapshots,effects}`；controller/cast/snapshot布局同十字，三节点数组；崩山只有流血效果行`[1,seq,node,targetIndex,origin,nextJump,snapshotIndex,budget]`，node=0..2。反解严格规范往返、拒绝未知字段/tag/重复效果。效果≤128B、snapshot≤192B逐行守卫。

schema4场景按需效果块为`{schemaVersion:2,kind:skillEffects,cross:<cross-v1>,bengshan:<bengshan-v2>}`，每块合计最多350效果行、两条严格类型lane；各lane独立局部seq、cursor=0/ready=0/cast=null。读全部引用块再合并两lane并验证，不忽略多余块/未知lane；已分配空块保留、只写变化hash，场景换房后重建2核心块。原schema3的crossEffects schema1仍读取。ordinal2..7、单块80KiB、header16KiB、O16KiB、结果/public page32KiB守卫不变，06继续验证最大域。

公开typed bengshanAction只含controller/cast+空effects，逐个bengshanEffect带连续index与单效果，进入统一public hash及32KiB分页；客户端验证完整hash/当前代次与configHash后恢复，不能提交伤害。完整动作结果沿原最多32事件/页的持久结果页，同笔CP/A/H/header/O提交。短暂停止不推进残留；恢复保留cast/流血/CD/随机游标，旧timeline拒绝。换房清cast/效果，保留HPMP、自然回复余数与崩山CD，不返还扣费。Cocos/浏览器/真机/SDK实际性能依旧GAP。
