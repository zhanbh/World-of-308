# ST09 build 补核：Standards 独立评审

日期：2026-10-24。固定范围：`git diff 04a1cc7...5129c57`；唯一提交为 `5129c57461c7daed1c20999d5c3b0b82382f9d00`（ST09 银行存取与扩容）。这是提交后的独立复核，不补造实施前检查记录。

依据：根目录 `AGENTS.md`、`docs/backend/source-of-truth.md` 及其物理映射、持有汇总、API/字段/状态合同，另按 soflow code-review 的 Fowler smell baseline 检视。通过 `rg --files` 未发现独立的 CONTRIBUTING/CODING_STANDARDS；工具可检查的类型和格式不列为人工发现。本次没有调用 Jira、修改代码或提交。

## 硬性规范

未发现能够由此差异证明的硬性规范违规。资产写入沿用事务内 A/J/O、先验证后暂存写集、可信身份和当前会话校验；测试价格显式注入，正式缺配置拒绝。此结论仅限所审提交，不证明真实 SDK、微信或生产可用。

## 启发式改善（非阻塞）

1. **可能的 Duplicated Code**：`backend/src/bank/bank-service.ts:84–90` 与 `backend/src/town/town-service.ts:641–649` 重复验证银行上下文的归属、代次、城镇、锚点和 24px 距离，例如两处均包含 `sceneEpoch` / `locationRevision` 比较以及距离平方 `576`。当前覆盖测试未显示访问绕过；但未来修改范围或生命周期时需同步两处。建议提取无 I/O 的银行上下文规则，两入口分别读取实体，再复用同一判定与明确错误映射。不要借此把 TownService 的身份适配问题宣称已解决。

2. **可能的 Speculative Generality**：`client/assets/scripts/ui/BankPanel.ts:153` 的 `button(..., mode: 'write' | 'refresh' | 'recovery' = 'write')` 声明了模式参数，函数体从不读取，调用点也不传该参数。它会让后续维护者误以为按钮权限/恢复状态由统一模式控制；实际控制在各回调及 `run`。建议移除未使用参数，维持现有行为；有真实统一策略需求时再引入。

## 实际复核

执行 `node --test backend/test/bank-rules.test.mjs backend/test/bank-v2.test.mjs backend/test/bank-coordinator-v2.test.mjs backend/test/bank-composition.test.mjs`：60/60 通过。仅本机测试，不替代 CI、Cocos 或真机证据。

结论：硬性发现 0；非阻塞启发式改善 2。最值得后续处理的是两个入口的银行访问规则重复。

## 2026-10-24 修复复核（追加，保留上文原始结论）

固定追加范围：`git diff 5129c57...a75ee61`，修复提交 `a75ee619d4f64f2e073c62d5626e605aff028402`。已阅读隔离工作区的 `st09-build-fix-verification.md`、新增高水位/并发/双币测试、共享预算以及服务、协议和合同变动。

- 原启发式第2项已关闭：`BankPanel.button` 移除未使用的 `mode`，调用和行为不变。
- 原第1项保留为非阻塞改善：银行与城镇权限路径暂未合并，理由和后续回归需求明确，无证据显示本轮出现访问规则偏差。
- 字节修复采用单一共享预算，协议 parse 与网络 decode 一致，银行/背包/装备服务的容器限制同步；物理映射、API、字典均已更新。针对合法转义 ID 的实际高水位数据，没有通过缩短 ID 或减少容量掩盖原限制。未发现追加差异引入新的硬性规范违规。
- 本评审在隔离工作区独立运行 `node --test backend/test/bank-budget.test.mjs backend/test/bank-v2.test.mjs`：45/45通过，复核包含 bank 响应230917字节、普通容器响应114894字节、整理流水311437字节。该样本不代表穷举绝对最大值，不证明 SDK 或设备上界。

当前 Standards 状态：硬性未关闭项0，非阻塞启发式未关闭项1；Cocos、CI、微信及真机不在本次独立复跑范围内。
