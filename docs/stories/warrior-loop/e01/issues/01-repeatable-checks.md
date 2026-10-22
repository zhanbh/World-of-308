---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-e01-01
status: draft
implementation_status: local-verified
plan_approval: user-confirmed
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-e01
    revision: 60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57
    path: docs/stories/warrior-loop/e01/spec.md
implements: [e01-contract-foundation]
blocked_by: []
---
# 01: 检查入口与迁移清单

**What to build:** 开发者用同一命令得到完整且可信的本地检查结果，并能定位新旧协议实际调用方。

**Blocked by:** None (can start immediately)。

**Status:** draft（任务图已确认，实施产物尚未验收）。

## Acceptance criteria

- [x] 盘点shared v1公开符号、后端验证/处理、测试调用与客户端消费者，输出保留/扩展/后续迁移清单。
- [x] 选择并显式记录可用工具链精确版本与路径，检查入口不触发隐式npx；工具缺失明确失败。
- [x] 保留旧测试的有效不变量，运行失败不跳过；类型检查使用真正类型检查器而非仅转译。

## Tests and evidence

- 缺编译器、路径含空格、工具版本不满足要求均有明确非零退出。
- 网络不可用时不尝试下载编译器；现有可用纯检查执行并记录实际结果。
- 检查报告区分当前工具阻碍与真实测试失败，不虚称全绿。

QA映射：QA41, QA39；原计划组号不是已通过测试数。证据记录提交/配置/工具版本、运行命令、期望/实际及剩余GAP。

## Scope boundary

本地验证记录：[E01-01实际证据](../../../../reviews/e01-01-local-verification-2026-10-22.md)。status保留draft表示尚未最终独立验收，implementation_status标明本地已实现并测试；不伪称后续02～07完成。

仅改检查/运行基础和迁移文档，不改玩法、资产服务或重画UI。

源规格：[E01 spec](../spec.md)。主题规则以[真相源索引](../../../../backend/source-of-truth.md)定位；实现位置可按代码现状选择，不把本任务文件当第二份玩法规格。
