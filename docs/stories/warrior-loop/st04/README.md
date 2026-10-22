# ST04 本地实施

[引用规格](spec.md) · [已确认任务图](task-plan.md) · [前置核实](build-preflight.md)

当前工作分支`feat/st04-inventory`，基于公司端`5bbcaa5`（`feat/e01-repeatable-checks`），不是旧main。E01、ST01～ST03本地能力已核实；不再重复询问任务图或把旧v1模块当上游缺失。

| 任务 | 交付 | 本故事内依赖 |
| --- | --- | --- |
| [ST04-01](issues/01-authoritative-sort.md) | 权威背包视图、正倒序与原请求恢复 | 无 |
| [ST04-02](issues/02-merge-and-organize.md) | 合堆守恒、谱系与一次原子整理 | ST04-01 |
| [ST04-03](issues/03-template-quickslots.md) | 3个模板快捷位与版本化数量视图 | ST04-01 |

本地验证与独立复核结果见[交付记录](../../../reviews/st04-local-verification.md)。本地实现不替代真实微信/云事务、Cocos拖拽、Note20 Ultra及其他真机验收。没有Jira或其他外部issue发布。


2026-10-23：Cocos面板及本机交互已验证，见[实际界面与试玩证据](../../../reviews/st04-cocos-verification.md)；此前仅命令演示的边界已推进。正式微信/SDK/真机门禁保留，不将故事标整体Done。
