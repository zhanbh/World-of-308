# ST16-03 独立合入核验（2026-10-30）

核验固定代码提交 `76a8ac2e3fc5f7dc68d7d935e9b1e76a9fb0c6b2`，集成基点 `c8464f0`。本核验者未参与实现；作者报告/日志为作者证据，以下命令由核验者独立执行。仅本片合入核验，最终 Standards/Spec 双轴及全7阶段留 ST16-05，不进入04/05。

读取 AGENTS、source-of-truth、恢复时序、加载握手、死亡尾效/终局及地面来源合同、冻结 spec/03、accepted-check 和01接口/验证。spec全文 SHA256 `f48a32f3988cbe3b623ba8f308fc1d25286309d2313eec27114048158cd36105`，03全文 `6c32f373032cda54f48927a904735c584cab256dc9dc6f37e93fcdf6211c0422`，保持批准版本。

独立在03固定提交worktree运行 Node24.22.1 `--test --test-isolation=none`，五文件 dead-looting-recovery、active-combat-recovery、recovery-coordinator-v2、loading-recovery-v2、boss-death-tail：27/27，exit0。TypeScript5.8.2 对 backend/tsconfig.json 与 tools/tsconfig.models.json 各 `--noEmit`，均exit0。既有 MODULE_TYPELESS_PACKAGE_JSON 警告保留。与作者同范围的独立复跑，不据此声称全部ST16通过。

真实服务/MemoryStore纵切从真实怪物伤害死亡及真实Boss击杀起步：dead完整role/scene保持、deathIndex/原deadline不变、禁新动作而仅合法尾效空片可推进；deadline等于时失败关闭。completed恢复固定clearReceipt及原收益/体力快照，真实移动和drop.list/collect保留roomToken/dropId并入包，2200ms不误套战斗缺口；lease等于时仅关闭，保留成功及已入包资产。

静态核验：ready恢复cleared/completed/looting时同步设置acceptingInputs与新移动锚点，inputGapBaseAt=null；movementGap仅active/result=active适用。dead仍受服务截止与尾效果资格及Movement.enqueue的DEAD拒绝；completed仅允许move。sameProofState扩大的是有限公开证明资格，绑定challenge/scene/timeline/revision/hash/manifest和connected；Activation调用者仍有active/alive前置门禁，Recovery经完整分页与最终当前状态复核，总控再经Movement当前证明。ready原回执仍固定proofDeadline且scene/timeline/manifest绑定，不能跨代次授权。clearReceipt取自最终challenge.get，现有当前修订/hash/连接/阶段/结果复核及代次失效机制继续生效；无新奖励写点或期限重设。

未发现阻断03合入的问题，根分支已快进到上述提交；execution仅03更新merged。02未知业务及交叉竞争待02合入核验，完整7阶段/62长循环、Cocos/设备/浏览器、云SDK/费用及任意最大内容包络均未由本报告关闭；没有安装、Jira、push或发布。
