# ST04 本地交付与验证

2026-10-23续接：Cocos面板及本机实际鼠标/触屏模拟已接通并验证；当前运行时证据见[交互验证](st04-cocos-verification.md)。下述46项为上一阶段纯逻辑增量，当前新增合计54项、backend194项，统一7组通过。

基线：公司端功能分支`feat/e01-repeatable-checks`的`5bbcaa5`；工作分支`feat/st04-inventory`。前置E01、ST01～ST03已有本地实现，不再使用旧main的缺失判断。原Cocos设置改动保留未纳入交付范围。

## 本轮交付

- InventoryService：可信组合根身份→当前会话/账号/选角授权→原O/J→精确expected集合→有界整理/绑定→A/B或C/J/O原子提交。复用v2创建的角色及容器，不向旧GameService增加旁路。
- 整理：仅本角色背包；装备/消耗品/材料排序及正倒序空格规则；兼容堆合并到20、绑定隔离；完整参与数量的输入/输出谱系；纯排序不改来源头、装备实例或两个金库。
- 快捷位：3个模板绑定，可替换/清除；数量取背包聚合，耗尽保持0，补货恢复。公开quickslot.get只读视图，无第二份余额。
- InventoryCoordinator：严格DTO、持久化完整待决请求、加载/空/失败/提交/未知状态，双版本视图与迟包隔离；查询原操作、显式重发原请求，不新造ID。已提供真实服务JSON往返的可重复演示测试。
- API、字典、事务预算同步；整理明确计入身份link，共7键读取/4键写入的内存设计量，无100装备扫描或历史来源遍历。

## 实际验证

本机Node24.9.0，现有Cocos TypeScript5.8.2，无依赖安装/隐式下载：

```bash
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```

统一7组：工具公开CLI、shared/backend严格类型、shared编解码/配置、客户端模型严格类型、backend历史与v2测试、动作模型、UI模型回归。完整原始日志及文件摘要见st04-verification-snapshot.json所指证据。

最终7/7组通过；工具CLI7项、shared109项、后端186项均通过，另有动作/UI模型回归。新增ST04共46项：8项纯规则、15项协调器、23项服务集成与故障。新增测试包括客户端协调器恢复/版本、服务集成与故障；服务测试真实调用LoginService和CharacterService，夹具仅提供合法来源资产，不把mock登录当真实上游。整理/绑定逐写点故障回滚、并发版本冲突、同操作并发重试只变更一次、O丢响应恢复、孤立J失败关闭、100格与字段边界均有明确断言。

## 独立复核

Standards轴初审：发现新增quickslot.get文档合同未同步（P2）；已补API/字典/预算并经复核关闭。重复InventoryCatalog类型的维护建议已通过导入消除。

Spec轴初审：发现首请求未到服务端时notFound会永久停留未知（P1）；新增显式retryOriginal保持原ID/参数/expected，并补从未送达及原请求仍在途并发重试测试，复核确认关闭。父审另补恢复查询互斥，防止迟到notFound覆盖已接受结果。

两个独立上下文Agent均为只读复核，无外部发布；未把同模型复核说成双模型结论。最终本地测试和文件摘要另行固定，不冒称CI或云验证。

## 保留的验收边界

本地服务、纯协调器及Cocos H5面板已交付；鼠标、浏览器触屏模拟、热区及本机持久化通过交互验证。故事整体不能记为平台全部Done：正式微信传输/存储、真实SDK、Note20 Ultra及其他真机交互/性能仍待验收；本机隔离试玩不能替代这些证据。

本轮不包含用药战斗效果/CD、银行整理/扩容、奖励领取或后续装备穿脱；没有Jira、云资源、依赖安装、自动部署或远端发布。未提交/推送的工作树交付需要后续按用户要求保存。
