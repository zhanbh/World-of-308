# ST15终局接入笔记

2026-10-29，只读探索当时集成基点`d755df1`；不是实现或测试通过记录。后续代码可能已修订，按实际diff复核。Accepted正文及任务依赖不变，实际文件摘要沿plan-validation-2026-10-29.json。

## 02/03必须共享的原子边界

现有ChallengeService的simulation.submit采用基线事务→模拟→重验提交。第二事务是击杀、完成、免费复活、资产、CP、O/J的共同提交点，不新建“先completed后尽力发奖”异步出口。02可先形成可复用的终局事实/决定接口，或随其首个使用落地必要的最小原子奖励；完整终局未接入前不得宣称正式奖励闭环已完成，03继续补齐路由/升级/邮件最大域。

普通怪金币/XP也须在相应确认片段入账，不把所有收益延期到Boss才到账。终局只汇总本片新增和Boss派生击杀，不将累计总数重复记账。奖励配置显式local-test，禁止从no-rewards训练模式静默产资产。

## 当时看到的具体风险

- submit仅记confirmedKills/allEnemiesDead，没有真实即时gold/XP、room掉落来源、clearReceipt或终局邮件/磨损/解锁写入。
- 旧免费复活条件isDead+allEnemiesDead+BossRoom遗漏Boss先死余怪仍活的通关；不能凭片尾状态猜同刻死亡。需保存首次Boss死亡原节点/玩家死亡事实，按合法事件顺序推进。
- 旧confirmedKills去重把当前roomNo套到历史spawnId，应使用历史k.roomNo；跨房同名spawn不能误判已杀。
- 旧hash/chunks在提交事务前生成，免费复活却在之后改role；终局/回复改变角色或scene后，必须重新生成一致的CP、公开状态与hash。
- Boss死亡后保持completed+looting可拾取；不能提前关闭CP/场景。leave已有finishLoot及门口落点，要避免重复沉降体力或撤销已确认收益。

## 可复用资产接口

WalletEntity沿account.walletId取实际钱包，不另造内嵌余额。角色已有xp/level/progressionConfigRef/mailIds/pendingGrantIds，但当时无经验升级执行器，需要显式受控配置及真实升级规则。

ST07 MailService.reward.claim可领取pending装备，终局需生成兼容grant字段（route:pending、payload.kind:equipment及itemId、deliveryState:available）并同笔加入character.pendingGrantIds。等级邮件确定键需检查不存在性、加入mailIds、保留旧来源stub；不能因列表未展示就重复发。

未提交direct/pending可在重新读取背包后重映射，基础抽样不变；提交后clearReceipt永久固定实例与路由。pending/direct生成套装均进入角色永久持有汇总，pending领取不再加一次。未拾取地面不计持有。通关物化新实例、grant、邮件都检查确定键不存在，不能覆盖历史资产。

## 预算与验收

当前终局合同R44/W33是待验证设计目标，不是恒定事实。实际唯一键并集包含CP按需块、13槽、7磨损、6节点邮件、满包pending、两持有摘要和本次combatResults分页；不能将新增结果页藏在旧77小计。测实际调用/字节并与合同解释，SDK仍另验。

最坏测试需真实公开submit产生Boss死亡/余怪派生、升级/邮件及pending，而非预置completed后只测奖励helper。逐写点失败应同时保持H未通关、资源未加、CP未前移、邮件/实例/grant未新建。成功丢响应原O恢复不再选路由。

边界包括同刻互杀免费复活、先死后残留杀Boss、Boss先死后尾弹不可翻盘、末房武器归零不判败，以及重复意图/同来源不重复收益。历史测试直接设置completed的场景只作下游夹具，不替代真实击杀入口。

## 03成长/交付接口补充

当前尚无业务经验阈值表/升级执行器；progressionConfigRef只有引用并不表示配置已装载。data-dictionary-v2定义XP为版本表下累计有效经验，旧Python候选保存等级内余量，两者不同：新local-test表应明确累计阈值1～30，不照搬逐级扣XP并冒称累计字段。候选XP可参考combat-numeric-v1.csv；旧challenge_awards四分钟奖励预算不是当前发布表。

每5级绿武器邮件沿economy已确认方向，5→15/10→20/15→25/20、25、30→30装等只是progression_award_trial.py候选映射。实际附件沿CharacterService新手邮件的完整字段：active/version0、30天、角色绑定、quantityGranted/Claimed、equipmentPayload及确定模板；不自动穿戴。邮件产生要同笔加入mailIds，确定键上的deleted/expired stub也阻止重发。MailService现有装备邮件消费者不保留setRef且耐久固定100，因此该通道只承接非套装节点武器，不用它发套装再声称数据完整。

RewardGrantEntity为route:pending、payload:{kind:equipment,itemId}、deliveryState:available、deliveredAt:null及version/owner/sourceTuple；实例先持久为location:{kind:pending,grantId}，并把grant加入pendingGrantIds。真实领取必须走当前邮箱服务context；公开reward.claim结果校验不等于整个私有grant全对象严格校验。

01现已提供groundHoldings新套装角色+1写计划、validateGroundBag等可复用校验。planGroundDelivery限定roomDrop来源，clear不能直接套用而残留错误sourceLocator；clear需独立来源决定。缺件策略还须读账号摘要，不能仅复用角色+1函数就说完整策略已接通。
