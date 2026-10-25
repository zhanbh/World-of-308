# 拔刀斩权威执行合同 v1

ST11-05，2026-10-25。与十字斩、崩山击合同及已批准ST11规格共同生效。全部参数属于显式本地无奖励训练配置，不是生产数值默认值。

`combat.schemaVersion:4/profile:local-test-badao`严格包含basic/cross/bengshan/badao/no-rewards和全部配置；旧schema1～3仍按原字段集读取。E01正式发布与1级入口校验不放宽；缺少原子经验/掉落消费者的有奖励战斗能力继续在配置/入口阻断。测试中的当前角色10级来自合法1级训练入场后的可信成长fixture，ST15成长服务未交付。

拔刀10级解锁，每2级技能升1级。当前角色与装备属性决定起手快照；MP/CD/控制/其他技能动作合法性在每个输入边界检查。仅接受才取消普攻。宽幅前向矩形单节点，位置/面向冻结，稳定actorIndex排序；范围外不消耗随机，范围内每目标独立命中后独立暴击，仅一次直接伤害。没有扩散剑气或逐帧重复命中。

直接整招预算一次向下取整；附着流血独立整招预算，只有命中且存活且非流血免疫才附着，逐跳独立暴击、不再命中抽样。最后一跳承担分配余量；攻击快照不变、防御每节点/跳实时且只算一次。直接伤害累积倒地，DOT不累积，死亡优先。急速封顶2，节点/CD/跳时刻从原始有理时序计算后落10ms逻辑tick，片段右端不提前执行。

新scene5保留cross/bengshan并新增badao。核心scene只放紧凑控制器；效果按需skillEffects schema3三lane，旧schema1cross/schema2双lane仍严格读取。每effect≤128B、去重snapshot≤192B、块≤80KiB/header≤16KiB，最多8块。已有空块保留稳定布局与无变化修订。当前实测不是最终四技能3648效果/228快照上界证明，06负责收口。

公开证明新增严格`badaoAction`与带连续index的`badaoEffect`记录，纳入同一完整publicStateHash、当前CP/代次证明。只公开冻结位置/面向/急速及动作信息，不公开私有随机seed/cursor或攻击快照。客户端使用独立显示随机域预测，通过原operationId、完整动作结果页与新CP纠正；durable pending先于传输。未知不换意图，旧响应由共有generation/scene/timeline/CP保护。施放控制中断未生成节点，已释放流血保留；普通移动与普攻在控制/技能锁内禁止，但保留移动意图。

换房清cast/效果且只重建2核心块，保留CD/HPMP及回复余数；恢复保留所有lane与私有游标，旧timeline无法推进。写点故障整笔回滚、相同CP候选只成功一个。实际证据与未运行环境见[05验证](../reviews/st11-05-verification.md)。
