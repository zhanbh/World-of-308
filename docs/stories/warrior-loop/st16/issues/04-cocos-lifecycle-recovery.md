---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st16-04
status: accepted
revision: ceabcc15796ad318bdc0b4babf4844de91335741de376a38ec864c6539fa9e22
accepted_revision: ceabcc15796ad318bdc0b4babf4844de91335741de376a38ec864c6539fa9e22
derived_from:
  - artifact_id: spec:warrior-loop-st16
    revision: d428cb55274071ed2d64c91e1ac1b11412130ba7b0d88e5f4c6164d5a3869780
    path: docs/stories/warrior-loop/st16/spec.md
implements: [ST16]
blocked_by: [2, 3]
approval_kind: human
approval_evidence: '整体确认，连续实施ST16'
---
# ST16-04 Cocos生命周期与交互

**Blocked by:** 2, 3

## 04：Cocos生命周期与交互

依赖02和03的完整编排。把hide/show、显式暂停/恢复、网络未知/重试接入现有权威战斗和掉落场景；关闭预测、清除按键持有，确认恢复后再允许对应动作；重登走既有登录流程。保留本地沙盒隔离。

验收：纯模型状态与真实transport驱动Cocos适配入口，恢复中不可发新攻击/资产操作；死者不误恢复攻击、looting不误关闭拾取；显示“正在恢复战斗状态”及终止提示“网络中断，请重新进入游戏”。旧组件销毁/重新attach隔离回调。离线构建通过不等于真实手机前后台/断网验收。


## 共同交付边界

来源为上级已批准spec及task-plan，沿source-of-truth的主题合同。测试边界已批准：公开协议/纯模型、真实服务与MemoryStore/传输、Cocos生命周期及离线构建。保留已确认资产和原结果，不离线补报；实际证据、预算与GAP进入execution和专属评审文件。无Jira、安装、云资源、浏览器或外部发布。
