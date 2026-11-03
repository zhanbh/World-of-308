# ST17 实施准备

2026-11-01，feat-1.0.0 / 131edef。用户已选择开始ST17；目前处于规格/五项任务图整理，**未开始ST17业务编码**。

- [规格草案](spec.md)
- [五项任务图与测试边界](task-plan.md)
- [现状预检](../../../reviews/st17-preflight-2026-11-01.md)
- [本地草案检查](plan-check.json)

本工程仅仓库文档、不创建或同步Jira。按AGENTS保留任务粒度/依赖的一次人工确认；确认后生成accepted独立任务并按图实施，不把“开始ST17”写成尚未展示任务图的批准。正式价格/最大耐久/云SDK/设备保持独立GAP。

## 当前批准（2026-11-01）

用户“可以，确认；开始01吧先”批准规格/五项任务图及测试边界，**本次仅启动ST17-01**。spec仅更新批准frontmatter，正文hash保持草案一致；草案中的待确认措辞保留为原始提案快照，由本条、[批准记录](plan-approval.json)、[接受源检查](plan-accepted-check.json)和[执行记录](execution.json)说明当前状态。5项独立issues已发布accepted；接受任务不代表本次授权实施02～05。

## ST17-01 本地交付（2026-11-01）

01已实现并合入，最终源码 `13a8b6bf4935ce93ec4341b04d8f12d6630c479d`。普通清房/死亡磨损与归零继续本局、清房后完整恢复/换房已覆盖；实现相关75/75、恢复修复33/33，最终独立新增12/12及后端/客户端模型类型通过。初次merger发现普通cleared恢复门禁缺陷，修复后READY，原报告保留。见[实现证据](../../../reviews/st17-01-verification.md)、[初次核验](../../../reviews/st17-01-merge-verification.md)、[独立复核](../../../reviews/st17-01-merge-recheck.md)。

本轮独立工作树已清理；未执行全7阶段或Creator，不冒称全ST17或平台通过。按用户“开始01吧先”停在01，02～05尚未启动；没有push。

## ST17-02 本地交付（2026-11-02）

用户“继续02吧”授权02，覆盖历史01-only范围。02已实现并独立核验合入，固定源码 `0ea7f0fafda90cee844d9e69bb94d90b6f5806f6`：可信林纳克斯上下文、只读版本化报价、穿戴/背包单件修满、原O/J恢复及真实传输RepairCoordinator。初版168/168相关，版本修复后106/106定向及两types通过，最终独立21/21和两types通过；初次NOT READY的旧expected问题已修复，完整记录见[02证据](../../../reviews/st17-02-verification.md)、[初次核验](../../../reviews/st17-02-merge-verification.md)、[独立复核](../../../reviews/st17-02-merge-recheck.md)。

实现子任务及旧merger在交付后遇执行额度限制，根会话接手修expected并记录真实RED/GREEN，最终由新的独立复核者验证READY，未将自验冒充独立通过。本轮工作树已清理；未push。03一键全修、04面板、05全故事门禁尚未启动，正式价格/SDK/设备GAP保留。

## ST17-03 本地交付（2026-11-02）

02推送后用户“继续吧”授权03。03已独立核验并合入，固定源码 `4b7191357519021a7b7862aae07b1e558069e2c5`：当前穿戴wear7完整报价/原子全修，空/全满零费、余额不足/坏后件/版本变化整批拒绝；包/库不动、评分事实不变。焦点112/112、相关184/184及两类型通过，独立新增14/14及两类型通过，merger READY。见[03证据](../../../reviews/st17-03-verification.md)、[独立合入核验](../../../reviews/st17-03-merge-verification.md)。

12实际写点逐点回滚，普通全修R21/W12/33调用；合法长字段实际75909B及codec-only89203B分列，新all view128KiB、旧single64KiB边界明确。新模式及原O/持久pending兼容02。工作树已清理；本轮未push、未启动04面板/05全故事门禁，正式配置/SDK/设备GAP保留。

## ST17-04 本地交付（2026-11-02）

用户授权实施 ST17-04。04 已独立核验并合入，固定源码 `ed5779a`：Cocos 城镇修理面板（`RepairPanel.ts`）、全部穿戴一键全修与单件修理双模式、7 槽位明细与三色耐久阶梯、总费用呈现与成功横幅、`unknown` 结果恢复按钮、防重复点击、迟包/切角代次隔离；`Prototype.ts` 集成 M 键/点击修理面板与非阻断装备破损警告提示。定向测试 8/8 通过，全量 7 阶段自动化门禁 7/7 通过（855/855 测试通过），merger READY。见[04证据](../../../reviews/st17-04-verification.md)、[独立合入核验](../../../reviews/st17-04-merge-verification.md)。

## ST17-05 本地交付（2026-11-03）

用户授权实施 ST17-05。05 端到端联合验收套件已实现并独立核验合入，固定源码 `a4db9b5`：构建大闭环联合验收套件 `backend/test/repair-joint-acceptance.test.mjs`（4/4 全部通过），完整闭环覆盖真实战斗/死亡磨损至 0、属性加成归零、副本通关/离开、回城新挑战入口严格被拦（`WEAPON_BROKEN`）、林纳克斯一键全修扣费修满、重新入本成功开启挑战；完成物理事务预算实测（R21 / W12 / 33调用 / 写 95.3 KiB / 视图 74.1 KiB，完全在预算内）；完成 12 写点故障注入 100% 干净原子回滚与丢包恢复验证；完成换装与商店出售 OCC 并发竞争双序验证。关联回归套件 59/59 全部通过，两项 TypeScript 编译 Exit Code 0，纯模型与 UI 模型门禁 100% SUCCESS。Standards 独立评审通过，Spec 独立评审通过（AC17-1 ～ AC17-8 全部 PASS）。见[05证据](../../../reviews/st17-05-verification.md)、[独立合入核验](../../../reviews/st17-05-merge-verification.md)、[Standards独立评审](../../../reviews/st17-standards-independent-review.md)及[Spec独立评审](../../../reviews/st17-spec-independent-review.md)。至此，ST17 全部 5 项实施任务已完整交付归档。
