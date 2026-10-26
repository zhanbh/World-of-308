# ST12 配置接续笔记

2026-10-26，只读探索结果；不是新玩法批准、正式数值表或验证通过证据。实施选用候选时需在实际配置标注版本与来源。

## 普通技能与职责

候选来源：`docs/design/analysis/spatial_growth_encounter_trial.py`的NODES和SPAWNS；命中几何参考`group_attack_coordination_trial.py`的contact。联合模型近战首节点0.35s、结束0.85s、起手CD3.5s；投石释放0.8s、结束1.3s、CD4s；冲锋首节点0.7s、结束1.75s、CD5s。旧群怪模型近战CD2.5s与之不同，不混表。秒数尚未正式平衡。

投石旧模型是锁点后固定0.25s延迟，不包含真实投射速度/墙碰撞/扫掠半径；冲锋旧通道单次判定也不等于逐段位移实现。缺失项由版本化local-test配置明确补齐，不能假称参考已给全部物理参数。

四档方向及预算来源`difficulty-behavior-review-v34.md`、`enemy-role-acceptance-proposal-v1.md`与`analysis/enemy-role-candidates-v1.json`。后者最多侧翼为0/1/1/2，同时后撤远程上限0/0/1/1；旧v34冒险未启侧翼与新职责候选不同，实施应选择并注明，不能混用后宣称用户已确认人数。等待重型许可不预扣CD，需要有界公平调度与持久状态；普通近战不擅加统一两人攻击上限。

## 出生与版本资源

联合模型SPAWNS提供七房既定职责的固定坐标，紫名候选(105,20)，玩家入口(-180,20)。源坐标需乘位置scale1000，逐点校验地图、足迹、可达性与入口空间。可以先使用固定合法位置、不加随机偏移；允许随机偏移不等于必须实现随机偏移。

当前E01测试release只有humanoid模板及monster-strike契约技能，地图4个spawnPoints，不能冒充完整三本/四难度/1～30数据。当前prepare-manifest为测试生成连续x位置，03必须从绑定版本的逐房布局生成，并进入manifest摘要/资源证明；不是只改数量。

## 接入风险

AI必须进入CP/公开records及hash；scene新增版本需保留现有最高compact字典布局，不能误落旧pack路径。MovementCoordinator目前没有真实Cocos战斗入口，06需要新增实际接线，不以纯模型通过代替可玩。参数、发布算术、912敌效果与3648总效果上界、完整字节/分页预算需实际验证。
