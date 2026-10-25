# ST11-06 独立合并核验

2026-10-25。固定来源与实际合并记录，不替代最终两轴独立评审。

## 来源及执行者

- 合并前integration `feat-1.0.0`：`df3d40bf870ed6c3b3b563bf9ef149b2e8915b52`。
- 来源 `.worktrees/st11-06-earth` / `feat/st11-06-earth`：`ea9ac987e6a70a6c19bb5ccb2a1a44aaeebdaeeb`。
- source运行前后干净，merge-base精确等于上述基线。39文件限定earth/统一调度、CP紧凑编码、服务/协议/客户端、测试、活跃合同及证据，`git diff --check`通过。
- root执行来源commit及integration fast-forward，merger没有Git mutation。报告READY并收到root成功通知后独立读取integration HEAD，确认与来源一致。
- 冻结spec正文SHA-256 `605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b`、issue06正文 `8e58438d3bea8c3684509aabaa01d09dc2498af8f60dd936e220abedd248f363`独立计算匹配批准版本。已读冻结任务、earth合同与实施报告。

## 实际独立运行

以下命令在固定来源执行，全部退出0：

```text
node --test shared/test/earth-combat.test.mjs backend/test/compact-effects-checkpoint.test.mjs backend/test/compact-room-checkpoint.test.mjs backend/test/earth-submit.test.mjs backend/test/earth-client.test.mjs
node backend/test/fixtures/earth-demo.mjs
node backend/tools/benchmark-warrior.mjs
git diff --check df3d40bf870ed6c3b3b563bf9ef149b2e8915b52 ea9ac987e6a70a6c19bb5ccb2a1a44aaeebdaeeb
```

27/27聚焦通过，约42.94秒：6earth纯核、4compact codec、2room codec、14真实服务、1客户端。涵盖四节点守恒/首拍倒地到效果结束、控前取消与落地残留、薄墙合法落点、全部切点/混合四技能/渲染节奏、免疫死亡优先、MP边界、实际写点回滚、竞争/原结果/恢复/换房/当前破损武器、发布包络及下述最大编码域负载。Node既有package模块类型推断警告未影响结果。

实际demo：unknown→重开active，acceptedTick26、MP99990、cast1、11效果（含ground）、21结果/15damage/3块；预测和确认均x-177000/y20000。头1480B、公开第一页8213B。

最大3648效果/228快照实际完整CP往返：header2083B，chunks `[2288,46904,45255,45399,45255,45399,45255,45399]`，总321154B，头/块/总量预算通过。912未来怪物预留行及极值快照、稳定槽删除/复用和严格非法引用/分数/ordinal反解均通过。这是编码分配域，不能冒称全部可达战斗轨迹或ST12 AI已实现。

最大公开证明115页、总1679956B、最大14797B，完整hash重建通过，读取约18.76秒。11400到期damage结果全部保留357页，私有cursor11400，单次本地提交约2474.73ms。首/中/末结果页写点3/181/359故障均整笔回滚，重试取全11400结果；未逐一测试所有357页故障。

独立benchmark使用Node24.9.0/darwin-arm64/Apple M4，2warmup/5samples。本轮与聚焦压力测试并发，负载环境不同于实施者测量：codec182.15～219.66ms、均194.27ms；四技能100tick/急速2/各1cast/250events为117.96～166.55ms、均140.20ms。记录实测差异，不以实施者较快结果替换本轮数据，不将其解释为云/微信/网络端到端门禁通过。

实施者全量7/7及其分阶段日志沿原报告保留；merger没有重复全量运行，独立范围是上述命令。

## 保留与缺口

未改根用户配置、ST09文件、父任务execution或其它既有dirty，未stash/reset/stage。没有Jira、push/MR、安装、部署、GUI/Cocos构建、浏览器/真机或云SDK操作。

正式收益原子消费者及ST12～15仍后置。357页本地事务不代表云SDK操作数/大小/费用可部署；大证明读取和本地核基准不代表端到端时延合格。最终两轴独立review及修复由root继续编排。
