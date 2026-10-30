# ST15 storage Standards review — 2026-10-30

固定代码范围：`git diff 8cbbda3...bf6c5ccf94088187085872fce5e4a87e9d39d83b`；唯一提交 `bf6c5cc fix(st15): store complete combat results in a bounded atomic gzip document`。未提交验证日志不计入固定代码。只读审查实现，未修改代码、安装、访问Jira/云、推送或提交。

## Standards

**硬规则违反：1项（P3，文档）。** `docs/reviews/st15-local-verification.md:37–39` 仅在末尾追加当前状态。`docs/backend/source-of-truth.md:9` 明确要求“历史文件顶部注明当前状态并链接修订”。该文件顶部仍以旧代码和旧499页拒绝结论开场，当前修订链接在文末。建议在顶部加简短历史状态提示及本次验证链接，原日志、数值与原结论保持不动。此项不否定仍保留的完整发布blocked。

**运行实现：未发现其他已证实的标准违反。** Node24内置标准gzip、严格规范base64往返、有界累计解压、UTF-8 fatal、声明字节/事件数检查、最终文档和公开页UTF-8预算、原O授权后读取、schema1按原键兼容、同事务写与预算保护均可对应当前合同。unsafe oracle仅在独立验证工具，未进入运行代码。字段/API/状态/预算视图已链接v2；未发现保留/TTL或CP状态合同被改写。

**启发式：无须报告的Fowler smell。** 单包仍使用packStart/packIndex形式略有将来扩展形状，但没有足够维护成本证据将其列为Speculative Generality。

## 独立执行事实

- Node24运行 `--test --test-isolation=none backend/test/combat-result-storage.test.mjs`：2/2通过，含32768事件往返、schema1旧页、损坏身份/压缩、声明限制与33MiB炸弹。首次默认隔离模式因spawn EPERM未进入测试；随后无隔离模式实际成功。
- 独立stdin断言通过：空数组往返，空白/非规范缺padding/额外padding拒绝（仅对确实变化的数据执行），32769事件拒绝，原JSON超32MiB拒绝，packed额外字段拒绝。
- 未重跑作者完整7/7、62写点、OCC或oracle，不将作者日志计作独立执行结果；未验证真实云压缩运行时、CPU/内存成本或生产内容包络。

来源：AGENTS.md；source-of-truth、combat-result-storage-v2、earth-combat、simulation-checkpoint-schema、enhancement-terminal-budget、asset-physical-mapping、retention-and-replay合同，以及API/字段/状态同步diff。仓库`rg --files`未发现独立CODING_STANDARDS/CONTRIBUTING。

## 独立复核（2026-10-30，文档修复）

只读复核工作树相对固定code HEAD `bf6c5ccf94088187085872fce5e4a87e9d39d83b` 的 `docs/reviews/st15-local-verification.md` diff：仅顶部新增历史状态提示与2026-10-30存储整改记录链接，原测试/预算正文未改。新增提示清楚区分历史阻断、当前整改和正式发布/平台验收，满足 `source-of-truth.md:9` 的顶部状态及修订链接要求。原P3发现关闭；Standards剩余发现0项。本次未重跑测试、未改实现，代码审查范围仍为原固定SHA；不将文档复核视为生产包络或SDK通过。
