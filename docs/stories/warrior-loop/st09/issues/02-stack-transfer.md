---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st09-02
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st09
    revision: "9394d40b88d29d4203c7deda0a5418e20f644557fef7cf1c7b54795635794bec"
    path: docs/stories/warrior-loop/st09/spec.md
implements: [ST09]
blocked_by: [1]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST09-02：拖动堆叠物品存取并选择数量

**Blocked by：** ST09-01。

**交付：** 左库右包拖动后弹选量，默认整叠，确认提交；取消不发写请求，成功后刷新两容器。

- [ ] 同模板版本/绑定归属兼容才填充，每堆≤20；非法数量/不同账号/角色绑定进账号库拒绝；本角色绑定允许个人库，存取不改绑定。
- [ ] 所选数量不能全部容纳时整笔拒绝，提示可容纳量，不能部分转移或部分扣减。个人/账号页签不能串操作，不增加金库整理或任意跨库直转。
- [ ] 原子两容器、余量/输出traceRef与一笔有界J、A/O；全量数量与绑定池守恒，不递归追源，不留下两份余额。
- [ ] UI提交中防重；未知关窗重开沿原ID确认或显式重发原意图，不换ID；并发、每写点失败、迟包、来源变化、部分堆空间边界验证。


完成证据：待实现后记录实际命令、版本、结果及平台/设备GAP；不将夹具或静态稿当整故事完成。
