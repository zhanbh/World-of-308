# ST11-02 实施与验证

2026-10-25。工作树`.worktrees/st11-02-basic`，分支`feat/st11-02-basic`；基线/复核集成tip为`c0017eddaf235120b49bb8c0b155b9a2f25227fa`（feat-1.0.0）。只读批准spec、02 ticket及task-plan保持原文；本报告记录实际证据，不修改批准状态。不调用Jira、安装、push/MR、云资源、GUI或Cocos构建。

已实现真实ST10入口/activate/ready后同一simulation.submit链路的三段普攻、按住/松手/缓冲/连段窗口、动作移动解锁、逐目标几何/hit/crit/miss/伤害/倒地/起身/训练死亡，固定步整数与有理原点调度。共享核无Cocos依赖。当前C.level和穿戴装备/耐久/套装参与新起手，旧快照保留；精通不进入普攻，暴击100%及急速2倍封顶，无隐藏最小1伤害。私有scene seed+HMAC按已提交cursor索引，不依赖客户端或operationId；两阶段提交重验完整C、装备、CP和墙钟。

role4/scene2严格CP及公开combatAction/targetControl/current proof已接入，保留role1/2/3、scene1兼容与ST10加载/恢复/handoff。初始ready即绑定combat profile摘要；公开动作带冻结面向和原始调度，省略私有seed/cursor/概率/攻击快照。客户端显式本地profile+独立display stats/RNG预测、持久pending、未知先读原O、分页完整动作反馈后用最新公开proof纠正；旧代次/回包/readyhash不能开启预测。换房清新场景动作/移动意图并保留当前HP/MP/CD/回复余数。

## 实际红绿循环

- 首个公开服务测试在未实现门禁时RED：声明rewarding combat的basic仍committed，预期CONFIG_NOT_READY失败。加入严格无奖励能力/入口与执行门禁后GREEN。
- 初始客户端RED COMBAT_CONFIG_MISMATCH，暴露ready未初始化动作摘要；修复activate初始role4+combat后GREEN。
- exact-boundary release测试RED（castSequence实际2，预期1）；改为[fromTick,toTick)边界、同刻release先处理并延后右边界新动作，GREEN。全切分及渲染调度验证同结果。
- eligible hit失败无反馈测试RED（缺miss），新增独立typed miss结果，GREEN；miss只消耗hit，几何不合格不抽样。

## 可重复命令及结果

```bash
node --test shared/test/basic-combat.test.mjs backend/test/basic-submit.test.mjs backend/test/basic-client.test.mjs
node backend/test/fixtures/basic-demo.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```

聚焦21项通过：纯核9、真实服务9、客户端3。纯核包括所有1..99切点、30/60/120FPS、8靶、3/2非整除急速、负坐标/墙、buffer/超窗重置、冻结攻端/实时防端、稳定目标遍历和独立hit/crit、0伤害、跨招倒地/起身及死亡优先。真实服务通过当前角色/装备变更、当前proof完整hash、严格CP往返/未知字段、候选竞争/OCC真实写冲突、重试墙钟进入recovery、暂停/resumePrepare/ready后保留调度并栅栏旧timeline、接管两种提交顺序、当前新会话R13历史O/动作页读取及旧会话拒绝。

每个新写点故障均整笔回滚（本测试动作域共7写：role/scene/结果页/A/H/header/O；页数增长逐页同笔），随后原意图重试提交。提交丢响应通过精确原O和完整动作页恢复，CP及cursor不变；不得以改operationId重新抽样。既有移动/恢复/加载/资产测试同时回归，未导入其他.test.mjs作夹具。

全量check-all：7/7阶段通过，Node24.9.0、既有本地TypeScript5.8.2；工具合同、共享/后端类型、shared测试、客户端纯模型类型、后端旧版+v2回归、client model/UI model均通过。类型编译器只读取已安装Cocos自带TypeScript，没有启动Cocos构建。

## 字节与上界证据

`backend/test/basic-submit.test.mjs` 的`haste2 training plus32 inputs uses complete bounded pages and compact receipt`实测：5只真实入口靶、2倍急速、1个basic+31个明确技能拒绝，完整67事件、3个结果页；完整请求2485B、回复510B、O952B、header1362B、role数据2317B、scene数据3304B、公开proof页3623B，最大动作结果页7903B（UTF-8 JSON）。代码在写完整chunk时校验80KiB，header/O分别16KiB、回复/页32KiB，公开页也经strict codec校验。O中无seed、snapshot或完整CP；events为空明确由actionResultsRef提供完整结果，未截断处理过的动作。

单技能未实现，合法skill/item/trinket均按原序明确ACTION_NOT_SUPPORTED，结构/上下文/序号/时间错误整片失败。纯核另用8目标实测确定性；上述服务字节是实际5靶训练入口，未虚称正式8靶遭遇/全部效果域已跑过。基本攻击合法最短起手120ms、每次1直接节点、最多8靶、1秒输入段的理论抽样≤9×8×2=144，当前预计算256索引样本足够；结果页32事件/最多64页裕量覆盖该域，不适用于未来任意新技能图。

## ST11-03 接口交接

- `basic-combat-kernel.ts`为已批准纯规则缝，`basic-simulation.ts`共享编排movement与action；03可扩动作节点/释放残留，保持原点有理调度与同刻顺序。
- `ChallengeContent.combat`的严格profile与完整digest需版本化扩展，不向已有profile悄加默认十字数值。当前profile只显式支持basic/no-rewards，基础AP按当前C等级表索引，currentBasicStats沿装备汇总规则；高等级真实入口仍未验证，可在已进入的训练挑战内通过受控真实C成长夹具测试解锁，monsterLevel仍锁定入口1。
- role4携带基础动作；scene2携带私有seed和目标防御/倒地；03必须增量严格schema，不丢弃未知效果。当前readCheckpoint只接收实际role+scene两块，03效果块须同步扩展read/write/hash/public分页及handoff验证，不把额外块忽略。
- 动作结果统一严格事件页；03新增多节点时事件身份必须加节点序号（当前basic每cast仅1节点），保持challenge/scene/cast/target稳定来源。新增结果页写点纳入故障循环。
- public combatAction只公开重建动作所需调度及冻结面向，权威私有抽样不发客户端；display stats/RNG可有秒级偏差，以完整typed结果和当前proof修正。

## 尚未覆盖的能力

正式平衡/发布表、公开manifest新增战斗资源获取、真实高等级入口、AI/ST12、完整技能/ST11-03后续、ST13消耗品/饰品、ST14复活和ST15原子XP/奖励消费者均未交付；训练能力不能发布成正式收益遭遇。当前无正式防御/概率换算表，明确本地模板规则及千分率装备绑定只服务测试，不声明正式数值完成。完整3648效果/228快照紧凑编码、1..8块实际增长及最大技能可达图预算归后续。Cocos场景构建、浏览器、真机、云SDK/时延/计费未执行；既往构建拒绝保持有效。
