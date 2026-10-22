---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st03-04
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st03
    revision: 39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd
    path: docs/stories/warrior-loop/st03/spec.md
implements: [st03-town-authority]
blocked_by: [3]
---
# 04：私有读模型与字段裁剪

**What to build:** 实现银行资产与个人金库查询对有效银行 `ServiceContext` 的强制校验；实现完整邮件列表查询对有效邮箱 `ServiceContext` 的强制校验；实现 HUD 仅查询未读摘要/红点，禁止远程全量预取。

**Blocked by:** 03。

## Acceptance criteria

- [x] 银行私有读模型：未携带或携带无效/过期银行 `ServiceContext` 读取个人金库及资产明细直接拒绝；持有有效上下文则返回金库格位数据。
- [x] 邮箱私有读模型：未携带或携带无效/过期邮箱 `ServiceContext` 读取完整邮件列表直接拒绝；持有有效上下文返回邮件与附件列表。
- [x] HUD 摘要轻量裁剪：HUD 仅允许查询未读邮件总数、红点等元数据，严禁借远程预取返回金库全量格位或邮件正文/附件。

## Tests and evidence

测试入口：读模型查询应用入口。
- 无上下文直接请求银行/邮箱接口返回拒绝。
- 失效上下文请求读取返回拒绝。
- HUD 摘要接口返回精简字段，不包含任何金库/附件明细。
