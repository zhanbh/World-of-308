---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st10-05
status: accepted
derived_from:
  - artifact_id: spec:warrior-loop-st10
    revision: "23272608bc24780e09b3850e117598a78d44fea7614ee7d9015a1060989f34ed"
    path: docs/stories/warrior-loop/st10/spec.md
implements: [ST10]
blocked_by: [4]
approval_kind: human
approval_evidence: "好的，开始吧"
execution_state: pending
---
# ST10-05：后续房继承角色状态、计时与零体力续房

**Blocked by：** ST10-04（复用已成立的完整握手及恢复时钟）。

**What it delivers：** 从服务端合法cleared旧房走到出口换下一房，继承当前角色状态，加载继续正确计时；本局体力为0或武器归零也可继续。

- 前房仍有敌人/非法出口/跳房拒绝。fixture可预置服务端cleared，不新增客户端清场命令；首房以后的完整实际战斗串接留ST11/12。
- 继承等级XP/装备耐久、HPMP、技能/两组药品/饰品CD及buff；加载分段自然回复与精确余数沿算术合同，buff中途到期正确分段，不满血蓝、不额外回复或清CD。
- 固定示例：剩5秒，prepare→activate2秒，再到ready1秒，最终剩2秒；9秒加载含4秒recovery只计5秒；重放不再次计时；跨体力刷新不补本局快照。
- 激活令旧场景地面失效，旧输入不打新怪；旧房拾取与切房通过共用A/H版本栅栏验证两种顺序。ST15拾取尚未实现时只验证真实事务争用+合法来源夹具，并明确完整拾取/发奖组合待ST15，不宣称mock为真集成。
- 客户端连续两房加载演示、旧回调/原结果防覆盖；资源失败保留此前已确认收益；终止/接管先后顺序、按需CP变更块与最大写集实际编码有证据。
