---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st04-03
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st04
    revision: "10a5967302a81abe4f6e46998ca5e83d1a7da059072e15302e2bd61637612543"
    path: docs/stories/warrior-loop/st04/spec.md
implements: [ST04]
blocked_by: [1]
external_capability_dependencies: [E01-minimal-contract, ST02-owned-backpack]
approval_kind: human
approval_evidence: "确认，开始吧"
execution_state: local-verified
---

# ST04-03：自定义3个道具快捷位并随背包刷新数量

**Blocked by：** ST04-01的权威背包视图及结果恢复能力；不依赖ST04-02，二者接口稳定后可并行，但共享入口修改需串行集成。

**交付：** 玩家从背包拖入合法消耗品绑定、替换或移除快捷位；绑定模板而非stackId，背包整理、数量变化后显示仍正确。

- [ ] 固定3位，验证索引/可绑定模板/归属；不允许装备或复活纹章进入普通用药路径；清除绑定不删除物品。
- [ ] 同模板可用数量按背包合法堆汇总，耗尽显示0且保留绑定、补货自动恢复；数量变化不得由快捷位再维护第二份资产余额。
- [ ] 模板绑定与整理后stackId无关；用药消费优先角色绑定→账号绑定→未绑定的合同留给ST13实现，本任务提供相应读模型兼容测试，不伪造战斗药效/CD服务。
- [ ] 绑定命令与原结果、必要角色版本更新同笔；客户端拖入、替换、清除具备提交中/未知/失败和低版本保护；任何失败不消费道具。
- [ ] unit/contract/内存integration验证索引越界、非法模板、越权、重复/异参、并发绑定与整理、清空后补货；演示本地状态连接，真机拖动与正式传输另记录GAP。

## 证据与状态

尚未实施；外部前置已核实，详见[开工检查](../build-preflight.md)。未来完成必须记录实际测试命令、结果、代码版本及未覆盖平台/真机项，不用夹具通过代表整故事Done。


## 本轮实际交付

本地服务/纯协调器及自动化验证完成；证据见[ST04验证](../../../../reviews/st04-local-verification.md)。真实Cocos拖拽、微信传输/持久存储、SDK和真机仍待接入验收，不能标整故事Done。任务范围和依赖未改变，状态更新不表示重新批准产品规则。


2026-10-23运行时进展：Cocos面板及本机鼠标/触屏模拟已有实测，旧“待接入Cocos”边界更新为正式微信和手机设备GAP。见[实际界面证据](../../../../reviews/st04-cocos-verification.md)。任务范围与已批准依赖未改变。
