---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st15-05
status: accepted
revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
accepted_revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
derived_from:
  - artifact_id: spec:warrior-loop-st15
    revision: "3be6725f53814b036db495f823cf6680a3e29ea0ee8085998db07675819df6c2"
    path: docs/stories/warrior-loop/st15/spec.md
implements: [ST15]
blocked_by: [4]
approval_kind: human
approval_evidence: "好的，开始吧"
---
# ST15-05 全链路终局最坏事务预算、每写点故障与两轴独立评审

依赖 04。交付：端到端可重复演示怪物掉落拾取、满包留地、首领击杀即刻通关、免死复活、终局奖励路由与退出全流程，归档完整证据与 GAP。

- 覆盖极限竞争与物理预算用例：
  1. 满包拾取阻断（`BAG_FULL`）与地面保留；
  2. 首领击杀同时 8 怪并发清场，收益完整汇总；
  3. 首领与玩家同刻击杀，免纹章免费复活；
  4. 终局升级跨 6 级节点邮件不重复发放；
  5. 满包通关装备走 pending 路由及后续提取；
  6. 末房武器耐久扣至 0 仍保持通关成功；
  7. 验证 `enhancement-terminal-budget-v1.md` 规定的最坏读写键预算（R44 / W33）。
- 全量 7/7 门禁通过（包含 backend 639+ 测试、shared 契约、纯模型与 UI 模型测试）。
- Standards 与 Spec 两轴独立复核，更新交付记录至 `docs/reviews/st15-local-verification.md`。
- 无 Jira、外部发布、依赖安装和云操作。微信 SDK/真机/云端数据库保留独立 GAP。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
