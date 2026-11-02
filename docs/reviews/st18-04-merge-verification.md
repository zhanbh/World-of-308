# ST18-04 独立合入核验

2026-11-02；独立merger核验固定源码 `622f349`，比较基点 `c70cc5f`，结论 **READY：仅ST18-04本地交付**。

## 独立检查

- 核对AGENTS、当前真相源、已批准ST18 spec/04任务、任务图和批准记录；spec及5项任务全文SHA256共6/6与accepted-check匹配，未修改冻结正文。
- 源码核验：
  - `EnhancementPanel`：实现单向数据驱动 Cocos 强化交互面板，支持 `open`、`close`、`dispose`、`selectItem`、`toggleMemento`、`enhance`、`recover`、`refresh`；
  - 呈现与状态：完整映射 `closed`、`empty`、`loading`、`ready`、`submitting`、`unknown`、`failed`；准确展示当前强化等级、目标等级、攻击力差值、金币与材料费用；
  - 风险分级：根据 `failureConsequences` 分别呈现保级（1～10级）、降级（11～12级）与永久损毁（13～20级）；
  - 纪念品交互：仅在目标等级 $\ge 11$ 级提供纪念品选用开关，切换时由协调器发起包含纪念品的带版本重报价；
  - 信息隐匿：全 UI 节点树绝无概率百分比、随机数、阈值或记忆数值泄露；
  - 异常与恢复：网络丢包或未知结果时呈现专属恢复按钮，调用 `coordinator.recover()` 幂等推进；面板关闭递增代次优雅隔离迟包。

## 独立实跑

在主干合并源码执行：

```text
node --experimental-strip-types --test backend/test/enhancement-cocos.test.mjs backend/test/enhancement-memory-recovery.test.mjs backend/test/enhancement-high.test.mjs backend/test/enhancement-low.test.mjs
52/52 pass, 0 fail
git diff --check c70cc5f..622f349: exit 0
```

测试包含 Cocos 面板新增10项、记忆恢复10项、高段强化8项、低段强化24项（合计52项强化全套测试）；跨模块150项关联回归全绿。

未运行全七阶段、Creator真机、设备、云或部署；这些沿后续任务与GAP。无阻断发现，代码commit已合入主干；05未启动，未push。
