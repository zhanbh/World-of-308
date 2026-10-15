# 技术选型、工程与云隔离

Type: grilling
Status: resolved
Label: wayfinder:grilling
Parent: [308世界整体规划](../map.md)
Recorded: 2026-10-15

## Question

沿用棋牌工程还是独立建设动作游戏，云资源如何划分？

## Answer

基于只读检查的棋牌仓库选择独立 Cocos Creator/TypeScript 客户端，以及 TypeScript/Node CloudBase 云函数与权威数据库。Cocos 具体版本未定；云托管留给未来持续计算需要。独立工程/AppID/CloudBase 环境，测试和正式隔离。旧工程可参考平台接入与规范，不继承实时牌局逻辑、内存资产或实际云标识。新仓库已建立不代表平台或云资源已创建。

这是此前真人讨论的归档，不是本轮新作的默认决定。具体已确认规则和待定项见[交接规格](../../architecture.md#1-现有项目证据与复用判断)；后续修改先取得对应决定，再同步规格与记录。
