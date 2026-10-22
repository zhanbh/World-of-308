---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st04-01
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st04
    revision: "10a5967302a81abe4f6e46998ca5e83d1a7da059072e15302e2bd61637612543"
    path: docs/stories/warrior-loop/st04/spec.md
implements: [ST04]
blocked_by: []
external_capability_dependencies: [E01-minimal-contract, ST02-owned-backpack]
approval_kind: human
approval_evidence: "确认，开始吧"
execution_state: local-verified
---

# ST04-01：打开背包并完成权威正倒序排序

**Blocked by：** 外部E01最小公开命令/结果/检查合同、ST02归属与合法背包能力；无本故事内阻塞项。

**交付：** 玩家打开自己的背包，执行排序并看到权威结果；通过窄协议接入应用服务、容器模型与客户端状态，不仅新增纯排序函数。该任务只验证无可合并堆的排序路径；完整“一键整理”尚未交付，不把它当最终整理入口开放。

- [ ] 正序装备→消耗品→材料，装备部位固定顺序/品质降序/装等降序，同键稳定；模板排序稳定；正序空格末，倒序按已确认规则反转排列、空格首。固定部位枚举以权威配置为准，不自行发明优先级。
- [ ] 实际容量20～100格，锁格不可写；只整理当前角色背包，不改金库、装备实例属性/location/version或快捷绑定。
- [ ] 缺失/畸形sortHeader明确拒绝或进入受控重建，不默认空值排序，不在此新增全历史扫描。
- [ ] 归属/会话/版本校验、同operation同参重放/异参拒绝、O/J/A和容器原子提交；纯排序保留quantity与traceRef，仅记录有界排列。
- [ ] 客户端具有加载、明确空、失败、提交中、结果未知状态；未知沿原operation恢复，迟到旧版本不覆盖新背包。
- [ ] unit验证排序边界；内存事务integration验证并发、逐写故障和提交丢响应；contract验证公开DTO/授权/拒绝；提供客户端状态或命令演示。真实平台待验单列。

## 证据与状态

尚未实施；外部前置已核实，详见[开工检查](../build-preflight.md)。未来完成必须记录实际测试命令、结果、代码版本及未覆盖平台/真机项，不用夹具通过代表整故事Done。


## 本轮实际交付

本地服务/纯协调器及自动化验证完成；证据见[ST04验证](../../../../reviews/st04-local-verification.md)。真实Cocos拖拽、微信传输/持久存储、SDK和真机仍待接入验收，不能标整故事Done。任务范围和依赖未改变，状态更新不表示重新批准产品规则。


2026-10-23运行时进展：Cocos面板及本机鼠标/触屏模拟已有实测，旧“待接入Cocos”边界更新为正式微信和手机设备GAP。见[实际界面证据](../../../../reviews/st04-cocos-verification.md)。任务范围与已批准依赖未改变。
