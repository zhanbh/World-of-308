# 权威模拟检查点与提交关系 v1

日期：2026-10-21。状态：逻辑schema候选，等待确定性、平台与最坏字节验证；不是已建数据库。配套[输入协议](verified-action-protocol-v1.md)、[时间预算](simulation-timing-and-budget-v1.md)。

## 1. 单一权威与读模型

场景检查点是已验证战斗状态的权威，钱包/容器/装备仍各有资产权威。挑战的lifeState、终态与检查点中玩家状态若有投影，必须在同一提交版本关联更新，不能允许分别写入互相矛盾。客户端镜像和排行/界面读模型不是消费或发奖授权。

逻辑检查点以场景ID确定，使用revision及输入游标CAS推进；当前选择独立checkpointHeaders+按需1～8个checkpointChunks，详见[并发与编码包络](simulation-content-envelope-v1.md)，不内嵌challenge。不能因分成多个逻辑对象就各开事务提交。

| 逻辑部分 | 候选字段与约束 |
| --- | --- |
| 身份与场景 | accountId、characterId、sessionEpoch、rolePlayEpoch、sceneEpoch、challengeId/roomNo或城镇anchorRef；全由服务端绑定 |
| 版本 | schemaVersion、revision、rulesRef、mapRef、contentRef、acceptedSeq、acceptedTick、timelineEpoch、lastOperationRef；timelineEpoch随重建时间锚点递增，与场景有效性sceneEpoch分开 |
| 时钟 | anchorWallAt、anchorTick、lastAcceptedInputAt及累计允许/已接受进度、暂停控制版本；死亡/恢复截止引用挑战权威，不另存可独立延长的副本；见恢复时序第6节 |
| 玩家 | 位置/速度余数、面向、动作与阶段、生死、HP/MP及上限、分别约分的HP/MP自然回复余数、属性修订引用、控制状态、目标/输入状态 |
| CD与增益 | 四职业技能CD、生命药/法力药两组CD、独立饰品CD/增益、复活保护等；区分逻辑时间和墙钟期限 |
| 敌人 | 有限spawnId集合，模板/等级/角色分类引用、位置、HP、生死、AI/技能阶段与目标锁定、控制/免疫/倒地进度 |
| 持续效果 | 来源castId/阶段、攻击端快照、目标、剩余预算/跳数/调度、有效时间、残留/出血标识；目标当前防御仍逐次读取 |
| 随机与事件 | 战斗随机游标/引用、稳定事件顺序、外部复活/成长/破损事件引用；不含可公开的私有掉落随机状态 |

列表上界按[当前包络](simulation-content-envelope-v1.md)验证：当前战士每房≤8敌，无召唤，独立效果/流血及编码分配明确；超出该合法域的内容需要重新评审，不使用任意数组。流血可重复叠加的已定预算不可删；可压缩相同调度的等价状态，但需证明与逐跳独立暴击和不同快照等价，不能按性能需要合并成新伤害规则。

## 2. 输入、结果和来源

本期不强制独立持久接收收据。输入片段在验证提交时与operation摘要、检查点新版本、来源记录关联；响应丢失通过原operation恢复。输入原文是否归档与保留多久另按恢复/审计需求定，不在检查点无限追加历史。

输出事件使用稳定身份，例如H(挑战,房间,spawn,事件种类)或H(castId,stage,target,tickIndex)的规范元组；不能在事务重试时重新生成随机事件ID导致同一击杀/伤害重复。内部伤害事件并非每个都必须物化为单独数据库文档，权威来源只在需要防重/追踪处持久化。

## 3. 原子写集合

| 片段事件 | 必须同笔保持一致的逻辑对象 |
| --- | --- |
| 单纯移动/普通攻击无收益 | 账号写栅栏、检查点/挑战必要状态、原operation；具体栅栏物理合并去重 |
| 用药 | 上述对象＋当前背包合法堆叠数量、药品效果/CD；不将背包总数和来源数各减一次 |
| 饰品激活 | 上述对象＋合法穿戴/版本验证，效果及独立CD；装备不因激活被消耗 |
| 击杀/升级 | 上述对象＋已确认收益来源、钱包/角色成长、升级节点邮件；dead升级不复活 |
| 房清/破损 | 上述对象＋最多7耐久实例与属性修订、开门事实；破损不暂停 |
| 复活 | 上述对象＋纹章、deathIndex/付费次数、生死/满状态/保护与CD矩阵 |
| 最终通关 | 上述对象＋Boss及小怪间接收益、通关发奖/待领、免费复活、难度解锁与指针 |

发生多种事件时取逻辑键并集，预算不是把每行孤立证明通过就算整段通过。超预算片段须在执行前有完整可恢复策略；不能验证一半后丢另一半收益。

## 4. 恢复关系

同一有效会话短恢复读取最新确认检查点和原结果，允许秒级未确认表现修正。旧已提交结果可查询但不得覆盖更高版本状态；已过恢复/死亡截止按原生命周期结束。新launch/接管仍结束旧场景，检查点持久化不意味着开放重登续关。

恢复不返回私有随机种子、内部概率或其他角色数据。必要战斗状态裁剪为当前场景的客户端重建视图；哈希和序号不是访问权限。

## 5. 未来一致性验收

同游标同输入重放一次；同游标异参拒绝；乱序缺口不跳过；检查点成功而背包失败不能提交；武器归零/升级后的属性及时生效且不改旧流血快照；死亡/复活/通关竞争保持终态；旧代次不可写；原请求结果与最新视图分开。以上只是待实现验收，不宣称已通过。


2026-10-22评审决定1A：头revision为整体提交版本，每块chunkRevision只在该块变更时更新；头activeChunks固定其块版本/摘要/场景。恢复按头前后复读及逐块引用验证，不要求块版本全部等于头。只写变化块且与资产原子提交，完整协议见[包络](simulation-content-envelope-v1.md)。


2026-10-22评审决定2A：切房初始化仅替换场景状态，角色当前HP/MP、装备修订、CD/增益继承；联网转场累计时间按transitionClock原子折算后进入新CP，不加载满状态默认值，recovery段不计。时间精度余数保留，旧房效果不跨场景；角色层与场景层状态明确分开。


## FR01/FR02当前字段合同

H.transitionClock是唯一转场计时权威，prepare建立、activate保留并推进已结算边界、ready最终结清后删除；pendingRoomAttempt不承载时钟。CP头时钟新增inputGapBaseAt:Time，活动段首次ready赋值，随后仅新输入成功提交更新，心跳与重放不更新。lastAcceptedInputAt保留实际输入提交事实；输入缺口以inputGapBaseAt为准，≥2000ms到期。场景仍awaitingReady/转场时不启用输入缺口。字段在H/CP已有键内，编码字节计入原上界。

## ST10-03 初始内层 schema 实施域（2026-10-24）

外层沿 login-handoff 的 schemaVersion=2 cpHeader/cpChunk 键、归属、activeChunks 和 canonical(data) hash，不建立第二命名空间。头附 sessionEpoch/rolePlayEpoch、rulesRef/mapRef/contentRef、roomNo、严格 sceneState 与 logicalTimeMs/timeRemainderMs。头 revision 是整体修订；本轮 ready 只改变头逻辑时间/锚点时，角色/场景块保留原 chunkRevision/hash，不无故重写。

内层严格 schemaVersion=1：ordinal0 为 role，保存非空玩家、配置基础 AP、装备修订、HP/MP 分别的回复余数、位置余数、真实已解锁技能及配置引用、固定职业/药品/饰品七 CD；ordinal1 为 scene，保存 1..8 个非空敌人、原 spawn/template/分类/技能/免疫/AI 状态和战斗随机/事件游标。等级1只解锁 cross，其他技能按既定 5/10/20 等级开放，不因四配置引用就全部解锁。背包数量不进入 CP。初始角色资源来自锁定、已校验发布，后续房不得重用此首房初始化来重置角色。

该初始版本严格限定 buffs/effects/snapshots 为空、regenerationRef=null；非空或未知 schema 明确拒绝，绝不丢弃未识别状态。它交付首房开启及 ready，不宣称 ST11 战斗、3648 效果/228 快照的完整编码包络已实现。后续严格版本应扩展实际战斗域并重新验证其最坏编码。当前只按实际使用两个块读写；其最大合法非空 actor/CD 编码与外层字节在 ST10-03 验证报告记录。

## ST10-05 后续房内层 schema2（2026-10-24）

外层 schema2、cpHeader/cpChunk 键与两块布局保持；role 内层新增严格 schemaVersion=2，沿 schema1 相同字段，允许最多32个严格公开buff记录及 nullable regenerationRef。schema1仍只接受空buff/null回复引用；未知字段、未知版本及scene非空effects/snapshots一律拒绝，不静默丢弃。该32条是本地实际支持域，不代表未来全部战斗效果包络已实现。buff按actorId、唯一buffId、templateRef及绝对逻辑endsAtTick绑定；公开证明包含buff。7CD与技能等级直接继承当前role，装备资产/角色等级XP及statsVersion仍以当前资产/角色记录为权威，entry equipmentSnapshot仅审计。

后续activate先校验旧room绑定的manifest/map及完整spawn集合全部死亡，再复用当前role、替换入口坐标及新scene；不重置HPMP、CD、技能或回复余数。头revision及新场景复用ordinal的chunkRevision单调递增，sceneEpoch更换令旧地面/公开票据失效。ready只在role实际变化时重写ordinal0；scene未变化保留原引用。

regenerationRef只解析显式ChallengeContent.regeneration local-test配置：ref、unit=`internal-per-second`、HP/MP约分有理速率及最多32个按templateRef匹配的buff附加速率。单位是1/1000显示HP/MP的内部资源单位每秒，毫秒换算分母乘1000。当前E01无正式自然回复表；null引用没有推定回复，无生产默认值。每个base/buff速率先规范化为每毫秒有理数，再检查其分母及持久余数分母的LCM≤uint32；不闭合配置在修改资源前拒绝。计算乘积、约分、资源与期限比较使用BigInt，分段点为buff到期；满值舍弃溢出且清对应分数，暂停不推进。运行时只接受当前存活角色的换房，未扩展死亡MP规则或战斗效果引擎。

schema2同时必含regenerationHash（regenerationRef=null则为null，否则为64位小写SHA-256）；每次结算校验完整显式回复配置canonical摘要。同名ref更换速率或buff表也拒绝，不能仅靠字符串相等声明不可变。后续pendingRoomAttempt.exitRuleHash以同样方式把prepare时的出口交互规则绑定至activate。

### ST10 ready 后 CP 公开投影（2026-10-24）

ready后缀可合法改变HP/CD/buff及CP修订/hash；active分页投影当前CP公开记录，并以同场景/时间代次的已签发原ready回执绑定。CP不嵌入回执，外层CP头/块修订语义和私有字段隔离保持；客户端不能用旧基础页替代新公开记录。 固定截止、旧回执缺字段拒绝、读取/回放/心跳不延期及预算/验收统一沿[加载合同当前证明节](room-loading-handshake-v1.md#st10-ready-后当前公开证明2026-10-24)。

外层校验与login handoff共用头/块元数据约束：身份/键/schema匹配，acceptingInputs为boolean；revision/chunkRevision为非负安全整数，sceneEpoch为正安全整数，ordinal为0..7且唯一，hash为64位小写十六进制，引用与块一致并重算canonical(data)摘要。房间读路径另验session/role正安全整数及严格state/role/scene内层，不因两处同为null等畸形元数据而放行；块修订不要求等于头整体修订。


## ST11-01 当前移动实施（2026-10-25）

role schema3持久移动意图与精确带符号/100000余数，兼容role1/2；保持logicalTimeMs原亚tick余量（13ms+500ms=513ms），不以acceptedTick重建毫秒。movement公开精度进入公开hash并由simulation.confirmed裁剪分页。字段、兼容与约束见[移动合同](movement-input-contract-v1.md)。


## ST11-02 普攻训练实施（2026-10-25）

当前CP增量见[普攻执行合同](basic-combat-contract-v1.md)：显式无奖励训练profile、role4/scene2动作及目标控制、独立私有战斗流、当前公开动作证明和完整有界actionResults分页。既有未声明combat的移动能力保持。实现及实际预算见[验证](../reviews/st11-02-verification.md)，不代表正式收益/技能/AI能力已交付。


## ST11-03 十字斩实施增量（2026-10-25）

当前增量沿[十字斩合同](cross-combat-contract-v1.md)：严格schema2无奖励profile、逐节点直接/流血预算、输入边界MP回复、scene3紧凑效果/快照及按需块、crossAction/crossEffect公开证明和完整动作结果。旧schema1普攻、原CP/恢复/加载兼容；实际验收与未覆盖项见[ST11-03证据](../reviews/st11-03-verification.md)，不代表正式奖励/AI或全部技能混合图已通过。


## ST11-04 崩山击执行增量

当前增量见[崩山击合同](bengshan-combat-contract-v1.md)：显式无奖励训练profile schema3、scene schema4及双技能严格效果lane；三节点直接/流血分别整招预算后按权重分摊、末段承余数。位移全路径复用足迹/边界/障碍扫掠，以实际合法位置判命中；终段才自带特殊倒地，已有倒地不缩短、死亡优先。typed bengshanAction/逐个bengshanEffect纳入完整公开hash和分页；MP/CD/当前等级装备、原操作/恢复/OCC/原子结果页预算沿原合同，旧schema保持兼容。各字段、时序、编码及界限以该合同为同一增量的展开视图；完整最大四技能图仍待ST11-06。


## ST11-05 拔刀斩增量

显式无奖励profile4、scene5及skillEffects schema3三lane保留旧版本严格兼容；拔刀单节点、当前等级10起每2级成长、MP/CD原子扣除、完整公开badaoAction/badaoEffect及原操作恢复，按[拔刀合同](badao-combat-contract-v1.md)执行。动作/伤害/流血精度、字节包络及训练/正式收益边界见该合同；实际验证见[05报告](../reviews/st11-05-verification.md)。


## ST11-06 连续战斗增量

当前大崩四节点、实际落点/独立地面尾伤、四技能有理候选顺序、profile5/scene6稳定槽与全局字典、公开256页/原结果1024页及完整字节预算按[大崩与连续战斗合同](earth-combat-contract-v1.md)执行。旧profile/schema严格兼容；future怪物912条仅编码域夹具，ST12 AI未实现。实际证据见[06验证](../reviews/st11-06-verification.md)。

## ST12-01 近战组合增量

显式profile6/scene7的怪物runtime、玩家控制时钟及原四lane compact存储，按[近战组合合同](monster-melee-combat-contract-v1.md)执行。公开monsterRuntime/playerControl进入完整proof/hash；旧版本不隐式升级。
