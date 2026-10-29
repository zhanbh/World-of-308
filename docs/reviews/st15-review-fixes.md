# ST15 两轴评审修复

2026-10-29。修复分支 `fix/st15-review` 基于 `0639c097fd8f2da0465ace41e16a06ee127d1dd7`，冻结规格及实际字节哈希清单不变；原始 `st15-build-spec-review.md` / `st15-build-standards-review.md` 由根会话保留，不覆盖历史结论。本补丁只处理该轮P1及一项重复计算建议。

## P1：真实跨submit死亡尾伤

按已确认的公开服务/真实MemoryStore及客户端传输边界实施TDD。新增 `backend/test/boss-death-tail.test.mjs` 首先在原服务复现：首片真实技能释放、真实怪物伤害提交玩家死亡，第二片空inputs返回 `ROOM_NOT_AVAILABLE`。没有以预置completed或纯内核测试代替服务验收。

当前服务只对dead且已有合法已释放效果的空片开放模拟，两次事务继续重验身份、CP/代次、在线连接、2秒间断、时间前沿和原截止；公开证明可恢复dead场景。H记录当前playerDeathAtTick并传回联合内核；首次死亡按原时间锚点固定10秒截止，尾片不延长。新增deathIndex的首次提交扣一次死亡磨损−5，后续尾片通关只扣末房磨损。通关保留terminalFact死亡来源，再免费满HP/MP复活、清职业CD/动作/移动余数/回复余数；药品饰品CD不顺带重置，纹章/paidRevives不变。completed/looting继续保留原体力快照与unsettled。

MovementCoordinator接受dead公开证明但拒绝任何新动作入队；LootSceneCoordinator暴露尾效果推进条件，Prototype现有帧循环只提交空片，尾效果耗尽即停止。没有后台守护循环或离线补算。

## 重复扣损计算

一次计算扣损后装备快照，同时用于装备文档写入与CP战力投影。既有装备键域及终局预算保护不变；额外死亡片不重复制造终局奖励。

## 实际验证

- 两项真实公开双submit用例：十字斩流血、大崩独立地面尾伤；首片dead/active、后片completed/alive/looting，与未切片的terminalFact一致；50耐久→死亡45→通关44，两路径最终一致；HP/MP/CD/全部相关余数、纹章/付费计数及原体力快照均检查。
- 客户端真实MovementCoordinator + LootSceneCoordinator传输：死亡确认后保持可恢复，禁止动作，第二片payload.inputs为空，通关后恢复移动。
- 合法协议动作五类拒绝；旧身份、未来时间、2秒断流、原死亡截止拒绝；无尾效果不推进；死片与尾片原operation重放无重复磨损/发奖。
- `node --test backend/test/boss-death-tail.test.mjs shared/test/boss-terminal.test.mjs backend/test/loot-victory-client.test.mjs backend/test/monster-client.test.mjs`：19/19通过（新增5项，最终全量门禁另记）。
- 后端共享类型、客户端纯模型类型分别通过，使用既有 Node24.9.0 / Cocos TypeScript5.8.2；不安装依赖、不构建、不操作云端。
- 最终一次完整7阶段门禁由根会话以所需本地HTTP权限执行，7/7通过（tooling7、shared230、backend692），日志为 `st15-review-check-all.log`；固定代码为 `bb916d809f8d9dcd04b8f2bc2477fa66fbb7dcb3`。

最大到期域仍FAIL/BLOCKED：已知570调用超过预算，保留当前原子拒绝和active状态。正常78调用域及最大结果存储映射不在本修复中重新设计；不宣称ST15全部完成。SDK、设备和生产配置仍是原GAP。
