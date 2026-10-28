---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st15-01
status: accepted
revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
accepted_revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
derived_from:
  - artifact_id: spec:warrior-loop-st15
    revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
    path: docs/stories/warrior-loop/st15/spec.md
implements: [ST15]
blocked_by: []
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST15-01 房间怪物掉落生成、拾取入包与满包留地

无本包前置。交付：怪物死亡生成地面掉落物，接收 `drop.collect` 拾取指令，完成材料合堆或装备物化入包，满包时保留地面并阻断。

- 怪物击杀在房间内生成带坐标与唯一 `dropId` 的掉落物（`templateId`, `quantity`, `quality`, `itemLevel`, `x`, `y`, `collected: false`）。
- 服务端校验玩家坐标与掉落物距离（<= 32px）；超距拒绝 `NOT_FOUND_OR_FORBIDDEN`。
- 空间检查与物化：
  - 材料：优先寻找同模板且同绑定未满堆叠合堆；无则占新空格；
  - 装备：检查背包空位，成功拾取物化唯一实例 `id = H(sourceKey, ordinal)` 并放入背包；
  - 满包阻断：无可用空格返回 `BAG_FULL`，掉落物状态保持 `collected: false` 留在地面。
- 掉落物生命周期：切房或副本关闭未拾取物失效；已拾取物生成 assetJournal 审计流水与 assetOp 凭据。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
