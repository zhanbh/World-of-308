# ST11-04 实施与验证

2026-10-25。分支`feat/st11-04-bengshan`，工作树`.worktrees/st11-04-bengshan`，基线及收口时集成tip为`080e81b5ad993b2128f9ab2a81ec876838bcb07f`。本报告及代码由04实施者完成，合并者须独立验证并另记实际SHA。本次从保留的未提交04实现继续，没有reset/替换既有进展；批准spec/ticket只读，未调用Jira、push、安装、云/GUI或Cocos构建。

## 已交付

真实Login/Character/Town/ST05初始装备、ST10 prepare/activate/ready之后，同一simulation.submit执行崩山击三节点。新显式无奖励profile schema3/scene4保留basic/cross，独立bengshan严格lane；角色/当前装备与等级读取、原子MP/CD、资源边界回复、命中暴击及私有cursor接入真实权威片段。正式收益入口仍因缺XP/奖励原子消费者而阻断。

位移按冻结施放有理时序推进，逐10ms复用方形足迹/边界/薄墙全路径扫掠；真实合法地面位置决定节点命中，不用画面跳高规避。直接和流血各分配一次总预算、独立三份/三节点，未中不补；终段特殊击倒，前两段沿普通直接累计，DOT不积倒地，已有倒地不缩短，死亡优先。中断清后续位移与未生成节点，已释放流血保留。

严格紧凑bengshan-v2 codec，schema2 skillEffects双lane按需CP块，完整typed公开bengshanAction/effect及hash/proof；独立display预测、durable原意图、丢回复后原O/完整动作页及新CP证明纠正。恢复冻结并保留cast/效果/随机游标，旧timeline拒绝；换房重建2核心块、清残留但保留CD/HPMP/回复余数。

## 测试与实际结果

```bash
node --test shared/test/bengshan-combat.test.mjs backend/test/bengshan-submit.test.mjs backend/test/bengshan-client.test.mjs
node backend/test/fixtures/bengshan-demo.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```

聚焦18项通过（纯核7、真实服务10、客户端1），日志`/tmp/st11-04-focused.log`。纯规则101均权33/33/35直接及独立流血守恒，总伤202；三节点18次直接/DOT事件，终段才产生特殊倒地。薄墙正/负朝向、方形足迹角落、任意59切点分别在急速3/2、2、3（封顶2）下状态/事件/MP一致。攻端/急速冻结，实时防端一次减伤；霸体免控、已有倒地不缩短、死亡不再起身及已释放流血不随中断丢失。

恢复后新增的一次明确RED暴露：崩山被控制取消后，同片basic仍能起手且普通移动未锁。GREEN在新profile3编排层清未生成basic、拒绝控制中basic并锁普通位移；保留已释放技能效果与后续移动意图。对应保留负测`player control interrupts remaining leap...`。其余恢复后新增覆盖先跑即通过，未把回归覆盖冒称为已观察到RED。

服务验收包括：当前C未到5级拒绝且无消耗；合法1级训练入场后可信成长fixture升5级，未放宽E01入口/prepare等级校验。低蓝不取消普攻且后续移动仍处理；接受才取消并扣10内部MP。所有实际8写点故障整笔回滚、同意图重试及原结果重放；两个相同CP候选仅一笔提交；丢回复通过原O/全部动作页恢复且CP/cursor不变。3内部单位/秒回复在输入34→35边界整段/切片接受与分数一致。短暂停止/恢复保留完整CP，旧timeline拒绝，新timeline继续同游标。

真实服务薄墙夹具（摘要绑定显式movement配置，重建服务，非生产默认）终点准确停在`wall.minX-footprint`，公开actor同位置。真实cross→bengshan组合同时保留两lane效果，完整proof效果计数一致。换房测试使用标注的可信已清房外部fixture（ST15尚未实现），实际prepare/activate新房后只留2核心块、cast/效果清空、CD及MP/分数保留、旧场景候选不能提交；未将该fixture冒充真实通关/收益消费者。

客户端通过真实资源验证和新公开证明开启预测；预测位移与确认位置一致。丢回复重开后恢复全部16动作事件和10个流血效果，冻结haste/面向不受显示属性改变影响。demo输出unknown→active，acceptedTick26，MP99990，地面x0/y20000，3块，公开第一页7868B。

最终全量日志`/tmp/st11-04-final-check.log`：7/7阶段通过，tooling7、shared148、backend528实际执行项，已有客户端模型/UI模型和共享/后端/纯客户端类型全部通过。Node24.9.0、已安装TypeScript5.8.2；既有fixture重复执行包含在统计内，不等于新增独立测试数。`git diff --check`通过。

## 包络与后续交接

真实5目标入口、25tick fixture测UTF-8：header1480B、O952B、role块2338B、scene块4015B、效果块997B，10效果/1去重snapshot。effect≤128B/snapshot≤192B、chunk≤80KiB/header≤16KiB/O≤16KiB/public与结果page≤32KiB逐项守卫。反解未知字段/重复效果拒绝，已分配空块保留且无变化修订稳定。当前数据是04实例，不是3648效果/228快照/最终四技能混合图上界证明；06收口发布后验。

05接入指针：`bengshan-simulation.ts`接管basic/cross/bengshan顺序与随机cursor；`basic-training.ts`新增严格schema3；`room-checkpoint.ts`scene4和skillEffects schema2双lane；`MovementCoordinator.ts`独立confirmedBengshan与完整proof恢复。新拔刀能力请显式版本扩展这些共同文件，不能覆盖03/04字段/严格旧版本兼容。`bengshan-fixture.mjs`提供真实服务+可信成长/CP测试迁移，`bengshan-client-fixture.mjs`提供真实durable客户端；不得导入.test作fixture。

已知待06/最终review集中核对：旧`shared/src/cross-simulation.ts`的cross-only schema2编排也有“controlled只约束skill而未统一拒绝basic/锁普通位移”的同模式代码；本次新增负测已保护schema3新编排，未扩张重构旧编排。06统一四技能图时应复用该负测输入到cross-only分支并修复，不能将此疑点当成已验证无问题。

ST12怪物AI/施法霸体动态接线、ST13道具、ST14复活、ST15经验奖励仍未实现。Cocos构建/浏览器/微信真机、云SDK事务、实际延迟费用未执行；此前构建拒绝仍有效。没有推送。
