# ST16-01 存活战斗恢复验证（2026-10-30）

实现入口 `client/assets/scripts/net/CombatRecoveryCoordinator.ts`，来源为已接受 ST16-01；未改冻结 spec、issue 或批准清单。测试边界沿已批准公开模型及真实 ChallengeService/MemoryStore 传输。

新增纵切从真实 active/ready 战斗起，提交 cross 技能，冻结 Movement，再 suspend、resumePrepare、验证既有 Loading 资源、完整恢复页、ready 当前证明及最终状态，然后 Movement.resumeActive 再取当前完整公开证明并继续真实移动片段。前后 position、combat、targets、四技能 lane、monsters、player 完整相等；确认 Tick/Seq 不退、不补暂停间隙，sceneEpoch 不变，timelineEpoch 加一。首次新片 100/1900ms 成功，2000ms 返回 RECOVERY_REQUIRED；确认后1000ms预测冻结。丢失已提交 suspend 后重开，以原控制回执恢复，尚无票据时不提前读取证明。

TDD 实际：新入口不存在的 ERR_MODULE_NOT_FOUND red → 存活纵切 green；随后 suspend 丢响应重开 RESOURCES_NOT_LOADED red → 按 pendingCommand 区分恢复时机 green。初稿技能输入字段与控制 leaseRevision 错误均经真实协议拒绝，修正为公开 skill DTO 与 scene.status 返回的当前 leaseRevision；没有绕过协议正确性。

本次实际执行：Node24.22.1；相关五文件 46/46（见 `st16-01-related-tests.log`）；TypeScript5.8.2 的 backend/tsconfig.json、tools/tsconfig.models.json 均 exit0。根调度明确全7阶段留05联合验收，本片不声明7/7。未运行Cocos、设备、云SDK或HTTP弱网；本片是可重复直接传输纵切。

## 协调器接口与后继接缝

`init(context,config,roomNo,basic)` 绑定同场景模型；`freeze()` 立即关闭 Movement 预测和旧异步代次；`suspend(command)`、`prepare(command)`、`ready(command)` 接受既有公开控制DTO（调用者持有真实控制序号及最新 leaseRevision）；`retry()` 保留原控制，不换ID；`close()` 退役；`state` 只有恢复证明与 Movement 重建均成功才给 predictionEnabled。RecoveryCoordinator 只读 pendingCommand 用于决定 ready重试前必须重验基础证明，suspend/resumePrepare则先查原结果。

02热点：在 prepare 调用 Recovery.control 前接全部未知业务写栅栏；Movement.retry 的原结果确认与connected重建仍耦合，留02拆分，不把本片当unknown资产安全已交付。03热点：RecoveryCoordinator与RecoveryProof目前严格alive/active预测，后续区分完整已恢复与允许攻击；本片不改dead/looting资格。04可复用总控接口接Cocos生命周期，Loading本片只验证既有合同JSON资源，不等于Cocos Bundle通过。

预算/合同：零新后端DTO、物理记录或写事务；原proof页/CP/结果上界不变。新增一次Movement重建的challenge.get两次+simulation.confirmed全页读取是独立当前证明，不复制私有CP或旧原结果为当前状态。完整7阶段/最大域及云费用仍由05与平台门禁核验。

追加生命周期TDD：真实transport挂起旧handoff的Movement challenge.get；owner.init并完成新Movement证明后放行旧响应。旧回调关闭新Movement的red已重现；修正为init先冻结旧Movement代次、prepare在控制await后核对owner代次、旧handoff返回不再close当前Movement，测试green。当前专项5项，相关合计46项均通过；末次两tsc exit0。
