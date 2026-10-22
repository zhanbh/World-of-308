# E01-04 输入与恢复协议实施映射

2026-10-22，公开合同已本地实现；不代表业务状态机或微信在线验收。依据[有序输入](../backend/verified-action-protocol-v1.md)、[包络](../backend/simulation-content-envelope-v1.md)、[加载握手](../backend/room-loading-handshake-v1.md)、[恢复合同](../backend/recovery-timeline-proposal-v1.md)。

首个切片为`shared/src/protocol/simulation-v2.ts`的`decodeSimulationSubmit`。真实wire文本先检查UTF-8不超过16KiB，再解析精确字段。写信封使用v2/sessionId/sessionEpoch/operationId/expected；payload携characterId/rolePlayEpoch/challengeId/roomNo/sceneEpoch/timelineEpoch/baseCheckpointVersion/firstSeq/lastSeq/fromTick/toTick/ruleRef/mapRef/digest/inputs。

当前测试编码：10ms逻辑步，0＜toTick−fromTick≤100；最多32条输入；seq从firstSeq连续，lastSeq为最后已处理输入序号。空输入推进时间时lastSeq=firstSeq−1，不伪造按键；和服务端当前acceptedSeq/Tick是否连续须由后续业务校验。输入tick按非递减排列，落在[fromTick,toTick)，同刻动作按seq顺序。已接收前沿不由本解析器读取或推进。

ST01交叉纠偏：权威字典规定roomNo统一0基，7房为0～6，未激活首房currentRoomNo=-1；原E01代码1～7误写已在输入、prepare/collect及测试fixture纠正，先加首房0/末房6/非法7反例观察失败再修复。UI第1房自行显示+1，不能混用协议索引。原E01快照保留当时结果，不声称当时此项已经正确。

输入联合为move{x,y}、basic{pressed}、skill{skillId}、item{templateId,quickSlotIndex}、trinket{itemId}，各自另含seq/tick。摇杆轴编码为−1000～1000整数，表达意图，不上传速度或位置；四技能沿既有cross/bengshan/badao/earth标识。快捷药品为0～2。规则/地图引用长度≤64，具体不可变版本由后续release解析；本地digest采用64位小写hex字符串，实际计算/核对由业务层负责，不构成真实性证明。

解码拒绝未声明字段、旧reportEvents/单次enterRoom、自报HP/击杀/奖励；无旧GameService转发。客户端仍未接入此协议，旧v1历史入口尚未因此关闭。安全整数/expected结构复用既有基础，服务端归属、代次真实性、墙钟防加速、具体expected必需集合与战斗重算都未实现。

## 加载、控制与恢复

`scene-v2.ts`提供prepareRoom/activateRoom写信封与manifest/状态引用结果。prepare payload为characterId/rolePlayEpoch/challengeId/nextRoomNo/expectedRevision；activate改为roomAttemptId/manifestHash/expectedRevision。两者expected必须包含目标H/C，不要求各CP块版本。manifest引用release/map及资源，不含私有随机种子。

控制信封为protocolVersion/command/sessionId/sessionEpoch/controlSeq/leaseRevision/payload，不含业务operationId或expected；heartbeat使用独立heartbeatSeq。支持suspend/resumePrepare/ready/status，ready含readyTicketId和sceneEpoch/timelineEpoch/checkpointRevision/publicStateHash/manifestHash。控制结果也按原序号关联，不以回执重新启动时钟。

状态视图区分roomPhase、connection、lifeState和result；acceptedSeq/Tick保留，anchorWallAt为Time、anchorTick为LogicTick，inputGapBaseAt与lastAcceptedInputAt分别表示活动段缺口起点与真实新输入事实。首次3秒ready样本保留lastAcceptedInputAt=null，inputGapBaseAt=3000；这只是合法样本，不推进任何时钟。

transitionClock仅在场景状态的独立字段展示，phase/attemptId/settledAt/connectedElapsedMs/timeRemainder/transitionRevision齐全；pendingRoomAttempt不承载它。awaitingReady样本保留该时钟、活动样本清空。解析器不消费计时，不证明CD从5秒变2秒或CAS幂等已经实现。

恢复票据绑定原deadline；查询scene.recoveryPage用独立requestId，不混用控制序号。分页绑定同票据、scene/timeline/revision、公开及资源摘要、截止，单页最多64条/32KiB UTF-8，最多64页；调用方assembleRecoveryPages拒绝缺页、重复页、混版、重复实体/局部索引和悬空角色引用。公开记录仅actor/cooldown/effect/buff，资源是规范字符串，内部攻击预算与随机流不出CP。该视图用于客户端表现重建，不复制全部私有内核状态；实际状态hash的计算核对由后续可信内容/加载协调器完成，字段一致不构成内容真实证明。

`scene-wire.ts`提供真实调用方可导入的编码/消费边界：关联操作ID/控制序号/查询ID、目标challenge、就绪代次及适用票据；R12明确区分读取错误与成功状态。C23开始、C26复活、C27离开、C28拾取的有界意图/原结果也由场景模块覆盖，药品/饰品无独立旁路。

## 后续业务责任

ST04/ST10/ST14/ST15负责场景生命周期、动作重算、墙钟/输入缺口、原请求防重及恢复事务；ST09/ST16负责真实地面来源和领取。E02负责SDK/字节/设备证据。客户端原型和旧v1服务尚未迁移，schema拒绝旧事件不等于旧业务端点已关闭。
