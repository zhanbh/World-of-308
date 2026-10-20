# MVP模块设计 — 子需求地图

Type: planning
Status: open
Recorded: 2026-10-19
Parent: [整体规划](../map.md)

## 目标与边界

2026-10-20门禁：先按[完整性审计](../../reviews/design-completeness-audit-2026-10-20.md)收敛完整产品与工程方案，再eng-review并关闭问题，之后coding。D06切分不等于准入，UI可独立并行；当前下一步补逻辑架构与模块依赖。

把已完成的整体规划、挑战生命周期和Q24–Q119核心机制，交接为可审阅的模块子需求。此处为仓库内设计票，不是Jira/GitHub工单，也不是已排期开发任务。不得以拆票为由重新访谈已确认机制。依据冲突时以[最新规则摘要](../core-rules-v2/SUMMARY.md)及用户最后决定为准。

本轮只产出方案与设计拆分，不修改业务代码，不创建云资源。MVP仍含战士和猎人；猎人进一步动作制作暂停保留v4，不等于删除职业。

## 子需求与依赖

| ID / 子需求 | 依赖 | 当前状态 | 下一步 |
| --- | --- | --- | --- |
| [D01 战斗数值与成长](issues/01-combat-growth.md) | 已确认属性/技能规则 | proposal-ready：专题审阅中，已补战士数值表 | 审阅[数值试算](../../design/combat-numeric-proposal-v1.md)，再校准与验证 |
| [D02 装备、套装与饰品模板](issues/02-equipment.md) | D01输出属性预算和公式 | proposal-ready：有13槽预算与配装算例 | 审阅[装备方案](../../design/equipment-proposal-v1.md)，联调D01旧预算 |
| [D03 掉落、经济与补给](issues/03-economy.md) | D01成长、D02装备、D04单局时长互相校准 | proposal-ready：已给来源/消耗与示例账 | 审阅[经济方案](../../design/economy-proposal-v1.md)，联调局长和获得速度 |
| [D04 地图、怪物与副本节奏](issues/04-dungeons.md) | D01伤害预算；与D03共同校准奖励 | proposal-ready：已给出首副本7房间方案 | 审阅[首副本方案](../../design/dungeon-first-proposal-v1.md)，联动D01/D03 |
| [D05 城镇与资产交互](issues/05-interactions.md) | 已确认容器规则；D02/D03提供内容 | proposal-ready：主要交互已确认，待定项已列 | 按[界面与验收清单](../../design/town-interactions-acceptance-v1.md)交接D06，补价格/视觉及范围边界 |
| [D06 规则迁移与最小在线切片](issues/06-online-slice.md) | 已确认规则与D05验收；正式数值依赖D01–D04 | proposal-ready：已切11项任务，未实施/未排期 | 审阅[开发切分](../../design/implementation-slices-v1.md)，先明确S01–S04契约与迁移 |

状态约定：needs-proposal=尚无完整方案；proposal-ready=有待审阅方案，不表示已grill；resolved=关键决定确认且已同步规格。所有子票当前均未resolved。只有出现实质取舍才进行专题grill，工程字段/批量边界由实现方案承担。

## 设计推进顺序

1. 审阅[D01首版提案](../../design/combat-growth-proposal-v1.md)，先讨论节奏，再固定公式与基准数据。
2. 给出D02模板预算及D04首副本方案，再联动D03校验收益与成长时间；依赖是迭代关系，不要求先做完全部装备库。
3. D05补足玩家可见操作；D06将已确认规则迁移为测试和端到端切片。
4. 每张票关闭前更新正式模块规格、实现差异和验收场景；设计确认与功能实现分别标记。

最小在线切片只缩小首次验证内容量，不缩小已确认MVP。微信Note20 Ultra持续性能验收单独并行记录，不用桌面测试替代。

## 明确后置

拍卖交易细则、传说强化继承、猎人动画进一步制作、活动与充值等按既有边界后置。生产美术精修沿既有brief，不阻塞数值提案。

## 当前同步检查点（2026-10-20）

当前联调统一入口：[试算索引](../../design/combat-simulation-index.md)，已纳入家中资料，不再等待用户另行提交。

- 已确认：武器途中归零不停战；攻击端施放快照/目标防御逐跳实时读取；急速总上限2倍；每段每目标独立命中、有效份额施加流血；DOT不额外判命中且使用物理护甲/穿透减伤。
- 首Boss最终以本次用户答复为准：平时可受控，施招时按特殊设定霸体；收招恢复正常控制。覆盖家中早前“仅虚弱可控”，参见[首副本整合方案](../../design/dungeon-first-proposal-v1.md)。
- 强化高段极稀有；失败记忆按强化目标等级相似度提供补偿，成功按相似度消耗，切角色/下线重登清零，短恢复保留。具体曲线/上限/幸运纪念品配置仍为候选。
- 正式通关套装部位轻度缺件加权、怪物随机不变；测试通关必补独立保留。具体概率与权重仍可动态调优。
- 家中试算入口：[逐段命中v9](../../design/segmented-hit-dungeon-review-v9.md)、[强化联调v7](../../design/enhancement-combined-review-v7.md)、[掉落难度v3](../../design/drop-difficulty-review-v3.md)。七房战斗脚本采用旧遭遇/Boss假设，需按公司新增紫名/吼叫/霸体配置重跑，不是当前首副本验收证据。
- 公司端UI/工程设计保留，D06为proposal-ready；家中T系列只是早期草案，不替代[当前实现切片](../../design/implementation-slices-v1.md)。新规则须补齐契约/迁移/验证，设计与工程审阅门禁不变，未获准进入业务编码或云部署。

跨环境合并与验证见[同步记录](../../reviews/design-sync-2026-10-20.md)。D01–D06未因本轮模拟通过而整体标resolved；完整数值/模板、成长与其他副本、工程新规则差异仍需继续。

2026-10-20继续数值联调：[最新首副本接入v10](../../design/first-dungeon-sync-review-v10.md)新增28怪/施招霸体/吼叫时间代理；尚缺空间与完整招式模型，不替代实机验收。下一步分层拆解装备收益。

2026-10-20装备联调：[分层试算v11](../../design/equipment-contribution-review-v11.md)区分同装等武器品质、五防具、其他七槽与全套收益。当前不调正式参数，先补空间/机制时间预算。

2026-10-20时间联调：[时间预算v12](../../design/encounter-time-budget-review-v12.md)为现有模型增加互斥计时与起手窗口敏感性；尚未做真实空间路线验证，不因约4分钟目标直接增加HP。

2026-10-20空间反例：[躲避v13](../../design/spatial-dodge-review-v13.md)读取原型源像素横向100/纵深45，以足迹/扇形/锁定时间检查安全路径；独立几何证据，未替代整局模型。下一步接moveAt与敌招节点。

2026-10-20动作时间轴：[预警联调v14](../../design/action-warning-timeline-review-v14.md)读取moveAt/本体/接触节点，反应与剩余锁定按重叠处理；下一步接技能强制位移，尚未替代整局模型。

2026-10-20技能轨迹：[位移联调v15](../../design/skill-displacement-review-v15.md)加入崩山34、大崩64/100源像素曲线与朝向；216组独立空间对照，不是整局验收。下一步建立敌招节点表。

2026-10-20敌招节点：[时间轴提案](../../design/enemy-action-nodes-proposal-v1.md)建立顺劈/横扫/重槌/吼叫候选节点，验证中断/冷却/阶段/死亡交接；起手霸体等待审边界仍未定稿。

2026-10-20联合坐标时间轴：[空间对照v16](../../design/joint-spatial-encounter-review-v16.md)将玩家强制位移/移动解锁与三种敌招节点合并，216组参考轨迹通过；未计受击响应，下一步接击退/取消，不能直接算真实伤害或整局耗时。

2026-10-20受击联调：[响应v17](../../design/received-hit-spatial-review-v17.md)补取消/已释放残留/死亡/持续吼叫倒地检查，并对照怪物可穿身与实体阻挡；当时碰撞方向待选，现已确认可穿身，继续路线校准。

2026-10-20用户确认：普通走位和技能位移均可穿过怪物身体，地图边界/场景实体障碍仍阻挡，穿身不免伤。关闭此前身体碰撞方向待选，继续群怪路线及进攻协调验证。

2026-10-20继续：[群怪v18](../../design/group-attack-coordination-review-v18.md)、[P2组合节点](../../design/boss-stomp-charge-proposal-v1.md)及[成长v19](../../design/progression-award-review-v19.md)/[中途升级v20](../../design/levelup-encounter-review-v20.md)已补候选与参考验证；空间与七房升级模型尚未完全合并，不标resolved。

2026-10-20[满级时间v21](../../design/progression-calendar-review-v21.md)补固定体力刷新日历。首角色3–5小时已确认按战斗+正常城镇操作计算，排除体力等待/离线；未据此直接修改XP或体力规则。37个离线脚本当前检查通过，模块仍proposal-ready。

2026-10-20[有效时长v22](../../design/active-progression-budget-review-v22.md)按用户确认口径计入失败战斗与正常城镇操作，排除体力等待/离线；保留XP候选，平均局长3.5–4分钟仅为联调区间，尚未实测。39个离线脚本通过各自检查，不表示完整成长数值完成。

当前联合检查点：[v23首副本空间/成长](../../design/spatial-growth-review-v23.md)、[v24策略/窗口/HP对照](../../design/boss-counter-window-review-v24.md)。修正射程策略后初始武器脚本约3.8分钟，暂不削Boss或加强武器；Boss单战和蓝耗仍未定稿。当前41个离线脚本检查通过，D01/D04仍proposal-ready；未修改业务实现、未提交。
