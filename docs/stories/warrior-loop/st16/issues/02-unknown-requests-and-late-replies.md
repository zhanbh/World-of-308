---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st16-02
status: accepted
revision: b6eb5308c07136625d9ac7ca61fbdab52411b8687062bbf694473c281c6f24b9
accepted_revision: b6eb5308c07136625d9ac7ca61fbdab52411b8687062bbf694473c281c6f24b9
derived_from:
  - artifact_id: spec:warrior-loop-st16
    revision: d428cb55274071ed2d64c91e1ac1b11412130ba7b0d88e5f4c6164d5a3869780
    path: docs/stories/warrior-loop/st16/spec.md
implements: [ST16]
blocked_by: [1]
approval_kind: human
approval_evidence: '整体确认，连续实施ST16'
---
# ST16-02 未知请求和迟包

**Blocked by:** 1

## 02：未知请求和迟包

依赖01提供真实恢复出口。暂停或恢复与在途simulation、drop.collect、challenge.leave及控制请求竞争时，先恢复各自原意图结果，再以权威栅栏继续或关闭；跨协调器编排统一阻新业务写，但不丢原持久意图。原查询必须在相同授权传输上可用。

验收：已提交丢响应不重复消耗/发奖，notFound后旧写和恢复两种OCC顺序；原结果仍可查但不覆盖新场景；换角色/房间/关闭时迟到回调无效；未知期间状态可见、有界重试，无离线输入补报。用真实药品或装备掉落构成资产断言，不用空操作代替。


## 共同交付边界

来源为上级已批准spec及task-plan，沿source-of-truth的主题合同。测试边界已批准：公开协议/纯模型、真实服务与MemoryStore/传输、Cocos生命周期及离线构建。保留已确认资产和原结果，不离线补报；实际证据、预算与GAP进入execution和专属评审文件。无Jira、安装、云资源、浏览器或外部发布。
