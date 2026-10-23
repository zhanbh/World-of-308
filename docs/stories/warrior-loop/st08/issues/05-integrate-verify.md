---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st08-05
status: local-verified
plan_approval: user-confirmed
implementation_status: local-verified
revision: 2
derived_from:
  - artifact_id: spec:warrior-loop-st08
    revision: e034cf9f9a94deab20f37e164f14eec04839a675d2f70173b799d7abdaa6ce4d
    path: docs/stories/warrior-loop/st08/spec.md
implements: [st08-batch-mail-claim]
blocked_by: [4]
---
# 05：全量门禁回归、双轴独立评审与交付归档

**What to build:**
完成 ST08 全量能力集成与门禁验证，归档评审证据与提交分支：
1. **全量本地门禁回归**：
   - 运行 `tools/check-all.cjs`，确保 7/7 门禁（工具链契约、shared/backend 类型、shared 契约测试、client 纯模型类型、backend 回归测试、client 模型回归、client UI 模型回归）100% 全部通过；
   - 覆盖所有新建批次规划、分步执行、跨请求断点恢复、关窗重验及协调器一键批领测试；
2. **双轴独立评审**：
   - 编写 Standards 独立复核报告 `docs/reviews/st08-standards-independent-review-2026-10-23.md`（代码风格、无外部网络、离线工具链、本地 markdown 驱动、Node 24 严格规范）；
   - 编写 Spec 独立评审报告 `docs/reviews/st08-spec-independent-review-2026-10-23.md`（AC5、AC8、AC12、US11、US13 覆盖、真相源与物理映射一致性）；
   - 编写本地验证归档记录 `docs/reviews/st08-06-local-verification-2026-10-23.md`；
3. **提交与推送**：
   - 在统一开发分支 `feat-1.0.0` 上提交全部代码与文档变更并推送到远程仓库。

**Blocked by:** 04。

## Acceptance criteria

- [x] `tools/check-all.cjs` 7/7 门禁全绿，测试用例全部通过，零失败、零跳过。
- [x] Standards 独立评审与 Spec 独立评审完成并归档至 `docs/reviews/`。
- [x] `docs/stories/warrior-loop/st08/` 下的所有工单状态按实际证据闭环更新。
- [x] 代码整洁提交并推送到 `feat-1.0.0`。

## Tests and evidence

- `tools/check-all.cjs` 执行日志输出：7/7 门禁全部通过（264/264 测试通过）。
- 双轴独立评审报告与验证记录：
  - `docs/reviews/st08-standards-independent-review-2026-10-23.md`
  - `docs/reviews/st08-spec-independent-review-2026-10-23.md`
  - `docs/reviews/st08-06-local-verification-2026-10-23.md`
- Git 分支提交与推回证据：提交至 `feat-1.0.0` 并 push 至 `origin/feat-1.0.0`。

