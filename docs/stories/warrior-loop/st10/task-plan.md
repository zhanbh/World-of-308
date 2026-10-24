# ST10 本地实施任务图提案

2026-10-24；基线`feat-1.0.0 / a75ee619d4f64f2e073c62d5626e605aff028402`。用户已要求接续ST10；本文件为本次新任务粒度和依赖的待确认提案，不冒记为已批准。无Jira、外部单据、安装或云资源操作。

## 来源与真实前置

来源：[ST10故事](../st10.md)、[真相源](../../../backend/source-of-truth.md)、[加载握手](../../../backend/room-loading-handshake-v1.md)、[恢复时序](../../../backend/recovery-timeline-proposal-v1.md)、[检查点](../../../backend/simulation-checkpoint-schema-v1.md)、[包络](../../../backend/simulation-content-envelope-v1.md)、[API](../../../backend/api-contract-v2.md)、[字典](../../../backend/data-dictionary-v2.md)、[三本内容](../../../design/warrior-three-dungeon-baseline-v1.md)。规则以用户最新决定与活跃正文为准，历史“待评审”标题不覆盖其后批准章节。

ST03城镇位置与ST05装备服务存在，真实组合必须沿它们的角色、装备/属性及账户会话事实。ST09本地修复已合入，但正式SDK/真机及本轮Cocos重构建仍未验证，不冒充ST10前置不存在，也不自动重试此前被拒绝的构建操作。

当前v2共享层已有challenge.start、prepareRoom/activateRoom、scene.ready、challenge.get及恢复分页等严格协议；不存在对应v2挑战应用服务、LoadingCoordinator。旧GameService的单步enterRoom与事件自报只作历史回归，不作为新实现的授权旁路。登录接管已有v2挑战/CP关闭和体力结算约束，新服务必须与其兼容。

E01 release-v1 是明确local-test/contract-fixture-only的小范围配置，不是三个副本和所有难度的正式发布包。ST10建立版本化内容/配置读取边界，复用能兼容的发布验证；用明确测试manifest覆盖当前入口/难度/房费，不将一档1级夹具伪称全部正式内容已冻结。创建锁定release和怪物等级，后续prepare不取latest。

## 交付边界

提供实际客户端选择/加载状态和可重复命令演示，验证入口→创建→prepare→资源校验→activate→完整状态→ready。Cocos表现可按现有注入入口接入最小选择/加载界面；未实际构建/运行须记录GAP，不能拿静态图或自动跳过资源检查声称已可战斗。

ST10不实现ST11战斗模拟、ST12怪物AI或ST15拾取发奖。可预置合法cleared旧房/持久来源做换房竞争夹具；禁止增加客户端“设清场”“报击杀”或“免费回滚”公开入口。角色HP/MP/CD/buff、精确余数与租约的加载结算属于本故事必要范围。恢复仅实现本故事加载阶段所需控制，不宣称整个ST16完成。

## 建议五项纵向切片

### ST10-01：到副本入口选择难度并创建挑战

**Blocked by：** 故事内无；外部复用ST03/ST05实际能力。

**What it delivers：** 角色走到服务端认可入口后读取难度选项，主动确认才创建挑战；返回锁定的配置/等级/体力快照，客户端可展示并通过命令演示重放。

- 可信身份/当前会话/选角/rolePlayEpoch，城镇地图和入口范围与真实装备、等级、难度解锁重验；入口上下文由服务端发放并绑定实际位置，不能凭客户端传nearDungeon。
- 0体力/无武器/破损武器拒绝，1体力可进；普通与特殊副本等级/难度规则、账号共享解锁、高等级回刷沿规格，不加评分或前本通关门槛；选项不显示体力消耗。
- 创建不扣首房费、不创建已付费首房。锁release、怪物等级/装备来源和体力快照；首本紫名安排在创建时固定，重试不重抽。
- 账户active/openScene指针、角色location/reservation、挑战与原结果同事务；兼容真实LoginService接管/新launch关闭与旧结算不覆盖新挑战。
- 同ID同参/异参、权限、失效入口、边界值、并发创建、每写点失败、丢响应；真实ST03/ST05组合。缺正式配置拒绝，不补默认有效关卡。

### ST10-02：prepare固定房间manifest并验证资源加载

**Blocked by：** ST10-01。

**What it delivers：** 首房prepare获得唯一attempt及资源摘要；客户端加载成功/失败可观察，失败留在同一挑战，不扣下一房费、不刷新安排。

- 一次至多一个pending attempt；校验首房/顺序、活着/连接/挑战未终止和配置，生成确定manifest/hash并绑定挑战release。
- prepare不扣费、不推进战斗、不删除旧房；复用相同意图返回同一attempt，不重新随机站位或紫名。
- 创建唯一H.transitionClock基点；客户端LoadingCoordinator隔离异步流程代次，失败/取消/重试不换challenge/attempt，不让旧资源回调进入新流程。
- 实际manifest/资源摘要校验接口、缺资源与hash错、同ID异参、过期上下文、接管/终止竞争、逐写点失败和原结果恢复；保持未付首房时无CP的既有接管合同。

### ST10-03：activate一次扣费，完整状态就绪后ready开场

**Blocked by：** ST10-02。

**What it delivers：** 成功加载后activate原子开首房进入awaitingReady；客户端读齐一致公开状态，再提交ready进入active。没有ready成功便没有预测开战。

- 原子创建确定room/有界CP头及分片，扣本局快照至最低0一次，递增scene/timeline代次并返回ready票据；不能重建同房或重扣，途中武器归零不新增暂停规则。
- H.transitionClock跨activate保留；activate结算已累计联网角色计时，ready只结未消费区间再清时钟。ready才建立活动锚点/inputGapBaseAt；awaitingReady不套战斗2秒输入缺口。
- recoveryPage/公开状态绑定ticket、revision、manifest/publicState hash；资源和完整状态未就绪不允许客户端预测，不开放并行写CP旁路。
- 资产命令走原operation，控制ready走原控制序号/票据回执；未知结果不换ID，重复ready不重启锚点。真实身份、版本、原截止、每写点故障及两种竞争顺序有断言。
- 首房命令端到端演示止于active，不伪造ST11战斗已完成；所有CP/响应/原结果实测UTF-8及边界，不能只测空CP。

### ST10-04：加载中断后恢复同一attempt和原就绪结果

**Blocked by：** ST10-03。

**What it delivers：** prepare或awaitingReady阶段资源失败、短断线或响应丢失后，客户端可查询原结果并在原截止内恢复，已支付房费不退、不重扣。

- 加载阶段新心跳/暂停/恢复准备/ready只实现必要共享控制；原租约/死亡截止不滚动加10秒，等于截止即到期。ready丢响应查同票据，notFound不等于未提交。
- 停止预测，恢复原版本公开状态；旧session/role/timeline与迟到资源回调拒绝，重连不重抽manifest或紫名、不清CD、不免费复活。
- recovery区间从角色转场计时排除，恢复回加载阶段只恢复加载时钟，不提前启动敌人；关闭/到期/接管清理与现有登录/体力结算一致，不另加退款/宽限。
- 失去响应、关页重开原意图、失败重试、ready前后截止-1/相等/+1、接管先后顺序和逐写点故障验证；不将该范围称全ST16。

### ST10-05：后续房继承角色状态、计时与零体力续房

**Blocked by：** ST10-04（复用已成立的完整握手及恢复时钟）。

**What it delivers：** 从服务端合法cleared旧房走到出口换下一房，继承当前角色状态，加载继续正确计时；本局体力为0或武器归零也可继续。

- 前房仍有敌人/非法出口/跳房拒绝。fixture可预置服务端cleared，不新增客户端清场命令；首房以后的完整实际战斗串接留ST11/12。
- 继承等级XP/装备耐久、HPMP、技能/两组药品/饰品CD及buff；加载分段自然回复与精确余数沿算术合同，buff中途到期正确分段，不满血蓝、不额外回复或清CD。
- 固定示例：剩5秒，prepare→activate2秒，再到ready1秒，最终剩2秒；9秒加载含4秒recovery只计5秒；重放不再次计时；跨体力刷新不补本局快照。
- 激活令旧场景地面失效，旧输入不打新怪；旧房拾取与切房通过共用A/H版本栅栏验证两种顺序。ST15拾取尚未实现时只验证真实事务争用+合法来源夹具，并明确完整拾取/发奖组合待ST15，不宣称mock为真集成。
- 客户端连续两房加载演示、旧回调/原结果防覆盖；资源失败保留此前已确认收益；终止/接管先后顺序、按需CP变更块与最大写集实际编码有证据。

## 依赖图与实施方式

```text
已具备ST03 + ST05
        ↓
       01 入口/创建
        ↓
       02 prepare/资源
        ↓
       03 activate/ready
        ↓
       04 加载中断恢复
        ↓
       05 后续换房/继承计时
```

依赖来自同一挑战/CP/转场时钟的一致性，先按线性frontier交付，不以服务/前端/测试横切并发。每项都含契约、规则、实际服务连接、客户端状态、测试及可重复演示。每implementer单独项目内已忽略worktree，从integration tip起步，合入后才推进下项；merger核对并合入，最终完整diff双轴独立评审，问题由单独implementer统一修复。

本次新图需用户一次确认粒度及依赖；确认后生成本目录Accepted spec与issues/01～05、来源SHA和本地plan gate。确认前仅探索/文档，不提前编写ST10业务代码。原ST09未提交审计文档和用户Cocos配置均保留，不混入ST10功能提交，也不把旧门禁改成已通过。

## 批准记录

用户已确认本次五项及线性依赖：“好的，开始吧”。提案阶段的待确认叙述保留为历史，当前以Accepted规格/任务和execution.json为准，不要求重复确认。
