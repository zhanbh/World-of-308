# ST11-05 实施与验证

2026-10-25。工作树`.worktrees/st11-05-badao`，分支`feat/st11-05-badao`；开始及收口复核集成基线`60a8933949ed2b4521a989fa1940f5e91c6b4881`。保留并接续已有纯核/codec四文件，没有重做、reset或覆盖进展。用户批准spec/ticket保持只读；未调用Jira、push、安装、云、GUI或Cocos构建。

## 交付与TDD

严格无奖励combat profile4/scene5保留basic/cross/bengshan并新增badao；真实Login/Character/Town/ST05初始装备/ST10 prepare→activate→ready后沿simulation.submit执行。10级解锁、每2级成长从当前角色读取，E01仍严格1级入口；测试在合法入场后由可信成长fixture升10级，未冒充ST15成长服务。当前装备/AP/精通参与冻结快照，资源按每tick边界回复后检查MP/CD/动作/控制。仅接受才取消普攻，失败仍处理后续输入。

宽幅前向单节点，稳定目标排序，近远各独立命中/暴击，一次直接预算；无持续扩散波。流血独立实例/预算、逐跳独立暴击、实时一次防御、尾跳余量，DOT不累计倒地，死亡优先。共享10ms有理时序、急速封顶2，右端节点留到下片。控制中断取消尚未生成节点并锁basic/普通移动，已生成流血继续。同tick先接受的技能阻止另两技能抢占。

首次新增服务RED：profile4未识别导致实际activate拒绝、fixture未取得readyTicket；GREEN扩展严格配置/CP/协议及权威执行，真实拔刀接受。首次客户端RED：预测未提供badao状态，读castSequence失败；GREEN接入完整新证明、独立显示随机域预测、持久原意图与原操作结果恢复。已有8纯核/1codec测试接续保持；其余新增回归运行即绿，未伪称所有测试都观察到RED。

## 实际测试与demo

```bash
node --test shared/test/badao-combat.test.mjs backend/test/badao-checkpoint.test.mjs backend/test/badao-submit.test.mjs backend/test/badao-client.test.mjs
node backend/test/fixtures/badao-demo.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```

聚焦初轮19/19通过，随后2项控制/同tick技能顺序回归通过（服务11/11）；最终全量实际包含全部21个05测试。最终日志`/tmp/st11-05-final-check.log`，7/7阶段通过，tooling7、shared156、backend541实际执行项；既有fixture重复执行包含在数量内，不等于独立新增测试数。Node24.9.0/已安装TypeScript5.8.2，共享/后端/纯客户端模型类型及既有模型/UI回归通过。`git diff --check`通过。未运行Cocos构建或真机。

纯核验证近远多目标单次击中、范围外不抽样，独立命中后暴击、流血不重抽命中；101总预算/5跳20/20/20/20/21，任意119分割点时序/状态/事件一致；起手AP/位置/面向/急速冻结，实时防御，免疫/死亡/倒地优先与严格字段反解。

真实服务覆盖低蓝不取消basic、当前角色未10级拒绝、接受后取消basic、CD拒绝、cross→badao两lane共存证明、同tick三技能输入顺序、控制锁/已释放流血保留、MP回复34→35边界整片/分片相同且保留余数。实际8写点逐点故障整笔回滚、同意图重试、原操作重放；同CP两个候选只一笔提交。丢回复后operation.get取原O与完整动作页、CP/私有cursor不重采样；恢复后旧timeline拒绝，新timeline继续。换房用标注的可信清房fixture（ST15收益未做），清效果/cast并重建2核心块，CD/MP/回复余数保留。

客户端实际资源验证/完整publicStateHash证明后预测；丢回复状态unknown，重开相同durable pending查询原结果后active，恢复全部6动作事件和5流血，冻结位置/面向/急速不被显示新属性覆盖。原操作/当前CP纠正共有generation/代次保护沿既有协调器回归验证。Demo日志`/tmp/st11-05-demo.log`：acceptedTick26、MP99990、5目标单节点5次直接damage、5流血、3块；预测/确认同地面位置x-180000/y20000。

## 包络和明确GAP

真实UTF8测header1480B、O952B、role2399B、scene4073B、效果块912B，5效果/1去重snapshot；demo公开第一页6086B。effect128B/snapshot192B、块80KiB/header16KiB/O16KiB/public与结果页32KiB均有守卫。未知字段/重复效果拒绝，效果清空后的已分配块无变化修订稳定。严格badaoAction/badaoEffect不公开私有攻击快照或随机seed/cursor，客户端显示随机域独立于服务私有流。

本次实例通过不等于最终混合可达图/3648效果/228快照已验证。继承的350条×6效果块最多2100条并可能重排，合法极值snapshot可达215B与192B守卫冲突，整体可达配置发布上界待06修正/验证；未宣称这些已通过。cross-only旧兼容编排控制锁疑点仍按04交接在06集中修复。ST12怪物动态AI/霸体、ST13道具、ST14复活、ST15成长/掉落/收益未实现；正式有奖励能力缺原子消费者时继续配置/入口阻断。云SDK真实事务、微信设备、浏览器/Cocos构建、网络延迟/费用均未运行。没有推送。

共同合同新增[拔刀斩](../backend/badao-combat-contract-v1.md)，同步字段/API/状态/算术/CP/包络/真相源。提交后由合并者独立验收并记录实际SHA。
