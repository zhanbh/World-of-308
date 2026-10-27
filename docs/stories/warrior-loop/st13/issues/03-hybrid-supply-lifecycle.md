---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st13-03
status: accepted
revision: "de2d821a52f896912d0ad38a41579bd51cbf1cae367950aa7346d347d1989ceb"
accepted_revision: "de2d821a52f896912d0ad38a41579bd51cbf1cae367950aa7346d347d1989ceb"
derived_from:
  - artifact_id: spec:warrior-loop-st13
    revision: "09bc9716057a26d11b177816d25259d8cfdcee64c6771359a60a2ea158ae278b"
    path: docs/stories/warrior-loop/st13/spec.md
implements: [ST13]
blocked_by: ["ST13-02"]
approval_kind: human
approval_evidence: "确认，开始吧"
---
# ST13-03 混合战斗补给：同刻顺序、换房与原操作恢复

依赖02。交付：玩家在怪物对抗中连续用药/饰品/技能，切片、换房、短恢复后库存、效果和旧技能快照一致。

- 同刻先到期状态、合法药品/饰品效果，再处理已生成伤害节点与死亡、新起手；同tick新技能能使用之前合法补蓝结果，失败动作不吞后续输入。
- 受控可用药但不解控；药品/饰品不取消当前动作或提前释放职业锁。对未明确的饰品受控可用性，本轮建议允许激活但不解除控制、不赋免伤，作为任务图一并确认的候选；不回写成历史已确认决定。
- 同一片段内候选库存逐次消费，同模板绑定顺序和每组CD严格，冲突丢弃整份旧候选；查询原操作不再次模拟、补药或刷新期限。
- 真实联网加载推进与恢复暂停矩阵、增益结束/角色死亡清理、回城重置/旧场景拒绝均可复现；未实现ST14/16完整场景明确保留GAP，不能用伪终局handler模拟成功。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
