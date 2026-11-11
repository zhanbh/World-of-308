# 战士闭环本地故事目录

2026-10-22。本地故事目录；E01已有后续实施授权并完成本地交付，其余状态以各功能任务图记录为准。不创建Jira/Epic链接，不写Jira frontmatter、不估算虚构SP。用户指定仓库文档是交付物，覆盖skill的临时文件/Jira发布流程。业务真相源为[主题索引](../../backend/source-of-truth.md)，故事只描述交付边界与验收，不重定义玩法。

## 拆分原则

每个ST是完整能力切片，包含该能力的规则、应用接口/原子性、必要读模型/客户端连接及测试，不按前后端分别建功能故事。独立验收不等于零依赖：先决能力可用已确认端口/fixture替代，真实集成验收随后必须补齐；只有mock通过不可标整故事Done。E01/E02是技术前置，不伪装成玩家故事。VT01是全流程出口，不代替各故事测试。

当前阶段仅战士三本；US1/AC2中猎人部分明确后置，US15拍卖不实施。所有ID稳定、不复用；正文变更时更新覆盖/依赖，不自动重排。故事过大或无法给出单一演示场景时继续拆，不将本目录当15日以内交付的工期保证。

## 故事与硬依赖

| ID | 独立能力 | 硬依赖 | QA组 |
| --- | --- | --- | --- |
| [ST01](st01.md) | 登录、会话接管与原登录结果恢复 | E01 | 01, 02, 04 |
| [ST02](st02.md) | 创建战士、隔离成长与初始物品 | ST01 | 03, 04 |
| [ST03](st03.md) | 城镇步行、服务地点授权与私有读模型 | ST02 | 05, 06, 39 |
| [ST04](st04.md) | 背包整理、堆叠与快捷位 | ST02 | 10, 37 |
| [ST05](st05.md) | 穿脱装备、属性与套装生效 | ST04, ST03 | 09 |
| [ST06](st06.md) | 商店买卖、共享钱包与整数兑换 | ST03, ST04 | 11, 37 |
| [ST07](st07.md) | 单项邮件与永久待领领取 | ST03, ST04 | 15, 16, 18, 37 |
| [ST08](st08.md) | 邮件与待领的可恢复批量领取 | ST07 | 17 |
| [ST09](st09.md) | 银行存取与分档扩容 | ST03, ST04 | 07, 08 |
| [ST10](st10.md) | 副本入口、体力快照与三步开房 | ST03, ST05 | 19, 20, 21, 31 |
| [ST11](st11.md) | 战士移动、三段普攻与技能伤害 | ST10, ST05, ST04 | 22, 23, 24, 25, 26 |
| [ST12](st12.md) | 怪物组合、精英与首领阶段 | ST11 | 27 |
| [ST13](st13.md) | 战斗药品与主动饰品 | ST11, ST06 | 28 |
| [ST14](st14.md) | 死亡、复活与失败退出 | ST12, ST13 | 29, 34 |
| [ST15](st15.md) | 拾取、首领结算与奖励来源 | ST12, ST07, ST14 | 30, 31, 32, 37 |
| [ST16](st16.md) | 暂停、完整状态恢复与迟包处理 | ST15 | 33, 37 |
| [ST17](st17.md) | 耐久磨损与林纳克斯修理 | ST15, ST06 | 12 |
| [ST18](st18.md) | 玛丽强化、纪念品与会话记忆 | ST17, ST07 | 13, 37 |
| [ST19](st19.md) | 特殊副本套装策略与持有检测 | ST15, ST09, ST07, ST18 | 14, 15, 36 |
| [ST20](st20.md) | 查看当前装备评分排行榜 | ST05, ST18 | 35 |
| [E01](enablers.md#e01-协议配置与检查基础) | 公开协议、schema、精确编码与固定工具链 | 无 | 22, 36, 39, 41 |
| [E02](enablers.md#e02-隔离平台适配验证) | 微信可信链、真实事务/索引、最大预算与恢复 | E01；相关故事提供最大fixture | 01, 38, 42 |
| [VT01](enablers.md#vt01-三本真机与发布出口) | 全流程/设备/经济/构建/恢复出口 | ST01～ST20、E02 | 40, 41, 42 |

## 排序与集成里程碑

1. E01先稳定协议、schema与离线检查；与B0计划对应，不将B0的六技术任务冒充六个玩家故事。
2. ST01→ST02后，城镇/背包能力可按依赖推进；ST05评分事实先交付，榜单UI不必等ST20。
3. 首本闭环骨架：ST03/04/05→ST10→ST11/12/13→ST14/15；ST07的待领交付用fixture先验，不要求真实先通关而形成依赖循环。
4. ST16恢复与ST17修理优先接首本完整路径；ST06基础药品商店已提前提供消耗来源。
5. ST08/09/18/19/20补齐城镇和成长收集，后两本按ST10/12/15/19的内容矩阵验收，不另复制一套战斗后端。
6. E02先做身份/事务骨架探针，持有/终局最大fixture稳定后补最大写集验证；无需等全部UI写完才发现SDK不兼容。平台资源/安装操作必须另明确授权。
7. VT01最终完成三本/各难度、真实微信/Note20 Ultra、完整1～30经济和发布恢复出口。正式开放条件不随fixture通过提前满足。

## 共同完成定义

- 权威合同与本故事AC可追溯；修订规则、公开协议/字段、预算和测试同时更新，无活跃相反口径。
- unit验证领域规则与确定性，integration用真实内存Store与逐写点故障验证资产/CP/O/J/来源不变量，contract验证真实公开DTO/权限/错误与消费者，不仅mock内部函数。
- 新功能能用固定种子/可控时钟/最小测试配置重现；最大合法fixture与边界由故事负责，不依靠随机跑到目标分支。测试重置只影响隔离数据。
- 旧49项只复用有效不变量；按所属故事迁移过期断言，不删除失败用例制造全绿。42组是覆盖索引，不是42条已通过测试。
- 每故事提交测试命令、实际结果、配置/代码摘要和未覆盖项。可记“本地能力验收完成/平台待验”，但需要真实微信/真机的故事在门禁通过前不得写整体Done。
- UI静态稿不代替功能交互；未知请求关页后仍沿原结果恢复，业务层不因UI加载失败撤销已提交资产。
- 发布/SDK/手机门禁独立记录，不为让故事Done虚构环境证据。既定本期外功能不借实现顺手加入。

## 覆盖与变更追踪

详见[覆盖矩阵](coverage.md)及每张故事卡。原S01～S11保留历史实现参考；本目录作为当前功能交付拆分，B0只对应E01实施前置，开工时再将选中故事细分为可执行任务，不一次铺开全部实现。

本目录不批量授权全部故事实施。E01已完成本地交付，见[证据](../../reviews/e01-07-integration-verification-2026-10-22.md)；下一项ST01已整理[6项实施任务与测试边界](st01/README.md)，任务图待一次整体确认，尚未开始业务编码。[E02a探针计划](../../design/e02a-platform-probe-plan-v1.md)仅准备文档，真实SDK/资源另授权。设计闭环不冒充全量功能验收。

## ST04 本地实施续接

2026-11-09 UI接续：用户确认交互小样通过并授权先推广正式背包与装备详情。当前沿 ST04/ST05 增量接线，未另建业务故事或 Jira；样式、只读详情和本机真实服务证据见[背包 UI 落地记录](../../reviews/inventory-ui-style-verification.md)。其余城镇面板与战斗 HUD 仍待分别推广。

ST04已获任务图及实施授权，接续公司端`5bbcaa5`，本地背包整理/快捷位服务与纯协调器已实现；验收状态与平台/展示GAP见[ST04交付记录](../../reviews/st04-local-verification.md)及[任务入口](st04/README.md)。旧故事卡的proposed为拆分时快照，当前实施进度看本条链接，不要求重复批准已确认图。

ST04后续状态（2026-10-23）：[Cocos实际面板交付](../../reviews/st04-cocos-verification.md)已完成本机鼠标与触屏模拟验证；下一验收边界为正式微信/SDK/设备，不再重复从面板未接入阶段开始。

## ST05 本地实施续接

ST05已获任务图及实施授权，当前工作分支 `feat/st05-equipment`，接续 `feat/st04-inventory`；13槽位装备穿脱、满包同部位原格置换、紫装穿戴角色绑定、0耐久属性与套装失效、饰品CD阻断、固有评分与排行榜投影同事务同步及纯模型 `EquipmentCoordinator` 已全部实现并通过本地验证；验收状态与双轴独立评审见[ST05交付记录](../../reviews/st05-06-local-verification-2026-10-23.md)、[Standards 独立复核](../../reviews/st05-standards-independent-review-2026-10-23.md)、[Spec 独立评审](../../reviews/st05-spec-independent-review-2026-10-23.md)与[任务入口](st05/README.md)。

## ST06 本地实施续接

2026-11-10 UI换肤：正式实现杂货商店与货币兑换面板（`ShopPanel.ts`，ST06）并接入城镇场景（`Prototype.ts`）。接入 912×500 9-Patch 外框 `panel_window_frame`、`panel_well_inner` 凹槽切片、56px/44px `slot_grid_base` 槽位基底、品质外边框、原生 48px 图标、3态按钮切片（`button_normal/pressed/disabled`）、商人货架药剂/白装购买调量、背包非穿戴非绑定物品固定回收估值、法定 10000:1 金币/点券平价双向兑换、未知网络结果自愈恢复；交付 [`backend/test/shop-cocos.test.mjs`](../../backend/test/shop-cocos.test.mjs) 8 组自动化用例 100% 通过；详见[杂货商店 UI 样式落地记录](../../reviews/shop-ui-style-verification.md)。

ST06已获任务图及实施授权，当前工作分支 `feat/st06-shop`，接续 `feat/st05-equipment`；商店药剂与白装购买、满包整笔拒绝（`BAG_FULL`）零扣款、报价变化校验（`QUOTE_CHANGED`）、穿戴中与商城绑定道具禁售、强化不涨价固定回收、双向法定比率（`10000 gold ⇄ 1 points`）整数兑换与纯模型 `ShopCoordinator` 已全部实现并通过本地验证；验收状态与双轴独立评审见[ST06交付记录](../../reviews/st06-06-local-verification-2026-10-23.md)、[Standards 独立复核](../../reviews/st06-standards-independent-review-2026-10-23.md)、[Spec 独立评审](../../reviews/st06-spec-independent-review-2026-10-23.md)与[任务入口](st06/README.md)。

## ST07 / ST08 本地实施续接

2026-11-10 UI换肤：正式实现旅店信箱与永久待领面板（`MailPanel.ts`，ST07/ST08）并接入城镇场景（`Prototype.ts`）。接入 912×500 9-Patch 外框 `panel_window_frame`、`panel_well_inner` 凹槽切片、56px `slot_grid_base` 槽位基底、品质外边框、原生 48px 图标、3态按钮切片（`button_normal/pressed/disabled`）、双标签页模式（系统信件收件箱 / 永久待领奖励暂存）、查阅自动标已读、未领附件防删保护、一键批量可恢复领取（`mail.claimAvailable`）、满包自动转入永久待领提取入包、未知网络状态自愈恢复；交付 [`backend/test/mail-cocos.test.mjs`](../../backend/test/mail-cocos.test.mjs) 9 组自动化用例 100% 通过；详见[旅店信箱 UI 样式落地记录](../../reviews/mail-ui-style-verification.md)。

## ST09 本地实施续接

2026-11-09 UI换肤：用户授权推进金库/银行面板（`BankPanel.ts`，ST09）换肤。接入 56px 槽位、48px 原生透明图标、品质外框、9-Patch 切片底板与两级只读装备详情卡；手势指针所有权与弹窗尾部释放隔离回归通过；证据见[银行 UI 落地记录](../../reviews/bank-ui-style-verification.md)。

2026-10-23，`feat-1.0.0`：用户确认的四项任务已完成本地能力验收，含实际Cocos银行、普通背包扩容、原结果恢复及独立评审修复。详见[任务入口](st09/README.md)及[试玩与验证](../../reviews/st09-local-verification.md)。正式价格/SDK/真机待验，不以本机通过标全平台Done。下一可玩检查节点仍是[城镇界面联调包](../../reviews/player-preview-milestones-v1.md)，ST05～08服务存在不代表面板已接入。

## ST10 本地实施续接

2026-11-10 UI换肤：正式实现地下城入口选择面板（`DungeonSelectPanel.ts`，ST10）并接入城镇场景（`Prototype.ts`）。接入 912×500 9-Patch 外框 `panel_window_frame`、`panel_well_inner` 凹槽切片、3 张地下城选择卡片（幽暗密林深处、格兰之森工坊、裂隙深处）、3 级难度切换（普通/冒险/勇士）、权威 `dungeon.entry` 选项响应、疲劳消耗展示（8点/次）与准入硬门禁守门（0体力拦截、未装备主手武器拦截、0耐久完全破损拦截）、推荐物攻与魔物情报展示、`challenge.start` 锁定疲劳快照开启挑战、网络未决自愈恢复重试；交付 [`backend/test/dungeon-select-cocos.test.mjs`](../../backend/test/dungeon-select-cocos.test.mjs) 11 组自动化用例 100% 通过；详见[地下城入口选择 UI 样式落地记录](../../reviews/dungeon-select-ui-style-verification.md)。

2026-10-24，用户已确认五项任务图并授权本地实施，integration为`feat-1.0.0`。见[ST10入口](st10/README.md)、[Accepted规格与依赖](st10/plan-check.json)、[当前执行状态](st10/execution.json)。2026-10-25，01～05按frontier实施并独立合入，评审修复后两轴复查通过；见[本地交付与限制](../../reviews/st10-local-verification.md)。来源卡proposed保留为历史快照，执行状态以Accepted任务与sidecar为准。无Jira；ST09历史构建与本轮被拒绝的重构建分别记录，不挪用为ST10构建通过。

## ST11 本地实施续接

2026-10-25～2026-10-26：用户已确认六项任务图并授权本地实施，integration为`feat-1.0.0`。移动、三段普攻、十字斩、崩山击、拔刀斩、大崩均已按frontier独立实现合入，经Standards/Spec独立评审及集中修复，两轴复查通过，全量7/7（含568/568后台测试）及Cocos类型检查通过。见[ST11入口](st11/README.md)、[本地交付与限制](../../reviews/st11-local-verification.md)、[Standards复核](../../reviews/st11-build-standards-recheck.md)、[Spec复核](../../reviews/st11-build-spec-recheck.md)。未声称Cocos构建/真机/云端SDK或后续怪物AI(ST12)通过。

## ST12 本地实施续接

**当前更正（2026-10-27）**：下段为历史完成记录；本次代码核对发现Cocos战斗仍走本地模型、最大预算测试未充分证明真实服务/CP/恢复全链，ST12整体验收重新打开，保留六项合入事实。下一步建议先收尾ST12，再确认/编码ST13；详见[接续交接](../../reviews/handoff-st12-closeout-st13-2026-10-27.md)。ST13目前仅有[任务图草案](st13/task-plan.md)，未获具体图确认、未编码。

2026-10-26～2026-10-27：用户已确认六项任务图并授权本地实施，integration为`feat-1.0.0`。ST12-01～ST12-06全部6项单据均已独立实现并快进合入主干（近战组合、远程投石与冲锋突进、首本七房紫名与权威清场、精英横扫顺劈与牛头Boss重槌践踏50%半血切阶段、牛头Boss二阶段践踏冲撞接撞墙虚弱与中距离扇形吼叫、三本遭遇组合与Cocos可玩联调及8敌群/3648条状态效果CP预算签署）。全量门禁7/7（含shared 199项、backend 582项测试）、纯模型测试19/19、离线Cocos H5构建全部通过，无外部网络依赖，两轴独立复查合入完成并推送远程。见[ST12入口](st12/README.md)、[执行记录](st12/execution.json)、[三本合同](../../backend/dungeon-three-composition-contract-v1.md)、[06验证报告](../../reviews/st12-06-verification.md)与[06合入核验](../../reviews/st12-06-merge-verification.md)。

## ST13 本地实施续接

2026-11-10 UI换肤：正式实现战斗内 HUD 视觉切片升级，包含玩家状态栏（`PlayerStatusHUD.ts`，`bar_fill_hp/mp` 与 `panel_well_inner` 凹槽）、补给与饰品 4 槽位（`CombatSupplyHUD.ts`，56px `slot_grid_base`、品质外框、冷却倒计时遮罩与生效中金框）、死亡复活弹窗（`DeathRevivePanel.ts`，9-Patch 外框、倒计时进度条、3态按钮、金光复活光环与全屏渐隐黑幕）；交付 [`backend/test/combat-hud-cocos.test.mjs`](../../backend/test/combat-hud-cocos.test.mjs) 12 组自动化用例 100% 通过；详见[战斗 HUD 样式落地记录](../../reviews/combat-hud-ui-style-verification.md)。

2026-10-27～2026-10-28：用户已确认五项任务图并授权本地实施，integration为`feat-1.0.0`。见[ST13入口](st13/README.md)。

## ST14 本地实施续接

2026-10-28：用户已确认五项任务图并授权本地实施，integration为`feat-1.0.0`，基线为 `4577f28`。ST14-01～ST14-05全部5项单据均已独立实现并合入主干（权威死亡与10秒倒计时锚定、手动复活与纹章/状态重置事务、倒计时超时判败与落点退出、Cocos复活HUD与视觉交互、全链路联合集成与评审），commit 为 `4243635`。全量通过 7/7 门禁（包含 639 项后台测试、纯模型及 UI 模型回归），Standards 与 Spec 两轴独立复核通过。见[ST14入口](st14/README.md)、[执行记录](st14/execution.json)、[两轴独立评审报告](../../reviews/st14-local-verification.md)。

## ST15 本地实施续接

2026-10-29：01～04已实现合入；05联合验收、预算保护及评审修复已合入，代码`bb916d809`。最终全量7/7（shared230、backend692），原两轴发现复核关闭。**最大终局预算门禁仍BLOCKED，ST15不标整体Done/可发布**：正常八块CP提交78调用；最大到期效果域原570调用/约3.76MB超限，当前原子拒绝，下一步整改结果存储物理映射。见[本地交付与限制](../../reviews/st15-local-verification.md)、[当前执行](st15/execution.json)及[任务入口](st15/README.md)。Windows历史离线构建、无头测试和本次Mac服务回归分别记录，不替代微信/SDK/设备验收。

2026-10-30更新：ST15已知最大结果存储压力域已整改，future/due/mixed均成功，最高R42/W33/78调用；最终全量7/7（shared230/backend694）、62实际写点故障及两轴复核通过。正式内容包络、SDK和真机仍GAP，不标可发布。当前证据见[存储整改](../../reviews/st15-storage-verification-2026-10-30.md)，上段为2026-10-29历史状态。

2026-11-09 UI换肤：推进战斗 HUD 与地下城结算卡片（`Prototype.ts` 与 `LootVictoryPanel.ts`，ST15）换肤落地。接入玩家 180px 生命/法力双阶梯状态条、顶部场景切换与导航高对比胶囊、84px 金框普攻与晶蓝战士四技能触控按钮组；结算卡片接入 `panel_window_frame`、`panel_well_inner` 凹槽视口与 3D 翻牌切片；证据见[战斗 HUD 落地记录](../../reviews/combat-hud-ui-style-verification.md)。

## ST16 本地完成记录（2026-11-01）

已按批准五项图完成恢复编排、未知原意图栅栏、dead/looting资格、Cocos生命周期及联合验收；最终源码8d73ca8，全七阶段7/7（shared230/backend730）、最终Creator离线构建通过，Standards/Spec各0可行动发现。见[本地交付与限制](../../reviews/st16-local-verification.md)及[执行状态](st16/execution.json)。04历史类型失败已保留并由05补齐seq，不能据旧汇报算通过。真实网络/微信设备、SDK及正式发布内容包络仍GAP；未push/Jira。ST17为下一业务故事，尚未自动实施。

## ST17 本地完成记录（2026-11-03）

用户已选择开始耐久与林纳克斯修理；现状预检和既有38项基线已完成，普通清房磨损与修理纵切为主要缺口。[规格草案/五项任务图](st17/README.md)待一次整体确认，尚未开始ST17业务编码。core-contract旧暂停描述已按既定“不暂停”规则勘误，无新玩法决定。

2026-11-01 ST17接续：用户批准五项图但仅启动01。01真实普通清房/死亡磨损、0武器继续本局及普通清房后完整恢复/出门换房已合入，源13a8b6b；独立复核READY。详见[01记录](../../reviews/st17-01-verification.md)和[当前执行](st17/execution.json)。02～05未启动，全7阶段/Creator与平台GAP未宣称通过；未push。

2026-11-02 ST17-02接续：林纳克斯单件报价及穿戴/背包修满服务与真实传输协调器已交付，固定源码0ea7f0f，独立复核READY；初次旧expected阻塞已修复。详见[02证据](../../reviews/st17-02-verification.md)、[独立复核](../../reviews/st17-02-merge-recheck.md)及[执行状态](st17/execution.json)。03一键全修/04面板/05联合门禁未启动，未执行全7/Creator或push；正式价格、SDK和设备仍GAP。

2026-11-02 ST17-03接续：当前穿戴7耐久槽完整报价与原子全修已合入，源码4b71913，独立核验READY；焦点112/相关184/独立新增14及两类型通过。空/全满零费、余额不足或坏目标整批拒绝，原O与单修兼容。详见[03证据](../../reviews/st17-03-verification.md)、[独立核验](../../reviews/st17-03-merge-verification.md)和[当前执行](st17/execution.json)。04修理面板/05全故事门禁未启动，未push；SDK/设备/正式配置仍GAP。

2026-11-02 ST17-04接续：Cocos林纳克斯修理面板（RepairPanel.ts）、全部穿戴一键全修/单件双模式、7槽耐久明细与费用、成功横幅、unknown恢复按钮、迟包/切角代次隔离、Prototype M键/点击交互与非阻断破损警告已合入主干，源码ed5779a；定向8/8全绿，全7阶段自动化门禁7/7通过（855测试全部通过），独立核验READY。详见[04证据](../../reviews/st17-04-verification.md)、[独立核验](../../reviews/st17-04-merge-verification.md)及[执行状态](st17/execution.json)。05联合门禁未启动，未push。

2026-11-03 ST17-05接续：磨损—修理—再入本大闭环联合验收套件（`repair-joint-acceptance.test.mjs`）、真实战斗/死亡磨损至0、城镇门禁拦截 `WEAPON_BROKEN`、林纳克斯一键全修扣费修满、重新入本成功开启挑战全链路已合入主干，源码 `a4db9b5`；终局物理事务预算实测满足硬限制（R21 <= 25, W12 <= 15, calls 33 <= 40, writeBytes 97623 <= 256 KiB, viewBytes 75917 <= 128 KiB）；12写点故障注入100%原子回滚与重放幂等通过；换装/出售OCC并发竞争双序安全裁决通过。两轴独立评审均通过（Standards 0违规，Spec 0偏离）。详见[05证据](../../reviews/st17-05-verification.md)、[独立核验](../../reviews/st17-05-merge-verification.md)、[Standards独立评审](../../reviews/st17-standards-independent-review.md)及[Spec独立评审](../../reviews/st17-spec-independent-review.md)。ST17全部5项任务完整交付归档。

2026-11-09 UI换肤：推进修理面板（`RepairPanel.ts`，ST17）换肤落地。接入 `panel_window_frame` 9-Patch 外框、`panel_well_inner` 凹槽视口底板、3态按钮切片（`button_normal/pressed/disabled`）及双模式 Tab 选中高亮；修复 `bank-panel-gesture.test.mjs` 工具链自动降级路径；证据见[修理 UI 落地记录](../../reviews/repair-ui-style-verification.md)。

## ST18 本地完成记录（2026-11-02）

已按批准五项图完成强化全链路交付、合入主干 `feat-1.0.0` 并通过两轴独立评审。
- **ST18-01（低段强化 +1～+10）**：可信玛丽授权、只读报价、成功/保级强化、会话记忆与确定性随机样本、独立强化AP投影及传输协调器已交付合入，源码 `375a342`。独立复核54/54通过，见[01记录](../../reviews/st18-01-verification.md)及[独立核验](../../reviews/st18-01-merge-verification.md)。
- **ST18-02（高段降级/损毁与纪念品）**：11/12失败降至+10、13～20失败永久损毁、选用角色绑定纪念品、损毁返还合堆与满包邮件溢出、适用套装持有贡献递减及评分同步已交付合入，源码 `099e088`。独立实测62/62通过，见[02记录](../../reviews/st18-02-verification.md)及[独立核验](../../reviews/st18-02-merge-verification.md)。
- **ST18-03（跨装备相似记忆与恢复）**：跨装备相似记忆复用、相似距离衰减权重、多重上限截断、代次边界重置与隔离、OCC重试固定样本防漂移、已提交结果不可变防重扣、Cocos协调器高段/纪念品/损毁联动及网络丢包双路径恢复已交付合入，源码 `d0234d7`。独立实测72/72通过，见[03记录](../../reviews/st18-03-verification.md)及[独立核验](../../reviews/st18-03-merge-verification.md)。
- **ST18-04（Cocos玛丽强化面板接线与交互）**：Cocos强化面板（`EnhancementPanel.ts`）、单向数据流与状态映射、属性增量与金币/材料费用展示、三级风险警示（保级/降级/损毁）、11级起纪念品选用与自动重报价、未知丢包恢复按钮、信息隐匿门禁（绝无概率或记忆泄露）、关闭迟包与切角代次隔离已交付合入，源码 `622f349`。独立实测52/52通过，见[04记录](../../reviews/st18-04-verification.md)及[独立核验](../../reviews/st18-04-merge-verification.md)。
- **ST18-05（强化联合验收与两轴独立评审）**：端到端大闭环（低段强化、高段纪念品、失败损毁、返还合堆、满包邮件溢出、邮件领取、再次强化与丢包恢复）、最大终局物理预算实测（R26 / W11 / 37调用 / 29466写字节 / 16622最大文档字节）、11个物理写点逐一注入故障原子回滚、并发OCC竞争（脱装/出售/单修）已交付合入，源码 `5731b10`。两轴独立评审均通过（Standards 0违规，Spec 0偏离）。见[05验证记录](../../reviews/st18-05-verification.md)、[Standards独立评审](../../reviews/st18-standards-independent-review.md)、[Spec独立评审](../../reviews/st18-spec-independent-review.md)及[执行状态](st18/execution.json)。
- 限制：正式概率与数值校准、微信真机环境与云端分布式SDK事务继续保留为GAP；ST17-03一键全修竞争待ST17-03交付后闭环；无Jira，未push。

2026-11-09 UI换肤：推进强化面板（`EnhancementPanel.ts`，ST18）换肤落地。接入 `panel_window_frame` 9-Patch 外框、`panel_well_inner` 凹槽视口底板、3态按钮切片（`button_normal/pressed/disabled`）及纪念品启用按下态高亮；证据见[强化 UI 落地记录](../../reviews/enhancement-ui-style-verification.md)。


## ST19 本地实施记录（2026-11-02）

用户已指示推进 ST19（特殊副本套装策略与持有检测）。实施规格与五项任务图已获用户确认并冻结，详见 [ST19 任务入口](st19/README.md)、[实施规格](st19/spec.md) 及 [五项任务图](st19/task-plan.md)。硬依赖 ST15、ST09、ST07、ST18 均已在本地主干交付。
- **ST19-01（策略引擎与多策略分层体系）**：算法与 Profile 解耦、三种策略注册表、30 级特殊副本严格校验已合入，源码 `a7967f0`；见[01记录](../../reviews/st19-01-verification.md)及[独立核验](../../reviews/st19-01-merge-verification.md)。
- **ST19-02（全口径持有聚合与双角色严格隔离）**：穿戴/背包/个人库/账号库/有效邮件/待领全 6 类存储源聚合覆盖、严格双角色私域隔离、公共账号库联动、邮件时效判定与损坏摘要完整性保护已合入，源码 `b8d42eb`；见[02记录](../../reviews/st19-02-verification.md)及[独立核验](../../reviews/st19-02-merge-verification.md)。
- **ST19-03（固定样本重映射、全齐平滑回退与提交不可变性）**：`deriveDropSample` 确定性样本生成、OCC 重试未提交候选重映射且基础样本不漂移、11 部位全齐平滑安全回退至 `fallbackStrategy`（`weighted-random` 绝不卡死拒发）、终局结算 `planClear` 提交后绝对不可变性与网络丢包幂等返回原回执已交付合入，源码 `ba18c58`；全量 7 阶段门禁检查 7/7 全部通过（861 项测试全部通过），见[03记录](../../reviews/st19-03-verification.md)及[独立核验](../../reviews/st19-03-merge-verification.md)。
- **ST19-04（生命周期联动与套装收集展示）**：商店出售、强化损毁（+13~+20）与金库跨域转移即时同步持有并在最后一件移出时恢复缺件判定；客户端纯模型协调器（`CollectionCoordinator.ts`）维护 11 部位套装进度（`X/11`）、高亮/灰显、通关回执解析反馈及 generation 异步隔离已合入，源码 `583e655`；全量 7 阶段门禁检查 7/7 全部通过（867 项测试全部通过），见[04记录](../../reviews/st19-04-verification.md)及[独立核验](../../reviews/st19-04-merge-verification.md)。
- **ST19-05（全链路大闭环联合验收、预算测量与两轴独立评审）**：0 到 11 件渐进收集定向补齐、账号金库跨角色共享与多角色持有隔离、商店出售与强化损毁即时恢复未收集、满件平滑回退加权随机；终局物理事务预算实测满足硬限制（R42 <= 44, W33 <= 33, calls 78 <= 80, writeBytes 327,245 <= 1.5 MiB, holdings 461 <= 16 KiB）；28 个实际物理写点故障注入 100% 干净原子回滚无残留；并发 OCC 竞争串行化安全裁决已交付合入，源码 `c33a0bd`；全量 7 阶段门禁检查 7/7 全部通过（871 项测试全部通过），两轴独立评审通过（Standards 0 违规，Spec 0 偏离）。见[05记录](../../reviews/st19-05-verification.md)、[05合入核验](../../reviews/st19-05-merge-verification.md)、[Standards独立评审](../../reviews/st19-standards-independent-review.md)及[Spec独立评审](../../reviews/st19-spec-independent-review.md)。ST19 全部 5 项子任务完整交付合入。

## ST20 本地实施记录（2026-11-03）

用户已指示推进 ST20（查看当前装备评分排行榜）。实施规格与五项任务图已获用户确认并冻结，详见 [ST20 任务入口](st20/README.md)、[实施规格](st20/spec.md) 及 [五项任务图](st20/task-plan.md)。硬依赖 ST05、ST18 均已在本地主干交付。
- **ST20-01（评分排行服务核心、索引排序与分页查询协议）**：构建 `RankingService` 服务核心并接入 `ranking.list` 协议；建立 `(score DESC, scoreReachedAt ASC, characterId ASC)` 稳定三元组排序；支持全服总榜（`all`）、战士榜（`warrior`）、猎人榜（`hunter`）与 `scoreConfigRef` 隔离；实现 HMAC-SHA256 签名有界游标编解码（单页 1~50 条，默认 20 条，防篡改、防跨域与 10 分钟 TTL 过期保护）；查询纯只读（0 次 `tx.set`，存储文档无任何修改，`scoreReachedAt` 绝对不变）已交付合入，源码 `2805636`；定向测试 8/8 通过，关联回归 26/26 通过，两项 TS 检查 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，见[01记录](../../reviews/st20-01-verification.md)及[独立核验](../../reviews/st20-01-merge-verification.md)。
- **ST20-02（短租约原子刷新缓存、TTL 新鲜度机制与并发抢锁）**：构建 `rankCaches` 独立确定键物理首屏缓存（`v2:rankCache:${b64}`），包含 CAS `version`、`cachedAt`、前 50 条条目与 3 秒短租约；15 秒新鲜期极速命中（`stale: false`）、15~60 秒平滑降级（租约忙时返回旧数据并显式标识 `stale: true` 防击穿防重叠写）、超过 60 秒强制穿透刷新、租约超时接管与缓存写失败资产零污染已交付合入，源码 `e13ad34`；定向测试 16/16 通过，关联回归 34/34 通过，两项 TS 检查 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，见[02记录](../../reviews/st20-02-verification.md)及[独立核验](../../reviews/st20-02-merge-verification.md)。
- **ST20-03（本人名次三段式精准计数与大容量降级熔断）**：构建三段式互斥统计求和算法（$C_1$ 比本人分高 + $C_2$ 同分先达到 + $C_3$ 同分同秒 ID 较小，三数相加 + 1），与全量三元组排序排位 100% 严格一致；实现换装即时响应（评分升降即时反映，不受 15 秒缓存延迟影响）；实现容量超额检测、故障注入与外部统计提供器异常优雅降级返回 `ownRank: null`（列表与快照时间正常返回，绝不伪造“未上榜”）；严格保证异职业跨榜隔离与查询纯只读已交付合入，源码 `ad1de71`；定向测试 23/23 通过，关联回归 41/41 通过，两项 TS 检查 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，见[03记录](../../reviews/st20-03-verification.md)及[独立核验](../../reviews/st20-03-merge-verification.md)。
- **ST20-04（Cocos 排行榜面板与纯模型协调器）**：构建纯模型协调器（`RankingCoordinator.ts`），涵盖完备状态机管理、严格 `generation` 代次隔离丢弃在途迟包、跨页按 `characterId` 幂等去重与网络错误重试；实现 Cocos 表现层交互面板（`RankingPanel.ts`），支持全服总榜/战士榜/猎人榜切换选项卡、本人名次金色置顶横幅（`OwnRankBanner`）、前三名差异化颜色标识、15 秒缓存快照/实时新鲜度状态显示与触底翻页已交付合入，源码 `e30bde7`；定向测试 6/6 通过，关联回归 47/47 通过，两项 TS 检查 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，见[04记录](../../reviews/st20-04-verification.md)及[独立核验](../../reviews/st20-04-merge-verification.md)。
- **ST20-05（换装/强化即时刷新联合验收、物理预算与两轴评审）**：真实换装（ST05）与强化（ST18）到排行榜投影即时刷新端到端大闭环；15 秒新鲜期内本人名次即时计算反映升降（3040 分即时登顶 #1，卸装即时跌落 #3，重新穿装同分较晚达成排 #2 验证三元组同分裁决）；物理预算实测达标（`rankCaches` 文档 12,604 B $\le$ 16 KiB，条目实体 335 B $\le$ 16 KiB，单页网络传输 12,532 B $\le$ 64 KiB）；防击穿并发验证（10 并发安全回退旧缓存）、租约超时接管、容量熔断与存储故障资产零污染；并发换装与排行查询 OCC 安全竞争已交付合入，源码 `ad8939c`；全套定向测试 33/33 通过，两项 TS 检查 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS，两轴独立评审通过（Standards 0 违规，Spec 0 偏离）。见[05记录](../../reviews/st20-05-verification.md)、[05合入核验](../../reviews/st20-05-merge-verification.md)、[Standards独立评审](../../reviews/st20-standards-independent-review.md)及[Spec独立评审](../../reviews/st20-spec-independent-review.md)。ST20 全部 5 项子任务完整交付合入。

2026-11-09 UI换肤：推进排行榜面板（`RankingPanel.ts`，ST20）换肤落地。接入 `panel_window_frame` 9-Patch 外框、`panel_well_inner` 凹槽榜单卡片与个人排名横幅、3态按钮切片（`button_normal/pressed/disabled`）及三大榜单 Tab 选中下凹高亮；证据见[排行榜 UI 落地记录](../../reviews/ranking-ui-style-verification.md)。

## 微信小游戏（wechatgame）全量 UI 切片离线构建核验（2026-11-11）

2026-11-11，基于 `feat-1.0.0` / `6cef789` 对完成全部 9-Patch 换肤后的完整客户端执行微信小游戏（`wechatgame`）离线 CLI 构建与包体预算校验。主包 `1,779,899` 字节（约 1.70 MiB，低于 4 MiB 上限），总体积 `14,547,149` 字节（`internal` / `main` / `resources` 三分包就绪），全套 12 个 UI 面板与 HUD 组件、`ui/slices/`（32 项）及 `icons/`（98 项）均成功打包合入，三层 TS、纯模型与 89 项 Cocos UI 用例全部通过。详见[微信小游戏切片版构建核验](../../reviews/wechat-build-verification-2026-11-11.md)。真机微信开发者工具预览、设备运行性能与 E02 微信云端接入继续保持为后续待验门禁。
