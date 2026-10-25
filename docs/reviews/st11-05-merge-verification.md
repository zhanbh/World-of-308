# ST11-05 独立合并核验

2026-10-25。固定来源及实际合并核验，不替代最终两轴独立review。

## 来源与执行者

- 合并前integration `feat-1.0.0`：`60a8933949ed2b4521a989fa1940f5e91c6b4881`。
- 来源 `.worktrees/st11-05-badao` / `feat/st11-05-badao`：`df3d40bf870ed6c3b3b563bf9ef149b2e8915b52`。
- 来源运行前后干净；merge-base精确等于上述基线。24文件变更限定拔刀实现、客户端、测试、活跃合同与实施证据，未改冻结故事正文；diffcheck通过。
- merger仅独立检查并报告READY，未执行Git mutation。实际fast-forward执行者为root；收到成功通知后独立读取integration HEAD，确认等于上述来源。

## 独立执行证据

读取根AGENTS约束、冻结spec/issue05、实施报告及拔刀合同。独立计算spec正文SHA-256 `605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b`、issue05正文 `4371b54755d7f1381af57058364f88191010ed012e2ea5d2616458c04b269ed6`，与批准版本一致。

固定来源实际命令均退出0：

```text
node --test shared/test/badao-combat.test.mjs backend/test/badao-checkpoint.test.mjs backend/test/badao-submit.test.mjs backend/test/badao-client.test.mjs
node backend/test/fixtures/badao-demo.mjs
git diff --check 60a8933949ed2b4521a989fa1940f5e91c6b4881 df3d40bf870ed6c3b3b563bf9ef149b2e8915b52
```

21/21通过（8纯核、1codec、11真实服务、1客户端）。包括宽幅单节点多目标独立命中暴击、范围外不抽样、101预算/尾跳余数、所有切点与右端节点保留、起手冻结/防御实时、控制锁与同tick技能顺序、低蓝不取消、当前角色解锁、真实写点故障回滚、相同CP候选只提交一次、原结果完整恢复/随机不重采样、恢复旧timeline拒绝、换房清效果保留CD/资源及严格CP反解。既有package模块类型推断警告未影响结果。

实际demo：丢回复unknown→重开active，acceptedTick26，MP99990，5次直接伤害/5流血效果/3块/6事件；预测与确认均x-180000/y20000。头1480B、公开第一页6086B；聚焦测试另测O952B、块2399/4073/912B、1去重snapshot。

全量7/7、shared156/backend541为实施者报告证据，merger未重复执行全量，不冒称独立全量通过。

## 保留与后续

没有修改用户cocos-service配置、ST09文件、父任务execution或其它既有dirty；未stash/reset/stage。没有Jira、push、安装、部署、GUI/Cocos构建、浏览器/真机或云SDK操作。

本次实例不是最终混合图发布证明：350行×6块的2100条容量、极值snapshot215B与192B守卫冲突，以及cross-only控制锁疑点，均已明确交ST11-06收口验证，不记为已完成。最终3648效果/228快照、ST12～15、真实SDK/时延费用等仍按实施报告保留范围与GAP。
