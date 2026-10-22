# E01-05 资产服务公开协议实施映射

2026-10-22。按[API](../backend/api-contract-v2.md)、[字典](../backend/data-dictionary-v2.md)、[物理映射](../backend/asset-physical-mapping-v1.md)、[持有合同](../backend/collection-holdings-projection-v1.md)细化公开DTO，不新增服务或资产权威。

代码为shared/src/protocol/asset-v2.ts及专用严格parser组合器asset-schema.ts。所有请求拒绝额外字段/访问器；写用operationId/session/expected列表，查用requestId/session，无客户端自报可信身份。正文与wire有界，操作ID64可见ASCII；金额为精确资源字符串，金币/点券统一gold/points。

覆盖19条业务命令：exitInn、service.open/close、inventory.transfer/expand/organize、equipment.equip/unequip/repair/enhance、quickslot.assign、shop.buy/sell、wallet.exchange、mail.markRead/claimAttachment/claimAvailable/delete、reward.claim。覆盖除R12之外13个查询；R12及挑战/地面由04场景模块负责，创角/选角由03负责，合计覆盖本期API家族。旧reportEvents、单次enterRoom及独立item.use/trinket.activate不能通过v2解析。

数量：堆叠1～20、装备转移/出售只能1件；背包/个人库20～100每档20，账号库固定100；快捷位0～2；整理forward/reverse。银行读取要求contextId，报价内外角色/上下文必须一致，但这些结构校验不证明NPC访问权限或真实库存。批领选择最多20附件、返回单批最多4项；游标是有界字符串，真实服务仍需限制100封扫描及稳定子意图。

13槽采用既有UI命名：shoulder/chest/belt/pants/boots/trinket/bracelet/necklace/ring/subEquip/magicStone/earring/weapon。所有实例必含durability；武器、五防具、耳环为磨损槽，current≤max，其余current/max为null。仅武器/耳环强化。绑定公开none/account/character，当前受信账号作用域不透出内部accountId；持有角色、容器与绑定限制分开，容器归属明确。schema不代替服务端所有权验证。

装备来源为roomDrop/mailAttachment/grant/challengeClear互斥定位；位置container/equipped/pending/retired互斥。待领仅引用已物化itemId，不复制第二份可领取装备payload；邮件以quantityGranted/quantityClaimed表示累计进度，不能领取超过总量。固定抽样种子和未提交候选不作为公开DTO；来源/已提交物品引用不等于重新抽样入口。持有汇总的scope、revision、domainRef和计数不构成可领余额。评分声明basis=intrinsicEquipmentValue及版本/达到时间，耐久不改固有评分。

命令结果仅有版本化有界摘要，committed含resultVersions，rejected为安全错误码，unknown为RESULT_UNKNOWN；不把历史结果覆盖成当前钱包。operation.get区分found/notFound与查询错误，固定注册03创角/选角、04场景和05资产回执，查询operationId必须与返回原回执一致。登录open及ready控制回执仍按独立身份/控制合同处理。读取空列表不是失败，notFound不承诺在途不会提交。

encodeAssetRequest/decodeAssetResponse为调用方wire边界，真正执行schema及关联校验，不生成固定成功结果。后续ST02～ST09、ST16～ST20负责初始化/归属/报价/CD/来源/原子交易/评分等业务；E02负责真实SDK。这里的合格公开样本不证明钱已扣或货已发。
