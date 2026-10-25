# ST09 银行存取与分档扩容

2026-10-23。用户已确认四项任务图并授权实施；`feat-1.0.0`基线04a1cc7。无Jira、无安装或云部署。

原交付已提交并推送：`5129c57`。2026-10-24补核发现的三项规格缺口已修复并独立复核，修复本地合入`a75ee61`，尚未推送。全套7/7及Cocos类型通过；本轮Cocos重构建被权限审批拒绝，未执行。历史实施不完整遵循build的偏差仍保留，平台/设备待验。详见[交付与试玩](../../../reviews/st09-local-verification.md)、[后端独立评审](../../../reviews/st09-spec-review.md)、[客户端独立评审](../../../reviews/st09-client-review.md)。

- [只读规格](spec.md)、[已确认任务图](task-plan.md)、[计划凭证](plan-check.json)
- [01银行访问](issues/01-bank-access.md)
- [02堆叠存取](issues/02-stack-transfer.md)
- [03装备存取与持有](issues/03-equipment-transfer.md)
- [04背包/个人库扩容](issues/04-container-expansion.md)

执行状态与证据分开记录在[execution.json](execution.json)，保留Accepted任务正文和原始修订，不用执行记录重新改变需求。正式价格缺档拒绝，试玩价格为显式隔离测试配置。

本次流程追溯见[build审计](../../../reviews/st09-build-process-audit.md)及[可复现计划检查](verify-build-audit.py)。旧任务正文的pending是Approved修订快照；当前执行状态只读execution.json，不把勾选/状态变更伪装成新批准。下一故事按用户最新决定为ST10，城镇界面缺口不新增为其前置。
