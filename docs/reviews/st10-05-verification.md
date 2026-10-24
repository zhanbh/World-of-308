# ST10-05 后续房与角色时钟验证

2026-10-24；基线 `83752e76fd9835d908165ccc7c0847e03d7db49c`（集成分支feat-1.0.0）。范围为已批准ST10-05，本地规格及source-of-truth指向合同；未改冻结spec/任务图/父execution、未操作Jira/外部发布/安装/云资源/GUI，未重试此前拒绝的Cocos构建。

## 交付与实际红绿

公开测试缝沿已批准的ChallengeService、真实MemoryStore故障/竞争、strict wire、durable客户端。首个后续prepare测试实际返回rejected（原实现只准首房），接通后续权威清场/出口/角色继承后转绿。第二个分段buff回复测试实际以INVALID_CHECKPOINT失败（schema1只准空buff），演进严格role schema2并接上实际activate/ready结算后转绿。客户端prepareNextRoom缺失反例转绿；实际连续两房测试还发现preparing的H与旧cleared CP控制投影不兼容，修复投影/恢复阶段后通过。旧schema未知版本测试从2更新为3，保留schema1空buff规则及非空scene effects/snapshots拒绝。

后续prepare/activate均重验严格下一房、H/CP清场、完整旧manifest spawn集合全部死亡（含紫名）、存活权威玩家及旧manifest绑定地图出口。无客户端设清场入口；合法清场/出口由明确服务端夹具提供。E01未提供出口半径，显式local-test规则缺失即CONFIG_NOT_READY；prepare把规则canonical摘要写pending attempt，activate拒绝同ref更换规则。

角色沿当前CP继承HP/MP/7CD/技能等级/余数/AP，保留C当前等级XP/statsVersion及实际装备磨损、版本，重新读取当前装备归属并采用当前equipmentVersion。入口equipmentSnapshot保持审计用途。场景敌人/入口坐标/代次重新创建，头/复用块修订单调递增，旧票据与旧地面失效。本局体力0、武器耐久0均可续房；跨4小时全局体力刷新不更新本局entryRefillWindow/entryValue/remaining。

## 时钟与精确回复

H.transitionClock仍为唯一settledAt/累计联网/已消费水位权威；activate消费前缀，ready消费后缀并删除。role CP保存逻辑毫秒，10ms步余数不丢失。固定CD500tick，2秒activate+1秒ready后acceptedTick300，七组CD都保留200tick；replay及旧原结果不重复消费。后续prepare→3秒联网→4秒recovery→2秒联网的9000ms墙钟只消费5000ms；恢复ready仍preparing，无活动敌人锚点。

role schema2最多32buff，明确local-test regenerationRef+完整配置canonical regenerationHash。服务每次结算核对摘要，同ref换速率拒绝；E01没有生产自然回复默认值。配置速率明确为内部1/1000显示HP单位每秒，换算每毫秒有理数；逐buff到期分段、BigInt乘积/约分、分别持久HP/MP分数，满值清分数，不按tick向下取整。所有可能组合速率的规范每毫秒分母与持久分母LCM先验≤uint32；1/8388608每秒的反例拒绝（有效毫秒分母8388608000），不只检查LCM(1000,d)。buff绝对tick乘10比较也使用BigInt。

实际服务断言：1000+1/3资源，前1500ms速率2/3每秒、后1000ms速率1/5，得到1001+8/15；6ms+7ms与13ms单段完全相同、逻辑余3ms；99+3/4在1/2每秒补满100后分数清零，满值后不积攒；9007199254740993加4294967295精确得到9007203549708288。未知buff/摘要错/不闭合分母整次不提交。

## 原子性、场景栅栏与字节

| 实际路径 | 写集合/故障点 |
| --- | --- |
| 后续prepare | H、manifest、O：3 |
| 后续activate | A、H、room、header、role chunk、scene chunk、O：7 |
| 回复改变的ready | role chunk、A、H、header：4 |

逐点注入写故障均回滚完整store快照，重试可提交。无role变化ready仍只写A/H/header；有回复/到期变化只重写role块，scene块版本/摘要不动。activate丢响应以原operation查回，旧首房activate原结果保持原样但不覆盖当前第二房CP。版本/角色代次/attempt错拒绝，真实LoginService在后续activate前/后接管都关闭旧场景、清时钟并拒绝旧session；到期先/后顺序均关闭，无退款。

ST15尚无实际v2拾取服务：本轮使用明确测试域拥有account/character/challenge/room/scene/spawn/token的ground source、已确认trace证据和真实ContainerEntity背包。该事务读取并共写实际A/H，和实际activate通过MemoryStore并发屏障强制两种提交顺序，均出现真实冲突重试。拾取先提交：旧activate版本拒绝，刷新版本后新意图激活且已确认物品保留；activate先提交：旧scene拾取拒绝、不入包。没有fake生产drop codec，不宣称完成ST15发奖组合。

完整JSON UTF-8（含wrapper），当前严格支持域：

| 对象 | 字节 | 上界 |
| --- | ---: | ---: |
| 最大role编码：32个最长转义buff ID、4技能/7CD、uint32余数 | 15814 | 81920 |
| 实际带32buff续房role/scene块 | 14716 / 1933 | 每块81920 |
| 实际续房header / H | 1594 / 4732 | 16384 / 131072 |
| 32buff公开恢复页 | 15074 | 32768 |
| activate响应 / O | 1518 / 1788 | 32768 / 16384 |

最大纯编码域与可执行配置分母闭合域明确分开；最大uint32余数编码夹具不冒称能配任意速率执行。既有03最大8敌/最长转义actor/uint64资源测试仍回归。本轮不扩展3648效果/228快照包络；scene非空未知效果一律严格拒绝。

## 客户端与验证命令

LoadingCoordinator.prepareNextRoom仅在上一房已确认active且资源/证明完成后退役旧prepare/activate/ready持久槽、禁用预测并递增代次；unknown不因此消失。实际服务组合从首房到第二房，旧资源callback与旧activate原响应延迟至第二房ready之后也不能覆盖；持久重开保留新房。补齐既有ActivationCoordinator/RecoveryCoordinator缺失的唯一.meta（未动旧UUID），无新UI要求。

- `node --test backend/test/next-room-v2.test.mjs`：14/14通过。
- `node --test backend/test/next-room-client.test.mjs backend/test/loading-coordinator-v2.test.mjs backend/test/activation-coordinator-v2.test.mjs`：9/9通过。
- `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`：7/7通过；含115共享测试、420后端/协调器回归及类型门禁。
- `node client/tools/demo-next-room.mjs`：实际start/prepare/11资源摘要/activate/公开证明/ready，房0 scene1 active/stamina307 → 服务端cleared夹具 → 房1 scene2 active/stamina0。
- `git diff --check`通过。Node对既有client模块设置的MODULE_TYPELESS_PACKAGE_JSON提示仍存在，不影响测试。

GAP：无实际Cocos构建/真机或云SDK预算验证；正式出口交互/自然回复配置缺失；真实战斗清场、场景效果引擎、完整ST15拾取发奖与完整ST16仍属后续故事。本轮用明确服务端夹具，未将这些边界描述为已交付。
