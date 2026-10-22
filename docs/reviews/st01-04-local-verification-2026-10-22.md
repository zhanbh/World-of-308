# ST01-04 角色与旧场景交接本地验证

2026-10-22。工作区未提交；本任务局部实现、测试和真实tsc通过，独立评审/完整LoginService组合由ST01-06另记。详见[映射](../design/st01-login-handoff-contract-v1.md)。

TDD过程：选中角色回旅店测试先因模块不存在失败，最小实现通过；active关闭/结算测试先因拒绝有挑战的临时分支失败，补实际H/CP/角色/J计划后通过。追加“旧已结算指针遇到新刷新窗口”与“首房未activate无CP”反例分别观察19≠308及完整性拒绝，补明确合法分支后通过。

使用Node24.19.0执行`--test backend/test/login-handoff-v2.test.mjs`，23/23通过；使用现有Creator3.8.8 TypeScript5.8.2执行`--project backend/tsconfig.json`退出0。无依赖安装或网络调用。

覆盖：当前角色新role/旅店、active failed/closed、completed保留成功、跨固定窗口308、旧settlement不回放余额、未选挑战角色仍交接、元数据/hash/正文混版、缺块/错归属/拆分指针/reservation错误、5写点全回滚、账号栅栏与竞争终局的两种提交顺序。终局竞争测试是受控事务fixture，不是假造战斗规则服务或完整Boss验证。

块正文是闭包核验用opaque最小样本，不证明完整战斗CP合法性/最大编码；当前23项也不等于QA01/02/04全部通过。没有实际微信身份、云SDK、真实索引/设备或发布验证。外层LoginService必须同笔完成账号/session/O，且先查原openReceipt再调用handoff，才能形成完整登录原子性。
