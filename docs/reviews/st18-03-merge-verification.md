# ST18-03 独立合入核验

2026-11-02；独立merger核验固定源码 `d0234d789e26b7e68e2930ee5d091dfbdc6f92d5`，比较基点 `5cca5ac`，结论 **READY：仅ST18-03本地交付**。

## 独立检查

- 核对AGENTS、当前真相源、已批准ST18 spec/03任务、任务图和批准记录；spec及5项任务全文SHA256共6/6与accepted-check匹配，未修改冻结正文。
- 源码核验：
  - `EnhancementCoordinator`：移除了低段 10 级硬编码截断，全面支持 11～20 级强化流程，达到 20 级时标记 `MAX_GRADE_REACHED` 并置空报价；支持 `setMemento(enabled)` 与 `enhance(useMemento?: boolean)` 纪念品控制联动；当装备损毁（`destroyed`）时，自动清空本地持有的 `itemId`、`view` 和 `quote`，状态平滑进入 `empty`；未知意图与网络丢包恢复（`recover()`）通过 `operation.get` 区分 `found`（推进版本）与 `notFound`（沿原 tuple 幂等重发），关闭面板时递增代次退休迟包回调。
  - 跨装备相似记忆与衰减：强化记忆挂载于 `characterId` 与 `rolePlayEpoch` 维度，武器失败累积的记忆可直接加成耳环等同角色合法装备；按整数配置 `distanceWeights` 严格结算贡献与消费（同级 100% 清空，距离 1 衰减 60% 消费并保留 40%，距离 2 衰减 14% 消费并保留 86%，距离 $\ge 3$ 衰减 0% 完全保留）；单来源上限（150000）、总加成上限（150000）与全链路概率上限（900000）严格落实。
  - 代次边界与并发安全：重新登录或代次变更（`rolePlayEpoch + 1`）重置为全新零记忆文档，跨角色绝对隔离；秘密随机样本基于 `[accountId, operationId]` 确定性生成，OCC 冲突重试下样本不漂移，提交后历史结果不可变；强化执行前与穿戴卸下、商店出售等生命周期变更进行版本栅栏校验，并发竞争时拒绝执行，杜绝幽灵扣款；公开接口严格隐藏私有随机样本与记忆数组。

## 独立实跑

在主干合并源码执行：

```text
node --experimental-strip-types --test backend/test/enhancement-memory-recovery.test.mjs backend/test/enhancement-high.test.mjs backend/test/enhancement-low.test.mjs backend/test/single-repair.test.mjs backend/test/equipment-v2.test.mjs
72/72 pass, 0 fail
git diff --check 5cca5ac..d0234d7: exit 0
```

测试包含记忆与恢复新增10项、高段强化8项、低段强化24项、修理21项、装备穿脱9项（合计72项独立抽检）；作者122项关联测试全绿。

未运行全七阶段、Creator、设备、云或部署；这些沿后续任务与GAP。无阻断发现，代码commit已合入主干；04–05未启动，未push。
