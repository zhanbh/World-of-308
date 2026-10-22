---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-e01-04
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-e01
    revision: 60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57
    path: docs/stories/warrior-loop/e01/spec.md
implements: [e01-contract-foundation]
blocked_by: [2]
---
# 04: 输入与恢复协议

**What to build:** 调用方可完整验证有序输入、加载与恢复公开消息，旧自报事件不能被新协议接纳。

**Blocked by:** 02。

**Status:** draft（任务图已确认，实施产物尚未验收）。

## Acceptance criteria

- [x] 提供prepareRoom/activateRoom/resumePrepare/scene.ready/状态与有界公开恢复分页的请求响应schema。
- [x] 字段包括scene/timeline代次、revision/hash、inputGapBaseAt及明确逻辑/墙钟类型，保留FR01/FR02所需契约。
- [x] 运行schema拒绝自报HP/击杀/奖励、旧reportEvents/单次enterRoom，新协议不转给旧服务处理。

## Tests and evidence

- 1秒/32条/16KiB及序号、expected重复、旧协议/未知字段、非法分页/摘要结构负测。
- 控制/查询/业务写信封互不混用，CP私有分块不直接外传。
- 构造3秒ready基点和转场时钟合法样本；时钟推进/幂等CAS本片不实现，不用schema测试冒充。

QA映射：QA20, QA21, QA22, QA33, QA39；原计划组号不是已通过测试数。证据记录提交/配置/工具版本、运行命令、期望/实际及剩余GAP。

实施结果：公开合同及真实调用方消费边界已验证；独立评审发现的ready错配已修复复核。时钟推进/业务CAS/SDK未实现，不据此声称原QA组整体通过。[实施映射](../../../../design/e01-simulation-contract-implementation-v1.md)、[完整本地证据](../../../../reviews/e01-04-local-verification-2026-10-22.md)；首片记录保留为历史证据。

## Scope boundary

不实现恢复状态机、时间推进、战斗内核或分页数据库；样本只验证公开合同。

源规格：[E01 spec](../spec.md)。主题规则以[真相源索引](../../../../backend/source-of-truth.md)定位；实现位置可按代码现状选择，不把本任务文件当第二份玩法规格。
