# E01-01：旧协议消费者与迁移清单

2026-10-22。实际扫描shared/src、backend/src、backend/test及client/assets/scripts。仅清单与检查工具改造，未把v2业务接入现有GameService。

## 符号与消费者

| 公开符号/入口 | 当前消费者 | 处理与负责任务 |
| --- | --- | --- |
| CharacterClass、Quality、Loot | shared旧类型；backend/domain/model及rules、GameService | 领域概念可复用，v2增加完整绑定/来源/实例不能冒用旧Loot；E01-05建立新DTO，后续ST02/04/15落业务 |
| BattleEvent | GameService及backend测试helpers/core | 保留为旧内存切片诊断，不向v2公开；E01-04新增输入合同，ST11/12/15真实内核产生死亡/击杀 |
| Payloads、Command | backend/application/validation、GameService | v1协议/expected单对象/operationId128上限均为旧定义；E01-03/04/05显式扩展v2并隔离入口，不改名伪装新实现 |
| ErrorCode、Outcome、Response | backend/domain/rules及GameService，测试通过helpers读结果 | E01-03/05引入当前错误、unknown及版本化视图；原成功回执不是当前余额，后续故事负责应用事务 |
| validateCommand | GameService的旧命令入口 | 当前只接受protocolVersion1，仍接受reportEvents/单次enterRoom。任务01未封堵这些旧本地业务，只记录；v2入口不得转发给它。后续E01-04验schema，业务故事再迁移处理器 |
| character.create | 旧validator只含classId | E01-03定义名称字段，ST02实现姓名唯一占位、20格及初始化来源/汇总；不把旧10格创建测试当新规则 |
| challenge.start/enterRoom/reportEvents/revive/leave | GameService和helpers.request/report/kill | ST10/11/14/15/16分阶段接当前体力/加载ready/输入/终局；E01只先建公开schema和不兼容测试 |
| drop.collect/reward.claim | GameService及旧测试 | ST07/15实现当前载体与物化/绑定；旧sourceId余额不能混作mail/grant双余额 |
| backend/test/helpers.mjs | 直接构造v1请求并创建GameService/MemoryStore | 保留有效幂等/回滚/并发不变量；按所属故事建立v2 fixture，不让新测试借公开自报事实绕过内核 |
| client纯模型/UIStateModel/Prototype | 当前扫描未发现导入shared协议或真实wx.cloud请求 | 目前仍本地原型，不是旧在线客户端已迁移；后续故事及E01-07记录真实消费者接入，保留动作资源与模型 |

扫描中没有发现在client/assets/scripts里已经实现的新v2传输，不虚构客户端后门已关闭或身份已接入。运行时GameService仍旧实现，仅本地工具可完整检查它。

## 已知旧断言的归属

| 旧预期 | 当前合同 | 迁移责任 |
| --- | --- | --- |
| 手动复活preserves cooldowns/resetCooldowns=false | 清职业CD，药品/饰品CD保留 | ST14；保留原同源重试/并发扣纹章测试的不变量 |
| 0体力先start，再enterRoom拒绝 | 新挑战0体力拒绝；本局快照到0可继续下房 | ST10/ST15 |
| reportEvents直接报告死亡/击杀 | 新入口只收有序输入，事实来自规则内核 | E01-04合同隔离，ST11/12/15业务重算 |
| 原型流血refresh等旧表现检查 | 释放快照、独立份额叠加、目标防御实时 | ST11；本工具任务不改游戏平衡或业务模型 |

测试工具没有删除这些断言或把旧套件结果改成新合同通过。所有新v2服务仍未实现；后续需同时验证类型/公开校验、真实应用处理器与状态资产不变量。

## 工具迁移结果

check-model/check-ui-model共享显式本地TS加载，不再执行npx；原模型断言完整保留。backend类型检查去掉macOS绝对默认，支持同一显式TS包、Creator根或tsc路径。根统一入口运行类型与现有测试，不假造真实SDK/构建/设备结果。操作说明及覆盖见[tools/README](../../tools/README.md)。
