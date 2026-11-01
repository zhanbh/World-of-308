# ST17 本地只读预检与文档勘误

2026-11-01，feat-1.0.0 / 131edef，工作区起始干净且与origin一致。仅查当前代码/合同并复跑既有定向测试；未开始ST17业务编码，无Jira/安装/云/发布。

## 复用与缺口

- 已有7槽耐久字段和不磨损槽显式null；equipment-rules排除0耐久属性/套装，评分按固有价值不随磨损/修理改变。已有新挑战WEAPON_BROKEN校验和同挑战换房继续语义；技能释放快照不会因武器后来归零被追溯改写。
- ChallengeService当前simulation提交的wear由terminalFact×rewardConfig.roomWear加newlyDied×5构成，非末房全灭虽建立cleared却未据普通清房事实扣1；死亡磨损亦受奖励配置存在性耦合。故不能把ST15末房/尾伤验证算作ST17每房磨损已完成。须在01用真实服务明确合法profile策略、原子去重/属性修订，不为磨损验证打开经济授权。
- equipment.repair已有command/result，service.quote已有通用定义；EquipmentService仅处理equip/unequip，ShopService仅buy/sell/exchange，尚无repair业务handler、RepairCoordinator或Cocos修理面板。Town已有blacksmith/repair上下文可复用，林纳克斯操作不能只靠客户端坐标。
- 报价/成本、单修目标归属、全修集合版本、钱包/实例/O/J同笔及未知查询均待真实纵切验证。协议现有形状不自动代表这些功能已实现。完整13穿戴/7磨损与背包100格都需预算。

## 已解决的正文冲突

core-contract-v2.md第4节仍残留“非末房武器0暂停”，与主规格、耐久方案、API/状态/恢复/CP合同已确认“不暂停”相反。本次直接勘误为不中断当前挑战/怪物/截止、新挑战仍拦0武器，不新增产品决定。早期耐久方案的“旧实例缺字段/尚未确认”等历史段落不作为当前数据迁移假设；数据字典要求全实例明确durability。正式单价与最大耐久候选仅是试算，未自动锁为发布值。

## 实际基线

Node24.9.0运行：

```bash
node --experimental-strip-types --test backend/test/equipment-rules.test.mjs backend/test/next-room-v2.test.mjs backend/test/boss-death-tail.test.mjs backend/test/earth-submit.test.mjs
```

exit0，**38/38**，约61秒；原始日志[st17-existing-baseline-2026-11-01.log](st17-existing-baseline-2026-11-01.log)。这是既有属性/换房/终局尾伤/大崩快照基线，不包含尚无实现的修理或普通清房磨损，不代表ST17验收或全7阶段。未创建新ST17测试。

## 下一步

[spec草案](../stories/warrior-loop/st17/spec.md)和[五项任务图](../stories/warrior-loop/st17/task-plan.md)已持久化。按AGENTS保留一次粒度/依赖确认，确认前无accepted独立票、无业务编码。已确认玩法不重复提问，SDK/真实网络设备/正式发布配置GAP独立保留。
