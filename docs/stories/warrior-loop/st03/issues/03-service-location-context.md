---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st03-03
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st03
    revision: 39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd
    path: docs/stories/warrior-loop/st03/spec.md
implements: [st03-town-authority]
blocked_by: [2]
---
# 03：服务地点授权与 ServiceContext 机制

**What to build:** 实现地图服务锚点（银行、邮箱、铁匠铺、商店）交互半径判定（源像素距离平方 ≤ 24² = 576），签发绑定角色与地点版本的 `ServiceContext`；并在角色移动出界、关闭面板、切场景或代次改变时将旧上下文作废。

**Blocked by:** 02。

## Acceptance criteria

- [x] 服务半径授权：角色权威坐标与合法服务锚点距离平方 ≤ 576 且同场景时，签发有效 `ServiceContext`（包含 `accountId`, `characterId`, `rolePlayEpoch`, `sceneEpoch`, `locationRevision`, `anchorId`, `serviceKind`）。
- [x] 超距与非法请求拦截：距离 > 24 像素或未注册锚点返回 `LOCATION_NOT_ALLOWED` 或 `CONFIG_NOT_READY`。
- [x] 上下文失效机制：角色发生移动离开服务范围、主动关闭面板、场景切换或代次递增时，当前活跃的 `ServiceContext` 立即失效。

## Tests and evidence

测试入口：服务授权单元测试与事务集成。
- 临界距离测试：距离平方 576 允许，577 拒绝。
- 角色移动后原上下文无法继续作为有效凭据。
- 切代次/切场景后原上下文失效。
