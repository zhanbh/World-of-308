# E01 Standards 独立评审

2026-10-22。评审者为未参与本轮实现的独立 Standards agent；只写本报告。基线 `ab195410928f3f887f928d87e56d5d4ad61f71e5`，工作区 `feat/e01-repeatable-checks`。`git diff <基线>`仅含4个已跟踪修改；新增共享模块、工具及样本需另读。本报告对应未提交文件快照，不是 HEAD 或合并准入证据。

## Standards

根 `AGENTS.md` 是本次找到的工程标准；未找到 CONTRIBUTING/CODING_STANDARDS。未发现 Jira、云操作、依赖安装或分支命名的硬违规。

- **S01／P2：回复余量遗漏严格 data-only 对象检查。** `shared/src/exact-values.ts:33` 的 `decodeRemainder` 使用 `Object.keys` 与直接读取属性；与 `session-v2.ts:8`、`asset-schema.ts:4`、`scene-v2.ts:22` 的严格数据属性边界不一致。实际运行 `decodeRemainder({get numerator(){invoked++;return 1},denominator:3})` 成功且 getter 执行两次；额外 Symbol 字段也被忽略。公开 `unknown` 接口可在校验期间执行调用方访问器，未达到其余 DTO 的拒绝行为。建议局部检查纯对象、全部自有键及数据属性描述符后读取，增加 getter 未执行与 Symbol 额外字段负测。该问题属于边界一致性缺陷；AGENTS 未规定专门编码风格，不将它冒称风格硬违规。

其余重复 schema 原语仅作启发式观察；当前模块范围和私有边界不同，不建议为了消除重复而在本轮大规模抽象重构。

结论：硬标准违规0项；运行边界问题1项（S01），需修复并复核。未把后续业务服务/SDK/真机缺项作为本片编码违规，也未独立重复执行全量测试。

## 阅读及复现证据

阅读：AGENTS、source-of-truth索引、工具入口/编译器加载与测试入口、共享精确值/公开codec、session/login/simulation/scene/asset schema与wire、release校验/投影；抽查资产测试、fixtures和任务图。范围聚焦运行校验与公开私有边界，不声称逐行审核所有历史测试和美术文件。

复现使用现有 Node 24.19.0，直接导入 `exact-values.ts`，本地命令退出0，输出 `{"result":{"numerator":1,"denominator":3},"invoked":2}`；Symbol 额外字段输入返回1/3。未联网或安装依赖。

发现时 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| shared/src/exact-values.ts | 8dcd87d398e5a27ad42f94dccb6925ac2d7c4dcfc838cb15da079f196b3c9bf4 |
| shared/src/protocol/session-v2.ts | b077e3b186b8c8d5e83989c6acbfaecfa6787fdba4ee8e79d7cdc2785207d9a5 |
| shared/src/protocol/asset-schema.ts | 35cd1a1e4935d9f62ad28d996140565b72ef4414d808d6768e6156fd84ac85c9 |
| shared/src/protocol/simulation-v2.ts | 2cbc0c05a93fb46ca62bb8efbeaec3ef3e79a3cebf43d3aba56b670510048dde |
| shared/src/protocol/scene-v2.ts | 276e4546868a86e295bca72a5f36e3ff088a92068ec7df519ee1577ec095877f |
| shared/src/protocol/scene-wire.ts | 6ed9b5ba2924a2c6bf5c41ec750d2949b7461568b571ebd7b64bb424d89e180f |
| shared/src/config/release-v1.ts | aabd749ccd9877f986d28f7767edcc50a135df07984fa658546ce1b394d92ded |

修复应另附关闭证据，保留这里的原始发现及当时快照。

## S01 修复独立复核

2026-10-22。只复核本项修复及其测试，未重复完整评审或全量回归。`decodeRemainder` 现先限制普通对象/空原型对象、拒绝数组，使用 `Reflect.ownKeys` 检查完整自有键数量，并在读取前确认 numerator/denominator 都是数据属性。新增用例同时断言访问器被拒绝且 getter 未执行，并拒绝额外 Symbol 字段。

以现有 Node 24.19.0 执行 `node --test shared/test/exact-values.test.mjs`，退出0，4/4测试通过；包括原整数、约分与Time/LogicTick边界用例。S01已关闭，本轴未遗留阻塞项。此结论仅绑定下列修复快照，不替代其他模块及最终工作区联合证据。

| 修复文件 | SHA-256 |
| --- | --- |
| shared/src/exact-values.ts | ce57ad639539771623d167a331278b39ff3b68c58059cdc001dd9aaaf38a7fa9 |
| shared/test/exact-values.test.mjs | 6ab0039827246c9fd78f67164d86eb1fa7ab8f3f1338264e0532bc67a30b8380 |
