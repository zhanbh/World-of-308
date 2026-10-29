# ST15-03 体力结算裁决

2026-10-29。审批证据，用户原话：**“保留回城结算，通关只固定本局消耗（推荐）”**。

此决定覆盖冻结 [spec](spec.md) 与 [03任务](issues/03-terminal-settlement-and-routing.md) 的“通关将 staminaSettlement 标记 settled”一行；原 Accepted 文件字节和历史摘要保持不变。

通关事务固定本局 staminaSnapshot.remaining 和通关凭证，禁止再开启付费房间；completed/looting 仍为 unsettled，不加载新刷新窗口。challenge.leave、场景过期或身份接管真正回城时才按原窗口/最新窗口加载并 settled 一次。此语义沿 [主规格](../../../spec.md)、[字段字典](../../../backend/data-dictionary-v2.md)、[状态转换](../../../backend/state-transitions-v2.md)。

实现与验证见 [03验证](../../../reviews/st15-03-verification.md)。此决定不授权安装、云操作、部署或外部发布。
