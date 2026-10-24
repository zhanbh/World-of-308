---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st10-01
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st10
    revision: "23272608bc24780e09b3850e117598a78d44fea7614ee7d9015a1060989f34ed"
    path: docs/stories/warrior-loop/st10/spec.md
implements: [ST10]
blocked_by: []
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST10-01：到副本入口选择难度并创建挑战

**Blocked by：** 故事内无；外部复用ST03/ST05实际能力。

**What it delivers：** 角色走到服务端认可入口后读取难度选项，主动确认才创建挑战；返回锁定的配置/等级/体力快照，客户端可展示并通过命令演示重放。

- 可信身份/当前会话/选角/rolePlayEpoch，城镇地图和入口范围与真实装备、等级、难度解锁重验；入口上下文由服务端发放并绑定实际位置，不能凭客户端传nearDungeon。
- 0体力/无武器/破损武器拒绝，1体力可进；普通与特殊副本等级/难度规则、账号共享解锁、高等级回刷沿规格，不加评分或前本通关门槛；选项不显示体力消耗。
- 创建不扣首房费、不创建已付费首房。锁release、怪物等级/装备来源和体力快照；首本紫名安排在创建时固定，重试不重抽。
- 账户active/openScene指针、角色location/reservation、挑战与原结果同事务；兼容真实LoginService接管/新launch关闭与旧结算不覆盖新挑战。
- 同ID同参/异参、权限、失效入口、边界值、并发创建、每写点失败、丢响应；真实ST03/ST05组合。缺正式配置拒绝，不补默认有效关卡。
