# ST11-03 实施与验证

2026-10-25。工作树`.worktrees/st11-03-cross`，分支`feat/st11-03-cross`，基线及提交前集成tip为`287e72c0cc431c7cb7b8e5771c3538144f40c63b`。批准spec/03 ticket/task-plan只读。未调用Jira、push/MR、安装、云资源、GUI或Cocos构建；当前能力为明确无奖励训练，正式奖励/经验消费者仍阻断正式入口。

## 已交付

真实ST04/ST05/ST10准备、激活、ready后同一simulation.submit执行十字斩。先验证MP/CD/控制及等级条件，再取消普攻；同tick保留输入seq顺序。近身与已释放投射两独立节点，投射扫掠/逐目标去重、各次hit/crit独立。直接与流血总预算分别按权重分摊，未中份额不补其他节点；独立流血叠加、攻端快照、实时防端、每跳独立crit且不重hit，DOT不积倒地。MP回复在输入边界结算，旧自然回复分数保留。

严格schema2 local-test-cross profile及SHA摘要绑定，没有生产默认值。scene3、压缩snapshot池/效果行、ordinal2..7按需块、完整公开crossAction/crossEffect分页、客户端独立显示预测和最新proof纠正已接入。公开冻结x/y/facing/haste保留，私有攻击参数/seed/cursor不公开。恢复冻结逻辑；换房清残留且保留CD/HPMP/回复余数。已分配空效果块保留到换场景，hash不变不写，块修订单调。

新增schema2战斗私有流使用AES-CTR绝对cursor抽样（不同于旧schema1 HMAC）；cursor与普攻共用并随CP原子提交，不随客户端/operationId变化。按现有残留、未完cast及本片输入保守预取样本，故障和OCC不重抽。旧basic-only profile/移动/加载恢复协议兼容。

## 红绿及可重复证据

首个公开服务RED：显式cross profile不能激活；补严格新能力、scene3及接入后GREEN。公开恢复最初删除全部snapshot，独立测试RED暴露移动/haste变化会改变旧投射原点；改为仅公开冻结空间/时序后GREEN。算术预检发现两节点重复整招直接伤害，加入强制damage.nodeWeights并修正已知101预算33/68，末段承余数；直接累计101、流血101、总伤202，逐段未中不补伤。

```bash
node --test shared/test/cross-combat.test.mjs backend/test/cross-submit.test.mjs backend/test/cross-client.test.mjs
node backend/test/fixtures/cross-demo.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```

聚焦18项通过：纯核9、真实服务7、客户端2。纯核遍历全部129切点，非整除3/2急速、封顶2、独立叠加/随机cursor、101分配与固定跳数、实时防御一次减伤、DOT不倒地、免疫/hit失败/独立crit、公有态篡改拒绝、释放后改变位置/haste仍保持旧轨迹。8目标纯核的显式高并发fixture持续100次施放（CD100000us、两倍急速、1跳/1400000us），最终224个独立流血并存，直接总额每目标10000；该8靶fixture是纯规则域，未冒充E01真实入口5靶。

真实服务测试覆盖低蓝不取消普攻、后续移动意图；合法技能扣MP并取消；效果第一次分配第3块；所有实际8个写点（角色/场景/效果块/结果页/A/H/header/O）逐点故障整笔回滚后原意图可重试；已提交丢回包通过原O及完整结果页恢复，CP/cursor不变；竞争同基线候选只提交一次；短暂停止/resumePrepare/ready保留完整效果/快照，旧timeline拒绝；非零MP自然回复3内部单位/秒，起手边界34→35时刻整段/切片同接受、片尾MP2、分数完全一致；压缩往返及未知字段/重复效果拒绝；效果结束后空块保留并在再次无变化时不增加修订。

真实客户端使用LoadingCoordinator资源验证、durable pending、独立显示属性/随机数、MovementCoordinator技能预测；丢响应重开读取原O+全部typed动作页，完整当前公开proof纠正后再预测。已释放投射在当前显示位置9999/9999、反向及2倍haste输入下仍恢复原x/y、面向及1倍冻结haste。未显式提供当前技能显示等级/控制时拒绝开启cross预测。

最终全量日志`/tmp/st11-03-final-check.log`：7/7阶段通过，tooling7、shared141、backend517实际执行项；既有客户端模型/UI模型与共享/后端/纯客户端类型通过。已安装Node24.9.0、TypeScript5.8.2，无新安装。日志执行项含既有重复fixture测试，不等于517个独立新增用例。

## 字节实测与包络

真实5目标入口、1倍急速、片段25ticks、6效果/1去重snapshot：header1480B、原O952B、role完整块2289B、scene完整块3912B、效果完整块797B；demo小型simulation回复513B、公开proof6178B。所有数字为UTF-8 JSON字节。每效果行≤128B、snapshot≤192B逐行守卫，完整chunk≤80KiB/header≤16KiB/O≤16KiB，result/public page≤32KiB沿原严格编解码。header最多8引用且读所有块/hash；小型回复不含CP，完整动作结果沿原有界分页不截断。

当前fixture首次增长到3块，实际完整效果域最大8块/640KiB、3648效果/228快照及四技能混合图归ST11-06的发布后验；本报告没有把单技能fixture声明为全部上界已通过。profile目前以寿命/CD保守限制并发，超紧凑行上限/块预算/结果页数的计算会在提交前拒绝，不能丢弃已处理反馈。正式发布器还需按最终可达混合图验证，而不能仅靠运行时守卫。

## ST11-04/05 交接

- `backend/test/fixtures/cross-fixture.mjs`提供真实ST10/ST05入口及显式CROSS_CONFIG；其roleFixture只为可信测试初始化/迁移，不是公开命令。不要导入.test文件作夹具。
- `shared/src/cross-combat-kernel.ts`是纯技能模块；`cross-simulation.ts`按每tick、seq将cross技能与basic交错，接受后才清basic。它是下个技能接入的明确位置，不必重写旧三段规则。
- `basic-training.ts`继续严格版本profile。新能力请显式新版本/字段并hash绑定，保留现有schema1/2；currentBasicStats与currentSkillMastery读取当前装备。跨级测试可在合法level1训练进入后，通过可信成长fixture修改真实C，不能放宽E01 level1发布/prepare校验。
- `cross-checkpoint.ts`紧凑codec可复用布局思路，但当前tag只认projectile0/bleed1；下一技能必须新严格版本/tag并同步scene/parser/proof，不能把新效果塞旧数组后默默忽略。snapshot池按完整行去重，效果块局部controller不携带活跃cursor，保持change-only。
- `room-checkpoint.ts`已支持读取全部activeChunks和按需效果块；shared scene-v2公开crossAction只含空effects，crossEffect每record一个且连续index，客户端合并后再restore。新技能沿同一完整hash/当前proof和typed result pages扩展，不公开权威随机/攻击快照。
- 四技能混合图、统一扩展schema与最大预算由06收口。04/05需协调共用profile/service/CP/client文件，避免各自覆盖新版本。

尚无怪物AI/ST12、药物/饰品ST13、复活ST14、正式XP/奖励ST15；Cocos场景构建、浏览器/真机、云SDK事务/时延/计费未执行。此前构建拒绝仍有效；本报告不以类型检查替代构建或用户试玩。
