---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st16-01
status: accepted
revision: db7180199e22331356655cb553b8d2f4a1e7ecb815aac536a1b66f89df050ef3
accepted_revision: db7180199e22331356655cb553b8d2f4a1e7ecb815aac536a1b66f89df050ef3
derived_from:
  - artifact_id: spec:warrior-loop-st16
    revision: d428cb55274071ed2d64c91e1ac1b11412130ba7b0d88e5f4c6164d5a3869780
    path: docs/stories/warrior-loop/st16/spec.md
implements: [ST16]
blocked_by: []
approval_kind: human
approval_evidence: '整体确认，连续实施ST16'
---
# ST16-01 存活战斗恢复纵切

**Blocked by:** 无包内前置

## 01：存活战斗恢复纵切

从真实已ready的战斗房间出发，已有移动/技能/受击后暂停，先冻结输入，再走resumePrepare、资源与完整公开证明、ready和最终当前状态核验，恢复到Movement可继续提交真实片段。复用已实现服务控制与RecoveryCoordinator；通过可重复传输演示完整流程，不只让两个协调器各自变active。

验收：原确认游标不丢、不补暂停战斗，sceneEpoch不换、timeline换代；HP/MP/CD/buff/怪物与效果保真；首次输入1.9/2.0秒及1秒预测上界；旧ready重放不刷新锚点，旧/缺/混证明不启预测。Loading阶段沿既有握手，不新造宽限。


## 共同交付边界

来源为上级已批准spec及task-plan，沿source-of-truth的主题合同。测试边界已批准：公开协议/纯模型、真实服务与MemoryStore/传输、Cocos生命周期及离线构建。保留已确认资产和原结果，不离线补报；实际证据、预算与GAP进入execution和专属评审文件。无Jira、安装、云资源、浏览器或外部发布。
