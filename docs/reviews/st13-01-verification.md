# ST13-01 本地验证

日期：2026-10-27。分支`feat/st13-01-battle-potion`；基点`98480c4`。本记录为实施者证据，不代表整包ST13/平台/设备验收。

只读来源：spec accepted_revision `09bc9716057a26d11b177816d25259d8cfdcee64c6771359a60a2ea158ae278b`；ST13-01 accepted_revision `1608d5525d6914d82d652ca1c61ffc57b4b323cca7c59702c8babc1490f1227e`。未修改spec/票据正文；seam严格沿纯规则内核、仿真钩子与真实ChallengeService事务提交。

## 实际交付

1. **纯药品规则内核 (`shared/src/potion-kernel.ts`)**：
   - 定义全等级血蓝药目录（10/15/20/25/30级微型、小型、中型、大型、超大与百分比药剂）。
   - 10秒固定冷却周期（1000 ticks），血蓝两组共享CD完全独立。
   - 固定数值（150/40、300/70、550/110、900/160）与30%最大值整数截断算术恢复，达上限重置regen remainder。
   - 消耗背包绑定优先级：角色绑定 (0) -> 账号绑定 (1) -> 非绑定 (2)，同绑定槽位升序优先；扣光自动删除槽位。
   - 状态校验与防御：满血满蓝拒绝（`HP_FULL`/`MP_FULL`，不扣道具不触发CD）、死亡拒绝、CD中拒绝（`COOLDOWN_ACTIVE`）、槽位不匹配/未装备/库存不足拒绝。
2. **仿真循环同刻先处理供给 (`shared/src/*-simulation.ts`)**：
   - 在 `earth-simulation.ts`、`badao-simulation.ts`、`bengshan-simulation.ts`、`cross-simulation.ts`、`basic-simulation.ts` 每一刻循环起始点优先调用 `supply` 处理药品输入，使同刻恢复的HP能保护怪物攻击、恢复的MP立即供同刻技能释放。
3. **真实事务与乐观锁原子提交 (`backend/src/challenge/challenge-service.ts`)**：
   - baseline阶段加载角色背包ContainerEntity，校验schema与所有权，对齐 `q.expected` 容器版本。
   - 提交事务中比较 `canonical(currentBag) === canonical(bag)`，并原子递增背包版本与写回。
   - `resultVersions` 显式包含 `{ kind: 'container', id: bag.id, version: nextBag.version }`。

## 红绿证据

1. **纯内核单元测试 (`shared/test/potion-kernel.test.mjs`)**：
   - 13/13 项测试全部通过：包含目录完整性、数值恢复算术、绑定优先级扣除、同刻双药独立CD、满血满蓝拒绝不扣道具、死亡防御与上限截断。
2. **集成与服务并发测试 (`backend/test/battle-potion.test.mjs`)**：
   - 9/9 项集成测试全部通过：
     - 测试1：HP药提交恢复150点HP，扣除1瓶，进入10秒CD，CP与容器版本同笔原子提交。
     - 测试2：MP药提交恢复40点MP，与HP冷却独立，支持同刻消耗MP释放十字斩技能。
     - 测试3：10秒内连续使用两瓶HP药，第二瓶被拒绝（`COOLDOWN_ACTIVE`），背包不发生二次扣除。
     - 测试4：满HP状态下使用HP药被拒绝（`HP_FULL`），不消耗道具、不触发CD、不递增背包版本。
     - 测试5：幂等重放相同operationId返回原始committed结果，背包不重复扣除。
     - 测试6：相同operationId发送不同参数的输入拒绝并返回 `OPERATION_MISMATCH`。
     - 测试7（并发时序1）：药品提交先成功并递增背包版本；后续基于旧背包版本的 `inventory.organize` 检测到版本冲突并返回 `VERSION_CONFLICT`。
     - 测试8（并发时序2）：外部操作先递增背包版本，声明了旧背包版本的药品提交检测到 `VERSION_CONFLICT` 拒绝，零脏写、不丢药。
     - 测试9（并发时序2 OCC）：在仿真完成与事务提交之间并发修改背包，`ChallengeService` 提交事务比较检测到版本冲突并拒绝 `VERSION_CONFLICT`，无脏写。

## 实际命令与结果

本机 Node **24.22.1**，TypeScript **5.8.2**，离线无头执行，无依赖下载：

```powershell
$node = 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $node --test shared/test/potion-kernel.test.mjs backend/test/battle-potion.test.mjs
& $node tools/check-all.cjs --typescript 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
```

- 专项测试：**22/22 通过**（内核 13 + 集成 9）。
- 全量回归：**7/7 checks passed**（含后端回归 596/596、共享纯模型 212/212、客户端纯模型全部通过、UI模型 100% 成功）。0 业务回归。

## 限制

本交付为 ST13-01 战斗血蓝药后端与仿真内核原子生效。主动饰品机制移交 ST13-02；补给品生命周期与快捷栏联动移交 ST13-03；Cocos HUD 前端表现移交 ST13-04；联合预算与全量合入移交 ST13-05。未启动浏览器、未涉及 Jira 单据。
