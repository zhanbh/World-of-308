# ST12-01 本地验证

日期：2026-10-26。分支`feat/st12-01-melee`；初始基点`41e9ef8`，交付前已快进合入集成`08be54e`。本记录为实施者证据，独立merger复核尚待执行，不代表整包ST12/平台/设备验收。

只读来源：spec accepted_revision `26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7`；ST12-01 accepted_revision `62be806566077548f9dc3a78e665dd9cb5fd90dcb5712d2c111ee3fcf9865f11`。未修改spec/票据正文；三个seam沿已批准联合内核、真实服务/MemoryStore、真实客户端传输/恢复。

## 实际交付

显式无奖励profile6与scene7：模板/类型、spawn身份、技能引用、行为、奖励标签及四项抗性独立；近战追击、锁向起手、真实HP与控制、死亡/控制取消未来节点而不返CD。AI runtime进入原CP及公开proof，客户端可恢复runtime、玩家控制/HP和原事件。旧profile1～5原字段严格兼容；未进入02～06的远程/房间清场/Boss/Cocos构建。详细字段及预算见[近战合同](../backend/monster-melee-combat-contract-v1.md)。

## 红绿证据

1. 联合接口初次测试缺模块RED；实现后5怪tick2命中，玩家HP1000→500，同tick普攻拒绝，整段/切片一致GREEN。
2. 真实开房profile6最初激活失败RED；加入scene7完整compact存储、公开runtime/proof、真实service后HP1000000→999500 GREEN。
3. 客户端原无monsters状态RED；增加真实公开恢复，丢响应后重新实例化读取原操作结果和权威runtime/HP GREEN。
4. 防端测试原裸伤害500→期望815失败；实时有理护甲/减伤组合后GREEN。随后增加AP1×3/2×(1-1/3)样例，起手提前floor导致1000而非995 RED；改冻结有理预算到末次floor后GREEN。
5. 旧整批controlled导致受控到期后新技能消失RED；joint动态控制替代该路径整批布尔后GREEN。
6. 同刻过杀原只产生1个敌伤害，要求完整5个到期集合RED；保留全部到期伤害且死亡一次后GREEN。同刻技能击退不能把已到期敌命中挪出范围；冻结节点位置后GREEN。
7. 11.2tick技能僵直原未取消12tick敌命中RED；每个有理玩家节点后立即处理控制，再收整数边界到期集合后GREEN。

其他回归：逆序actor、任意切片、逐tick追击（不提前预支50ms路程）、普通伤害不打断/击倒打断且CD不退、类型默认及个体覆盖、500ms起手下界、未知/客户端注入AI数据拒绝、digest/同键异参保护。

## 实际命令与结果

本机Node **24.22.1**，TypeScript **5.8.2**，复用既有Creator安装，无下载。PowerShell命令：

```powershell
$node = 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $node --test --test-isolation=none shared/test/monster-joint.test.mjs backend/test/monster-submit.test.mjs backend/test/monster-client.test.mjs
& $node tools/check-all.cjs --typescript 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
& $node backend/test/fixtures/monster-demo.mjs
```

新增专项最终 **16/16**：joint12、service3、client1。7个真实写点逐个失败，完整store快照不变，重试/原结果稳定；不同operation并发仅一胜。使用的fault是真MemoryStore事务注入，不是假业务handler。

最终全量 **7/7**，tooling7、shared174、backend harness572；保留旧测试。完整输出[最终日志](st12-01-final-check-all.log)；[首轮日志](st12-01-check-all.log)是当时shared168/backend571的中间快照，不代表最终新增测试数。统一入口默认sandbox曾spawn EPERM，按本地测试权限重跑成功；Node直接导入Creator package的MODULE_TYPELESS警告仍是既有现象。日志末句“v2不覆盖”是当时工具旧文案，后合入08be54e已改为部分v2覆盖；不将旧文案当成业务未运行的事实。

演示真实开房/提交/公开proof：5怪，HP999500，敌伤害事件5，checkpointRevision2，公开1页/5788 UTF-8 bytes，原操作replay=true。透明计数代理只包裹真实MemoryStore：baseline R12/W0、commit R12/W7，没有新增每怪数据库记录。这是本样例预算；最大8怪+912效果与SDK费用仍是06/平台GAP。

## 限制

本地候选敌技能为确定命中、非暴击近战，AP系数/防端K与控制时长不是正式平衡参数。角色HP0/dead阻止后续动作与自然回复，挑战级死亡/复活完整生命周期由ST14承接；奖励由ST15承接。未安装SDK、未云操作、未推送/部署、未构建Cocos或验收微信/Note20 Ultra。客户端预测可修正，最终伤害与私有随机仍服务端权威。
