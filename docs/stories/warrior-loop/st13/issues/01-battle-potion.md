---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st13-01
status: accepted
revision: "1608d5525d6914d82d652ca1c61ffc57b4b323cca7c59702c8babc1490f1227e"
accepted_revision: "1608d5525d6914d82d652ca1c61ffc57b4b323cca7c59702c8babc1490f1227e"
derived_from:
  - artifact_id: spec:warrior-loop-st13
    revision: "09bc9716057a26d11b177816d25259d8cfdcee64c6771359a60a2ea158ae278b"
    path: docs/stories/warrior-loop/st13/spec.md
implements: [ST13]
blocked_by: []
approval_kind: human
approval_evidence: "确认，开始吧"
---
# ST13-01 战斗血蓝药：库存、恢复与共享CD同笔生效

无本包前置。交付：通过真实开房和simulation.submit使用背包快捷药，权威HP/MP、数量、CD、输入游标与原结果一次提交。

- 使用服务端模板配置，不信客户端当前HP/恢复量/数量/CD；固定量与最大值比例用现有内部精度，最后一次合法取整，满值对应回复余数清零。
- 快捷索引与绑定模板一致，缺货/满值/CD/失效模板是有序动作拒绝，后续合法输入继续；越权或坏协议沿片段拒绝规则，不新增独立扣药接口。
- 真实容器堆叠/来源谱系/持有投影按现有物理映射守恒，库存扣一次，清空格不清快捷模板；按实际变化原子更新版本及查询读模型。
- 同键重试/异参、两次同组用药、血蓝独立、旧seq/会话/场景、每个参与写点失败、丢响应和库存并发两顺序均有真实服务证据。交付命令演示与公开消费结果，不只测试纯函数。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
