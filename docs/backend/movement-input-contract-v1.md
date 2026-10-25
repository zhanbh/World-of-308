# ST11-01 移动执行合同

2026-10-25。适用已批准ST11-01；实现和实际证据见[验证](../reviews/st11-01-verification.md)。不将本地训练配置声明为正式首本战斗或ST12 AI。

## 配置与精度

`ChallengeContent.movement`为显式`schemaVersion:1/profile:local-test-movement/units:milli-design-pixel`配置。字段：`ruleRef/mapRef/walkSpeed/runSpeed/ySpeed/deadzone/runThreshold/footprint/bounds/walls`；坐标与速度整数、坐标int32、速度每秒，足迹为保守方形半径；bounds/walls严格矩形，墙最多256。单位为每设计像素1000整数单位。X超过deadzone后按量化力度乘所选walk/run速度；`abs(x)>=runThreshold`选择run，否则walk；Y超过死区固定±ySpeed。斜向不归一，非零X改变面向，纯Y保留面向。曲线/速度/死区和地图矩形均为本地测试配置，不复制原型屏幕边界。

每tick10ms；X位移分子为`speed*x`，Y为`ySpeed*sign(y)*1000`，统一分母100000，BigInt中间运算、向零取整、持久带符号余数（绝对值<100000）。碰撞沿整路径作精确有理接触判断，墙按足迹膨胀，首次接触截停两轴；截断及分数均丢弃，不累积补偿。怪物身体不参与阻挡。本片无伤害/免伤机制，不从穿身推导免伤。

## 严格请求、时间与原结果

`simulation.submit`沿既有严格DTO：≤100tick/32输入/完整16KiB，连续seq和tick、当前身份/会话/选中角色/role代次、场景/时间代次/房间、CP修订、expected角色和挑战版本全验。`ruleRef/mapRef`匹配已配置地图，`digest=SHA256(canonical({payload:去掉digest后的payload,config:完整movement配置}))`。canonical按既有room-manifest编码。CP已有配置hash时必须一致。移动不接受客户端位置/HP/击杀结果。

重算在事务外；提交事务重新授权并读取全部当前头/块、检查完整基线、装备版本、墙钟/生命周期和游标，失败丢弃候选。累计`toTick-anchorTick <= floor((serverNow-anchorWallAt)/10)`，无逐包未来容差。逻辑毫秒从原`logicalTimeMs + tick差*10`推进，保留ST10原3ms等余数，不重建成`toTick*10`。自然回复继续使用精确原配置摘要和余数。

输入缺口≥2000ms通过共同守卫原子转recovery，`recoveryUntil`继承原leaseUntil，原死亡截止不变。submit、challenge.get、scene.status/控制/新心跳和活动公开分页均执行；awaitingReady/加载排除。新成功片段更新inputGapBaseAt/lastAcceptedInputAt、lease；原输入/控制重放与查询不刷新缺口。已开始recovery不由心跳延期。

成功原子写A.writeRevision/H接受游标与lease/CP头/实际变化块/O。未变化块保留版本/hash。O≤16KiB、回复≤32KiB：`acceptedSeq/acceptedTick/checkpointRevision/actionResultsRef/events`与resultVersions；没有CP或怪物私有状态。正常离散输入在本能力域不执行，按序返回`{seq,tick,kind:'rejected',code:'ACTION_NOT_SUPPORTED'}`，仍处理序号并推进本段；不吞按键、不声称四技能可用。后续ST11-02扩展能力与动作状态。

`operation.get`返回精确原小型回复；移动O保存原session/role上下文，当前可信身份/合法会话和账号归属校验先于读取原结果；同账号当前合法新会话可读取旧会话/旧角色的小型历史结果，历史元数据只验完整性，不赋予旧会话写权或当前CP证明权。提交同ID异原意图为OPERATION_MISMATCH。新整段拒绝码包括INPUT_GAP/TIME_FRONTIER/DIGEST_MISMATCH；结构错误在严格解码处拒绝。

## CP与公开证明

role内部schema3兼容读取schema1/2；schema3增加`movement:{configHash,state:{x,y,remainderX,remainderY,facing,intentX,intentY}}`，保留旧回复字段与positionRemainder，不将其<1000旧单位混用为新精度。schema3同schema2有regenerationHash；ST10回复、切房、恢复和handoff可读取。外层header/chunk schema2、scene schema1保持。x/y必须与player整数位置相同。

公开记录新增`movement`：actorId/configHash/intentX/intentY/remainderX/remainderY/denominator=100000；不暴露随机、装备快照、attackPower或原始CP。它进入完整公开记录数组hash。`simulation.confirmed`严格查询含session、requestId、characterId/rolePlayEpoch/challengeId/sceneEpoch/timelineEpoch/checkpointRevision/pageIndex；返回既有≤64条/32KiB RecoveryPage，固定身份为`confirmed:<challengeId>`，绑定当前修订/hash/manifest及原lease/死亡截止；无旧ready票据依赖、无延期。版本混用/不完整页必须全部丢弃重取。

客户端先加载并验证真实manifest资源，再challenge.get→全部confirmed页→完整hash→再次challenge.get，同场景/代次/修订才启预测。公开movement精度使重开后可继续确定性预测。原pending先持久，再发送；未知/重开先operation.get，未找到仅重发完全原意图。generation与CP版本阻止旧回包覆盖。最多1秒未确认预测后冻结；队列≤32，同tick相邻move可合并，离散输入满队列显式INPUT_QUEUE_FULL，调用者提前分片，不删除已排离散输入。

## 预算与后续边界

当前移动域使用role+scene两个在用块，只变化role时写1块；五个写点（role/A/H/header/O）逐点故障回滚。恢复缺口两写点另验。纯计算最多100tick×256墙，CPU与实际UTF-8见验证，不代表SDK费用或真机性能。最大战士效果/快照及1～8块增长由后续战斗票扩展，不以本片两块代替完整战斗包络证明。
