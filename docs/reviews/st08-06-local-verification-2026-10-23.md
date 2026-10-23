# ST08 06 本地综合验证记录

2026-10-23。统一开发分支 `feat-1.0.0`，Node 24.19.0，离线环境。

## 验证目的

验证 ST08（邮件与待领的可恢复批量领取）所有核心设计、存储实体、步进事务切片、满包跳过、实时过期、跨请求断点恢复、关窗重验及纯模型协调器自动驱动全部达成已核准规格验收标准。

## 验证命令与结果

### 1. 全量工程门禁与回归

```powershell
$env:WORLD308_TYPESCRIPT="C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar.unpacked\node_modules\typescript"
node tools/check-all.cjs
```

**执行结果**：
- CHECK 1: tooling contracts — PASS
- CHECK 2: shared/backend types — PASS
- CHECK 3: shared value contracts — PASS
- CHECK 4: client pure-model types — PASS
- CHECK 5: backend regression (legacy and v2) — PASS (264/264 测试通过)
- CHECK 6: client model regression — PASS (19/19 模块全绿)
- CHECK 7: client UI-model regression — PASS (7/7 UI 模块全绿)
- **SUMMARY: 7/7 checks passed (100% 成功率)**

### 2. ST08 专属自动化测试集

```powershell
node --test backend/test/batch-planning.test.mjs
node --test backend/test/mail-batch-service.test.mjs
node --test backend/test/mail-coordinator-batch.test.mjs
```

**执行结果**：
- `batch-planning.test.mjs`:
  - ✔ planBatchFromMails scans up to 100 mails, sorts reverse-chronologically, and bounds candidates to 20
  - ✔ planBatchFromSelection bounds explicit selection to 20 items and maps attachments
  - ✔ sliceBatchStep slices up to 4 items and generates nextCursor
- `mail-batch-service.test.mjs`:
  - ✔ batch execution limits each request to at most 4 items with cursor progression
  - ✔ full bag equipment is skipped while subsequent stack item merges successfully (AC8)
  - ✔ real-time expiry intercept skips expired mail item during step execution
  - ✔ location re-verification blocks batch advancement after service closed and resumes on reopen
  - ✔ concurrent batches competing for same attachments preserve quantity conservation
  - ✔ child operation receipts and recovery via operation.get
  - ✔ multi-step execution across 20 candidates continues to completion
- `mail-coordinator-batch.test.mjs`:
  - ✔ MailCoordinator.claimAvailable auto-loops across steps until completed and aggregates delivered & skipped
  - ✔ MailCoordinator.claimAvailable halts immediately if panel is closed mid-loop
  - ✔ MailCoordinator.claimAvailable enters unknown on network drop and recovers via operation.get

## 结论

ST08 所有 5 个实施工单（01～05）全部验证闭环，满足生产准入要求。
