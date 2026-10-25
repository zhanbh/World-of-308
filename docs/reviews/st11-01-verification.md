# ST11-01 本地实施与验证

2026-10-25。任务：`ticket:warrior-loop-st11-01@53e5ce36c156757462e5f9ef4cdbbf10c08c4a9de2e76e309560160475c0e48a`；基线/已核对integration tip：`f7ff09be3dbcab596852c638a135eee102a8e139`，工作分支`feat/st11-01-movement`。Accepted spec/issues/任务图保持只读，最终提交SHA由实施交接记录。工程合同见[移动输入](../backend/movement-input-contract-v1.md)。

## 完成行为

真实可信身份、Login/Character/Town、现有装备与ST10 prepare/activate/ready接续simulation.submit：服务端严格校验输入，事务外精确移动重算，提交事务重新授权/读CP/验完整基线/时钟与版本；A/H/头/实际变化role块/O原子提交。没有调用v1 GameService/reportEvents。真实EquipmentService读取已穿戴初始武器，非模拟装备服务。场景敌人仍为ST10真实初始化对象；本片不执行怪物AI/攻击/伤害/奖励。

无Cocos共享内核：量化X力度走跑、Y死区后定速、斜向不归一、面向，方形足迹整路径扫掠薄墙/角落/边界，截断不积攒。地图/规则采用完整摘要绑定的显式local-test配置；E01原地图/校验不放宽，没有复制原型像素边界。role内部schema3持久意图与带符号/100000精度，读role1/2；逻辑毫秒独立保留ST10加载亚tick余数。自然回复保持原摘要/有理余数。

新公开`movement`精度记录加入当前公开hash，`simulation.confirmed`按当前授权身份/角色/场景/时间代次/修订分页，无旧ready hash依赖、无原CP/私有随机暴露。客户端加载真实资源→当前状态→完整公开证明→再次状态确认；持久原pending、先查operation.get、完全原意图重试、代次/修订与generation栅栏，最多1秒未确认预测，32输入有界且离散溢出显式拒绝。显式整段拒绝可取得新完整证明后reconcileRejected；未知结果不能使用此出口抛弃原意图。

共同2秒缺口守卫用于submit、challenge.get、scene.status/新心跳/控制和活动公开分页；继承原lease截止，加载排除，无新10秒。新成功片段才刷新inputGapBaseAt；原结果/心跳不刷新。R13保持：当前合法新会话可按账号读取旧会话/旧角色小型原结果，旧会话不能写或查询，历史结果不能授权新场景预测。

## TDD与命令证据

已批准seams：纯内核、真实execute/query+MemoryStore、严格DTO/公开证明、client transport/pendingStore/输入时钟。

- RED：`node --test backend/test/movement-submit.test.mjs`最初真实ready后submit失败`UNSUPPORTED_PROTOCOL`；实现后GREEN。薄墙/分数内核与客户端首测最初`ERR_MODULE_NOT_FOUND`，实现后GREEN。显式拒绝恢复用例先失败`reconcileRejected is not a function`，补实现后GREEN。
- `node --test backend/test/movement-submit.test.mjs backend/test/movement-client.test.mjs shared/test/movement-kernel.test.mjs shared/test/simulation-v2.test.mjs`：本片12服务+6客户端+7内核+4严格wire测试通过。全量运行含这些实际文件。
- `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`：最终7/7，Node24.9.0/TypeScript5.8.2；tooling7/7、shared123/123、backend496/496，shared/backend类型、含新MovementCoordinator的显式客户端纯模型类型、旧客户端模型/UI模型均通过。最终日志`/tmp/st11-full-check-release.log`。`git diff --check`通过。
- `node client/tools/demo-movement.mjs`：真实组合及资源证明→预测→提交成功丢响应→重开operation.get→完整当前证明→纠正/继续；输出位置`(-179834,20350)`、acceptedTick51、logicalTimeMs513/timeRemainderMs3；确认同一原操作与预测精度，不重复执行。
- `node backend/tools/benchmark-movement.mjs`：Darwin arm64/Node24.9.0，100tick×256墙，2次预热后10样本，2.180～4.755ms，均值2.874ms。仅本机纯核CPU，不是平台SDK/费用/微信性能。

服务负测覆盖：连续游标、全部相关版本/代次/摘要、预提交与逐包未来加速、32有序不支持动作、五个新移动写点逐点故障全部回滚、两恢复写点故障、丢响应同原结果、同ID异参、损坏O身份/结果operationId、跨服务ID、孤立J、真实Login接管两顺序、并发不同输入仅一个前沿、真实A冲突后重试在新的2秒边界拒绝、2秒−1/等于/+1、原截止关闭及心跳不延期。历史ST10一个长时间无输入公开证明用例现在先命中缺口RECOVERY_REQUIRED，断言据此迁移，未放宽守卫或固定proofDeadline。

内核验证包含任意切片/负方向/反转/输入切点、30/60/120实际渲染调度、非归一斜向、固定Y、薄墙/角落/足迹、截断分数清除及反向离墙。客户端验证loading/empty/error/submitting/unknown/stale/active/frozen、原pending重开、完整hash与版本再检查、迟到旧generation、32离散溢出、1秒冻结、明确拒绝后新证明纠正。

## 实际UTF-8预算

| 场景 | request | response | O | CP头 | CP块 | 公开页 | H |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 演示移动 | — | 521 | 963 | 1359 | 2065 / 2305 | — | 4167 |
| 32个有序不支持技能 | 2493 | 2681 | 3123 | 1362 | 按真实两在用块 | 2727 | — |

限制：请求/O16KiB、回复/公开页32KiB、头16KiB、每块80KiB。32离散输入均返回明确拒绝，无技能已就绪声明；没有回传整CP。当前两在用块只变化role时写1块，scene块revision/hash保留；头/H/O预算在实际服务提交路径校验。

## ST11-02交接与剩余范围

复用`shared/src/movement-kernel.ts`的MovementConfig/MovementState/advanceMovement（每tick10ms，固定分母100000，单位milli-design-pixel），`ChallengeContent.movement`与payload+完整config规范摘要。保留逻辑毫秒亚tick余数，不复用旧positionRemainder。真实执行入口集中于ChallengeService.submitMovement；后续可引入battle kernel，但必须保留两阶段完整重验、A/H/CP/O原子性与当前公共证明。当前scene schema1/role3仅移动，后续动作扩展须严格升版本；公开movement记录必须随stateHash与恢复证明一起维护。当前actionResultsRef指小型原O，未来大动作结果可按已批准预算扩展有界结果，不把完整CP塞入O。当前攻击/技能/item/trinket是按序ACTION_NOT_SUPPORTED，后续逐能力开放；无攻击随机抽取，不能把本片无奖励训练profile发布为正式首本收益域。

本片本地行为/纯类型已验。Cocos真实构建沿此前拒绝未重试；未跑GUI/浏览器/微信真机/云SDK、时延/费用、完整战斗效果/快照最大并发和ST12～16。没有安装依赖、创建Jira、push/MR或部署。最终独立两轴评审由父任务在后续frontier完成后组织；本报告不代替独立评审。
