# ST11-06 实施与验证

2026-10-25，工作树`.worktrees/st11-06-earth`、分支`feat/st11-06-earth`，基线`df3d40bf870ed6c3b3b563bf9ef149b2e8915b52`。Accepted spec/ticket正文未改。使用soflow build/implement-spec/TDD；独立codec helper仅拥有CP模块/纯codec测试，主实现拥有完整技能/服务/客户端。本地文档记录，无Jira、push、安装、云、GUI或Cocos构建。

## 交付和RED/GREEN

新增profile5/scene6、大崩4节点、20级当前成长门槛、MP/CD及动作恢复；首拍实际合法落点产生独立ground，其后三爆保留原攻击快照，死/控只取消未生成施放。扫掠复用足迹、墙和边界；薄墙测试实际x90，后续地面来源x90。首拍倒地至本次效果结束，后爆不延长；控制免疫仍伤害/流血，目标死清其流血，换房全部效果隔离。

第一纯核RED为earth模块缺失，GREEN四节点/101直接+101流血守恒。第一真实服务RED为未表达scene6的CONFIG_NOT_READY，接入严格profile/CP/公开wire后GREEN。Cross-only受控角色仍能重启basic的实际服务回归RED，修复纯核取消和编排basic/移动锁后GREEN。其余新增回归中有直接绿的检查，不伪称每项均观察RED。发现并修复子调度器有理候选未约分、投射物hit数组codec旧类型错误；后续验证保持。

四技能统一有理候选顺序处理，再应用共享私有RNG/死亡/目标状态，不能仅输出sort。投射物接触保持固定10ms边界；输入按seq处理、合法拒绝不取消basic。控制状态不由片段末尾idle隐式清除，外部权威起身由ST12接续。私有AES-CTR按seed/绝对cursor出有界批次；客户端使用独立显示随机域。

## 实际验证

`node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`，最终日志`/tmp/st11-06-final-check.log`，7/7阶段通过；tooling7/shared161/backend561实际执行项（包含历史fixture重复执行）。随后新增大结果页故障及免疫/纯核控制修复的独立聚焦结果见`/tmp/st11-06-page-fault.log`、`/tmp/st11-06-kernel-final.log`，最终稳定复跑日志`/tmp/st11-06-release-check.log`为7/7、tooling7/shared162/backend562；随后仅新增当前破损武器回归独立通过`/tmp/st11-06-weapon.log`，代码未再修改。

纯核每99个earth分割点、四技能+basic每149个分割点，以及30/60/120输入渲染节奏，对完整movement、HP/MP、CD、快照、效果、预算、事件ID及RNG cursor完全一致；有理急速3/2及上限2，控制前后落地、攻击属性变化、实时防御/免疫/死亡均验证。真实服务使用Login/Character/Town/ST05装备/ST10prepare/activate/ready；E01入口仍1级，可信后入场成长fixture20级明确不冒充ST15成长服务。当前破损武器由可信磨损夹具设0耐久后读取实时装备聚合AP0，已释放earth保持旧AP1000，下次合法cast快照AP0；未将磨损夹具声称成ST12动态磨损服务。低蓝/锁等级/同tick技能拒绝、非零MP回复整片/切片、恢复旧timeline拒绝、新timeline继续、换房清尾伤保留CD/资源、同CP两候选仅一笔、丢回复原O查询/重放不重采样均通过。

普通earth实例全部8个实际写点逐点故障回滚后原意图重试。额外大结果压力原结果页首/中/末写点3/181/359故障，完整存储逐字不变，重试保留全部11400结果；未声称逐一执行357个压力page故障。已有真实接管/序号/前沿/身份/暂停回归随全量保持。正式云SDK对357页事务的操作数/大小/费用仍未验证，不能宣称上线可用。

客户端demo：`node backend/test/fixtures/earth-demo.mjs`，日志`/tmp/st11-06-demo.log`。合法资源→完整证明→预测，提交丢回复unknown，重开同pending查询原结果并active；预测/确认x-177000/y20000，acceptedTick26、MP99990、1次earth、11存续效果（含ground）、3块、21结果/15damage。公开旧响应代次保护沿现有协调器；新earthAction/effect严格绑定。显示攻击属性不作为权威事实。

## 实测CP/公开页/结果域

稳定608槽×6效果块、role/scene核心块，空槽复用、不重排后块、无用尾块释放；不变hash保持revision。numeric uint32有理对解决原合法215B快照，旧decimal字符串codec兼容。严格反解拒重复身份/引用缺失/非法分数/ordinal/hash/scene版本篡改。

实际3648战士分配域/228独立快照完整CP往返：header2083B，chunks约[2288,46904,45255,45399,45255,45399,45255,45399]B，总321154B；全部完整外层UTF8计入，每块<81920/header<16384/总<655360。效果128B、快照192B合法极值均实际测量。另有2736玩家+912未来怪物预留行/228快照严格编码组合，ST12 AI未实现；分配域夹具不是可达游戏轨迹。

真实服务完整3648公开效果证明：115页、总1679956B、最大14797B，完整组装hash验证，未下发私有攻击快照/seed/cursor；新页上限256，动态24KiB记录载荷/32records，旧profile保留64records兼容。原结果上限1024页/32768结果，严格页号/metadata且≤32KiB；无静默截断。分配压力2280存续bleed×5跳=11400damage，实际357结果页、cursor11400，原查询全部取回，单次本地submission约4620ms。该压力是合法编码域负载，未宣称正常游玩会达此并发。

## 性能与GAP

`node backend/tools/benchmark-warrior.mjs`可重复，日志`/tmp/st11-06-benchmark.log`；Node24.9.0/darwin-arm64/Apple M4，2 warmup/5 samples。最大分配域codec123.34～194.00ms、均149.40ms；合法实际四技能100tick、急速2、各1次cast/250events，74.65～93.52ms、均83.82ms。以上为本地共享核/编码，不是网络/微信帧时/云SDK费用；大证明读取约20.6s本地压力，未宣称端到端时延合格。

发布检查联合取消图：效果型技能恢复/2至少120ms，basic立即取消不会产生第二个技能起手；CD重置不越过动作恢复。最慢配置急速下末直接≤4s、最多5跳/5s、独立尾伤≤9s；76施放保守预算2432流血+304脱离+912预留/228快照，不新增运行时节流。Formal奖励/怪物AI/道具/复活/XP掉落仍ST12～15；Cocos构建/浏览器/真机/云SDK均GAP。最终两轴独立review及SHA合并证据由root另记，不由实现者自证review通过。
