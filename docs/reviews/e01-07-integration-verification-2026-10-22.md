# E01／B0 本地交付与联合验证

2026-10-22。E01的01～07已完成本地实现、合同组合验证与独立代码评审修复。分支feat/e01-repeatable-checks，基线ab195410928f3f887f928d87e56d5d4ad61f71e5；实现仍在未提交工作区，不能把该HEAD当作已包含本次代码。未创建外部单据/MR、安装依赖、部署或操作云资源。

源规格为[只读spec](../stories/warrior-loop/e01/spec.md)，正文SHA-256为60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57。组合测试实际复算该hash并验证7任务及已批准依赖边；未改源规格规避实现差异。任务draft是人工接受/合并状态，implementation_status=local-verified是本次实际实施状态。

## 交付覆盖

| artifact_id@revision（前缀ticket:warrior-loop-e01-） | 本地交付 | 证据 |
| --- | --- | --- |
| 01@1 | 显式工具链、统一检查、旧协议迁移清单 | [01](e01-01-local-verification-2026-10-22.md) |
| 02@1 | Time/LogicTick/u64、约分余量、稳定公开编码 | [02](e01-02-local-verification-2026-10-22.md) |
| 03@1 | 两步登录、创角/选角、公开会话/原回执 | [03](e01-03-local-verification-2026-10-22.md) |
| 04@1 | 输入、房间加载、控制/ready、公开恢复分页及消费者 | [04](e01-04-local-verification-2026-10-22.md) |
| 05@1 | 19命令/13查询、容器/装备/来源/版本化结果及消费者 | [05](e01-05-local-verification-2026-10-22.md) |
| 06@1 | 授权战士测试release、引用校验、真实摘要、私有分离 | [06](e01-06-local-verification-2026-10-22.md) |
| 07@1 | 计划完整性及03～06真实parser跨模块组合、独立评审、交接 | 本报告及机器快照 |

implements并集为e01-contract-foundation。业务故事ST01～ST20没有因此完成；QA编号是原验收映射，107是本地测试项数，不是107个玩家路径。

## 实际运行

现有工具：Node24.19.0、TypeScript5.8.2（Creator3.8.8本地包）。从仓库根运行：

```powershell
$env:WORLD308_TYPESCRIPT='C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
& 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tools/check-all.cjs
```

最终退出0，[完整日志](e01-final-check-2026-10-22.log)：工具7/7、共享107/107、旧后端49/49；共享/后端真实tsc与客户端纯模型tsc通过；两个客户端回归入口通过。总计7/7检查组。未删除、跳过或弱化旧断言；这些旧模型仍含与v2不同的行为，不能用于宣称正式规则已迁移。

组合测试实际消费verifyTestRelease、登录wire、场景wire、资产wire及原结果parser：真实fixture摘要/单位/公开引用相容，旧reportEvents被拒绝，历史回执保留自身版本和时间，notFound与unknown独立。所有响应是明确合同样本；没有返回固定成功的业务处理器，也没有执行初始化/发奖事务。

中间失败均处理：报价内外角色不一致负测原本未通过，修复character/context关联；独立评审见下节。最后一轮另发现新创角回执base.command类型被推宽导致TS2322，增加显式类型注解后全量复跑通过。早先一次组合执行因自动审批服务额度不可用而未执行，之后重新通过审批实际运行；未把未执行当测试通过。

## 独立评审

Standards与Spec两轴独立，原发现及修复快照分别保留，不改写成首次即通过：

- [Standards](e01-standards-independent-review-2026-10-22.md)：硬约束违规0项，运行边界S01/P2一项。decodeRemainder原本会执行getter并忽略Symbol，已严格验证data-only属性，独立复核4/4通过。
- [Spec](e01-spec-independent-review-2026-10-22.md)：3项，最高P1。operation.get查询与原回执ID、ready请求与响应挑战/适用票据关联、创角/选角原回执消费已补齐，独立正负反例复核闭合。最终类型注解变化也另核验为无运行行为变化。

两轴没有遗留所报阻塞项；这是给定未提交文件快照的局部代码评审，不是远程CI、MR合并或平台安全认证。最终机器快照[JSON](e01-verification-snapshot-2026-10-22.json)记录受验源码/工具/fixture摘要和实际结果；文档与历史发现另保留，不伪造当前提交SHA证据。

## 下一阶段的真实缺口

| 责任 | 后续工作 |
| --- | --- |
| ST01/ST02 | 微信可信身份/票据CAS/初始化、名称原子占用、角色选择；当前parser不证明身份或所有权 |
| ST03～ST09/ST17～ST20 | 城镇服务、容器/装备/金币、银行/邮件、强化/评分等真实事务与来源/O/J守恒 |
| ST10～ST16 | 战士规则重算、时钟/缺口、加载/ready/恢复CAS、真实消费和来源结算；当前公开hash关联不代替完整状态内容hash验证 |
| E02 | 精确SDK、可信调用、真实事务/索引/字节/重试/成本；没有凭本地内存测试关闭platform-gap |
| VT01 | 微信Note20 Ultra真机、多触控/弱网/三本体验、完整成长经济及发布恢复 |

旧GameService/客户端原型仍未导入新v2；[迁移清单](../design/e01-protocol-migration-inventory-v1.md)保留每个旧消费者和冲突断言的归属。测试release仅为显式授权的本地战士首本普通profile；猎人关闭，后两本及全1～30配置、最大CP实际编码与正式平衡均不冒充完成。

E01本地范围到此结束。后续平台资源/SDK安装、部署及业务故事实施需沿其独立授权和准入；本报告不扩大本轮范围。
