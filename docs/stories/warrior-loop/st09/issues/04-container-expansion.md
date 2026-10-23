---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st09-04
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
# ST09-04：背包/个人库分档扩容及金额确认

**Blocked by：** ST09-01及既有钱包能力；不必等待02/03全部实现。

**交付：** 从背包锁格/扩容入口或银行个人库锁格读取报价，明确容量变化与金额，选币后确认、服务端原子扣款解锁，再刷新容量与余额。

- [ ] 背包仅金币且城镇可扩；个人库只在银行、金币/点券择一；都每次+20至100，同档并发只扣一次；账号库100全开不卖扩容。
- [ ] 配置版本与quoteRef/目标stage/钱包及容器expected匹配；价格缺失/变化、余额不足、越级、已解锁/满容量拒绝；不以已确认兑换比推导价格。
- [ ] 同笔钱包/容器/原结果/流水/账号栅栏；失败不扣款不解锁，原请求重放不再扣款。UI确认取消无写、未知不第二次支付，显示实际所选一种币。
- [ ] 背包与个人库各阶段/两币配置、并发双币抢同档、每写点故障和关闭恢复验证；实际Cocos锁格/报价/确认/满容量演示。


完成证据：待实现后记录实际命令、版本、结果及平台/设备GAP；不将夹具或静态稿当整故事完成。
