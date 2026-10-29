# 当前开发真相源索引

更新：2026-10-22。本索引组织已确认规则及设计合同，不创造新玩法。原型代码、静态UI、历史试算、评审发现和交接摘要均不得覆盖下列活跃正文。

## 优先级与维护约束

用户最新明确决定优先；产品规则以[主规格](../spec.md)及其链接的专题确认为准。工程合同依下表各主题正文；[数据字典](data-dictionary-v2.md)、[API](api-contract-v2.md)、[状态转换](state-transitions-v2.md)是同一合同的字段/传输/状态视图，不能各自另定行为。发现正文互相冲突时先修订，不靠猜测“日期最新的一段”实施。

修改主题合同必须同步相关字段、API/状态、预算和验收；改变已确认玩法则先获取新决定。历史评审及SHA清单保持原始证据，后续修订另建清单；历史文件顶部注明当前状态并链接修订，不篡改原发现以伪造当时已通过。

## 主题权威入口

| 主题 | 活跃正文 | 必须同步的视图/证据 |
| --- | --- | --- |
| 范围/战士闭环 | [主规格](../spec.md)、[三本内容](../design/warrior-three-dungeon-baseline-v1.md) | 猎人技能后置；后两本是可调整原型，不是已平衡产品 |
| 怪物执行/阶段 | [组合遭遇](../design/dungeon-first-proposal-v1.md)、[ST12执行边界](monster-execution-contract-v1.md) | 半血交接、吼叫霸体/最大生命快照；AI/CP/公开状态及预算须同步，候选参数不当正式数值 |
| 加载/转场 | [加载握手](room-loading-handshake-v1.md) | H.transitionClock独立保存至ready；字段、API、状态、加载/恢复测试 |
| 恢复/活动时钟 | [恢复时序](recovery-timeline-proposal-v1.md) | inputGapBaseAt、原截止、代次及ready幂等；时间基线/CP/输入验收 |
| 精确运算/回复 | [算术合同](combat-arithmetic-contract-v1.md) | HP/MP余数、生命周期与分段一致性；编码/发布上界验证 |
| CP与内容包络 | [检查点](simulation-checkpoint-schema-v1.md)、[包络](simulation-content-envelope-v1.md) | 按需块版本/摘要；实际UTF-8与SDK预算后验 |
| 容器/来源/原结果 | [物理映射](asset-physical-mapping-v1.md) | 字典、原子转移/物化、流水守恒及来源唯一性 |
| 缺件范围/汇总 | [持有合同](collection-holdings-projection-v1.md)、[策略](../design/drop-strategy-proposal-v1.md) | scope按实际容器/来源；固定样本、未提交重映射、已提交不变 |
| 评分/排行 | [评分映射](scoring-projection-mapping-v1.md)、[查询基线](ranking-query-baseline-v1.md) | 固有价值不受耐久影响；公式权重/缓存参数是可校准工程候选 |
| 事务预算 | [强化与终局预算](enhancement-terminal-budget-v1.md) | 工作表/持有合同/SDK验证；当前含汇总终局R44/W33，不用历史79代替 |
| 身份/适配 | [身份合同](identity-adapter-proposal-v1.md)、[平台基线](platform-adapter-baseline-v1.md) | 实测前不得宣称可信链、真实事务或费用通过 |
| UI功能边界 | [UI纠偏合同](../design/ui-review-authoritative-delta-v1.md)、[状态覆盖](../design/ui-state-coverage-v1.md) | PNG/HTML仅表现参考；运行时热区/拖动/恢复待验收 |
| 发布/保留/恢复 | [发布基线](release-and-validation-baseline-v1.md)、[保留合同](retention-and-replay-proposal-v1.md) | 真实配置表、版本兼容、账单/备份门禁；不自动TTL权威来源 |

## 本轮修订与准入

FR01/FR02/FR03原发现见[最终复核](../reviews/eng-review-final-recheck-2026-10-22.md)。本轮已修正文并补静态反例，见[一致性闭环](../reviews/design-source-consistency-2026-10-22.md)。旧评审“尚未批准”及预算数字是历史状态，不再作为活跃要求。

设计正文一致不等于功能已实现。B0实施范围见[首片计划](../design/implementation-b0-contract-foundation-v1.md)；用户后续已授权E01本地实现，当前协议/配置/检查基础已交付，实际覆盖与缺口见[E01验证](../reviews/e01-07-integration-verification-2026-10-22.md)。SDK/真机/经济与性能门禁按对应阶段执行。本索引不授权安装、部署或操作真实资产。

ST11-03当前技能执行增量见[十字斩合同](cross-combat-contract-v1.md)，并同步上表算术/CP/包络、字段/API/状态视图；实施事实与GAP见[03验证](../reviews/st11-03-verification.md)。

ST11-04崩山击增量见[崩山击合同](bengshan-combat-contract-v1.md)，同步字段/API/状态/算术/CP/包络；实际证据见[04验证](../reviews/st11-04-verification.md)。


## ST11-05 拔刀斩增量

显式无奖励profile4、scene5及skillEffects schema3三lane保留旧版本严格兼容；拔刀单节点、当前等级10起每2级成长、MP/CD原子扣除、完整公开badaoAction/badaoEffect及原操作恢复，按[拔刀合同](badao-combat-contract-v1.md)执行。动作/伤害/流血精度、字节包络及训练/正式收益边界见该合同；实际验证见[05报告](../reviews/st11-05-verification.md)。


## ST11-06 连续战斗增量

当前大崩四节点、实际落点/独立地面尾伤、四技能有理候选顺序、profile5/scene6稳定槽与全局字典、公开256页/原结果1024页及完整字节预算按[大崩与连续战斗合同](earth-combat-contract-v1.md)执行。旧profile/schema严格兼容；future怪物912条仅编码域夹具，ST12 AI未实现。实际证据见[06验证](../reviews/st11-06-verification.md)。

ST12-01显式profile6/scene7近战组合与权威玩家受击增量见[近战组合合同](monster-melee-combat-contract-v1.md)。字段、API、状态、CP/包络同步；实际本地测试、原子预算和平台缺口见[01验证](../reviews/st12-01-verification.md)。

## ST12-02 远程、冲锋与四档协同增量

远程投石投射物生命周期、冲锋锁向扫掠与地图阻挡、四档难度角色预算（flanker/retreater）及重型技能并发许可按[远程与冲锋协同合同](monster-tactics-combat-contract-v1.md)执行。投射物分片切片保真与宿主独立性、冲锋穿怪不免伤与不可当硬墙、严格数据模式拒绝非对象值；实际证据见[02验证](../reviews/st12-02-verification.md)。

## ST12-03 首本七房、额外紫名与权威清场增量

首本7房完整布局（27只基础怪+1只额外紫名怪，Boss房严格排除紫名）、紫名独立2倍经验事实、防第二波刷新的全怪死权威清场门禁、安全几何与ST10换房校验按[首本七房与权威清场合同](encounter-clear-contract-v1.md)执行。切房与断线重载严格保留出生与击杀事实，不重抽或漏发；实际证据见[03验证](../reviews/st12-03-verification.md)。

## ST12-04 精英与牛头Boss基础阶段增量

精英顺劈/横扫与牛头Boss重槌/践踏招式规范、指定施招霸体（起手及打击霸体不免伤害流血，收招恢复人形可控受控打断且不返还CD）、半血50% HP平滑交接（动作中等待收招结束再切、合法打断立即切、死亡优先清待切禁死后切阶段、不重置CD/回血/无敌、不清空受控状态）及统一确定顺序执行按[精英与牛头Boss执行合同](monster-elite-boss-contract-v1.md)执行。实际证据见[04验证](../reviews/st12-04-verification.md)。

## ST12-05 牛头Boss连续践踏、冲撞与吼叫增量

P2连续践踏（3段72px圆判）接锁向冲撞、碰墙即停解除霸体与3秒虚弱（未撞墙不虚弱，虚弱不因受击续期、不擅加增伤）、两阶段独立冷却前方中距离30度扇形吼叫（严格6跳、起手至末跳霸体收招可控、实时出入判定、伤害快照累计15%最大生命值最多倒地一次、倒地继续受声波与推离、死亡取消后续节点）按[牛头Boss冲撞与吼叫合同](monster-roar-charge-contract-v1.md)执行。实际证据见[05验证](../reviews/st12-05-verification.md)。

## ST12-06 三本组合与可玩战斗联调增量

后两本（失落工坊7房34怪，R5精英R7Boss；裂隙遗址7房41怪，R5精英R7Boss，R6峰值8怪并发）遭遇布局、种族抗性规则（人形/野兽可流血可受控，亡灵/机械免流血可受控）、发布前严格类型校验（INVALID_MONSTER_CATEGORY与UNKNOWN_MONSTER_KIND拒绝未知配置）、技能跨种族复用（melee/ranged/charge/cleave/sweep/smash/stomp且不复制牛头专属冲撞吼叫）、四层权威架构（纯内核 -> 服务/CP -> 客户端协调器 -> Cocos视图）与双模自适应接线（`MovementCoordinator` + `ChallengePreview` 权威驱动与本地沙盒兜底）、离线H5构建、理论合成3648条全效果极限治具（UTF-8块<=81920B，总计<=655360B）与实时8敌群并发运行预算（单CP ~8.2KB，集群 ~65.6KB，提交 <30ms）双轨分离，以及MemoryStore原子事务严格兼容按[三本组合与可玩联调合同](dungeon-three-composition-contract-v1.md)执行。实际证据见[06验证](../reviews/st12-06-verification.md)及[收尾加固验证](../reviews/st12-closeout-verification.md)。



## ST15-01 地面来源与拾取增量（2026-10-29）

当前真实死亡生成固定room来源、已确认CP距离授权、材料整源合堆/装备延迟物化、角色持有/谱系与原结果原子交付，以及显式local-test奖励授权按[地面拾取合同](ground-drop-collect-contract-v1.md)执行。01不覆盖Boss终局、即时金币经验或通关奖励路由；实际命令与平台GAP见[01验证](../reviews/st15-01-verification.md)。

## ST15-02 首领即刻通关增量（2026-10-29）

真实Boss死亡精确节点、余怪派生击杀、completed+looting、死亡事实与免费复活、末房磨损及显式local-test最小金币XP同笔按[首领通关合同](boss-clear-terminal-contract-v1.md)执行。当前不包含03完整升级邮件、专属装备路由、通关固定本局消耗、回城沉降/解锁；实际本地证据见[02验证](../reviews/st15-02-verification.md)。
