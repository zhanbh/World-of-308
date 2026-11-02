# ST19-02 实现与验证

日期：2026-11-02
实现分支：`feat/st19-02-holdings-isolation`，合入基点 `504a65d`。
代码提交：`b8d42eb`。
范围：全口径持有同步检测与双角色严格隔离。包含 13 槽穿戴/背包/个人金库/账号金库/有效邮件/待领全口径聚合；严格双角色私域隔离；邮件时效性判定；未拾取地面物排除；损坏摘要完整性保护。
来源：[ST19 实施规格](../stories/warrior-loop/st19/spec.md)、[02 实施任务](../stories/warrior-loop/st19/issues/02-holdings-isolation.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **持有摘要完整性与多源持有判定（`backend/src/challenge/drop-strategy.ts`）**：
   - 提取并导出 `validateHoldingsSummaryIntegrity(summary, expectedScope, characterId, domain)`：严格校验 `schemaVersion === 2`、`revision >= 0`、`scope` 匹配、`domainRef` 匹配、`characterId` 在角色 scope 下精确匹配且账号 scope 下必须为 `undefined`、`entries` 上限 $\le 64$、条目键唯一且存在于 `domain.keys`、`permanentCount >= 0` 且安全整数、`mailLatestExpiryAt` 非空时为合法安全整数；
   - 提取并导出 `isSlotHeld(collectionKey, summaries, now)`：聚合检索 summaries 中的持有状态；当 `permanentCount > 0` 或（仅限 character scope 下）`mailLatestExpiryAt !== null && mailLatestExpiryAt > now` 时判定为已持有；
   - 导出 `getMissingCandidates(candidates, context)`：基于 `isCandidateMissing` 过滤缺件候选池；
   - `selectCandidateByStrategy` 在执行 `missing-slot-first` 或 `weighted-missing-first` 前，强制调用 `validateHoldingsSummaryIntegrity` 分别校验角色 summary 与账号 summary，任何损坏整笔原子报错，绝不将损坏数据当成缺件补发。

2. **全口径覆盖与双角色私域严格隔离（`backend/test/holdings-multi-scope.test.mjs` 6/6 通过）**：
   - **多容器覆盖**：涵盖 13 槽穿戴、背包、个人金库、公共账号金库、有效邮件、永久待领全 6 类存储源聚合断言；
   - **双角色私域隔离**：同一账号下角色 A 拥有的套装装备（无论是否绑定），角色 B 缺件判定时绝对不视为持有（11 部位全缺）；
   - **账号公共金库共享**：通过 `BankService` 执行真实的 `inventory.transfer`，角色 A 将套装武器存入 `accountVault`，触发账号 summary 增量与角色 summary 减量，此时角色 B 判定缺件时正确识别账号金库共享武器，不再作为缺件补发；
   - **邮件时效性边界**：`now < expiry` 视为已持有；`now >= expiry` 毫秒边界精准判定为邮件贡献已过期并自动恢复为缺件；
   - **未拾取地面掉落排除**：掉落在地面的物品未拾入背包前，不计入持有摘要，缺件判定依然认定为缺件；
   - **摘要损坏防伪**：摘要篡改（负数 permanentCount、domainRef 不匹配、角色 ID 伪造、非法 collectionKey、旧 schemaVersion）时整笔原子拒绝。

## 验证证据

1. **定向多口径与隔离测试套件（`backend/test/holdings-multi-scope.test.mjs` 6/6 全部通过）**：
   - `Multi-Scope Coverage: 13-slot wear, bag, vault, mail and pending grant coverage`：通过；
   - `Dual-Character Private Isolation: Character A private assets never satisfy Character B missing slots`：通过；
   - `Mail Expiration Boundary: now < expiry is held, now >= expiry is missing`：通过；
   - `Holdings Integrity Protections: Rejects corrupted summaries without awarding phantom items`：通过；
   - `Ground Drops Exclusion: Uncollected ground drops do not count towards holdings`：通过；
   - `BankService deposit into accountVault updates account holdings and shares with Character B`：通过。

2. **跨模块关联回归套件（71/71 全部通过）**：
   - `backend/test/drop-strategy.test.mjs`：8/8 通过；
   - `backend/test/holdings-multi-scope.test.mjs`：6/6 通过；
   - `backend/test/terminal-settlement.test.mjs`：11/11 通过；
   - `backend/test/bank-v2.test.mjs`：43/43 通过；
   - `backend/test/bank-composition.test.mjs`：3/3 通过。

3. **TypeScript 类型安全与模型门禁**：
   - `backend/tsconfig.json` 与 `tools/tsconfig.models.json` 使用 TS 5.8.2 检查 Exit Code 0；
   - 客户端纯模型与 UI 模型回归 100% 通过（`check-model.cjs`、`check-ui-model.cjs`）；
   - 代码格式门禁：`git diff --check` 通过。

## 边界与已知限制

- 仅交付全口径检测、双角色隔离与完整性保护。
- 固定样本重映射、全齐平滑回退与提交不可变性留待 ST19-03；
- 客户端套装收集状态展示与生命周期联动留待 ST19-04；
- 全链路大闭环联合验收与两轴评审留待 ST19-05。
- 无 Jira、未向远程 push。
