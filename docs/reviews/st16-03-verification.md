# ST16-03 死亡与通关拾取恢复验证（2026-10-30）

来源：已接受的 ST16-03。未修改冻结 spec、issue、批准摘要或任务图；仅实施02/03授权中的03，不进入04/05。

真实服务纵切复用 ST15 的 trusted active-final-room 小夹具：起点仍 active，没有预置 completed 或死亡事实。第一例由真实怪物伤害产生 dead，同时保留已释放 cross 尾效；第二例由真实 basic submit 击杀 Boss，经真实终局结算产生 completed/looting 与固定 clearReceipt。LoadingCoordinator 通过真实资源解析器加载原资源，随后 CombatRecoveryCoordinator 执行 suspend、resumePrepare、完整分页验证、ready、当前完整证明及 Movement 重建。

TDD：新增两例首先分别得到 RESULT_UNKNOWN（alive-only 证明）及 loading（不进入通关证明）；放开有限状态证明后，looting 的 simulation.confirmed 因 inputGapBaseAt=null 返回 CONFIG_NOT_READY。修正为仅 active/result=active 检查战斗缺口，looting ready 建立移动锚点、不建立战斗缺口基点，测试转绿。死亡首片 TIME_FRONTIER 暴露测试时钟未推进，测试改为真实ready后10ms再提交，没有放宽服务时间门禁。

验证事实：

- dead/active 恢复前后完整 role/scene 相同，sceneEpoch、deathIndex、原 deathDeadline、体力快照/未沉降状态保持；完整公开记录恢复。不能移动或攻击，可继续原尾效空片；原死亡截止等于时关闭并 failed。
- Boss 完成后恢复仍 completed/looting，固定 clearReceipt（包括已固定路由）经当前 challenge.get 进入 Movement 和总控公开状态；canMove=true、canAttack=false。角色资产/终局收益不重发，体力未回城沉降。
- looting在ready后2200ms刷新当前证明并真实提交移动片成功，证明没有误套2秒战斗缺口；DropCoordinator通过真实drop.list/collect保留roomToken/dropId并拾取入包。当前lease等于时关闭场景、保completed、原clearReceipt与已入包物品。
- 活动存活恢复、原控制丢响应、迟回调、固定截止及ST15死亡尾效相关回归共27/27，日志为 st16-03-related-tests.log。Node24.22.1、TypeScript5.8.2，backend/tsconfig.json和tools/tsconfig.models.json均exit0。后者新增总控文件纳入实际编译。

实现区分完整恢复与新动作资格：同场景/时间代次/manifest、当前修订/hash及固定proofDeadline仍严格绑定，dead与looting只扩大合法公开证明状态，不放宽技能/拾取服务授权。总控公开canMove/canAttack/canAdvanceDeathTail，固定clearReceipt从当前已校验读模型提供。没有新DTO/持久字段/物理键/写点，既有分页和CP字节上限不变；未把小夹具当最大包络、SDK费用或生产预算实测。

边界：本片已确认、无在途业务写起点；02组合竞争由合并后针对接缝回归及后续05联合验收承担。未运行完整7阶段/62长循环、Cocos构建/设备/浏览器、云SDK、安装、push或发布。提取ST15共享death-tail-fixture仅复用既有夹具，原测试断言保持。
