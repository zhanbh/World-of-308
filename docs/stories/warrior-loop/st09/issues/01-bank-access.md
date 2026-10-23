---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st09-01
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st09
    revision: "9394d40b88d29d4203c7deda0a5418e20f644557fef7cf1c7b54795635794bec"
    path: docs/stories/warrior-loop/st09/spec.md
implements: [ST09]
blocked_by: []
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST09-01：到银行打开个人/账号金库

**Blocked by：** 本故事内无；外部已具备ST03/ST04。

**交付：** 从合法银行服务上下文读取左右两侧，显示左库右包5列独立滚动；个人/账号单页签互斥，当前页签容量、已用与锁格正确。先交付可真实读取的Cocos银行面板，不提供固定成功按钮。

- [ ] 可信身份、当前会话/选角、角色/银行上下文代次与地点授权；离开银行/旧上下文/他人角色拒绝，背包不借路径绕过库权限。
- [ ] 个人库本角色20格起，账号库本账号100格；账号库不能返回背包或个人库；查询裁掉内部身份和流水正文。
- [ ] 页签切换取消选择/拖动，旧响应不得覆盖另一页签或另一角色；加载/明确空/失败与关闭可用。
- [ ] 权威查询contract/真实内存service integration + 客户端状态/实际Cocos切页与滚动演示。第二角色只作为隔离夹具，不引入猎人玩法。


完成证据：待实现后记录实际命令、版本、结果及平台/设备GAP；不将夹具或静态稿当整故事完成。
