---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-e01-06
status: draft
plan_approval: user-confirmed
implementation_status: local-verified
revision: 1
derived_from:
  - artifact_id: spec:warrior-loop-e01
    revision: 60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57
    path: docs/stories/warrior-loop/e01/spec.md
implements: [e01-contract-foundation]
blocked_by: [2]
---
# 06: 配置与合法样本

**What to build:** 开发者可加载一个最小合法战士测试release，缺项/越界配置在使用前被清楚拒绝。

**Blocked by:** 02。

**Status:** draft（任务图已确认，实施产物尚未验收）。

## Acceptance criteria

- [x] 定义不可变测试release及职业/技能/地图/怪物/装备/奖励/价格等引用schema与合法域。
- [x] 构造最小战士首本普通测试样本及独立非法样本，猎人关闭且不伪造正式全1～30数值表。
- [x] 校验引用完整/非法递归/上界/整数单位、测试策略授权与公开私有资源分离；配置不从Python脚本即时导入。

## Tests and evidence

- 缺模板/价格/非法职业profile/品质装等/绑定及数组上界配置拒绝。
- 合法最小样本通过schema与引用校验，测试值有profile标识和来源。
- 后两本可审结构不等于完成全表；schema合法不等于伤害/经济或最大CP实际编码通过。

QA映射：QA36, QA39；原计划组号不是已通过测试数。证据记录提交/配置/工具版本、运行命令、期望/实际及剩余GAP。

本地6项配置测试及共享类型检查通过，保留draft，尚未独立验收。[实施映射](../../../../design/e01-release-fixture-implementation-v1.md)、[验证记录](../../../../reviews/e01-06-local-verification-2026-10-22.md)。

## Scope boundary

不做配置热发布、云资源、最终平衡或新的离线伤害试算；依赖03～05的跨消息样本由07联合验证。

源规格：[E01 spec](../spec.md)。主题规则以[真相源索引](../../../../backend/source-of-truth.md)定位；实现位置可按代码现状选择，不把本任务文件当第二份玩法规格。
