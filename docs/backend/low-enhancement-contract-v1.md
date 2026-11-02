# ST18-01 低段强化执行合同

2026-11-02。来源为已批准ST18 spec/01票；仅显式local-test、isolated-local-assets-only配置，未启用生产资产或正式数值。

## 授权、报价与原意图

- TownService对enhance复用已核验的可信repair-open路径：真实IdentityPort、当前账号/会话/选角、角色expected、城镇地图及玛丽24px范围；原O先于当前位置/版本检查，同原tuple返回固定原context。同账号assetOp/assetJournal命名空间，不另开重复账。
- 默认城镇配置增加mary(enhance)坐标(340,300)，与铁匠分离。当前上下文指针、rolePlayEpoch、sceneEpoch、locationRevision及固定issuedAt+配置TTL共同授权；新服务/移动/过期使旧意图前置拒绝。关闭不会重新执行已提交原O。
- equipment.enhance本片仅支持当前+1至10、穿戴或本角色背包唯一引用的active武器/耳环；useMemento=true与11–20明确拒绝，待02。0耐久可强化但不被修理。实际尝试成功/保级均消费；前置拒绝只记O/J，不变资产或记忆。
- service.quote是只读有界视图，列金币/材料、等级和强化AP增量及保级后果。摘要绑定身份、代次、context、完整版本、配置、旧实例、记忆与有效幸运；不公开基础率、随机样本、记忆和概率。

## 数值与随机

- 固定低段基础率80/70/60%；显式百万分率整数运算。候选记忆步长/单来源上限/历史总上限、20项距离权重、幸运每点换算/上限、概率总上限、材料与价格/AP表均由配置提供，缺失/越界失败关闭；不存在生产缺省概率。
- 配置AP累计表仅候选；每级增量严格增加且耳环为偶整数，武器按3/2精确推导，最高10档。测试夹具仅装等10，以耳环[2,6,12,20,30,42,56,72,90,110]演示，不冒充30档已讨论基准或正式平衡表。
- EnhancementRandom是秘密、稳定的原意图→[0,1000000)整数端口；KeyedEnhancementRandom用至少32字节秘密HMAC-SHA256及有界拒绝采样，不用客户端随机、时间或operationId明文哈希代替秘密。原账号/operationId样本跨进程稳定，事务回调重试复用同样本；已提交先查O，不重抽。
- enhancementMemory(characterId,rolePlayEpoch)持久保存20个有界来源与configRef/version。失败增加本目标来源；成功逐来源按距离权重消耗，同级清0。新角色代次读取新键；短恢复不创建新键。配置不可变，变更或兼容迁移不能改写已完成O。本片已验证服务重建与同级消耗，完整跨装备/代次恢复矩阵仍属03。

## 强化AP来源与资产原子性

- EquipmentEntity及公开EquipmentView新增可选enhancementBonus={configRef,level,attackPower}；只由强化事务写入，是不可变配置对当前等级的有界服务端派生投影，不是独立可消费资产，不混入rolledAffixes。级别与实例不符、非武器耳环、0级或0增量拒绝；已存在非0级但无合法投影的装备不能继续强化并猜出AP，需后续明确迁移。
- aggregateCombatAttributes统一计入该投影一次，所以装备详情、穿脱、战斗属性及单修沿同源；0耐久过滤强化AP，修满后恢复。旧无投影实例仍保留旧读兼容行为，不借读接口自动补属性。
- 成功穿戴强化同笔更新装备、当前属性必要statsVersion、equipmentVersion、固有评分及rankingEntry；耐久0仍按固有价值评分。背包强化不改穿戴评分。保级失败不写装备或评分，但消费与记忆变化真实提交。
- 本次金币/材料/装备/记忆/角色/账号栅栏、必要评分和原O/J同事务。材料角色绑定→账号绑定→未绑定、同类按格号消费；部分余量traceRef指向新J输出，J记录消费输入和余量输出。材料不合法或不足不提交前缀。非损毁不改套装持有。
- 用真实MemoryStore beforeCommit制造修理/强化OCC两序；不同NPC上下文的新open先栅栏旧上下文，落败事务重试后拒绝，不双扣、不修复错误版本。

## 查询与客户端

新增enhancement.get，结构同单修原子view，含context/角色/目标/钱包及当前有效属性和一致版本，无私有记忆/概率。已到10可读，低段协调器停止下一次报价，非自动提交11。

EnhancementCoordinator沿授权传输持有一个持久原tuple；加载/空/失败/提交/未知可辨，关面板或重init以代次隔离迟包。成功重读view并检查最低版本，未知query operation.get后原tuple安全重试，不用新ID；04才做Cocos实际面板。

## 成本与缺口

最大本地13穿戴/100材料格/20记忆来源成功样本R24/W9/45调用，写26111 UTF-8字节，最大文档15706B；success9、failed7、open5各真实写点故障均已回滚。不是高段损毁、正式极限字节域或SDK账单。02–05、正式内容/参数、平台SDK、真机、云部署均未交付。
