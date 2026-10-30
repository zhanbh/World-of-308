# 全量命令、查询与错误契约 v2

ST15-03本地增量：challenge.get响应在data/versions之外可含严格<=8KiB的顶层clearReceipt，供真实终局HUD恢复。字段、direct/pending固定路由与sceneState校验见[终局合同](terminal-settlement-contract-v1.md)；无凭证旧场景响应保持原形。simulation.submit不复制装备/邮件全对象，仍返回原有有界游标及实际变更角色/背包版本，通关数据随后query。正式SDK/设备验证未覆盖。

更新：2026-10-20。状态：E04设计提案，待方案收敛和eng-review，未写入shared协议代码或部署。依据：[核心契约](core-contract-v2.md)、[数据字典](data-dictionary-v2.md)、[访问/事务](access-and-transactions-v2.md)、[状态转换](state-transitions-v2.md)。

本文覆盖已确认MVP的Interface目录，名字与DTO字段是候选。标为“待边界”的项目不能因列出名字就编码上线；用户已明确社交不在本期工作范围：他人检视/搜索、好友、私聊等仅保留规则，不作为本期接口交付或工程准入前置；手动局内暂停仍未确认。

## 1. 公共信封和身份

写请求：`protocolVersion:2, command, operationId, sessionId, sessionEpoch, expected[], payload`。expected元素为`{kind,id,version}`，每种命令有必需对象集合，不接受任意跨账号ID；不再用一个containerVersion指代两容器。相同kind+id不得重复且版本冲突，数量有上限。

查询：`protocolVersion:2, query, requestId, sessionId, sessionEpoch, payload`，返回`serverTime, requestId, data, versions`；查询不必为只读列表建立无限operations。需要落实到期/回城等有副作用的状态读取，由受控应用事务执行并持久去重，不能直接从陈旧缓存答active。

命令结果：`operationId,serverTime,replayed,outcome`，outcome为committed{data,resultVersions}、rejected{code,details?}、unknown{code:RESULT_UNKNOWN}。任何details均为已授权的有界公开字段，不泄露他人对象是否存在、数据库堆栈、随机秘密或凭证。

sessionId/epoch不是独立身份凭证；可信平台身份由传输Adapter取得，不从payload的accountId/OpenID构造。会话open单独受信入口，在当前session尚不存在时也有稳定登录来源；平台凭证格式和交换流程属E07，不把raw secret写入operations或公开视图。

### 通用执行语义

1. 格式/大小/可信身份检查；解析账号与会话。
2. 当前会话授权后先查原operation；同ID同原摘要重放原结果，异参拒绝。只有新意图再检查expected。
3. 落实已到期状态，校验对象归属、场景、配置、版本与业务条件；一个应用事务提交关联对象、来源、流水和操作结果。
4. 结果未知先查原ID；notFound不证明在途永不提交，仍用原ID和原参数。换数量、目标、币种、报价或expected是新意图，不能在原提交未知时另开第二笔。
5. 客户端按每对象版本应用结果，原历史结果不当成最新余额；服务面板关闭不取消在途请求。

## 2. 查询Interface目录

排行榜已确认懒加载、不要求实时更新；R11需带asOf/投影版本等新鲜度标记，不能将查询/刷新时间写作scoreReachedAt。实际刷新与缓存失效方案仍需E03联调，不用全表逐角色同步重算冒充廉价懒加载。

全部查询先校验当前会话及目标所有权；列表使用有界游标与响应字节上限，具体平台/分页上限待E03/E07实测，不开放任意全量导出。

| ID／查询 | 输入 | 返回公开视图及限制 | E03 |
| --- | --- | --- | --- |
| R01 account.get | 无账号自报目标 | 可用角色摘要、选中角色、钱包、挑战/场景指针及版本；不返回平台subject | Q02 |
| R02 character.get | characterId | 自身等级/经验、穿戴、技能解锁/等级、属性拆分、location、当前体力来源、版本 | Q03/04 |
| R03 inventory.get | characterId,containerKind | 背包或当前个人/账号库的容量、stage、slots和权限；库数据访问受银行上下文约束 | Q03 |
| R04 equipment.get | characterId,itemId | 自己有权查看的装备属性、绑定、耐久、强化、套装/对比；不作为任意他人检视入口 | Q04 |
| R05 dungeon.options | characterId,dungeonId | 入口对应副本、等级区间、难度与解锁、可进入原因；不提示体力消耗，不新增评分门槛 | Q03/13 |
| R06 service.get | characterId,serviceContextId | 对应NPC/银行/邮箱服务类型与允许操作、当前版本；访问授权证明待第4节收敛 | Q03/13 |
| R07 service.quote | characterId,contextId,serviceIntent | 服务端目标版本/报价配置、所需币/材料、效果和失败后果；强化无概率字段 | Q03/04/13 |
| R08 mail.list | characterId,cursor,pageRequest | 倒序角色邮件、到期/未读/附件摘要和nextCursor；过滤时效用有界扫描 | Q05 |
| R09 reward.list | characterId,cursor,pageRequest | 仅原角色永久待领，生成时间倒序、数量/分页，绝无过期倒计时 | Q07 |
| R10 delivery.summary | characterId | 新邮件/待领提醒及计数的asOf/版本；不因此远程开放邮箱服务 | Q06/07 |
| R11 ranking.list | scope=all/warrior/hunter,cursor,pageRequest | 公开榜单、当前评分/达到时间及自己的排名信息；私有资产不外传 | Q12 |
| R12 challenge.get | challengeId | 结果/生死/场景/连接、room、快照余额、截止、序号、允许动作和恢复指令 | Q09 |
| R13 operation.get | operationId | 本账号原意图结果/未找到；当前合法会话可查自己旧会话结果，不赋予旧会话写权 | Q09 |
| R14 configuration.public | manifestId或服务端分配引用 | 客户端渲染/计算需要的公开内容和摘要；无私有权重、策略秘密/凭证，客户端不能选旧版获利 | Q13 |

银行完整库存读取和存取均要求有效银行上下文及服务端24px范围；不允许远程预取金库。邮件服务按城镇与批领合同执行；HUD摘要不开放完整库存/领取权限。列表空、服务不可用和未授权是不同状态。

## 3. 命令Interface目录

expected缩写：A=账号业务版本（仅需要时）、C=角色、B=背包、V=当前金库、W=钱包、I=装备实例、H=挑战、M=邮件、G=交付来源。账号writeRevision是服务端内部栅栏，不要求UI持有每次心跳改动后的值。所有行隐含当前会话、归属及原operation去重。

### 身份、角色与场景

| ID／命令 | payload关键字段 | expected与前置 | 成功结果／关键拒绝 |
| --- | --- | --- | --- |
| C01 session.prepare / session.commit（原session.open流程） | prepare:launchId、prepareOperationId；commit:ticketId、launchId、openOperationId；均需可信平台身份 | prepare只发票据；commit校验票据身份/时效及baseSessionEpoch并原子切代；旧launch不可抢回 | commit返回session/epoch、角色摘要及必要旧挑战结算；原回执不激活旧会话；详见身份适配§6 |
| C02 character.create | classId,characterName | 合法开放职业、账号职业未占用、名称合法且同名未占用（提交事务内校验） | C+20格B+20格个人库+白武器穿戴+新手邮件来源，同事务；不重置共享钱包/账号库 |
| C03 character.select | characterId | 无未结束挑战或旧拾取场景；不静默丢未拾取物 | 选中角色及其隔离旅店位置；有旧挑战/场景要求先明确结束 |
| C04 scene.exitInn | characterId,exitAnchorId | C；当前角色旅店、合法城镇出口 | 城镇固定入口锚点，无战斗/金库资产变化；地图几何待定 |
| C05 service.open/close | characterId,serviceKind,anchorId／contextId | C/location与服务身份，见第4节 | 返回/关闭服务上下文；关闭不取消在途资产意图 |

城镇移动是客户端即时体验，不每帧写坐标。C04/C05用于场景/服务许可，不应被误当成可信移动验证已经完成。

### 资产、装备与快捷位

| ID／命令 | payload关键字段 | expected与前置 | 成功结果／关键拒绝 |
| --- | --- | --- | --- |
| C06 inventory.transfer | characterId,contextId,sourceContainerId,targetContainerId,item/stackId,quantity | 源/目标版本、I如适用；银行、绑定/数量/容量 | 原子双容器转移；不足返回可容纳量但不部分转移 |
| C07 inventory.expand | characterId,containerId,targetStage,paymentCurrency,quoteRef,contextId? | B或个人V、W；背包城镇/个人银行，stage合法 | +20格到100，二币只选个人库；账号库不可扩容，同档一次 |
| C08 equipment.equip | characterId,itemId,targetSlot | C/B/I与旧穿戴I；城镇、职业/等级/绑定，饰品等待限制 | 满包同部位原格交换，属性/绑定/评分修订；不创造第二装备位置 |
| C09 equipment.unequip | characterId,itemId,slot | C/B/I；空格、饰品限制 | 入包并清穿戴；满包拒绝，不允许出售时隐式卸下 |
| C10 quickslot.assign | characterId,slotIndex,templateId或null | C；3格0–2，主动消耗品模板合法 | 更新绑定，null仅解绑不删道具；无库存是否能绑定的非拖动路径不额外开放 |
| C11 item.use（仅有序输入内的动作语义） | templateId,quickSlotIndex?、片段内动作序号 | 父输入片段的检查点/H/B及合法动作/CD | 与检查点同笔消费1并生效；满值拒绝不消耗不进CD，无独立公开扣药命令 |
| C12 trinket.activate（仅有序输入内的动作语义） | itemId、片段内动作序号 | 父输入片段的检查点/H/I及合法动作/固定CD | 与检查点同笔确认buff/CD，不解控、不护盾、不耗MP，无并行激活入口 |

C11/C12编号保留作规则追踪，不代表可独立调用的资产端点；统一由simulation.submit候选入口处理，语义见第6节。旧独立请求不作为兼容旁路，新请求拒绝UNSUPPORTED_PROTOCOL；已提交历史结果仅按授权查询原operation，不再次消费。后端不接受client传amount=治疗量或直接setHp。

### NPC服务与兑换

| ID／命令 | payload关键字段 | expected与前置 | 成功结果／关键拒绝 |
| --- | --- | --- | --- |
| C13 shop.buy | characterId,contextId,offerId,quantity,quoteRef | C/B/W及报价；商人、容量/币充足 | 整笔购买和来源交付，满包/不足整次拒绝；点券商品归绑定配置 |
| C14 shop.sell | characterId,contextId,item/stackId,quantity,quoteRef | C/B/W/I如适用；已在背包、可出售 | 固定按模板/装等/品质计收入，强化词条不涨；无回购无分解 |
| C15 wallet.exchange | characterId,fromCurrency,exchangeUnits,quoteRef,contextId? | W，城镇；兑换入口位置待定 | 每单位10000金币⇄1点券，非负整数/余额/上界检查，无真实充值 |
| C16 equipment.repair | characterId,contextId,target=single(itemId)或allWorn,quoteRef | C/W/涉及I；林纳克斯、7耐久槽 | 单件修满或当前穿戴全修，满耐久不收费；全修不足整批拒绝 |
| C17 equipment.enhance | characterId,contextId,itemId,targetLevel,useMemento,quoteRef | C/W/B/I；玛丽，武器/耳环、材料/目标级 | 固定本次随机结果，失败/损毁/纪念品来源与原结果一致提交，概率不展示 |

独立点券商城可使用C13同类购买Interface但需单独serviceKind/offer授权，不通过商人标价自动开放点券商城；商城具体入口仍待D05补齐。C16单件修理允许当前穿戴或背包装备，allWorn只处理当前穿戴，不修背包；金库物品先取出再修，不开放任意仓库远程修理。

### 邮件与永久待领

| ID／命令 | payload关键字段 | expected与前置 | 成功结果／关键拒绝 |
| --- | --- | --- | --- |
| C18 mail.markRead | characterId,contextId,mailId | M；邮箱授权/本角色 | 记录已读不影响附件资格；不因读更新生成时间 |
| C19 mail.claimAttachment | characterId,contextId,mailId,attachmentId | M/B/I如适用；时效/原角色；邮件内来源为权威，不另建同附件G余额 | 入包与附件实领/来源同笔，满包保留；堆叠可按可容纳量部分领取、余量留原处，装备整件领取 |
| C20 mail.claimAvailable | characterId,contextId,selection/cursor,batchIntentId | 服务端有界分配子意图；每附件重验 | 每项结果/剩余游标，尽可能领取，可部分成功；不承诺无限大原子全领 |
| C21 mail.delete | characterId,contextId,mailId | M；无未领附件 | 逻辑删除并保留来源凭据；有附件拒绝 |
| C22 reward.claim | characterId,contextId,grantId | G/B/I如适用；邮箱永久待领页签 | 原角色入包，pending→delivered；不过期、不转其他角色 |

批量子操作ID必须由batchIntentId+稳定附件来源确定，不靠客户端重开循环换ID领取。一键领取已确认跳过无法容纳附件并继续后项，能合并堆叠的仍可领取；最终汇总实际/未领取。每个子操作保留原结果，不因重试把上次部分领取的同一子操作变为再次领取剩余。

### 挑战、房间与复活

| ID／命令 | payload关键字段 | expected与前置 | 成功结果／关键拒绝 |
| --- | --- | --- | --- |
| C23 challenge.start | characterId,dungeonId,difficultyId,entryContext | C及装备/解锁事实；至少1体力、可用武器、无旧active/looting | challengeId、配置/等级/装备/体力快照、序号；不开场前额外扣费；固定紫名安排 |
| C24a challenge.prepareRoom / C24b challenge.activateRoom | prepare:challengeId,nextRoomNo；activate:roomAttemptId,manifestHash | H/C；alive/active/connected、上房全灭及合法出口；途中武器0不拦 | prepare只锁manifest；activate原子扣本局体力/初始化awaitingReady场景，完整状态就绪后scene.ready开战；详见加载握手，不保留单次enterRoom旁路 |
| C25 challenge.reportEvents（旧协议，禁止新调用） | 旧自报事件批结构仅供迁移识别 | 新请求拒绝UNSUPPORTED_PROTOCOL，不重算或发奖 | 新战斗改用simulation.submit有序输入；历史结果仅授权查询原operation |
| C26 challenge.revive | challengeId,deathIndex | H/B；dead/active/connected、两个截止均有效、纹章及次数 | 原子消费/复活/保护；职业CD清零、药品饰品不清；免费通关后不可再收费 |
| C27 challenge.leave | challengeId,reason=abandon或finishLoot | H；先确认在途输入/原请求结果，按权威result决定reason | 关闭场景、终态、回城门口、体力一次结算/满HPMP/清CD，不丢已保存收益 |
| C28 drop.collect | challengeId,roomNo,dropId,roomToken,sceneEpoch,positionHint | H/B；当前可拾取场景、有效来源 | 交付/绑定一次，满包留地；位置提示不是可信移动证明 |

进入入口范围只打开选择页，不提交C23；关闭页或回城门口后离开再走入才重触发。未加载资源时重复打开页面不重开挑战，加载失败后的握手时序在第8节保留检查项。

## 4. 服务上下文与授权约束

已实现服务上下文字段为id（公开contextId）、schemaVersion、accountId、characterId、rolePlayEpoch、sceneEpoch、locationRevision、serviceKind、anchorId、issuedAt及状态。sessionEpoch由当前会话和账号指针核验，不另在上下文复制；服务端签发并验证，不接受客户端换NPC名称就调用强化/银行。

上下文根据服务端最后确认的城镇位置/地点版本及合法移动输入签发，沿可验证动作协议，不信任客户端自报“已到NPC”。地图/出生锚点、移动时间及距离校验、签发/消费的版本竞争仍需联调；已有方案不等于已实现可信坐标源，不能仅持contextId就绕过地点校验。

关闭上下文后，已被服务端接受并提交的资产请求不撤销；关闭与在途请求的先后由事务顺序决定。若关闭先成立可拒绝尚未执行请求；若请求先提交则保留结果，UI关闭后仍能查原operation。换角色/接管/locationRevision改变时旧上下文失效；旧请求命中历史结果不授予新的写权限。

## 5. 战斗事件、来源与控制通道

playerDied、monsterKilled等为服务端重算生成的领域事实，不是客户端可提交并授权资产的事件。客户端只能提交有序输入意图；事实用于内部生命周期、来源去重及输出指令，不保留自报击杀的兼容入口。

输入序号与服务端生成事实的顺序分别维护，不能把客户端firstSeq当作已发生击杀的证据。内部事实带逻辑时刻和合法来源：monsterKilled绑定manifest的spawnId，playerDied带deathIndex及受规则内核约束的残留引用。同一步玩家/首领同死的领域处理顺序保留先死亡、再认定首领击杀/通关及免费复活；不是让客户端自行选择报告次序。首领识别来自manifest，不设任意finishVictory命令。

输入片段不能跨未确认房间边界。格式/版本/序号错误拒绝整段，不推进游标；满值用药、CD未到等合法动作拒绝则记录逐动作结果并按输入协议推进合法时间，不把无效动作当成功消费。重复父operation返回原结果，缺片段返回期望序号/检查点，不补发收益。死亡后不得生成新直接攻击，残留存续由权威检查点和既有技能生命周期决定，不接受客户端声明作为唯一证据。

控制通道独立：heartbeat、scene.suspend、scene.resumePrepare、scene.ready、scene.status，按递增controlSeq/heartbeatSeq及leaseRevision处理，不制造无限业务operations，也不让心跳无故推进challenge业务version。显式recovery只有同票据scene.ready成功才解除，重复suspend不能延长原截止。

租约按最后新有效连接证据lease.lastEvidenceAt+10秒；有效输入可承载保活，新心跳另有序号去重，旧请求重放不续期。静默缺口沿原leaseUntil，不在到期后另加10秒；显式暂停/恢复与timelineEpoch统一见恢复时序第6节。真实断网瞬间不可观测，工程频率/阈值不是平台或体验实测承诺。

## 6. 药品、饰品与冷却事实（明确未闭合）

已定行为：血药共享10秒、蓝药另组10秒，满值拒绝且不消费，受击/倒地可用不解控；饰品固定独立CD、不受急速/套装减CD，死亡/回城清buff；复活/回城/短暂重连冷却矩阵沿规格。

工程需补：本地模拟tick如何映射服务端可验证的动作顺序、HP/MP/最大值镜像如何推进、何时确认消费并表现恢复、断线暂停与死亡继续时钟、冷却期间饰品不可卸换/60秒换装等待。不能单纯收clientHp/ready=true就扣资产，也不能擅自改成墙钟CD绕过死亡/断线规则。

方向已确认：服务端按有序片段重算，不部署常驻逐帧多人服务器。C11/C12是该片段内动作，C08/C09涉及饰品的限制仍需与已确认CD事实对齐。剩余未定为时间锚点、精度/上界、逐动作结果结构及成本方案，不再把“是否验证行为”作为待用户选择；本文仍不构成coding准入。

## 7. 错误分类与客户端动作

| 类别／候选码 | 结果与可公开details | 客户端处理 |
| --- | --- | --- |
| AUTH_REQUIRED/SESSION_REVOKED | 不泄露账号映射/凭证 | 停资产写和战斗，提示重新认证/接管，不自动抢会话 |
| INVALID_ARGUMENT/UNSUPPORTED_PROTOCOL/OPERATION_MISMATCH | 白名单错误字段或协议范围，不返私有数据 | 修正客户端；不可用异参重试原ID |
| NOT_FOUND_OR_FORBIDDEN | 不区分外账号对象存在性 | 刷新自有视图或退出对应面板 |
| VERSION_CONFLICT | 当前已授权对象版本，可选refreshHints | 查新状态，确定旧意图已决定后新意图新ID |
| CONFIG_NOT_READY/QUOTE_CHANGED | 必需配置不可用/报价失效，不隐式换更高价 | 禁止执行，重新展示报价/原因，不消费 |
| CONTEXT_INVALID/LOCATION_NOT_ALLOWED | 服务种类或场景不匹配，安全细节裁剪 | 重开合法服务/返回场景，不重新提交资产意图绕过 |
| CURRENCY_NOT_ENOUGH/MATERIAL_NOT_ENOUGH | 所选币种或材料缺额 | 原意图拒绝；不自动切币种/购买补足 |
| CONTAINER_FULL/BAG_FULL | 可容纳数量，mail/grant/drop仍保留 | 整理/改数量后新意图，不部分扣转；地面满包不自动待领 |
| BINDING_RESTRICTED/ITEM_NOT_ELIGIBLE/UNLOCK_STAGE_MISMATCH | 合法展示的绑定/槽位/等级/阶段原因 | 不消费，更新目标状态 |
| MAIL_EXPIRED/UNCLAIMED_ATTACHMENTS/ALREADY_DELIVERED | 原角色已授权状态 | 刷新列表；重复领取可返回既有交付状态，不二次发奖 |
| ACTIVE_CHALLENGE_EXISTS/SCENE_STILL_OPEN | 本账号有效指针 | 先明确结束，不静默丢拾取物 |
| STAMINA_NOT_ENOUGH/WEAPON_REQUIRED/WEAPON_BROKEN | 仅新开挑战体力检查；武器归零只影响属性，不暂停 | 0不能开新本；不能因本局0阻止后续房 |
| ROOM_NOT_AVAILABLE/INVALID_EVENT/EVENT_GAP/EVENT_ALREADY_ACCEPTED | nextSeq、当前房间和安全裁剪游标 | 对齐原事件，不重抽/重杀；非法事件不伪装成功 |
| NOT_DEAD/EMBLEM_NOT_ENOUGH/REVIVE_LIMIT_REACHED | 更新允许动作 | 不消费纹章，不替扣金币/点券 |
| COOLDOWN_NOT_READY/RESOURCE_ALREADY_FULL | 已确认CD或满值原因 | 不消费药品、不清控制；相关状态协议需先闭合 |
| DEADLINE_EXPIRED/CHALLENGE_TERMINAL/SCENE_CLOSED/RECOVERY_REQUIRED | 权威状态/截止及恢复动作 | 停止不合法操作，completed不改failed |
| RATE_LIMITED/SERVICE_UNAVAILABLE | 有界retryAfter候选，不声明资产一定没执行 | 退避；提交不明先查原操作，不能离线继续刷 |
| RESULT_UNKNOWN | 非最终业务失败 | 原ID查/重试，不换随机、不再扣一笔 |

稳定业务拒绝可写operations；事务前格式/身份/限流拒绝不承诺写结果。真实SDK错误只入受控日志。错误码需与shared实现统一迁移，当前表不表示代码已经拥有这些枚举。

## 8. 时序与覆盖出口

| 流程 | 必须保持的时序 | 验收依据 |
| --- | --- | --- |
| 创角 | 职业占位、白武器/容器、新手来源一致可见 | S03初始化与E03 T02 |
| 开局 | 入口选择→C23锁快照→C24a准备manifest→本地加载→C24b一次扣首房/初始化→可战斗 | LOC04–LOC08；资源加载失败后原挑战处理仍需协议时序明确 |
| 死亡与复活 | flush未知事件→权威dead/deathIndex→C26 | 首领残留免费复活优先于后续收费，不自动退已提交纹章 |
| 回城 | 确认旧事件→C27关闭/快照结算→对应门口；新启动为旅店 | LOC01–LOC03/LOC09与旧结算迟到竞态 |
| 存取/服务 | 目标/版本/报价→提交→结果或查询→视图按版本合并 | UI01–UI14；他人检视与搜索为后续社交，不属于本期接口交付 |

下一步联调E06配置/迁移、E07平台/动作可信度；待边界的服务位置、药品/饰品动作、批量细节、未定商城/兑换入口等需先补方案收敛。不能因“全量目录已列”称协议全部定稿。完整设计→eng-review→关闭问题→coding门禁不变。

## 后续社交契约储备（本期不实施，2026-10-20）

已确认入口为排行榜或玩家信息搜索，检视以角色为目标。公开返回仅限昵称、职业等级、13槽穿戴装备及强化词条、套装、最终战斗属性和快照时间；不返回钱包、背包、金库、邮件、内部账号标识或资产审计来源，不复用R04私人资产响应。使用可公开的角色引用关联搜索结果与检视，不以内部账号标识作为公开检索字段。搜索仅接收角色名，不开放角色编号检索；角色名禁止重复。精确/模糊匹配、名称规范化、分页/限流以及错误状态仍是工程设计待补项；这里仅记录边界，不宣称接口已实现或已评审通过。
### C02命名与并发补充

创建时服务端验证角色名并原子占用名称键，与角色、初始容器、白武器、新手邮件来源及操作结果一并提交；查重接口只提供可用性提示，不预占、不承诺后续一定可用。同名并发仅一笔成功，另一笔返回名称已占用，不发放任何初始化资产。同一操作重试返回原结果，不能将自己已成功占用的名字误判为他人占用。乐观版本校验继续用于已有账号/角色等共同写入对象，但不以两个不同新角色各自version=0作为同名互斥保证。命名比较规则、改名/删角后名称是否释放待产品确认。

社交权限补充确认（2026-10-20）：私聊发送要求双方已确认的好友关系；陌生人仅可搜索、检视和申请好友。发送事务/命令须在服务端验证当前关系，客户端已打开聊天窗不构成授权。好友关系按账号共享已确认，角色名用于查找，关系绑定账号；客户端使用不透明社交引用，不回传内部账号标识或全角色列表。消息投递契约尚未冻结，不据此宣称聊天接口已设计完成。


在线私聊补充确认：仅双方在线时允许发送，不提供离线留言或下次登录补收。服务端发送时检查好友关系及双方有效在线会话；客户端在线展示不构成授权。在线租约判定、投递中断、历史保留与发送结果恢复契约待收敛；未知结果恢复必须保留原消息身份防重复，不能自动升级为离线队列。

## 本期补充：背包整理契约候选（2026-10-21）

inventory.organize候选输入为当前角色、背包expectedVersion、direction=forward/reverse及原操作ID；不接收客户端排列后的任意实例位置或数量。服务端生成稳定排列，按完整堆叠兼容键合并至20，装备不合并；正序装备→消耗品→材料，装备按固定部位顺序、品质高到低、装等高到低，同键稳定。倒序反转排列、空格置首；正序空格置末。快捷栏绑定模板不变，金库整理不在已确认范围。结果返回权威容器版本和必要位置变化，未知结果查询原操作；并发修改时不能以旧排列覆盖。持久保存direction偏好尚未确认，不由字段候选推导新设置功能。

原子范围覆盖背包与合并实际涉及的数量/位置记录以及原结果；角色权限、会话栅栏、实例唯一位置与总数量/绑定/来源守恒继续校验。原有T用例预算需增补该用例，尚未平台验证，不能据此编码。UI提交状态见[本期UI状态覆盖](../design/ui-state-coverage-v1.md)。
## C17强化游玩代次补充（2026-10-21）

写入上下文增加rolePlayEpoch，由服务端与当前有效角色游玩代次核对；它不是身份凭据。C17需校验强化记忆版本，服务端读取来源等级补偿量，按不可变规则计算阈值与相似度；失败增加相应来源量、成功按相似度消耗，而非全部清零。金币、材料、装备、所选纪念品消耗/损毁返还、记忆与操作结果同事务提交，拒绝不改变任何一项。晚到旧代次写拒绝；已完成旧操作仅允许当前授权身份查询其原结果，不执行第二次。

短恢复与同会话令牌更新不创建新角色代次；切角色、重登或接管创建新代次归零，关面板/修理/回城不归零。客户端不得提交自己算的概率或记忆。具体字段需与会话/角色切换契约整体复核，当前仍非冻结协议。

2026-10-21用户确认：本期在线闭环按服务端可验证行为设计。客户端即时表现，服务端分段验证移动/碰撞、战斗、药品/饰品与NPC地点，不只信任客户端击杀/HP；不引入实时多人或常驻逐帧服务器。输入、检查点及原子提交候选见[可验证动作协议](verified-action-protocol-v1.md)。方向已定，但确定性、时间容差、性能/事务与平台验证未完成，不宣称编码就绪。

## 有序输入命令与查询补充（2026-10-21候选）

候选simulation.submit接收verified-action-protocol-v1.md定义的场景/角色代次、timelineEpoch、基准检查点版本、连续输入范围及原operation；返回已提交游标、当前锚点代次/恢复视图及相关资产版本，不返回任意客户端指定奖励。simulation.get读取当前授权场景确认状态；原写结果仍走operation.get，不能把读状态当已执行消费证明。两者名字为候选，尚未写入shared。

C11/C12已按同一有序动作/检查点编排作为设计方向，不能保留一个绕过验证的并行扣药接口。复活、离开及房间转换作为明确外部控制事件与游标串行；不得只加新submit接口却保留可自报击杀的旧奖励入口。满值、CD、未解锁等合法游戏动作拒绝与整个片段格式/版本错误分开，逐动作结果与接受游标推进规则尚需精确定义，不能默默跳过非法输入发奖。

角色location/地点验证与普通资产服务共用服务端确认位置版本，城镇移动非每帧写数据库但仍需有界验证。恢复只返回最新确认状态，允许秒级未确认表现修正；持续断网沿原10秒窗口提示重新进入。与[检查点schema](simulation-checkpoint-schema-v1.md)、[时间基线](simulation-timing-and-budget-v1.md)共同评审。
角色命名补充（2026-10-21用户确认）：仅允许字母或中文，不允许数字、空格、标点及其他符号；纯中文角色名最多6个字。后续同日补充已明确纯中文6字或纯英文12字母，禁止中英混用；大小写等判重规范化由字段约束继续细化。角色名唯一、服务端原子占名及并发防重规则保留；命名规则属于创建角色基础能力，不随社交后置取消。
角色命名最新确认（2026-10-21）：不允许中英混用，只能是纯中文或纯英文；以中文每字2个长度单位、英文字母每个1个单位换算，总上限12，即最多6个汉字或12个英文字母。禁止数字、空格、标点、符号及不可见控制字符。英文采用A–Z/a–z字符集合；中文字符集合按Unicode汉字规则由实现规范明确，不用UTF-16代码单元误计汉字个数。大小写/全半角等名称判重规范化仍按未确认候选处理，不据本条自动允许近似同名。命名唯一、服务端原子占名不变。

所有装备实例必须包含durability字段；是否参与磨损由明确策略区分，不通过字段有无推断。礼包必须记录生成来源、附件总量、累计实领及每次领取原结果，领取进度与资产入包同事务更新。不能因邮件删除/过期或操作响应丢失而重复发放。本轮撤销假设旧数据缺字段作为当前用户待决项，改为新schema必需约束；没有盘点或修改真实旧数据。


## 当前评审合同增量（2026-10-21）

C24a/b完整schema、加载失败和竞争按[加载握手](room-loading-handshake-v1.md)。simulation.submit使用[精度顺序](combat-arithmetic-contract-v1.md)与[合法并发包络](simulation-content-envelope-v1.md)，原结果返回acceptedSeq/acceptedTick/checkpointRevision/actionResultsRef及有界摘要，完整恢复视图另查；CP私有分片不直接外传。R11使用[查询基线](ranking-query-baseline-v1.md)，包含rankAsOf/equipmentVersion及名次暂不可用状态，不虚报准确名次。新的引用是待评审候选，不表示shared已实现。

C24a expected包括H/C；C24b包括H/C及prepare返回attempt，不要求客户端持有每块CP版本。客户端不得用新ID对同attempt重建room；同参数重试按原操作，异参拒绝OPERATION_MISMATCH。资源摘要不符用CONFIG_NOT_READY，旧attempt/前房未清用ROOM_NOT_AVAILABLE，旧场景用SCENE_CLOSED，其他版本冲突沿既有VERSION_CONFLICT，不新增平行错误体系。

城镇服务地点的可验证坐标、C05距离/代次校验和邮件批领的20附件/100封扫描/每请求4项边界采用[城镇与批领合同](town-authority-and-batch-delivery-v1.md)。历史“服务位置来源未闭合”由具体候选替代，真实验证仍待实现。


## 2026-10-22批准4A/7A

恢复票据与公开恢复分页绑定sceneEpoch/timelineEpoch/checkpointRevision/publicStateHash/manifestHash及原截止；scene.ready携票据、controlSeq/leaseRevision，不接受客户端上传权威HP或省略页假装服务端通过。激活新房先awaitingReady再ready，沿[批准合同](../reviews/eng-review-approved-contracts-2026-10-22.md)。HP/MP自然回复余数进入权威CP编码，普通DTO显示取整不回写。


## FR01/FR02设计修订

转场唯一计时存H.transitionClock，activate清pending但保留时钟，ready结清未消费联网区间后删除。活动段首次scene.ready原子设置inputGapBaseAt与活动锚点，后续仅新合法输入提交刷新缺口基点；ready重放/心跳不刷新，历史lastAcceptedInputAt不充当首次输入计时起点。活动态差值≥2000ms进入recovery，加载态不判2秒缺口，原死亡/恢复截止不延长。详见加载与恢复权威合同。

## ST04 本地实现入口（v2）

`inventory.organize`与`quickslot.assign`由InventoryService消费；只接受v2公开解析器，不经旧GameService。前者必须携带当前角色及当前背包的expected，后者必须携带当前角色expected；多余/缺少对象拒绝，当前账号、会话与选角归属每次校验。整理成功只返回有界摘要及resultVersions，完整背包再查R03。同ID同参先重放，异参拒绝；操作未知继续沿原ID，notFound不允许另造新意图。

补充私有查询`quickslot.get`：payload为`{characterId}`；返回角色ID、角色version及恰好3个按slotIndex=0/1/2排列的`{slotIndex,templateId|null,quantity}`。quantity从当前背包同模板合法堆汇总，耗尽仍保留模板并返回0；不持久化第二份数量。versions同时包含角色和背包版本，客户端只能与同背包版本的R03视图一起应用，避免绑定未变但数量过期。此查询不返回内部账号绑定ID、审计正文或云身份。

本轮已接入内存适配、平台无关协调器及Cocos Prototype拖拽面板，真实微信传输和手机实机仍未接入验收；本机隔离试玩不视为真机完成。

## ST09 本地实现增量（2026-10-23）

以下为 `shared/src/protocol/asset-v2.ts` 与 `BankService` 已实现的 v2 边界，补充上述查询目录；不会将本机内存验证等同微信 SDK/真机接入。

| 查询 | payload | data / versions |
| --- | --- | --- |
| `bank.get` | `{characterId,contextId,vaultKind:personalVault或accountVault}` | 同一事务读取 `{characterId,characterVersion,backpack:ContainerView,vault:ContainerView,wallet:{walletId,version,gold,points}}`；versions恰含角色、两个容器、钱包，与data逐项同版 |
| `bank.itemVersion` | `{characterId,contextId,containerId,itemId}` | 仅 `{itemId,version}` 及该装备版本；要求装备确实处于所选合法容器，不批读全部实例，不返回完整装备或来源正文 |
| `inventory.expansionQuote` | `{characterId,containerId,targetStage,contextId?}` | `{containerId,targetStage,nextCapacity,configRef:{id,version},quoteRef,costs:[{currency,amount}]}`；versions含角色、该容器、钱包；背包城镇/个人库银行，账号库不可扩 |

查询统一使用v2 envelope（requestId、sessionId/sessionEpoch等）。`bank.get` 因一次返回两份完整容器，完整公开响应UTF-8上限为256KiB；inventory.get为128KiB，其他资产查询仍64KiB，普通写响应仍16KiB。单个内部容器256KiB、整理流水512KiB、其他流水128KiB、原结果16KiB。解析与网络解码共用shared/src/asset-budgets.ts，预算覆盖ASCII ID的JSON转义。解析器验证银行组合的owner/kind与版本向量，私有绑定账号ID、模板内部版本对象和流水正文不外传。

R03 `inventory.get` 的金库查询必须携contextId；账号库按account.accountVaultId取，不得回退成背包。两类金库都验证当前会话/选角、上下文账号/角色/rolePlayEpoch/sceneEpoch/locationRevision及银行锚点和24px距离。ST09保留旧TownService读入口并修正同样的账号库分支和公开投影，生产接入使用可信身份适配的BankService。

C06的target为 `{kind:equipment,itemId}` 或 `{kind:stack,stackId}`，quantity为1～20且装备必须1。expected恰含当前角色、源/目标容器；装备另含实例。仅背包↔一个金库，不提供库↔库。按模板版本及完整绑定归属兼容填叠；所选量放不下，整笔返回 `rejected` + `code:BAG_FULL或CONTAINER_FULL` + 可选 `availableCapacity`（0～2000），无部分转移。该提示仅允许这两个错误码，其他拒绝仍仅status/code。

C07 expected恰含角色、目标容器、钱包。quoteRef绑定配置id/version、容器及钱包/角色版本、targetStage与全部候选币价；确认选一种paymentCurrency。`BankExpansionConfig`显式注入test/release及各档价格，无内置默认价；背包每档必须金币价，个人库每档必须金币和点券价，均为正的规范uint64十进制字符串。缺项/非法配置CONFIG_NOT_READY，旧报价QUOTE_CHANGED、越档UNLOCK_STAGE_MISMATCH、余额不足CURRENCY_NOT_ENOUGH；不从兑换汇率推算价格。正式经济价格与实际发布配置仍待后续门禁。

存取和扩容都在当前可信身份授权后查原O，同ID异参拒绝；同参原结果重放不再消费。资产、钱包（如适用）、持有投影（如适用）、A.writeRevision、J/O同笔；明确拒绝只留O，J孤立而O缺失拒绝继续消费。unknown沿原ID查operation.get或显式重发原文，notFound不是新建支付的许可。

### ST10-01 入口选择的收敛接口（2026-10-24）

实际v2入口实现使用窄查询 `dungeon.entry`：输入严格为 `characterId,rolePlayEpoch,dungeonId`（通用session/requestId头同scene-wire），返回 `dungeonId,entryContext,locationRevision,options` 与账户/角色expected版本。它组合R05选项与入口证明签发；既有R05 DTO保持兼容；当前ChallengeService没有独立dungeon.options处理器，实际入口调用dungeon.entry，不能把R05旧DTO视为已交付的服务路由。服务端读取真实TownState地图、位置与24px内配置入口，持久证明绑定账号、当前session/epoch、选中角色/rolePlayEpoch、town sceneEpoch/locationRevision及release。移动后即失效，不接受客户端nearDungeon或serviceKind代替。

C23 start必须携带入口查询返回的账户和角色expected版本。成功DTO除既有字段，还返回 `monsterLevel,monsterStatsRef,equipmentSourceRef,equipmentVersion,equipmentAttributes[{statId,value}]`；value沿精确资源wire。新增拒绝码 `LEVEL_REQUIRED,DIFFICULTY_LOCKED`；入口options还可返回 `CONFIG_NOT_READY`。选项不含房间费用。创建仅保留体力，不扣首房、不建CP；未激活H保持sceneEpoch=0/currentRoomNo=-1/roomPhase=preparing，兼容LoginService新launch接管。

配置是显式注入的版本化只读内容；没有可用行则CONFIG_NOT_READY。`entryContentFromE01`必须先验真release摘要且仅授权local-test/contract-fixture-only，只支持其1级普通首本。第二本/特殊本及其他等级的测试行只证明门槛/锁定规则，不构成正式三本发布。

### ST10-02 prepare及原结果补充（2026-10-24）

`challenge.prepareRoom`请求不变；成功data使用[加载合同](room-loading-handshake-v1.md#st10-02-本地实施补充固定manifest与未付首房2026-10-24)完整严格manifest，替代无摘要的resourceRefs字符串列表。客户端重算manifestHash和实际资源bytes的sha256/长度，缺件/不符均停留同一attempt并可重试。命令编码<=16KiB、响应<=32KiB，manifest<=24KiB。

`challenge.get`可返回字典的`kind=unpaidLoading/checkpoint=null`明确分支；不改变已激活sceneState/ready/恢复页的正epoch约束。epoch0加载心跳/暂停/恢复请求与租约控制由ST10-04补齐，本次不把ready或恢复页校验整体放宽到0。

prepare的O只持有原manifest引用、attempt/hash、原结果版本与serverTime；`operation.get`通过ChallengeService.queryOriginal解析该引用，返回完整原响应（保持原serverTime/replayed值），不同于重新执行命令所返回的当前serverTime/replayed=true。引用丢失/摘要不符返回SERVICE_UNAVAILABLE，不返回notFound或当前pending替代品。原命令SHA-256用于同ID异参判定，不保存无界资源正文。身份/当前会话在重放前校验。

### ST10-03 本地原结果与就绪读写补充（2026-10-24）

ChallengeService.execute 接入严格 challenge.activateRoom / scene.ready；query 接入 scene.recoveryPage 和激活后的 challenge.get。activate 的 operation.get 返回原小型状态/票据，不读取当前 CP 重构历史结果。ready前分页仅允许当前有效身份、票据及原基础修订；ready后还支持下述当前证明分支。读取头→引用块→头一致性后裁剪公开记录，不直接发送 CP 内层。

本地 `queryOriginalReady`（execute 的 scene.status 路由）接收原 scene.ready 的 controlSeq、原 leaseRevision、身份/challenge 与 readyTicketId，找到后返回**原 scene.ready 响应**（保留原 serverTime/anchors）；未找到返回 scene.status 的 VERSION_CONFLICT，客户端才能用原 ready 重试。该原结果查询不消费新控制序号、不创建 O、不代表当前状态或续租。ST10-04 扩展一般状态/恢复控制时须保留这一精确查询分支。客户端恢复预测另读取 challenge.get 的当前 active/connected/alive、代次/摘要/修订；当前截止已到返回 DEADLINE_EXPIRED，原回执仍可作为历史读取。

## ST10-04 本地加载恢复控制

`ChallengeService.execute` 现接通 heartbeat / scene.suspend / scene.resumePrepare / scene.ready / scene.status。控制原意图必须持久化后发送；`queryOriginalControl(原请求)` 为本地传输适配接口，按原命令、原 controlSeq 或 heartbeatSeq、原 leaseRevision 及完整原摘要查询最近8个成功控制回执；未保留/未找到返回 VERSION_CONFLICT，不证明旧请求不可能提交，重试只能使用原请求。控制不创建 assetOp；同序号异意图 OPERATION_MISMATCH。身份、当前session和角色代次校验先于回放。心跳独立推进 heartbeatSeq/lease.revision，不推进 H.version；重复心跳/控制只读原结果，不更新租约/时钟。

未激活首房的 heartbeat/suspend 使用 sceneEpoch=0、当前 timelineEpoch；resumePrepare 的 checkpointRevision=null。该分支没有CP、假hash或公开分页。其恢复票据为 `{kind:unpaidLoading,readyTicketId,sceneEpoch:0,timelineEpoch,roomAttemptId,manifestHash,deadline}`；ready payload 为票据去掉deadline再加characterId/rolePlayEpoch/challengeId。控制响应的 state 使用既有 unpaidLoading 联合分支，readyTicket 使用此票据或既有CP票据。首次恢复递增timelineEpoch，保留同attempt/manifest/紫名安排，不扣房费。

有CP的恢复票据继续使用原正代次/修订/hash和完整公开分页证明。resumePrepare 冻结前沿并保持recovery；恢复ready回到awaitingReady时只恢复H转场计时，anchor/inputGapBaseAt仍null，并发放新的普通ready票据；资源与新完整基线通过后下一次ready才开场。活动场景ready仍受原死亡/恢复截止，不复活、不补离线战斗。

scene.status 的 readyTicketId 非null保留ST10-03精确原ready回执分支；null为当前状态读取，不消费新controlSeq、不续租。两者不能相互替代。任何新执行/当前读取到now≥原适用截止，事务内关闭场景：active→failed/closed，completed保留completed并closed；体力结算、A指针清理、角色旅店代次与现有handoff共用逻辑。`challenge.get` 返回关闭后的当前状态，替代ST10-03仅返回DEADLINE_EXPIRED的过渡行为；控制/分页返回到期拒绝。当前session保持active，关闭日志使用scene.expire，不伪装新登录。恢复预测须另核对新鲜当前状态，历史ready成功不是继续预测许可。

### ST10-05 后续房与回复域实施说明

prepareRoom/activateRoom/scene.ready命令形状不变；后续prepare只接受下一房、全敌（含紫名）死亡、存活玩家的旧manifest绑定出口。服务端显式local-test出口配置缺失/绑定摘要改变或回复配置摘要与CP不符时CONFIG_NOT_READY；客户端不提交出口坐标、清场结果或回复速率。后续房复用当前角色及逻辑期限，0保留体力/破损武器不会新增拒绝门槛。公开恢复页包含严格buff记录，仍须完整state hash证明后ready；旧scene/timeline/ticket与旧operation原结果不能授权新场景预测。详细本地schema及未覆盖战斗域见[CP合同](simulation-checkpoint-schema-v1.md)。

### ST10 ready 后分页收敛

`scene.recoveryPage`严格请求/响应形状不变；ready前绑定当前票据，ready后以原成功readyTicketId和当前CP修订/hash读取同一活动场景/时间代次的完整公开记录。active证明截止由成功ready的新connected租约及死亡截止确定，第一页提供固定截止，后续页须一致。客户端验证新完整证明后再读当前状态才能预测；读取/回放/心跳不延期。权限、状态、历史缺字段拒绝、预算与验收统一沿[加载合同当前证明节](room-loading-handshake-v1.md#st10-ready-后当前公开证明2026-10-24)。


## ST11-01 当前移动实施（2026-10-25）

ST11-01已实现simulation.submit移动能力及simulation.confirmed当前公开分页；严格字段、摘要公式、拒绝码、原operation及训练能力边界见[移动合同](movement-input-contract-v1.md)。simulation.get历史候选未采用。simulation.confirmed沿RecoveryPage分页协议，必须绑定当前身份/角色/场景/代次/CP修订，不下发原始CP。


## ST11-02 普攻训练实施（2026-10-25）

当前API增量见[普攻执行合同](basic-combat-contract-v1.md)：显式无奖励训练profile、role4/scene2动作及目标控制、独立私有战斗流、当前公开动作证明和完整有界actionResults分页。既有未声明combat的移动能力保持。实现及实际预算见[验证](../reviews/st11-02-verification.md)，不代表正式收益/技能/AI能力已交付。


## ST11-03 十字斩实施增量（2026-10-25）

当前增量沿[十字斩合同](cross-combat-contract-v1.md)：严格schema2无奖励profile、逐节点直接/流血预算、输入边界MP回复、scene3紧凑效果/快照及按需块、crossAction/crossEffect公开证明和完整动作结果。旧schema1普攻、原CP/恢复/加载兼容；实际验收与未覆盖项见[ST11-03证据](../reviews/st11-03-verification.md)，不代表正式奖励/AI或全部技能混合图已通过。


## ST11-04 崩山击执行增量

当前增量见[崩山击合同](bengshan-combat-contract-v1.md)：显式无奖励训练profile schema3、scene schema4及双技能严格效果lane；三节点直接/流血分别整招预算后按权重分摊、末段承余数。位移全路径复用足迹/边界/障碍扫掠，以实际合法位置判命中；终段才自带特殊倒地，已有倒地不缩短、死亡优先。typed bengshanAction/逐个bengshanEffect纳入完整公开hash和分页；MP/CD/当前等级装备、原操作/恢复/OCC/原子结果页预算沿原合同，旧schema保持兼容。各字段、时序、编码及界限以该合同为同一增量的展开视图；完整最大四技能图仍待ST11-06。


## ST11-05 拔刀斩增量

显式无奖励profile4、scene5及skillEffects schema3三lane保留旧版本严格兼容；拔刀单节点、当前等级10起每2级成长、MP/CD原子扣除、完整公开badaoAction/badaoEffect及原操作恢复，按[拔刀合同](badao-combat-contract-v1.md)执行。动作/伤害/流血精度、字节包络及训练/正式收益边界见该合同；实际验证见[05报告](../reviews/st11-05-verification.md)。


## ST11-06 连续战斗增量

当前大崩四节点、实际落点/独立地面尾伤、四技能有理候选顺序、profile5/scene6稳定槽与全局字典、公开256页/原结果1024页及完整字节预算按[大崩与连续战斗合同](earth-combat-contract-v1.md)执行。旧profile/schema严格兼容；future怪物912条仅编码域夹具，ST12 AI未实现。实际证据见[06验证](../reviews/st11-06-verification.md)。


ST11最终评审算术域修订：训练profile发布/入口须证明完整合法属性/等级域下直接节点及流血施放预算/末跳暴击均可编码uint64；超域在入口前CONFIG_NOT_READY且无资产变化，禁止留待首次施放失败。死亡清除失效的directSinceRise但保留原伤害事件，存活累计不变。精确上界及分配顺序见[大崩合同·算术发布域](earth-combat-contract-v1.md)。

## ST12-01 公开战斗增量

simulation.confirmed与recoveryPage允许有界monsterRuntime及playerControl记录，字段、同刻集合、身份引用和公开proof见[近战组合合同](monster-melee-combat-contract-v1.md)。simulation.submit仍只接收原始玩家输入；不增加客户端上报怪物状态或伤害的入口。

## ST15-01 当前拾取读写视图（2026-10-29）

新增 `drop.list` 读取当前challengeId/sceneEpoch的公开地面描述及H/C/B版本，roomToken复用attemptId。C28验证已确认CP距离<=32设计像素而不信positionHint；expected当前H/B。连接/场景代次与lease检查、固定source归属、原O与资产J语义、实际预算详见[地面拾取合同](ground-drop-collect-contract-v1.md)。未拾取不物化，成功后留原来源终态。此为01增量，不把终局结算或真实云端标为完成。

## ST15-02 实施接线（2026-10-29）

simulation.submit通过真实战斗节点在重验事务内产生终局，客户端不提交通关/奖励事实；提交后CP公开result=completed、roomPhase=cleared、lifeState=alive与hash一致。公开状态分页与移动接受有效completed+looting场景，MovementCoordinator能恢复该状态；drop.list/collect及finishLoot继续沿已有协议授权。详见[首领通关合同](boss-clear-terminal-contract-v1.md)。03邮件/专属装备交付不在本轮完成声明内。

ST15跨片死亡修复（2026-10-29）：simulation.confirmed允许当前connected/active/dead场景读取权威公开证明。simulation.submit在dead时只接受空inputs且CP仍有已释放合法效果；无尾效果或任一move/basic/skill/item/trinket输入拒绝ROOM_NOT_AVAILABLE。原身份、版本/代次、TIME_FRONTIER、2秒输入间断恢复门禁及原deathDeadline继续生效；客户端不新增死亡/结果或服务端时间字段。MovementCoordinator拒绝dead动作入队，帧循环仅沿现有传输提交空片等待尾伤，免费通关后正常恢复移动。详见[首领合同](boss-clear-terminal-contract-v1.md)。

## ST15-05 原结果存储增量（2026-10-30）

当前原结果物理映射按[结果存储v2](combat-result-storage-v2.md)：schema2每操作一个有界gzip JSON包；schema1旧页保留读取。公开32事件/页、1024页、稳定ref、授权及CP/资产/O/J原子提交不变。同499页及8改块混合合成压力夹具验收见证据；任意高熵1024页及正式发布包络仍待验证，见[验证](../reviews/st15-storage-verification-2026-10-30.md)。
