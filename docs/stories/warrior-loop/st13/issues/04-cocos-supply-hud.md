---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st13-04
status: accepted
revision: "e40f718bee191f294ad32c752e7846c3167ee5003e36d24e9e08697d04e3b904"
accepted_revision: "e40f718bee191f294ad32c752e7846c3167ee5003e36d24e9e08697d04e3b904"
derived_from:
  - artifact_id: spec:warrior-loop-st13
    revision: "09bc9716057a26d11b177816d25259d8cfdcee64c6771359a60a2ea158ae278b"
    path: docs/stories/warrior-loop/st13/spec.md
implements: [ST13]
blocked_by: ["ST13-03"]
approval_kind: human
approval_evidence: "确认，开始吧"
---
# ST13-04 Cocos战斗补给HUD与可操作联调

依赖03。交付：战斗界面三药位、独立饰品按钮接真实本地服务，能够操作并看到权威库存、CD、增益与恢复结果。

- 显示未绑定/耗尽/未装备/等待/CD/合法可用、提交中/结果未知/错误/死亡等状态；耗尽保留图标，血蓝共享CD展示正确，提示不过度遮挡摇杆与四技能。
- 触屏热区互不重叠；用药不打断移动/攻击，不能把本地演示字段当已提交资产；未知结果按原意图恢复，迟回调不覆盖新场景。
- 本地Cocos构建、浏览器鼠标与触屏模拟分别实际取证。沿当前战斗场景接权威输入与公开状态，不能只在Prototype几何演示里改数字。完整美术/手机手感不是本地构建通过即可验收。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
