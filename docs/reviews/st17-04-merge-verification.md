# ST17-04 独立合入核验

2026-11-02；独立 merger 核验固定源码 `ed5779a`，比较基点 `a5322f9`，结论 **READY：仅 ST17-04 本地交付**。

## 独立检查

- 核对 AGENTS、当前真相源、已批准 ST17 spec/04 任务、任务图和批准记录；未修改冻结 spec 正文。
- 源码核验：
  - `RepairPanel`（`client/assets/scripts/ui/RepairPanel.ts` 及 `.meta`）：单向数据驱动 Cocos 修理交互面板，实现 `open`、`close`、`dispose`、`switchMode`、`selectSingleItem`、`refresh`、`repair`、`recover`；
  - 呈现与状态：完整映射 `closed`、`loading`、`empty`、`ready`、`submitting`、`unknown`、`failed`；全部穿戴模式准确展示 7 槽位当前/最大耐久、缺失点数、单件与总金币费用；单件模式清晰呈现选定装备详情与单价；
  - 异常与恢复：网络丢包或未知结果时呈现专属【确认操作结果】恢复按钮，调用 `coordinator.recover()` 幂等推进；面板关闭递增代次优雅隔离迟包；
  - `Prototype.ts` 适配：提供 `attachRepair` 与 `toggleRepair()`（支持 M 键与点击）；新增非阻断装备破损警告提示（`brokenEquipmentNotice`），耐久归零时不阻塞战斗、移动或过门换房。

## 独立实跑

在主干合并源码执行：

```text
node --test backend/test/repair-cocos.test.mjs
8/8 pass, 0 fail
git diff --check a5322f9..ed5779a: exit 0
```

全量 7 阶段自动化门禁 `check-all.cjs`：**7/7 全部通过**（后台 855 项测试全部通过，0 fail）。

未运行 Creator 真机场景构建、微信真机设备或云端 SDK；这些沿后续任务与 GAP。代码已合入主干 `feat-1.0.0`；05 联合验收待启动，未 push。
