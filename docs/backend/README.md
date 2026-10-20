# 后台最小在线闭环设计 v1

> 2026-10-19：新机制已确认，见[基线摘要](../wayfinder/core-rules-v2/SUMMARY.md)和[实现差异](../implementation-gaps-2026-10-19.md)。本文现有本地切片/旧契约尚未全部迁移；测试通过不等于新背包、邮箱、冷却与奖励机制已实现。

更新：2026-10-17。状态：工程规格及首个[本地后台核心](../../backend/README.md)已落地，支持内存事务与自动化规则验证；未安装云端SDK、创建云环境或部署。玩法依据为[挑战流程](../challenge-flow.md)；本稿中的集合、命令名及租约参数是工程选择，不是新增玩法数值。

## 范围与模块

排行榜专项：[懒加载与评分时间](leaderboard-loading-v1.md)提出“固定13槽维护个人评分事实，查看时索引查询/缓存”的工程方案，区分非实时榜单与实际达到时间；尚待工程评审及缓存/评分配置收敛。

E08[工程评审准备包](../reviews/engineering-review-pack-v1.md)关联规则/模块/实体/接口/事务与验收，列正式评审门禁；当前仍需关闭待决项，不能视为工程评审通过或编码准入。

E06/E07提案：[配置发布与数据迁移](configuration-and-migration-v1.md)、[平台身份/安全/运维](platform-security-operations-v1.md)。后者区分官方文档事实与未实测能力；小游戏登录核验、服务地点证明、药品/饰品状态校验和真实平台验收尚未关闭。

E04入口：[全量接口契约v2](api-contract-v2.md)、[状态转换v2](state-transitions-v2.md)。已覆盖查询/命令目录及权限、版本、错误和终态，明确保留动作可信度/服务地点等待边界；不是已部署接口或已通过评审。

E03访问设计入口：[访问路径、索引与事务v2](access-and-transactions-v2.md)，含Q01–Q14查询及T01–T16原子用例、符号预算与竞态；数据库/索引能力未验证，尚未创建或运行。

E02数据设计入口：[完整数据字典与实体关系v2](data-dictionary-v2.md)，当前是逻辑实体设计，不是已落库或已评审的物理schema；下一步补访问路径、索引与事务预算。

2026-10-20最新提案：[逻辑架构与模块依赖v2](logical-architecture-v2.md)、[S01–S04核心契约](core-contract-v2.md)、[客户端逻辑架构](../design/client-logical-architecture-v1.md)。本文早期模块表作为背景，冲突处以最新规格/提案明确口径为准；架构细化未完成eng-review，不启动coding。

第一切片使用一个Node/TypeScript业务入口，内部按模块组织，不拆微服务。生产凭证和CloudBase SDK只进入平台适配器，领域逻辑不依赖Cocos或数据库SDK。

| 模块 | 对外职责 | 持有的规则 |
| --- | --- | --- |
| identity | 打开会话、恢复账号视图、校验调用身份 | 账号映射、会话代次、同账号接管 |
| character | 创建角色、角色视图、成长 | 每职业一个角色、经验/升级、生死分离 |
| challenge | 创建/进房/事件/复活/退出 | 唯一active、房间顺序、截止时间、结果终态 |
| assets | 钱包、背包、穿戴、待领 | 所有权、容量、堆叠、绑定、原子变更 |
| rewards | 怪物和通关奖励计划 | 服务端生成、来源唯一、交付一次 |
| configuration | 发布和读取不可变配置版本 | 副本、怪物、掉落、成长、物品；缺失则禁止开局 |
| platform | 身份、持久化、时钟、随机、日志适配 | CloudBase细节与可替换的本地测试实现 |

业务调用只经应用层事务协调器；模块不能各自开事务后声称整笔业务原子。初期同账号共用写入栅栏，牺牲账号内并发吞吐换取清楚的资产顺序；账号之间独立。

目标目录（domain/application/ports/memory与shared协议已创建，其余待实现）：

```text
backend/src/
  application/       # 命令分派、权限、事务、幂等
  domain/            # identity / character / challenge / assets / rewards
  ports/             # UnitOfWork、Clock、RewardGenerator、IdentityVerifier
  adapters/          # memory、cloudbase、微信身份
  functions/game-api/# 平台入口、输入校验、错误映射
shared/src/protocol/  # 可公开的请求/响应类型；不包含服务端凭证或私有随机信息
client/assets/scripts/online/ # 输入队列、状态同步、恢复；不直接操作数据库
```

## 设计文件

- [数据模型与访问路径](data-model.md)
- [命令、查询与错误契约](api-contract.md)
- [事务、时间、并发与验收](consistency.md)

## 实施顺序与出口

1. 建立纯TypeScript领域模型、内存事务适配器和共享协议；验证挑战终态、死亡/升级、扣费与奖励规则。测试替身不能当作线上身份验证。
2. 实现账号会话、角色/容器、挑战/房间、击杀/通关、纹章复活、拾取/待领/穿戴命令。仅使用明确标注的测试配置，不据此定义正式掉落和成长。
3. 接Cocos在线适配层，改造当前死亡即失败、死亡立即清残留效果的本地逻辑，保留独立本地原型模式。在线死亡需要保留合法残留，升级不能解除dead状态。
4. 接CloudBase适配器并验证真实身份、权限、事务冲突、索引和包体；到这一步才需要明确测试环境与部署配置。
5. 真机完成：真实登录 → 创建战士 → 进房扣体力 → 复活或通关 → 奖励入包/待领 → 穿戴 → 重启恢复资产并回城。

第一步本地核心已完成，运行命令与已实现/待实现边界见[后台README](../../backend/README.md)。真实微信/CloudBase链路须目标环境实测。当前已知客户端证据：`CombatModel.ts`用hp阻止动作；`Prototype.ts`死亡清除技能残留并进入本地胜败流程，不能直接接后端当正式死亡状态机。

## 尚未定值的边界

特殊副本复活上限、复活控制参数、正式成长/掉落/技能数值仍待方案；纹章商城购买、新手邮件及永久通关待领已确认，邮箱30天规则与待领分开。配置缺失返回CONFIG_NOT_READY，不默认“无限”或免费。

通关免费复活的控制反馈是否与付费复活完全一致未额外推定；本切片先落实满血满蓝、零消耗及通关取消危险战斗。不得借本稿增加付费复活退款、在线拾取时限或离线续关。

## 技术核对

2026-10-17核对的[CloudBase事务文档](https://docs.cloudbase.net/database/transaction)说明服务端Node SDK支持事务，并列出100次操作、30秒、事务内仅doc访问的限制。本稿据此采用已知ID访问和有界房间账目；目标环境/SDK仍须实测。[安全规则文档](https://docs.cloudbase.net/database/security-rules)用于配置客户端默认拒绝直接访问权威集合，服务端另做归属授权。微信登录文档本次工具无法读取，身份适配器的具体SDK调用留到接入验证，不编造已验证结果。
