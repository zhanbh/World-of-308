---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st09-03
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
# ST09-03：整件装备存取与共享持有范围同步

**Blocked by：** ST09-01；不依赖ST09-02，接口稳定后可独立验证。

**交付：** 装备跨左右面板拖动整件存取，服务端确认前不提前移动；穿戴中装备不能直接存库，先通过既有穿脱功能入包。

- [ ] 双容器slots与实例location/version同笔；不复制装备payload，不改变词条、强化、耐久或绑定；目标满拒绝，无物品丢失/复制。
- [ ] 当前角色内部个人库↔背包总持有不变；背包↔账号库按实际物理scope移动同步持有摘要，其他角色私物不计共享；非套装不凭空加持有键。
- [ ] 所有权限与服务上下文持续重验，结果未知沿原请求；同ID异参、旧版本、并发相反方向、每写点故障及跨scope回滚有断言。
- [ ] Cocos整件拖放演示、换页/关闭取消和错误反馈；ST05/ST06正常合法资产到银行的实际内存组合验证，不用只有孤立空容器的测试声称兼容。


完成证据：待实现后记录实际命令、版本、结果及平台/设备GAP；不将夹具或静态稿当整故事完成。
