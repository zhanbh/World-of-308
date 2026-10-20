# 全量命令、查询与错误契约 v2

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

自己的银行/邮件服务数据是否可在未靠近时预取，具体服务许可范围需E07明确；不能为了HUD提醒把完整库存/领取权限全部开放。列表空、服务不可用和未授权是不同状态。

## 3. 命令Interface目录

expected缩写：A=账号业务版本（仅需要时）、C=角色、B=背包、V=当前金库、W=钱包、I=装备实例、H=挑战、M=邮件、G=交付来源。账号writeRevision是服务端内部栅栏，不要求UI持有每次心跳改动后的值。所有行隐含当前会话、归属及原operation去重。

### 身份、角色与场景

| ID／命令 | payload关键字段 | expected与前置 | 成功结果／关键拒绝 |
| --- | --- | --- | --- |
| C01 session.open | launchId及独立openOperationId，可信平台上下文 | 当前session未建立亦可；旧launch已撤销不可抢回 | session/epoch、角色摘要；必要旧挑战结束结算，重启上线旅店 |
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
| C11 item.use | challengeId,templateId,quickSlotIndex?、动作标识 | H/B及合法动作状态；下文冷却协议待边界 | 消耗1、恢复指令/共享CD事实、B版本；满值拒绝不消耗不进CD |
| C12 trinket.activate | challengeId,itemId、动作标识 | H/I及合法动作/固定CD；冷却协议待边界 | 临时属性buff/固定CD指令，不解控、不护盾、不耗MP |

C11/C12不能先以“不校验CD”的资产接口落地。恢复/HP上限、模拟时间与CD证据需要完整E04/E07动作协议闭合，见第6节。后端不接受client传amount=治疗量或直接setHp。

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
| C19 mail.claimAttachment | characterId,contextId,mailId,attachmentId | M/B/G/I如适用；时效/原角色 | 入包与附件来源交付同笔，满包保留；堆叠可按可容纳量部分领取、余量留原处，装备整件领取 |
| C20 mail.claimAvailable | characterId,contextId,selection/cursor,batchIntentId | 服务端有界分配子意图；每附件重验 | 每项结果/剩余游标，尽可能领取，可部分成功；不承诺无限大原子全领 |
| C21 mail.delete | characterId,contextId,mailId | M；无未领附件 | 逻辑删除并保留来源凭据；有附件拒绝 |
| C22 reward.claim | characterId,contextId,grantId | G/B/I如适用；邮箱永久待领页签 | 原角色入包，pending→delivered；不过期、不转其他角色 |

批量子操作ID必须由batchIntentId+稳定附件来源确定，不靠客户端重开循环换ID领取。一键领取已确认跳过无法容纳附件并继续后项，能合并堆叠的仍可领取；最终汇总实际/未领取。每个子操作保留原结果，不因重试把上次部分领取的同一子操作变为再次领取剩余。

### 挑战、房间与复活

| ID／命令 | payload关键字段 | expected与前置 | 成功结果／关键拒绝 |
| --- | --- | --- | --- |
| C23 challenge.start | characterId,dungeonId,difficultyId,entryContext | C及装备/解锁事实；至少1体力、可用武器、无旧active/looting | challengeId、配置/等级/装备/体力快照、序号；不开场前额外扣费；固定紫名安排 |
| C24 challenge.enterRoom | challengeId,roomNo | H；alive/active/connected、上一房全灭、非weaponBroken | roomToken/sceneEpoch、全房manifest、remaining；0余额仍合法，同房实际或零扣费一次 |
| C25 challenge.reportEvents | challengeId,roomToken,sceneEpoch,firstSeq,events | H及游标；单房有界整批 | acceptedThrough、结果/升级/复活/磨损/奖励指令；不收自报经验金币和随机结果 |
| C26 challenge.revive | challengeId,deathIndex | H/B；dead/active/connected、两个截止均有效、纹章及次数 | 原子消费/复活/保护；职业CD清零、药品饰品不清；免费通关后不可再收费 |
| C27 challenge.leave | challengeId,reason=abandon或finishLoot | H；先flush待确认事件，按权威result决定reason | 关闭场景、终态、回城门口、体力一次结算/满HPMP/清CD，不丢已保存收益 |
| C28 drop.collect | challengeId,roomNo,dropId,roomToken,sceneEpoch,positionHint | H/B；当前可拾取场景、有效来源 | 交付/绑定一次，满包留地；位置提示不是可信移动证明 |

进入入口范围只打开选择页，不提交C23；关闭页或回城门口后离开再走入才重触发。未加载资源时重复打开页面不重开挑战，加载失败后的握手时序在第8节保留检查项。

## 4. 服务上下文与授权约束

服务上下文候选字段为contextId、accountId、characterId、sessionEpoch、locationRevision、serviceKind、anchorId、issuedAt及状态。服务端签发并验证，不接受客户端换NPC名称就调用强化/银行。

上下文不是“证明玩家真实走到NPC”的魔法凭据：城镇运动在客户端，服务端目前没有可信坐标源。E07须给出入场/地点转换校验、上下文创建的证据、内测威胁限制和正式强化校验方案；未闭合前C05和服务位置访问属于待边界，不宣称已安全。

关闭上下文后，已被服务端接受并提交的资产请求不撤销；关闭与在途请求的先后由事务顺序决定。若关闭先成立可拒绝尚未执行请求；若请求先提交则保留结果，UI关闭后仍能查原operation。换角色/接管/locationRevision改变时旧上下文失效；旧请求命中历史结果不授予新的写权限。

## 5. 战斗事件、来源与控制通道

当前已定义持久收益事件为playerDied、monsterKilled，未来为道具/饰品/属性修订所需事件必须在同一顺序协议内定义，不能另开无序通道绕过deadline。

每事件有seq、simulationTick和合法source标识；monsterKilled仅引用manifest的spawnId；playerDied带递增deathIndex与有界lingeringSourceIds。同一模拟步玩家/首领同死先报告玩家死再报告首领死，触发免费复活。首领识别来自manifest，不设任意finishVictory命令。

同批次不能跨房间；整批接收或拒绝。最新同摘要事件批可重放；旧批按operation或业务来源查已确认序号，缺号返EVENT_GAP/nextSeq，不能为补缺号重生成奖励。死亡后不得创建新直接攻击来源；声明残留只是边界校验，不证明客户端没有作弊。

控制通道独立：heartbeat、scene.suspend、scene.resume、scene.status，按递增controlSeq/heartbeatSeq及leaseRevision处理，不制造无限业务operations，也不让心跳无故推进challenge业务version。显式recovery只有resume能解除，重复suspend不能延长原截止。

租约检测沿v1设计：最后成功新心跳的服务端时刻+10秒；2秒心跳为工程候选，不是已测承诺。真实物理断网时刻不可观测，不能声称精确从拔网线再给满10秒。目标窗口、租约误差、客户端本地暂停须E07验证后收敛。

## 6. 药品、饰品与冷却事实（明确未闭合）

已定行为：血药共享10秒、蓝药另组10秒，满值拒绝且不消费，受击/倒地可用不解控；饰品固定独立CD、不受急速/套装减CD，死亡/回城清buff；复活/回城/短暂重连冷却矩阵沿规格。

工程需补：本地模拟tick如何映射服务端可验证的动作顺序、HP/MP/最大值镜像如何推进、何时确认消费并表现恢复、断线暂停与死亡继续时钟、冷却期间饰品不可卸换/60秒换装等待。不能单纯收clientHp/ready=true就扣资产，也不能擅自改成墙钟CD绕过死亡/断线规则。

因此C11/C12及C08/C09涉及饰品时标记待边界；其他已收敛行为仍可用于UI模拟，但此处不构成coding就绪。服务端每帧模拟是否需要，必须按安全与成本专项决策，不在本稿暗改既定单人架构。

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
| STAMINA_NOT_ENOUGH/WEAPON_REQUIRED/WEAPON_BROKEN | 仅新开挑战体力检查；武器暂停依具体路径 | 0不能开新本；不能因本局0阻止后续房 |
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
| 开局 | 入口选择→C23锁快照→C24扣首房/manifest→可战斗 | LOC04–LOC08；资源加载失败后原挑战处理仍需协议时序明确 |
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
