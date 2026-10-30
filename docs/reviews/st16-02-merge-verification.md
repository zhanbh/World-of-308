# ST16-02 独立合入核验与02/03合流（2026-10-30）

固定核验代码 `55c1c05bf93bc411f6cf494dd95810e3b224259a`，其已合入03及独立03报告所在根提交 `84d9274133647d632fcfa40e7bb11a6ab0290915`。核验者与实现作者分离。当前用户只要求完成02/03后停止：04/05未实施、未启动，最终Standards/Spec双轴与全7阶段仍留05。

已读取冻结spec、02/03及accepted-check、01接口/核验证据、恢复时序和source-of-truth主题合同。独立以 SHA256 检查spec与全部01—05 issue全文，六项均严格匹配plan-accepted-check；未修改冻结正文、批准摘要或图。02全文为 `d476a1ea950e271277cdccf2de385395cc3d15d07486efd055568007dc145dd4`。

独立在02固定tip的worktree执行 Node24.22.1 `--test --test-isolation=none`：backend/test 下 active-combat-recovery、dead-looting-recovery、loading-recovery-v2、recovery-coordinator-v2、loot-victory-client、movement-client、unknown-recovery-barrier 七文件，50/50，exit0。并行执行 TypeScript5.8.2 backend/tsconfig.json 与 tools/tsconfig.models.json 各 `--noEmit`，均exit0；既有 MODULE_TYPELESS_PACKAGE_JSON 警告保留。作者50项及日志属于作者证据；本段为独立同范围实跑，不能把七文件等同全7阶段。

源码复核统一barrier在控制前冻结Movement及显式注册Drop/Terminal，原意图不删除；首轮只通过授权operation.get查询，notFound保留原DTO且不直接当拒绝。控制栅栏成功后才以原查询/同参重送取得最终结果。真实装备OCC两序断言实际冲突：旧写先提交保留一件装备，栅栏先提交旧写拒绝且零装备；丢响应拾取与leave只取原结果，未重复物化/撤销终局。每次显式retry有界，不后台循环。原回执确认不直接恢复Movement预测，而经当前资源/完整证明和Movement重建，随后刷新参与者当前视图。

专项核验明确拒绝修复：queryOriginalControl的VERSION_CONFLICT占位先转为未找到，继续原tuple发送；未知时reconcile被ORIGINAL_RESULT_REQUIRED阻断。只有实际原命令明确rejected且failed，才允许授权scene.status读当前状态后清pending；失败/网络错误不清意图，预测继续关闭。新lease/checkpoint控制随后可继续，不修改服务端时间代次/原deadline。已覆盖notFound→实际拒绝→reconcile反例及双journal崩溃交接窗口，不新增tuple重复控制。

代次核验：原查询和同参重送每次await后均核对generation；close/rebind令旧回调失效，旧pending持久记录保留。Movement/Drop/Terminal六个close/rebind反例通过；owner旧handoff仍不能冻结新实例。02/03合流保留dead禁新动作/仅合法尾伤、completed仅移动、固定clearReceipt从当前读模型取得、looting不套2秒缺口，以及原deathDeadline/lease equality关闭且不撤成功。无新增后端DTO、持久字段、服务写点或额外宽限。

未发现阻断02合入的问题，根已快进至固定代码tip；execution02/03均merged。04/05保持未实施；Drop/Terminal的实际Cocos注册/生命周期接线仍归04。未执行全7阶段/62写点长循环、设备/浏览器、云SDK/费用、安装、push或部署；样本不代表完整最大生产包络。最终独立双轴评审与联合门禁不由本合入核验替代。
