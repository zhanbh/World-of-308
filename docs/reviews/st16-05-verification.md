# ST16-05 联合验收实施证据

2026-11-01，实施基线 `af2011aa02384eed09dbbd9d05ba5973e9ebd9f5`，分支 `feat/st16-05-joint-acceptance`。来源为已接受ST16 spec及05任务；冻结正文/任务图未改，README和execution由根会话维护。本文是05实施证据；最终全7阶段和固定提交的两轴独立评审由根会话另附，不能以本文代替。

## 联合链与修复

`joint-recovery-acceptance.test.mjs` 第一链使用真实monsterFixture：从合法ready状态经真实AI提交造成HP损失，而非注入受伤CP；同片HP药与cross技能经真实服务成功后丢响应。生命周期hide查询原O，再冻结/prepare/完整资源证明/ready/当前证明/show。恢复前后完整CP role、scene相等，包含药品CD、MP、技能尾效、怪物阶段/控制、回复余数；背包3瓶变2瓶且恢复不再扣，唯一simulation提交和唯一operation.get，确认前沿不退、timeline换代。此为本地测试内容内自然执行历史，不等于正式发布内容包络。补给满足“药品或饰品”的药品分支；不冒称验证了非空饰品buff。

第二链从真实Boss击杀得到completed/looting、固定clearReceipt和真实地面来源，drop.collect成功丢响应→hide/show恢复→challenge.leave成功丢响应→hide查询原O。装备/材料消费者、背包、已完成结果、固定回执及历史结果包保持，collect及leave各实际一次。恢复不迁移或重写历史结果，不撤已确认收益。

该联合链复现此前未覆盖的RED：leave原O已查到committed且pending已清，但随后closed控制触发生命周期再次freeze，Terminal.freeze无条件清fadeReady，导致已确认离场动画丢失。最小修复仅保留无pending且已closed的既有fade；未知/非closed仍清fade，显式LootScene.close/Terminal.close继续清旧fade。没有放宽新业务写、恢复截止或旧场景续关资格。联合链GREEN且独立原O、迟包、生命周期相关回归31项通过。

另更正04类型验证：04历史`st16-04-model-types.log`实际含两个缺seq的TS2345，并非通过；保留历史日志不覆盖。05为恢复后的basic释放/move0补上按acceptedSeq排列的seq，Movement仍沿原submit规则编排真实输入，不改变接口/协议。05实际models类型检查exit0，见`st16-05-types.log`；不能以04先前汇报覆盖这个修复事实。

## AC覆盖矩阵

| 验收 | 实际证据 | 覆盖边界 |
| --- | --- | --- |
| AC16-1 | 新联合药品/地面/终局链；unknown-recovery-barrier真实装备notFound后旧写/恢复OCC两序；本次每实际恢复写点回滚 | 原O/资产守恒，恢复不改历史包 |
| AC16-2 | loading-recovery-v2的ready截止−1/等于/+1、静默租约、心跳重放与登录接管；dead-looting-recovery原deathDeadline；新容量控制写点 | 原10秒不延期，重登入旅店沿真实LoginService旧测试，不冒称UI导航 |
| AC16-3 | active-combat-recovery恢复纵切；新小CP/8CP完整客户端交接；cocos-lifecycle已提交ready丢响应 | 资源/有序证明/ready及最终当前证明，三轮公开状态读取分别计量 |
| AC16-4 | 新AI+cross+药品CD完整CP相等；public-state-proof缺失/篡改/乱序摘要反例；client-ready-proof及loading-coordinator-v2既有资源/摘要验证；8CP全115页实际验证并重建Movement | 小历史与合成容量分列，私有CP不作为客户端恢复源 |
| AC16-5 | dead-looting-recovery及boss-death-tail真实尾伤、死亡/终局与原截止；新completed掉落/终局丢响应链 | dead无新动作，looting合法拾取，expiry保留成功 |
| AC16-6 | active-combat-recovery 100/1900/2000ms及1秒预测上界；loading-recovery-v2首次ready/心跳/加载；looting2200ms真实移动 | 活动战斗缺口与加载/looting分别判断 |
| AC16-7 | unknown-recovery-barrier各参与者原结果/迟包/close/rebind；新实际生命周期同药品/掉落/leave | 唯一消费者，原请求不换ID，旧代次回调退役 |
| AC16-8 | cocos-lifecycle-recovery真实transport适配、两种fetch预览、销毁/重attach、固定本地UI10秒和准确提示；04根会话离线构建 | 没有浏览器/手机/真实网络事件验收 |

既有用例是覆盖来源，最终由根全7阶段统一复跑；本片未为了测试计数复制相同deadline/OCC矩阵。08项不是以“多少测试”代替合同。

## 实际写点与容量计量

`recoveryMeter`包裹真实MemoryStore事务，R/W为唯一键数，getCalls/setCalls为实际调用次数（同键重复读取也计数），calls为两者之和，bytes为最终各写值JSON UTF-8总和。计量不含fixture初始化；不推导云SDK/费用。详细读键类别调用次数见`st16-05-small-trace.log`；所有调用及具体writeKeys见joint日志。

每个suspend、prepare、ready在两个域各有实际3次set（CP header、account、challenge H），均逐点injectWriteFailure(1..3)，断言SERVICE_UNAVAILABLE且整个Map逐值不变，共18个实际故障点。恢复无新服务写点；不得写CP chunk或combatResults历史包，测试对写键作断言。既有loading-recovery-v2覆盖heartbeat/expire等原控制写点及成功丢响应，不再复制旧ST15的62写点长循环。

| 域/控制 | 唯一R/W | get/set实际调用 | 总调用 | 写UTF-8 B | H B | CP header B |
| --- | --- | --- | --- | --- | --- | --- |
| 小CP suspend | 8/3 | 17/3 | 20 | 7257 | 5155 | 1363 |
| 小CP prepare | 8/3 | 13/3 | 16 | 8797 | 6695 | 1363 |
| 小CP ready | 8/3 | 13/3 | 16 | 9367 | 7268 | 1360 |
| 合成8CP suspend | 14/3 | 35/3 | 38 | 7983 | 5155 | 2089 |
| 合成8CP prepare | 14/3 | 25/3 | 28 | 9523 | 6695 | 2089 |
| 合成8CP ready | 14/3 | 25/3 | 28 | 10093 | 7268 | 2086 |

suspend比prepare/ready多一次完整冻结前沿读取：小CP多4次get（header重复核对+两chunk），8CP多10次get（header重复核对+八chunk）；唯一R不变。不把20/38误写成唯一读数。每控制响应≤1072B；readyTicket318B。CP chunk≤81920B、总≤655360B，H≤131072B、header≤16384B、每公开页≤32768B均有实际断言。

小CP来自真实cross/怪物片段，2块CP合计8362B，最大5913B，公开证明1页6327B。合成8块直接使用`maximumWarriorCheckpoint`注入3648条跨三个lane效果及最大数值快照，不是自然积累，也不是任意高熵发布域；8块CP合计323163B、最大48752B。实际公开证明115页，合计1689326B，最大14894B。完整客户端恢复每次prepare读一轮、ready验证再读一轮、Movement当前证明再读一轮：小CP3页，合成8CP345页，分别约18.99KB与5.07MB。每个显式恢复没有无界轮询，最多3×256公开页；队列恢复中立输入2项、未决输入0项。资源由既有Loading真实解析器逐项验证，解析不经rpc；不混计为scene.recoveryPage。

完整恢复RPC除公开页外为：scene.suspend/resumePrepare/ready各1，scene.status共5（工厂取得当前lease3、既有恢复复核2），challenge.get3、drop.list1，共固定12次；因此小CP15、8CP357次。该115页域在本机需要明显CPU/解析时间，固定可注入时钟仅验证逻辑截止，不能证明真机在10秒内加载或云端成本达标。正式网络/设备预算仍GAP，不能把有限调用误当足够快。

## 执行及保留GAP

使用已安装Node24.9.0、Creator附带TypeScript5.8.2，未安装依赖。`st16-05-joint-tests.log`为四个联合/容量测试（每个包含具体原子故障点）；`st16-05-focused-tests.log`为最后补充显式scene.close清fade断言的两条联合链；`st16-05-related-tests.log`为31项真实相关回归；`st16-05-types.log`为models实际类型通过；`st16-05-client-model.log`为已有客户端模型/Prototype语法转译通过。所有命令单独检查实际exit，不以最后一个命令成功替代前项。

未启动浏览器、真机、云SDK、安装、Jira、push或外部发布。04离线构建由根会话按准确源码记录；本片纯状态/输入seq修复仍需根最终类型及全7阶段闭合。正式身份登录/旅店UI接线、HTTP真实弱网、手机前后台及触控、真实SDK事务/压缩运行时/费用、任意高熵1024页结果与正式最大内容发布包络仍为独立GAP。全7/两轴评审的最终事实由根会话追加链接，本文不提前填PASS。
