# ST19-01 实现与验证

日期：2026-11-02
实现分支：`feat/st19-01-strategy-engine`，合入基点 `4025125`。
范围：掉落策略引擎与多策略分层体系，支持 `weighted-random`、`missing-slot-first`、`weighted-missing-first` 统一调度分发与不可变 Profile 固化，特殊本资格严格过滤。
来源：[ST19 实施规格](../stories/warrior-loop/st19/spec.md)、[01 实施任务](../stories/warrior-loop/st19/issues/01-strategy-engine.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **策略分层架构与策略注册表（`backend/src/challenge/drop-strategy.ts`）**：
   - 策略与配置完全解耦，定义枚举 `DropStrategyId = 'weighted-random' | 'missing-slot-first' | 'weighted-missing-first'`；
   - 定义不可变策略配置结构 `DropStrategyProfile`：包含 `profileId`、`version`、`schemaVersion: 1`、`strategyId`、`parameters`（如权重比 `missingWeight: 2, normalWeight: 1`）、`fallbackStrategy: 'weighted-random'`、`candidates`、`holdingsDomain`；
   - 严格 Profile 静态校验 `validateDropStrategyProfile`：校验 profileId 合法字符、正整数 version、candidate 上限（$\le 32$）及当存在套装装备时的 `holdingsDomain` 完整性与键去重；
   - 特殊副本资格门禁 `validateSpecialDungeonQualification`：套装装备掉落必须满足 `source.kind === 'special'`、`source.monsterLevel === 30`、`character.level === 30` 且 `candidate.itemLevel === 30`，普通副本（`kind: 'first'`）或低等级尝试配置/掉落套装时直接抛出 `CONFIG_NOT_READY`。

2. **核心策略算法实现（`selectCandidateByStrategy`）**：
   - `isCandidateMissing`：精准比对角色与账号双 scope 持有摘要，将永久拥有（`permanentCount > 0`）与未过期邮件（`mailLatestExpiryAt > now`）以及账号金库共享物准确判定为“已持有”，仅当全 scope 均未拥有且邮件已过期（`now >= mailLatestExpiryAt`）时判定为“缺件”；
   - `missing-slot-first`：测试期 100% 优先补全缺件部位；当全 11 部位已完全集齐（`missingCandidates.length === 0`）时，平滑回退至 `fallbackStrategy`（默认 `weighted-random`），随机发放一件合法部位，绝不报错或拒发；
   - `weighted-missing-first`：正式服轻度缺件加权，缺失部位按配置赋予加权系数（如 2:1），在保留随机性的同时适度偏向缺件部位；全缺或全齐时自动退化为等权随机；
   - `weighted-random`：纯权重随机抽取，允许抽取到重复部位。

3. **终局结算解耦集成（`backend/src/challenge/terminal-settlement.ts`）**：
   - `TerminalConfig` 扩展支持 `strategyProfile?: DropStrategyProfile`，同时无损向后兼容旧版 `missingPolicy?: 'random' | 'missing-first'`；
   - `planClear` 重构调用 `selectCandidateByStrategy`，实现统一策略分发。

## 验证证据

1. **定向策略引擎测试套件（`backend/test/drop-strategy.test.mjs` 8/8 全部通过）**：
   - `validateDropStrategyProfile`：验证合法 Profile 通过，并严格拒绝非法 profileId、非法版本、未知策略名、非法参数权重及缺失域定义；
   - `validateSpecialDungeonQualification`：验证 30 级特殊本资格放行，普通本或非 30 级尝试掉落套装严格拒绝；
   - `Strategy 1 - weighted-random`：验证全 11 部位按样本均匀可达，允许掉落重复部位；
   - `Strategy 2 - missing-slot-first`：
     - 单缺件场景（缺 Ring）：100 个随机样本 100% 全部命中 Ring；
     - 多缺件场景（缺 3 部位）：样本严格在 3 个缺件部位之间轮转，零命中已持有部位；
     - 全齐场景（11 部位全满）：平滑回退到 `weighted-random`，无阻断发放；
   - `Strategy 3 - weighted-missing-first`：验证配置 2:1 权重时，缺件部位（Ring）被选中的频次精确为已持有部位（Weapon）的 2 倍（200次 vs 100次）；
   - `Full Challenge settlement integration`：通关真实提交完整结算，成功识别 `TerminalConfig.strategyProfile` 并准确补齐角色所缺的 Belt 装备；
   - `isCandidateMissing`：详细验证永久装备（非缺件）、未到期邮件（非缺件）、到期邮件（自动恢复缺件）、账号金库共享（非缺件）及全新部位（缺件）；
   - `Ordinary dungeon restriction`：普通副本配置策略掉落套装严格返回 `CONFIG_NOT_READY`。

2. **跨模块关联回归套件（36/36 全部通过）**：
   - `backend/test/terminal-settlement.test.mjs`：11/11 通过；
   - `backend/test/drop-collect.test.mjs`：17/17 通过；
   - `backend/test/drop-strategy.test.mjs`：8/8 通过。

3. **TypeScript 类型安全与模型门禁**：
   - `backend/tsconfig.json` 与 `tools/tsconfig.models.json` 使用 TS 5.8.2 检查 Exit Code 0；
   - 客户端纯模型与 UI 模型回归 100% 通过（`check-model.cjs`、`check-ui-model.cjs`）；
   - 代码格式门禁：`git diff --check` 通过。

## 边界与已知限制

- 仅交付策略引擎分发层、三种策略算法与特殊副本资格判定。
- 双角色多容器深层持有隔离留待 ST19-02；
- 并发 OCC 冲突重映射与全齐大闭环留待 ST19-03；
- 客户端套装收集状态展示留待 ST19-04；
- 全链路大闭环联合验收与两轴评审留待 ST19-05。
- 无 Jira、未向远程 push。
