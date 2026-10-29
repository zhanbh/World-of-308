# ST15-02 首领即刻通关实施合同

2026-10-29。承接 source-of-truth、state-transitions-v2、ST15 冻结 spec/02 ticket 与 terminal-integration-notes；原 frontmatter revision 失配按 plan-validation-2026-10-29.json 保留，不重写批准正文。本合同记录当前02实现边界，不授予正式经济或平台发布资格。

## 真实死亡与时序

联合怪物内核仅在显式 terminalBossId 指定的、输入时仍存活的最终首领真实 HP 归零时产生 terminal。at 为精确有理微秒，不以片尾时间猜测击杀；整数 tick 边界保留当刻已到期近战事件与玩家死亡，随后通关免费复活；非整数 tick 节点立即终止后续敌对事件。剩余存活目标置零并以 derivedKills 保存来源，清空怪物动作、待切阶段、投射物和移动意图。玩家已释放的流血及独立地面效果仍可在死亡后击杀首领。死亡已在前一 simulation.submit 提交时，只允许空 inputs 推进已有合法效果；无已释放效果则拒绝 ROOM_NOT_AVAILABLE，不恢复移动、普攻、技能或补给。两次事务都重验当前身份、CP/代次、在线连接、输入间断与原时间前沿，不能离线补算；deathDeadline 用节点所属 anchorWallAt/anchorTick 映射发生时间后固定为10秒，尾片、重试与公开查询不延长截止。纯非hostile profile 从真实 death 事件接入服务侧终局，不预置 completed。

死亡事实保留 deathIndex 与 H.playerDeathAtTick（当前死亡节点，手动复活后清除）及 terminalFact.playerDeathAtTick；免费复活满HP/MP、清倒计时和职业技能CD、动作与回复余数，不消费纹章、不增 paidRevives，不顺带清药品/饰品CD。通关后清 activeChallengeId，保留 openSceneChallengeId、角色challenge位置与体力reservation供在线拾取；H=completed/alive/looting、roomPhase=cleared。

## 字段与传输

EntryChallenge 可保存 terminalFact={bossActorId,at:{n,d},playerDied,playerDeathAtTick,derivedKills}、rewardTotals={gold,xp,kills}、terminalRewardRef。confirmedKills 按历史 roomNo+spawnId 去重；新片段仅记录新增死亡，不把历史累计重复发放。上述为私有事实，不新增客户端自报死亡/收益协议。

simulation.submit 第二次重验事务是H、玩家资源、余怪来源、CP头/按需块、结果页、O/J与最小资产的共同提交点。免费复活/动作清理完成后重新生成公开状态hash及块；completed+cleared仍允许现有公开证明与移动，MovementCoordinator可从该公开状态恢复。dead公开证明继续可读；客户端阻断所有新动作，LootSceneCoordinator/Prototype仅在存在已发布尾效果时沿原帧循环提交空片，免费复活后恢复动作入口。drop.list/collect与finishLoot沿既有授权，关闭后旧地面来源失效，已入包资产保留。

## 显式测试奖励与磨损

ChallengeContent.rewards 必须显式 profile=local-test-kill-rewards、authorization=isolated-local-assets-only，含受限ref、goldPerKill、xpPerKill、roomWear；没有该配置不产生金币XP或终局磨损。drops授权与之独立。该限制不是正式无奖励规则，而是当前受控测试composition边界。

普通新增击杀在相应确认片段同笔更新真实 WalletEntity.gold、CharacterEntity.xp、H.rewardTotals与有界J；紫名XP按确认事实2倍。金币上限999999999999，XP安全整数。终局对7磨损槽且wearEnabled的装备扣roomWear，新死亡由 deathIndex 相对本次事务旧H递增识别并在首次确认片独立扣5（即使该片尚未通关），后续尾片通关仅扣roomWear，不重复扣此前死亡磨损，最低0；武器归零绝不把completed改failed。后续03须保持这些最小收益不重复入账，并接入真正的升级执行器和完整奖励路由。

## 预算、验收与后续范围

8目标+7磨损槽受限fixture实测唯一R20/W18、最大单写5416B；该样本不含13槽/6邮件/pending/持有汇总极限，不代表R44/W33最坏终局或SDK通过。逐写点失败保持H、资源、装备、CP与掉落源不变，成功丢响应以原O恢复，竞争意图不能重复铸造。

03仍须同笔完成累计XP升级/节点邮件、通关专属装备direct/pending及clearReceipt、通关固定本局消耗与解锁；按用户最新裁决，体力继续在回城时沉降；02不提前宣称这些已完成。04胜利HUD、05最坏预算、真实SDK/云DB/设备验收另行交付。当前验证及历史独立快照见[02收尾验证](../reviews/st15-02-verification.md)。
