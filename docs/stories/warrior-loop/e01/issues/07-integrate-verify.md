---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-e01-07
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-e01
    revision: 60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57
    path: docs/stories/warrior-loop/e01/spec.md
implements: [e01-contract-foundation]
blocked_by: [3, 4, 5, 6]
---
# 07: 联合验收与迁移交接

**What to build:** 开发者取得可复跑的E01验收证据与真实迁移边界，下一故事可以直接引用而无需猜测协议。

**Blocked by:** 03, 04, 05, 06。

**Status:** draft（任务图已确认，实施产物尚未验收）。

## Acceptance criteria

- [x] 统一检查运行全部新合同/fixture和可用旧回归，记录精确版本/命令/实际结果与未通过项。
- [x] 跨03～06组合合法消息/配置样本，确认新入口不静默接受旧自报协议，旧业务消费者尚未迁移要标明。
- [x] 记录各任务artifact/revision、源规格hash、覆盖与后续ST/E02责任；不把本地合同称微信在线闭环完成。

## Tests and evidence

- 类型/运行校验/编解码/引用与错误消费者contract都真实运行，不是只检查文件存在。
- 不跳过旧失败用例/弱化断言制造绿灯；新旧规则责任与实际GAP有证据。
- 验证包和公开fixture无私有种子/凭证，git差异不包含云环境或无关美术修改。

QA映射：QA22, QA36, QA39, QA41；原计划组号不是已通过测试数。证据记录提交/配置/工具版本、运行命令、期望/实际及剩余GAP。

统一检查7/7、共享107/107、工具7/7、旧后端49/49通过；两轴独立评审4项发现已修复复核。[联合交付报告](../../../../reviews/e01-07-integration-verification-2026-10-22.md)。任务保留draft表示尚未人工接受或合并，implementation_status记录实际本地交付。

## Scope boundary

不执行SDK/手机/发布验收，不将任务计划接受当功能Done，不自动部署。

源规格：[E01 spec](../spec.md)。主题规则以[真相源索引](../../../../backend/source-of-truth.md)定位；实现位置可按代码现状选择，不把本任务文件当第二份玩法规格。
