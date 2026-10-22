# ST02 独立规格轴评审

2026-10-22。依据 soflow:code-review 的 Spec 轴；核对批准规格 `spec:warrior-loop-st02`（SHA-256 `4605b8375d337ba356e49e2380fcf8a98e074c584c26f2f542dff20ab80d6e4f`），以及 `docs/backend/source-of-truth.md` 索引的 `data-dictionary-v2.md` 与 `asset-physical-mapping-v1.md`。

## 规格符合性核对

1. **命名策略与全局占名**：
   - 中文≤6、英文≤12、严格禁止混编与特殊符号；`CharacterService` 与 `CharacterCoordinator` 均实施双重严格正则校验；
   - 全局占名基于 `characterNames/{name}` 互斥，不区分大小写，跨账号并发冲突保障单赢；
   - 账号内同职业排他，若已存在 warrior 返回 `CLASS_EXISTS`，hunter 返回未开放拒绝。
2. **角色实体与容器隔离**：
   - 角色实体初始化为 1 级、0 经验、308 城镇体力、`inn{characterId}` 旅店独立位置、3 个空快捷栏；
   - 独立创建 20 格背包与 20 格个人金库；
   - 账号生命周期的共享金库（100格）与钱包余额在角色创建前后保持不变，未发生重置。
3. **初始白武器与新手邮件**：
   - 合法 10 级白品质战士武器实例，角色绑定，启用磨损且耐久满额（100/100），初始直接处于 `equipped{characterId, 'weapon'}` 状态并挂载角色 `equipped['weapon']`；
   - 生成 30 天到期新手礼包邮件，精准包含 8 个生命药水、8 个魔力药水与 10 个复活纹章三个角色绑定堆叠附件；
   - 原子创建交付来源存根 `novice-gift`，确保邮件删除后亦不可重复领取礼包。
4. **9 键原子事务与故障回滚**：
   - 占名、角色、背包、个人库、武器、邮件、邮件来源、账号指针与流水在单笔事务内提交；
   - 覆盖 9 个写点的故障注入测试，单点故障全额回滚，无残留孤儿数据；
   - 同意图（相同 `operationId` 与入参）网络丢失重试稳定恢复原创建结果（`replayed=true`）；异参重复使用原 `operationId` 明确返回 `OPERATION_MISMATCH`。
5. **客户端调用流**：
   - `CharacterCoordinator` 纯模型状态机驱动，未知超时状态保持原意图重试，重置状态后阻断异步迟到回调。

## 结论

- 阻断性发现：0。
- 业务规格覆盖完整，17 项专项测试 100% 通过。
- 真实微信 API、云数据库唯一索引及 Cocos 创角页面列入 platform-gap。
