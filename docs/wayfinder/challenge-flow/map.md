# 挑战生命周期 — Wayfinder 决策地图

Label: wayfinder:map
Status: resolved
Recorded: 2026-10-17
Parent: [整体规划](../map.md)

## Destination

明确挑战进入、死亡复活、断线/后台、首领通关、拾取退出的玩法边界，为在线模块设计提供基线。本轮不确定成长公式、掉落概率或数据库/API细节，不实施后端。

## Decisions so far

- [本轮确认记录](issues/01-lifecycle-decisions.md)：Q1–Q23，包含最终纠正和确认。
- [挑战流程规格](../../challenge-flow.md)：状态转换、模块交接与验收场景。

## Remaining work

特殊副本复活上限按副本及难度配置，具体次数待定；复活击飞半径、距离、高度及倒地时长待定。复活纹章来源、完整奖励表归后续模块。数据集合、事务边界和接口已形成[首版工程规格](../../backend/README.md)，首个[本地后台核心](../../../backend/README.md)已实现；完整在线闭环及目标环境验证尚未完成。resolved 只代表本轮玩法讨论收敛。
