---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st12-03
status: accepted
revision: "f76b8673f8a11b175263b7dbc70f59f948b39c7e57d414f6e7e5acc4acb8f487"
accepted_revision: "f76b8673f8a11b175263b7dbc70f59f948b39c7e57d414f6e7e5acc4acb8f487"
derived_from:
  - artifact_id: spec:warrior-loop-st12
    revision: "26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7"
    path: docs/stories/warrior-loop/st12/spec.md
implements: [ST12]
blocked_by: [2]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST12-03 首本七房、额外紫名与权威清场

依赖02。交付：按真实遭遇同时出生、逐房击杀并开门，恢复不重抽或重复出生。

- 首本基础27只+额外紫名1只；挑战创建固定在展示R1～R6（协议room0～5），Boss房不出现。紫名经验倍率2，独立于身份/品质；只输出后续结算需要的稳定击杀事实，不提前实现ST15发奖。
- 紫名参与清场，房内全部死亡才开门；没有第二波，不保留客户端设清场旁路。
- 出生点可达、不重叠入口/障碍；每房最多8怪，切房/恢复保留spawn身份及已确认击杀。
- 真实ST10换房以权威清场结果校验；全房死亡、残留效果、未知结果/并发切房均覆盖。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
