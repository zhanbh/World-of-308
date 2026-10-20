# 后台数据模型与访问路径 v1

2026-10-20：新增[核心契约v2](core-contract-v2.md)，三类容器、正式初始化、邮件与永久待领、挑战体力快照及回城一次结算以v2为准。以下集合名与字段仍是未部署候选，旧字段缺少新状态不表示可以省略迁移。

> 2026-10-19：新机制已确认，见[基线摘要](../wayfinder/core-rules-v2/SUMMARY.md)和[实现差异](../implementation-gaps-2026-10-19.md)。本文现有本地切片/旧契约尚未全部迁移；测试通过不等于新背包、邮箱、冷却与奖励机制已实现。

状态：工程规格，未建集合。约束来源：[挑战流程](../challenge-flow.md)、[后台入口](README.md)。所有金额/数量/等级为有界整数，时间统一UTC毫秒；客户端仅接收裁剪后的视图。字段名为初始契约，物理编码可由适配器调整。

## 1. 标识与写入边界

ID由服务端产生或按业务唯一键确定；组合键使用规范编码后哈希，避免字符串拼接歧义。身份外部键包含平台与AppID；不假设跨AppID的OpenID相同。数据库文档均带schemaVersion，业务聚合带version；版本是乐观并发依据。

账号文档既保存有限摘要，也作为账号级写入栅栏。每笔会话、挑战、资产写事务都更新它的writeRevision，使“查了旧会话后仍完成资产写入”的读写偏斜转为写冲突。不能只读取sessionEpoch而不写共同栅栏。

## 2. 核心集合

| 集合 / 已知主键 | 主要字段 | 有界性与归属 |
| --- | --- | --- |
| identityLinks / H(platform, appId, subject) | accountId | 服务端可信身份映射，不向客户端暴露subject |
| accounts / accountId | sessionEpoch, currentSessionId, characterIdsByClass, activeChallengeId?, openSceneChallengeId?, walletId, writeRevision | 固定角色映射及单挑战/场景指针；不保存无限历史 |
| sessions / sessionId | accountId, epoch, launchIdHash, status, openedAt, revokedAt? | 每次游戏进程启动一份，正常短暂恢复沿用；不是微信session_key |
| characters / characterId | accountId, classId, level, xp, statsVersion, equipmentVersion, equippedItemIds, backpackId, stamina{value, refillWindow}, version | 等级经验权威；HP/MP的战斗镜像属挑战 |
| wallets / accountId | gold, points, version | 账号共享，不能接受客户端余额覆盖 |
| containers / H(owner, kind) | accountId, characterId?, kind, capacity, unlockStage, slots, version | 背包20→100、个人金库20→100按角色隔离，账号金库100全开共享；槽记录itemId或堆叠，含绑定及归属 |
| equipment / itemId | accountId, ownerCharacterId?, templateId, itemLevel, quality, rolledStats, binding, location, sourceId, version | 唯一装备实体；location与容器/穿戴/待领一致变更 |
| challenges / challengeId | accountId, characterId, sessionId, configVersion, dungeonId, difficultyId, lockedMonsterLevel, entryEquipment, attributeRevision, result, lifeState, deathIndex, deathDeadline?, paidRevives, currentRoomNo, sceneState, sceneEpoch, lastEventSeq, lastAcceptedBatch{firstSeq,lastSeq,hash}, controlSeq, lease, version | result为active/completed/failed；sceneState为combat/looting/closed；死亡序号避免旧复活请求复活第二次死亡 |
| challengeRooms / H(challengeId, roomNo) | paidCost, paidAt, manifest, kills, drops, cleared, simulationCursor, version | 入口生成有限怪物清单；每个怪物有稳定spawnId，击杀账目及地面掉落按房间保存 |
| rewardGrants / H(sourceId) | accountId, characterId, kind, payload, deliveryState, createdAt, deliveredAt?, version | 通关装备满包时为pending；直接交付也保存来源凭据，禁止改变原角色 |
| operations / H(accountId, operationId) | sessionEpoch, command, payloadHash, outcome, resultVersions, decidedAt | 持久幂等结果，含稳定业务错误；不存平台凭证或无限完整账号快照 |
| assetJournals / H(accountId, operationId, entryNo) | sourceId, assetKind, objectId, beforeVersion, deltaOrMove, afterVersion, occurredAt | 有界一笔多项流水；可追溯但不代替权威余额 |
| configs / configVersion | 发布清单、内容摘要、子配置引用、状态 | 发布后不可变；服务端查出配置，客户端不能指定更有利的旧版本 |

HP/MP不做每帧网络写入。挑战保留最后已确认的生命状态、升级/复活属性指令及模拟游标，客户端推进即时战斗。lifeState是独立字段：dead升级时只更新等级/属性，保持不能行动；实际满血满蓝在合法复活转换应用。此设计不是服务端战斗真实性证明。

lease包含lastHeartbeatAt、leaseUntil、lastHeartbeatSeq、mode(connected/recovery)、recoveryUntil?。心跳/恢复更新独立leaseRevision，不无故让客户端的challenge.version失配；同样经过账号栅栏。

## 3. 房间奖励与掉落

manifest由服务端配置展开，包含本房间全部spawnId、怪物模板/等级、是否最终首领。客户端报告spawnId，不提交经验或随机属性。kills保存击杀来源、事件序号、生成奖励摘要；drops保存dropId、来源、物品描述/金币数量和状态ground/collected/expired。

随机结果首次成功提交后固定。地面装备只保存生成描述，成功拾取时才创建equipment实体并按品质处理绑定。金币依整体规则自动收取，击杀结算就更新钱包；材料/装备保留地面条目，满包不改为collected。通关装备先确定唯一itemId并直接入包或生成pending交付，不能重新抽取。

采用有界房间账目，是为了让最终首领+剩余小怪的奖励在少量已知文档上结算；不是把整场/整个账号事件无限塞入一个文档。配置发布校验本房间最大怪物/掉落数量、序列化字节、单事务操作预算。目标环境不通过预算的配置不能上线；不得分批漏奖后先显示结算成功。大规模召唤/无限波次未来需另设计分段结算，本切片不假设已支持。

## 4. 唯一性与查询

| 访问路径 | 实现要求 |
| --- | --- |
| 微信身份找账号 | identityLinks已知ID，不用扫描；并发首次登录共同写同一identityLink |
| 每职业最多一个角色 | accounts.characterIdsByClass在事务内占位，和角色/初始容器共同创建 |
| 每账号一个active挑战 | accounts.activeChallengeId事务内检查/占位；结束时只清匹配的指针 |
| 通关后仍拾取 | activeChallengeId清空，openSceneChallengeId保留；开新挑战需关闭旧场景并清旧掉落，客户端须先执行明确结束操作 |
| 背包/钱包/进房/复活 | 已知doc ID读取，不在事务里where查纹章或遍历集合 |
| 待领列表 | accountId + characterId + deliveryState + createdAt + ID游标；详情/领取按sourceId主键 |
| 超时修复扫描 | result + leaseUntil；或sceneState + leaseUntil；结果只作候选，事务内重读再决定 |
| 流水排障 | accountId + occurredAt + ID游标；按sourceId追踪 |

查询列出的复合索引需在实际SDK/环境验证后创建；唯一约束由确定性ID和事务指针实现，不依赖未验证的“部分唯一索引”。分页上限和响应字节有工程限额，不开放任意批量ID查询。schemaVersion迁移必须兼容未完成挑战绑定的旧configVersion。

## 5. 保留与清理

本切片不启用operations/rewardGrants的自动TTL；政策确定前不能删去重凭据后允许旧请求再次生效。地面掉落在场景关闭时由challenge.sceneState/sceneEpoch立即逻辑失效，物理清理可延后；不按通关后经过多久自动关闭仍在线场景。

孤立记录修复按来源和交付状态运行，不凭“记录较旧”再次发奖。配置旧版本与奖励来源保留到相关挑战/资产可安全迁移或归档。数据库直接读写默认拒绝客户端，业务视图由经过授权的服务端返回。
