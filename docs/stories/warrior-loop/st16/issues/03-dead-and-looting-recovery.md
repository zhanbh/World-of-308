---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st16-03
status: accepted
revision: 95f1a79948de49276eea69318f014f1176635c98a2f7608bda9e3b46a20c1ae9
accepted_revision: 95f1a79948de49276eea69318f014f1176635c98a2f7608bda9e3b46a20c1ae9
derived_from:
  - artifact_id: spec:warrior-loop-st16
    revision: d428cb55274071ed2d64c91e1ac1b11412130ba7b0d88e5f4c6164d5a3869780
    path: docs/stories/warrior-loop/st16/spec.md
implements: [ST16]
blocked_by: [1]
approval_kind: human
approval_evidence: '整体确认，连续实施ST16'
---
# ST16-03 死亡与通关后恢复

**Blocked by:** 1

## 03：死亡与通关后恢复

依赖01；可与02并行。分别从已确认dead/active与completed/looting出发恢复完整视图，接回正确控制限制和真实掉落/终局回执；本片用已确认、无在途业务写的起点，02的交叉竞争在05组合验证。

验收：dead保持dead、原deathIndex/截止不变，不清职业/道具CD、不自动复活；已有尾伤仍只在合法活动段推进。completed不改failed、不重发奖励，场景未关闭可合法移动拾取，恢复clearReceipt固定路由、地面dropId/roomToken和体力快照。looting不要求战斗2秒缺口；长断线关闭后保留已入包/已完成收益。


## 共同交付边界

来源为上级已批准spec及task-plan，沿source-of-truth的主题合同。测试边界已批准：公开协议/纯模型、真实服务与MemoryStore/传输、Cocos生命周期及离线构建。保留已确认资产和原结果，不离线补报；实际证据、预算与GAP进入execution和专属评审文件。无Jira、安装、云资源、浏览器或外部发布。
