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

ST12-01显式profile6/scene7近战组合与权威玩家受击增量见[近战组合合同](monster-melee-combat-contract-v1.md)。字段、API、状态、CP/包络同步；实际本地测试、原子预算和平台缺口见[01验证](../reviews/st12-01-verification.md)。后续02～06尚未因此完成。
