---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-e01-03
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
# 03: 登录与会话协议

**What to build:** 调用方能构造并验证两步登录/会话请求与原结果视图，且无法通过公开DTO自报可信身份。

**Blocked by:** 02。

**Status:** draft（任务图已确认，实施产物尚未验收）。

## Acceptance criteria

- [x] 提供prepare/commit/票据结果、角色代次/expected及结果未知/被替代的公开schema。
- [x] 共享schema与调用方wire契约harness区分登录前请求和登录后会话信封，拒绝body身份作为VerifiedIdentity；不模拟真实认证。
- [x] 命名/创角等公开字段引用当前规则，标注事务占名和认证由后续ST01/ST02承担。

## Tests and evidence

- 正确/缺字段/异参结构、错误版本/过长ID、会话/票据响应的类型及运行校验。
- 公开序列化无subject/session_key/AppSecret，平台错误不透传秘密。
- 旧v1成功结果不能冒充新的有效会话；真实接管/初始化作为后续集成GAP而非假模拟成功。

QA映射：QA01, QA02, QA39；原计划组号不是已通过测试数。证据记录提交/配置/工具版本、运行命令、期望/实际及剩余GAP。

本地结果：统一检查7/7组通过，共享测试11/11（本任务新增5项）通过。实施产物保留draft，尚未独立验收；[验证记录](../../../../reviews/e01-03-local-verification-2026-10-22.md)、[协议映射](../../../../design/e01-session-contract-implementation-v1.md)。

## Scope boundary

不实现真实微信身份、账号创建或服务端票据提交；不引入HTTP/匿名正式资产入口。

源规格：[E01 spec](../spec.md)。主题规则以[真相源索引](../../../../backend/source-of-truth.md)定位；实现位置可按代码现状选择，不把本任务文件当第二份玩法规格。
