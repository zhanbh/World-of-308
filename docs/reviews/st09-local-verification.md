# ST09 本地交付与试玩验收

2026-10-23；工作分支 `feat-1.0.0`，起点 `04a1cc7`；用户确认任务图并授权“好的，开始吧”。本次未创建 Jira，未提交/推送、安装依赖或部署。原有 `client/settings/v2/packages/cocos-service.json` 改动保留，不属于本次交付。

状态：ST09-01～04本地能力验收完成，平台/设备待验。不能据此标正式微信/生产通过。规格与任务见[ST09入口](../stories/warrior-loop/st09/README.md)。

## 实际交付

- BankService 从可信身份、当前会话与选角验证银行上下文/代次/地图/距离；同一事务读取左右两栏及钱包。修复旧 TownService 账号库误返回背包的旁路。
- 个人20格起/账号100格；五列独立滚动，互斥页签。堆叠默认全部数量确认，取消无写；容量不足整笔拒绝并返回可容纳量，角色绑定禁止入账号库。
- 双容器、实例与持有统计同笔提交；来源剩余及全部受影响输出保留有界谱系。套装共享按已发布域的职业资格，角色仅统计本职业可用键；缺摘要/负数拒绝，不猜测重建。
- 普通B背包与银行个人库均有锁格/扩容入口；背包仅金币、城镇可操作且无需银行上下文；个人库金币/点券二选一。每档+20至100，账号库无扩容。
- 报价绑定配置/容器/角色/钱包版本，原子扣款；测试价格显式配置，无正式默认价格。缺正式配置拒绝 CONFIG_NOT_READY。
- 原操作持久化后发送；丢包不新建意图，关窗/重开沿原ID查询或明确重发原命令。页面不预先挪动物品或扣款。
- 新角色同笔创建零持有摘要；已有角色缺摘要拒绝，需要后续真实来源盘点迁移。

## 自动化与构建

使用 Node 24.9.0 与本机 Creator 3.8.8 自带 TypeScript 5.8.2，无安装依赖。

```bash
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project tools/tsconfig.cocos-inventory.json
node client/tools/build-inventory.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
```

全套7/7、本机Cocos真实类型检查和H5构建通过。后端回归包含真实登录/创建/选角/出旅馆/银行上下文，逐写点故障、同档双币竞争、原结果恢复、第二角色隔离夹具、0耐久与绑定保存、套装双职业持有。ST05真实穿脱与ST06实际购买后入库的3项组合测试通过。共享合同另覆盖组合快照版本与范围、报价和容量提示。

独立评审：[后端规格](st09-spec-review.md)、[客户端](st09-client-review.md)。原3项P2已修复并保留原发现与复核记录：跨职业套装共享、锁格点击无效、次指针干扰主指针。额外补齐普通背包扩容，不再只从银行右栏扩容。

## 实际 Cocos 浏览器操作

使用 ego-browser 在独立本机页面测试，服务是真实BankService/MemoryStore，数据及价格均为隔离测试夹具。

| 操作 | 实测结果 |
| --- | --- |
| N打开、个人/账号切页 | 个人20起、账号100；账号读取不是背包 |
| 鼠标拖15药水到个人库已有18 | 默认15；取消仍15；确认后库20+13、包该堆消失 |
| 背包金币扩容 | 20→40、测试金币10000→9900 |
| 个人库点券扩容 | 20→40、测试点券100→98；金币不额外扣除 |
| 装备存账号库再取出 | 整件成功；包/库刷新一致 |
| 角色绑定药水存账号库 | BINDING_RESTRICTED，仍保留5个 |
| 独立滚动 | 账号库scroll750时背包scroll0；背包可独立scroll480 |
| 点击背包锁格 | 弹出下一档40→60报价，取消不扣款 |
| 触屏长按拖动 | 弹数量5；取消后触屏滑动只滚背包，未触发写入 |
| 提交后丢响应 | 测试fetch在真实提交响应后抛错；UI进入unknown，关窗重开原ID不变，查询原结果后ready，数量20+13+5未重复 |
| 普通B背包扩容 | 无银行上下文；报价20→40/测试100金币，取消仍20，确认后40且pending清空 |

[银行初始图](evidence/st09/bank-initial.png)、[扩容后银行](evidence/st09/bank-final.png)、[普通背包报价](evidence/st09/backpack-quote.png)。PNG是实际H5画布截图，不是设计稿。截图为对应操作时刻，不保证最终服务内存仍是同一数量。

## 复现试玩

```bash
node client/tools/bank-preview-server.mjs
node client/tools/inventory-preview-server.mjs
node client/tools/serve.cjs web-mobile-inventory 127.0.0.1 8770
```

打开 `http://127.0.0.1:8770/?bankPreview=1&inventoryPreview=1`。N或右上角银行；B背包。银行8789与普通背包8788是两个独立临时夹具，**不是同一玩家资产**；这用于各自功能验收，不能当城镇全功能联调完成。重启服务即重置临时数据并换持久化命名空间。服务仅绑定127.0.0.1并拒绝非本机浏览器Origin；不能部署作正式后端。

## 尚未覆盖与下一步

- 正式扩容价格、正式持有域/内容发布、真实微信SDK可信链与事务/索引费用仍待对应门禁；没有默定价格。
- 触屏为浏览器模拟，未在微信开发者工具/手机验收；正式运输层与场景NPC生命周期需随城镇界面集成接入。当前提供attachBank注入入口与显式localhost预览，不声称已接正式云服务。
- ST05～08仍需实际Cocos城镇界面集成。下一项是已讨论的城镇功能界面联调包，串换装、商店、邮件、银行；之后按ST10～12推进副本与战斗体验。技能/怪物/副本表现与交互需在对应故事接入，静态稿不算完成。
