# ST15-03 本地终局结算验证

2026-10-29，分支feat/st15-03-terminal-settlement，基于02已合入的e369758。Accepted spec/ticket未修改；原hash错误沿plan-validation，体力新决定另记[审批记录](../stories/warrior-loop/st15/decision-terminal-stamina-2026-10-29.md)。实现合同见[终局合同](../backend/terminal-settlement-contract-v1.md)。

真实simulation.submit第二事务加入终局额外金币/有效XP、累计等级/属性和活人回复、跨六节点邮件、固定通关装备direct/pending、套装持有摘要与下一难度解锁，和已有02死亡/清场/CP/O/J共同回滚。成长HP/MP为显式本地表；攻击、装备、套装和饰品仍用既有战斗计算器，并在本片磨损后重新生成CP/hash。通关维持原快照unsettled；真正离开才settled。

## TDD及真实入口证据

首条真实Boss死亡测试先因没有公开clearReceipt红灯，再实现direct+六邮件绿灯；升级CP资源测试先因旧maxHp红灯；direct结果容器版本测试先缺失红灯；非Boss同刻死亡成长测试发现旧MP超新上限拒绝，修复后保持dead；破损同片攻击测试先为1000050而正确应1000000，修复后沿磨损后装备与饰品统一汇总。测试使用可信active末房夹具，但从未预置completed，不替代完整城镇七房体验。

定向11/11，见[定向日志](st15-03-targeted.log)：direct、pending满100格、真实leave后MailService.reward.claim、节点武器mail.claimAttachment、每实际set写点故障回滚、成功丢响应后改包/重建配置仍原O、配置绑定与严格DTO负测、deleted节点stub、满级XP截断、成长CP/hash、八怪十三槽/七磨损/六邮件/双摘要、普通来源套装拒绝、死亡升级不复活、破损攻击一致。节点邮件消费者通过真实MailService；邮箱上下文为可信夹具，不宣称Cocos邮箱交互已验收。

## 预算

最大当前行为夹具：8敌、100格满包、13槽验证、7件磨损、跨6节点邮件、pending实例/grant与套装角色/账号摘要。提交事务唯一R36/W27，实际get/set共66次，写集42738B，最大单写6456B，含独立combatResults页。该夹具CP使用2块；实际预算日志保留全部写键，未将结果页藏入历史77小计。不是8块极限/最大字段编码证明，更不是SDK调用、commit、冲突回调或费用证明。ST15-05仍需更重效果页/CP包络与两轴验收；不能把R44/W33设计目标当本次已测全域。

每实际set写点注入用例覆盖真实pending终局（六节点邮件、钱包/角色、装备/grant、CP/H/O/J），任一失败保持原store完全相等，不留下半通关；套装13槽最大域成功验证另列，并未声称该域每写点都已故障测完。

## 命令与边界

Node24.22.1，TypeScript5.8.2，显式WORLD308_TYPESCRIPT指向已有Cocos编译器，无安装。命令为node --test backend/test/terminal-settlement.test.mjs、node tools/check-all.cjs；全量日志见[七阶段日志](st15-03-check-all.log)。完整七阶段本地门禁7/7（含shared/backend类型、shared契约、backend服务、客户端类型/模型/UI模型），不代表Cocos构建、微信SDK、真机或正式配置通过。

公开接口给04：shared/src/protocol/scene-v2.ts的parseClearReceipt和parseChallengeQueryResponse，challenge.get顶层clearReceipt包含装备公开快照、route、金币/有效XP/kill数、elapsedMs、sceneState及剩余体力。backend/test/fixtures/terminal-fixture.mjs提供terminalFixture(options)，它已经在可信active第6房，command()生成真实Boss击杀，query()/service/cp()/content用于独立本地联调；不能再接旧房0prepare/activate启动。preview启用须显式local-test奖励模式，不把no-rewards训练静默改成有奖。

本次未创建Jira、外部MR、安装依赖、push、云资源或部署。缺件正式权重、正式成长数值、云事务一致性/预算、设备/Cocos视觉与完整七房启动均保留GAP。
