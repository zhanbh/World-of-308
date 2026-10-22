---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-e01-02
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-e01
    revision: 60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57
    path: docs/stories/warrior-loop/e01/spec.md
implements: [e01-contract-foundation]
blocked_by: [1]
---
# 02: 精确值与编码校验

**What to build:** 同一合法公开值可从共享类型经JSON编码、校验和解码无损往返，错误表示被明确拒绝。

**Blocked by:** 01。

**Status:** draft（任务图已确认，实施产物尚未验收）。

## Acceptance criteria

- [x] 定义Time/LogicTick/版本化整数资源和约分回复余数的可辨类型及运行校验。
- [x] 实现规范化公开值编解码/字段排序与稳定摘要输入；BigInt不直接进入JSON。业务集合顺序由具体DTO合同确定。
- [x] 限制数值/字符串/集合与分母范围，拒绝NaN/无穷/溢出/非法约分；不把渲染小数写回权威值。

## Tests and evidence

- 边界−1/0/最大/最大+1、分母0、等价有理数规范化及重复序列化一致。
- 超安全整数的合法字符串往返，不以Number隐式丢精度。
- 余数0/分子接近分母及字段排序差异测试，摘要不含私有秘密。

QA映射：QA22, QA39；原计划组号不是已通过测试数。证据记录提交/配置/工具版本、运行命令、期望/实际及剩余GAP。

本地结果：统一检查7/7组通过，共享值测试6/6通过。实现未独立验收，保留draft；[验证记录](../../../../reviews/e01-02-local-verification-2026-10-22.md)。

## Scope boundary

仅精确值及编码基础；不实现完整伤害公式、回复推进、碰撞或调度内核。

源规格：[E01 spec](../spec.md)。主题规则以[真相源索引](../../../../backend/source-of-truth.md)定位；实现位置可按代码现状选择，不把本任务文件当第二份玩法规格。
