---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st03-06
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-st03
    revision: 39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd
    path: docs/stories/warrior-loop/st03/spec.md
implements: [st03-town-authority]
blocked_by: [4, 5]
---
# 06：联合验收、独立评审与迁移交接

**What to build:** 运行全量 `tools/check-all.cjs` 统一检查门禁（包含既有回归与 ST03 新增城镇移动/服务授权测试），完成 Standards 与 Spec 双轴独立评审，归档验收证据并记录平台缺口。

**Blocked by:** 04, 05。

## Acceptance criteria

- [x] 全量门禁通过：运行 `tools/check-all.cjs` 全部检查组 100% 通过，类型编译 0 错误，不修改或弱化既有断言。
- [x] 独立双轴评审闭合：Standards 评审（无坏味道与硬违规）与 Spec 评审（无遗漏边界）完成并归档实际证据。
- [x] 真实缺口明确交接：ST03 状态标记为 `local-verified (platform-gap)`，声明 Cocos 城镇地图实际渲染节点与触摸摇杆操作之后置责任。

## Tests and evidence

测试入口：全量检查门禁与独立评审。
- `tools/check-all.cjs` 全量通过日志。
- 归档 `docs/reviews/st03-06-local-verification-*.md` 及双轴评审报告。
