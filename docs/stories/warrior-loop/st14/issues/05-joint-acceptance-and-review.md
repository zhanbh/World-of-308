---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st14-05
status: accepted
revision: "3ad2cf0a05ff5dc8583546c98ac453a8a62cb9f5c3bfeb12db59118158bfa993"
accepted_revision: "3ad2cf0a05ff5dc8583546c98ac453a8a62cb9f5c3bfeb12db59118158bfa993"
derived_from:
  - artifact_id: spec:warrior-loop-st14
    revision: "185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12"
    path: docs/stories/warrior-loop/st14/spec.md
implements: [ST14]
blocked_by: [4]
approval_kind: human
approval_evidence: "好的，开始"
---
# ST14-05 全链路联合集成、极端竞争预算与两轴独立评审

依赖 04。交付：端到端可重复演示死亡、倒计时、纹章扣除、残留通关与失败退出全流程，归档完整证据与 GAP。

- 覆盖极限竞争用例：
  1. 最后一毫秒复活请求跨越 deadline（拒绝且零扣款）；
  2. 死亡窗口第 8 秒残留击杀 Boss 与手动复活请求并发，验证通关免费复活且不扣纹章；
  3. 死亡期间击杀小怪升级，验证保持死亡且不隐式回血；
  4. 特殊副本 3 次复活后第 4 次死亡拒绝；
  5. 背包无纹章时的阻断与提示；
  6. 断线重连处于死亡窗口中的状态同步与倒计时剩余时间恢复。
- 全量 7/7 门禁通过（包含 backend 616+ 测试、shared 契约、纯模型与 UI 模型测试）。
- Standards 与 Spec 两轴独立复核，更新交付记录至 `docs/reviews/st14-local-verification.md`。
- 无 Jira、外部发布、依赖安装和云操作。微信 SDK/真机/云端数据库保留独立 GAP。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
