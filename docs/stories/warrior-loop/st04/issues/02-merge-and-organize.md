---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st04-02
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

# ST04-02：一键整理合并兼容堆并保留数量谱系

**Blocked by：** ST04-01；不额外依赖邮件/银行功能上线，合法来源可用已提交的最小审计夹具提供。

**交付：** 将排序路径扩成完整“一键整理”：一次提交先合堆后排序，客户端展示最终背包和实际合并摘要。

- [ ] 仅同模板、同绑定归属及其他堆叠条件兼容项合并，每堆1～20；装备不合并；不改数量/绑定/来源资格，不跨角色或跨库。
- [ ] 合并受影响的输入和输出（包括余量）写一个有界J，输出traceRef确定且可追溯；纯位置变化不增长来源链，不递归读取祖先流水。
- [ ] 合并与排序一次原子提交；同ID重试不再次合并/发物，明确拒绝不造资产流水；J已存在O缺失不得二次执行。
- [ ] 满100格、多绑定、多来源、20/21/40数量边界与重复整理守恒；银行不变、装备不被逐件改写；检测容器/流水/原结果实际UTF-8编码预算（64/128/16KiB）。预算不满足时不能截断或部分整理。
- [ ] 客户端完整整理入口在本任务验收后启用；显示提交中/未知/失败并按版本合并查询结果，不把原请求摘要当完整背包快照。
- [ ] unit、contract、内存integration覆盖每参与写点失败、冲突重试两种顺序及提交丢响应；保留有效旧事务不变量，不靠删测试造绿灯。

## 证据与状态

尚未实施；外部前置已核实，详见[开工检查](../build-preflight.md)。未来完成必须记录实际测试命令、结果、代码版本及未覆盖平台/真机项，不用夹具通过代表整故事Done。


## 本轮实际交付

本地服务/纯协调器及自动化验证完成；证据见[ST04验证](../../../../reviews/st04-local-verification.md)。真实Cocos拖拽、微信传输/持久存储、SDK和真机仍待接入验收，不能标整故事Done。任务范围和依赖未改变，状态更新不表示重新批准产品规则。


2026-10-23运行时进展：Cocos面板及本机鼠标/触屏模拟已有实测，旧“待接入Cocos”边界更新为正式微信和手机设备GAP。见[实际界面证据](../../../../reviews/st04-cocos-verification.md)。任务范围与已批准依赖未改变。
