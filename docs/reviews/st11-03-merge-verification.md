# ST11-03 独立合并核验

2026-10-25。已批准十字斩切片的固定来源、实际验证与合并结果；不替代最终两轴独立评审。

## 来源与执行者

- 合并前 integration `feat-1.0.0`：`287e72c0cc431c7cb7b8e5771c3538144f40c63b`。
- 来源 `.worktrees/st11-03-cross` / `feat/st11-03-cross`：`080e81b5ad993b2128f9ab2a81ec876838bcb07f`。
- 独立核对来源运行前后干净、merge-base 精确等于上述基线；22个文件仅涉及十字实现/客户端/测试/同步合同及报告，冻结 docs/stories 正文未改；`git diff --check` 通过。
- merger 报告 READY；实际 fast-forward 执行者为父任务 root。merger 未执行 Git mutation；收到 root 成功通知后独立读取 integration HEAD，确认 `080e81b5ad993b2128f9ab2a81ec876838bcb07f` 与固定来源一致。

## 实际独立验证

读取冻结 spec、issue03、来源实施报告及 cross-combat 当前合同，沿根 AGENTS 与 source-of-truth 约束核验。

在固定来源实际执行并全部退出0：

```text
node --test shared/test/cross-combat.test.mjs backend/test/cross-submit.test.mjs backend/test/cross-client.test.mjs
node backend/test/fixtures/cross-demo.mjs
git diff --check 287e72c0cc431c7cb7b8e5771c3538144f40c63b 080e81b5ad993b2128f9ab2a81ec876838bcb07f
```

18/18 通过（9纯核、7真实服务、2客户端）：覆盖合法取消与拒绝后普攻/移动、全部129切点、两节点与101预算33/68分配、独立流血/固定跳数、实时防御一次减伤/DOT不倒地、释放后冻结轨迹/公开恢复、224个独立效果夹具、MP回复输入边界、恢复与旧timeline、8个实际写点故障回滚、精确原O/页/游标、竞争同基线提交一次、紧凑往返及空块无变化修订稳定。Node 出现既有客户端 package 模块类型推断警告，未影响结果。

真实 demo 展示 `basic/cross/no-rewards`、丢响应 `unknown` 后原结果 `found`、acceptedTick26、MP99990、cast1、6效果/3块及完整动作结果。实际字节：头1480B、小型回复513B、公开证明6178B；测试另实测 O952B、完整块2289/3912/797B。上述不是全部技能最大并发的发布证明。

实施报告的全量7/7、shared141/backend517属于实施者证据；本轮 merger 独立执行范围仅为上述命令，不冒充重复全量运行。

## 保留与缺口

未改根 cocos-service 用户配置、ST09审计/README/execution、父任务ST11 execution及既有合并核验文档；未stash/reset/stage。执行状态由父任务维护。

没有安装、Jira、push/MR、部署、GUI/Cocos构建或云操作。正式奖励/经验消费者、其余技能/AI/资产、完整3648效果/228快照与8块混合图、浏览器/真机/云SDK及计费仍沿实施报告后续范围/GAP。核验通过，可作为 ST11-04/05 依赖基线。
