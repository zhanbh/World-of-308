---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-e01-05
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
# 05: 资产服务协议

**What to build:** 调用方能按一致公开契约表达容器、领取和服务意图，响应不会将历史结果误称当前余额。

**Blocked by:** 02。

**Status:** draft（任务图已确认，实施产物尚未验收）。

## Acceptance criteria

- [x] 按API v2覆盖资产/服务/查询家族与原operation结果、expected对象列表和resultVersions。
- [x] 验证数量、枚举、目标/服务字段形状及公开边界；区分地面来源/邮件附件/pending与固定样本/候选/已提交结果。
- [x] DTO容纳13槽、绑定、耐久必填/非磨损策略、容器归属和固有评分事实；不另造第二份可领余额。

## Tests and evidence

- 各命令至少一合法样本和缺字段/非法数量/重复expected等有区分意义的负样本。
- 读取失败/空列表/拒绝/unknown的结果不能混淆，旧回执有版本而非整包权威覆盖。
- schema不证明所有权、库存/CD、报价或原子性；将这些责任映射到后续故事。

QA映射：QA06, QA37, QA39；原计划组号不是已通过测试数。证据记录提交/配置/工具版本、运行命令、期望/实际及剩余GAP。

75项资产合同测试通过；独立评审的原操作ID和创角原结果消费缺口已修复复核，不代表扣费/发货/原子性通过。[实施映射](../../../../design/e01-asset-contract-implementation-v1.md)、[证据](../../../../reviews/e01-05-local-verification-2026-10-22.md)。

## Scope boundary

不实现扣费、发货、强化、持有汇总或评分投影，不生成固定成功服务桩。

源规格：[E01 spec](../spec.md)。主题规则以[真相源索引](../../../../backend/source-of-truth.md)定位；实现位置可按代码现状选择，不把本任务文件当第二份玩法规格。
