# ST15 拾取、首领结算与奖励来源

2026-10-29，集成分支 `feat-1.0.0`。用户已确认五项任务图并授权连续实施；不创建 Jira，不安装依赖或操作云资源。

## 当前状态

01～04 已实现并合入；05 联合验收、预算保护和评审修复已合入，最终代码为 `bb916d809f8d9dcd04b8f2bc2477fa66fbb7dcb3`。原跨片段死亡尾伤 P1 及磨损计算重复问题均已修复，两轴独立复核通过。最终全量 7/7（shared230、backend692）。详见 [本地交付与限制](../../../reviews/st15-local-verification.md)及[执行记录](execution.json)。

**最大终局预算门禁仍为 BLOCKED，ST15 不标整体 Done 或可发布。** 正常八块检查点终局为 R42/W33、78 次提交事务数据调用；最大到期效果域实测超过预算，现有服务原子拒绝且不留下半通关/部分奖励。完整证据见 [05验证](../../../reviews/st15-05-verification.md) 和 [预算JSON](../../../reviews/st15-05-budget.json)。最大域的结果物理映射需要后续整改。

## 规格、审批与边界

- [冻结规格](spec.md)、[任务图](task-plan.md)、[五项任务入口](issues/01-room-drop-collect.md)。
- 历史 frontmatter 的声明摘要有误；保留原字节，不伪造修订。当前批准正文以 [实际源摘要核验](plan-validation-2026-10-29.json) 固定，[接续记录](../../../reviews/st15-resume-check-2026-10-29.md)说明差异。
- [体力裁决](decision-terminal-stamina-2026-10-29.md)：通关固定本局消耗，looting 仍 unsettled，实际回城才 settled；覆盖冻结正文中相反的一行。
- [权威合同入口](../../../backend/source-of-truth.md)、[地面拾取](../../../backend/ground-drop-collect-contract-v1.md)、[首领通关](../../../backend/boss-clear-terminal-contract-v1.md)、[终局结算](../../../backend/terminal-settlement-contract-v1.md)。

04 的 Windows 离线 Cocos 构建及无头客户端测试是历史实测，不代替本机视觉、触屏、微信真机、正式配置或云 SDK 验收。所有平台缺口和最大预算阻断单独保留，测试中的预期拒绝通过不等于发布预算通过。
