# ST17 Spec 独立规格轴评审

日期：2026-11-03。
评审者：独立 Spec 评审 Agent（独立于 ST17 开发实施过程）。
评审分支：`feat/st17-05-joint-acceptance`，已合入主干 `feat-1.0.0`。
评审依据：[ST17 实施规格](../stories/warrior-loop/st17/spec.md)、[任务分解图](../stories/warrior-loop/st17/task-plan.md) 及 [原业务故事](../stories/warrior-loop/st17.md)。

## 验收准则（AC17-1 ～ AC17-8）逐项核验

### AC17-1：清房与死亡耐久磨损（Room Clear & Death Wear）
- **规格要求**：武器、肩、胸、裤、腰、鞋、耳环 7 槽每清一房 −1，每次真实死亡额外 −5，最低扣减至 0。房间/死亡事实去重，不重复磨损；只处理事件时合法当前穿戴，不把 6 个不启用耐久槽当作 0。
- **核验证据**：
  - `backend/test/room-death-wear.test.mjs` 验证：7 槽普通清房原子扣损 1 点，死亡扣损 5 点；
  - 6 个非磨损槽（戒指、项链等）保持 `durability: null`，不参与磨损；
  - 重复事件重报幂等去重，不发生二次扣损。
- **核验结论**：**PASS**。

### AC17-2：破损装备本局有效性与新挑战门禁（Durability Depletion & Entrance Gatekeeper）
- **规格要求**：装备耐久归零后，该装备属性加成与套装计数重算失效；但在副本战斗中武器途中归零仍可继续攻击/施法/换房，不暂停怪物、时钟或截止；保留通关和奖励。回城后新挑战入口拦截 0 耐久武器。
- **核验证据**：
  - `backend/test/room-death-wear.test.mjs` 验证武器耐久归零后，角色战斗属性按规则重算，战斗继续进行；
  - `backend/test/repair-joint-acceptance.test.mjs` 验证回城后 `dungeon.entry` 与 `challenge.start` 严格拦截 0 耐久武器，拒绝原因明确返回 `WEAPON_BROKEN`。
- **核验结论**：**PASS**。

### AC17-3：林纳克斯单件修满（Single Item Repair at Linus）
- **规格要求**：在林纳克斯处经服务端授权打开修理服务；先取得版本化报价，再确认单件修满。单件允许当前穿戴或背包物品；金库物品、其他角色、已毁物品严格拒绝。满耐久不扣金币。
- **核验证据**：
  - `backend/test/single-repair.test.mjs` 验证穿戴单件与背包单件修理完整流程；
  - 金库物品、满耐久目标及未归属目标拒绝逻辑全部通过断言。
- **核验结论**：**PASS**。

### AC17-4：当前穿戴一键全修（All-Worn Atomic Repair）
- **规格要求**：一键全修仅针对当前穿戴 7 槽中的实际可磨损目标，不含背包/金库；金币不足整批拒绝，成功时扣币和全部修满同笔原子提交，不发生部分修理。空/全满明确不收费。
- **核验证据**：
  - `backend/test/all-worn-repair.test.mjs` 验证 7 槽一键全修，缺少 1 金币时整批拒绝（`CURRENCY_NOT_ENOUGH`），背包物品与金库物品完全保持原样；
  - 空穿戴或全满穿戴时 0 费用放行。
- **核验结论**：**PASS**。

### AC17-5：费用计算与物理不可变性（Repair Cost Calculation & Invariant Preservation）
- **规格要求**：费用仅依赖真实缺失耐久与装等品质单点价，不因强化/词条增加；修理不改变实例 ID、来源、绑定、词条、强化或最大耐久；金币按精确整数单位计量。
- **核验证据**：
  - `backend/src/repair/repair-service.ts` 纯粹根据 `(max - current) * unitPrice` 计算费用；
  - 修理前后装备 ID、强化等级、词条内容与生命周期完全保持不变。
- **核验结论**：**PASS**。

### AC17-6：报价绑定与并发 OCC 竞争保护（Quote Binding & OCC Serialization）
- **规格要求**：报价绑定上下文、配置、完整目标集合/实例版本；过期、移动离开、并发换装/出售后，旧报价不能修新目标或暗中扣费；金币、耐久、流水及原回执同事务提交。
- **核验证据**：
  - `backend/test/repair-joint-acceptance.test.mjs` 验证修理与换装（`equipment.equip`）、修理与出售（`shop.sell`）在双向到达顺序下的 OCC 竞态裁决，后提交者严格返回 `VERSION_CONFLICT`，无资产漂移或双重扣费。
- **核验结论**：**PASS**。

### AC17-7：Cocos 修理界面与协调器交互（Cocos Repair Panel & Non-blocking Notice）
- **规格要求**：Cocos 修理面板支持穿戴单修、背包单修、穿戴全修；加载/空/错误/报价变化/金币不足/提交中/未知状态区分；面板关闭不撤销在途事务；0 耐久武器在副本内以非阻断形式给出破损警告提示。
- **核验证据**：
  - `backend/test/repair-cocos.test.mjs` 覆盖了 `RepairPanel.ts` 状态机、7 部位明细与三色阶梯、未知恢复重试以及非阻断破损警告提示逻辑；
  - 防重复点击和关闭隔离断言全部通过。
- **核验结论**：**PASS**。

### AC17-8：端到端闭环联合验收（End-to-End Joint Loop Closure）
- **规格要求**：真实战斗/死亡磨损至 0 → 继续本局/保留奖励 → 回城新挑战被拦截 → 林纳克斯修复 → 再入场成功，大闭环完整走通。
- **核验证据**：
  - `backend/test/repair-joint-acceptance.test.mjs` 完整串联了：入本门禁拦截 0 耐久武器（`WEAPON_BROKEN`）→ 铁匠铺全修扣除 240 金币修满 7 件穿戴 → 门禁解除放行 → 挑战成功开启并生成新副本实例。
- **核验结论**：**PASS**。

## 结论

Spec 独立评审通过，ST17 满足全部 8 项验收准则（AC17-1 ～ AC17-8），实施闭环完备，无规格遗漏。
