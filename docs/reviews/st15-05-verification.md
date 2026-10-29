# ST15-05 联合验收与预算阻断

2026-10-29。基点 `b064c8d3f2f8f97945174db0225bd000ecafce89`，分支 `feat/st15-05-joint-acceptance`。本轮完成本地联合验收及超预算安全拒绝；**完整最大域预算未通过，ST15不能记为全部完成或可发布**。Standards/Spec独立复核由后续独立评审者填写，实现者不代签。冻结spec/issues与错误的历史declared hash均未改写；实际基准沿plan-validation，体力沿用户独立裁决。

`jointTerminalFixture`先经真实身份/开房/activate/ready，可信夹具迁移至active末房，再由公开simulation.submit真正杀Boss。没有预置completed。配置均显式local-test，不冒充正式发布表。8个实际敌人、13件装备验证、7磨损、100格满包、六节点邮件、pending实例/grant及角色/账号持有，8个在用CP块（3648合法技能效果）共同进入真实MemoryStore。

## 红灯、保护与物理证据

[原始红灯](st15-05-preflight-red.log)发现：正常未来效果域提交R42/W33，get44/set34共78次，327198B，最大单写48658B；8块读取并实际写入，1个独立combatResults页。压力到期域提交R42/W525，get44/set526共570次，3763879B，最大单写7466B；8块读取、2块写入，499个独立combatResults页。每次回调及全部键见[预算JSON](st15-05-budget.json)。只读基线另为R30、31次get；正常端到端31+78=109次，不能把整次请求称78次。这里统计应用Store调用/JSON UTF-8，不是SDK、重试计费或commit开销。

红灯后，真实服务在终局结果页已独立超W33/1.5MiB时提交前CONFIG_NOT_READY；终局提交回调同时按实际R44/W33、get/set80、最终写集1.5MiB保护，越限抛拒绝使事务完全回滚。到期最大域现在验证全store不变，没有completed、CP前移或钱包/邮件/装备/grant/O/J部分结果。正常域仍能完成。没有截断事件、异步补奖或隐藏结果页。预算及结算活跃合同已同步。尚无正式可执行发布器，不能声称发布门禁已集成；该能力发布仍blocked，后续须整改结果物理映射并重验完整最大域。

## 已完成的联合测试

新增 `backend/test/joint-terminal-acceptance.test.mjs`：

- 正常8块域真实Boss submit，8怪清场、升级30级、六节点邮件与pending路由，预算上界；最大到期域安全拒绝且全store保持原值。
- 正常最大域每个actual set注入故障：34次set均覆盖，包含重复角色写（唯一W33）；每次H仍active、全部存储严格相等，覆盖CP、七磨损、钱包、房间来源、邮件、持有、实例/grant与原结果。
- 成功丢响应后原O恢复，存储不再变化；真实DropCoordinator满包BAG_FULL留地、腾位后拾取；真实TerminalCoordinator离开令体力settled；真实MailService.reward.claim提取pending，六个mail.claimAttachment逐个领取并重放，原clearReceipt保持pending。
- 六个deleted/expired来源stub全部阻止重发；真实MemoryStore冲突下submit/leave两种提交顺序，无半通关或重复收益。

既有真实服务测试继续覆盖同刻互杀免费复活、不扣付费计数、末房武器归零、direct路由、改包改配置后原O路由不变。已释放尾伤在玩家先死后击杀Boss、Boss先死后敌方尾伤不能翻盘仍由 `shared/test/boss-terminal.test.mjs` 真实纯内核边界覆盖；不夸称这些特殊尾伤已另外走完整服务/客户端。

## 重复命令与边界

Node24.9.0，已有Cocos TypeScript5.8.2。无需安装：

```bash
node --test backend/test/joint-terminal-acceptance.test.mjs
WORLD308_TYPESCRIPT=/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript node tools/check-all.cjs
```

沙箱全量见[七阶段日志](st15-05-check-all-sandbox.log)：6/7，backend687项中686通过，唯一失败是既有HTTP loopback测试listen EPERM 127.0.0.1。其余六阶段通过。root在相同代码快照 `0639c097` 上完成获批全量7/7，见[获批七阶段日志](st15-05-check-all.log)。后续评审修复后的最终门禁另见[最终日志](st15-review-check-all.log)，两次结果不得互相替代。定向原始逐写点日志归档[逐写点日志](st15-05-rollback.log)，流程定向见[消费者/OCC日志](st15-05-flow.log)。预算负测预期CONFIG_NOT_READY通过，不能据此称最大域预算验收通过。

未操作Jira、外部发布、安装、云资源或GUI构建。微信SDK、真实数据库事务/费用、移动设备/触屏与完整城镇七房体验仍GAP。04的Windows历史离线构建不证明本机Mac或真机视觉验收。可信邮箱context仅用于真实MailService接口消费，不证明Cocos邮箱交互。
