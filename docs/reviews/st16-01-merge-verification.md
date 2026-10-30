# ST16-01 独立合入核验（2026-10-30）

核验固定代码提交 `2b82f2b46bf4f7ffcf6bcc2c833c15bcbfbf34d2`，对比集成基点 `2df659927ee65c2a3c6f7597f447bbac0c941b1f`。作者与核验者分离；本报告只记录本片合入检查，最终 Standards/Spec 双轴及全7阶段由 ST16-05 联合验收执行。

读取 AGENTS、source-of-truth、恢复时序、加载握手、CP/包络与已接受 spec/01。冻结文件全文 SHA256 复核：spec `f48a32f3988cbe3b623ba8f308fc1d25286309d2313eec27114048158cd36105`，01 `330092e70be96870165a0b4323bacc542f61772e1f43e043b1173f7ebc75b156`，均与 plan-accepted-check 一致；未改 Accepted 或批准清单。

独立执行 Node24.22.1 `--test --test-isolation=none`：backend/test 下 active-combat-recovery、recovery-coordinator-v2、loading-recovery-v2、movement-client、loading-coordinator-v2 五文件 **30/30**，exit0。作者已有五文件46/46日志属于作者证据，本报告不将其冒称独立复跑。TypeScript5.8.2 对 backend/tsconfig.json 及 tools/tsconfig.models.json 各执行 `--noEmit`，均exit0。Node既有MODULE_TYPELESS_PACKAGE_JSON警告不影响通过。

真实服务/MemoryStore纵切覆盖已有受击和cross尾效果、暂停冻结、prepare资源及完整基础证明、ready当前证明、Movement再次完整当前证明与恢复后提交。逐项断言玩家、位置、动作、怪物、目标及四技能公开lane保真，游标不退、sceneEpoch不变、timeline加一且暂停间隙不补模拟；100/1900ms可提交、2000ms恢复、1000ms预测停止。既有测试继续验证10秒原截止/equality、旧心跳不续期、原ready丢响应、资源hash和旧异步资源回调。

静态复核新增owner生命周期：init先freeze，使Movement旧代次失效；prepare控制await后检查owner代次；restoreMovement前后核对代次，旧handoff不再关闭当前Movement。独立真实transport延迟case将旧movement-current响应挂起、init并完成新证明后放行，确认新Movement不被旧响应冻结。资源绑定及旧ready当前证明沿既有Recovery/Movement校验，无新服务写点或额外10秒。未发现阻断01合入的问题。

已按授权将根feat-1.0.0快进至上述代码提交；执行状态01标merged，02/03仅ready。unknown业务O统一栅栏、dead/looting资格、Cocos生命周期由02/03/04完成；本片不声称这些已实现。额外当前证明读沿既有分页上界，无新增物理键/后端DTO；最大内容域、全7阶段、云SDK/费用、设备和HTTP弱网仍未由本核验关闭。
