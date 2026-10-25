# ST11-02 独立合并核验

2026-10-25。本记录核验已批准 ST11-02 普攻切片的固定来源与合并结果，不替代最终两轴独立评审。

## 固定来源及实际执行者

- 合并前 integration `feat-1.0.0`：`c0017eddaf235120b49bb8c0b155b9a2f25227fa`。
- 来源 `.worktrees/st11-02-basic` / `feat/st11-02-basic`：`287e72c0cc431c7cb7b8e5771c3538144f40c63b`。
- 独立核对来源 HEAD、运行前后干净状态；merge-base 精确等于合并前 integration。24 个变更文件限定为普攻实现、测试、客户端协调器、同步合同及实施报告，冻结 spec/issues 未改；`git diff --check` 通过。
- merger 报告 READY 后，实际 fast-forward 由父任务 root 执行，merger 没有执行 Git mutation。收到成功通知后独立读取 integration HEAD，确认结果为 `287e72c0cc431c7cb7b8e5771c3538144f40c63b`，与固定来源完全一致。

## 独立验证

读取已批准 spec、issue02、来源实施报告及 basic-combat 当前合同；根 AGENTS 和 source-of-truth 约束沿 ST11-01 核验继续适用。

在固定来源工作树实际执行并全部退出 0：

```text
node --test shared/test/basic-combat.test.mjs backend/test/basic-submit.test.mjs backend/test/basic-client.test.mjs
node backend/test/fixtures/basic-demo.mjs
git diff --check c0017eddaf235120b49bb8c0b155b9a2f25227fa 287e72c0cc431c7cb7b8e5771c3538144f40c63b
```

聚焦 21/21 通过：纯核9、真实服务9、客户端3。覆盖三段持有/松手/缓冲、全部切点与 30/60/120 渲染调度、8目标和非整除急速、独立几何/hit/crit/miss、零伤害、跨招倒地与死亡优先；服务七写点回滚、丢响应精确原O/完整结果页和随机游标、当前角色/装备与冻结施放快照、真实 OCC 冲突后墙钟重验、接管两顺序、当前新会话读取历史原结果/页及旧身份拒绝、暂停恢复与 timeline 栅栏。客户端验证完整动作页与当前公开证明纠正。

真实 demo 输出 `basic/no-rewards` 能力、`simulation.submit` committed、acceptedTick `101`、CP revision `2`；三段起手及五靶每段伤害共15条，返回完整动作结果和当前公开 combatAction/targetControl/movement 证明。未使用旧 reportEvents 路径。

独立测试实测32输入产生67事件，完整请求2485B、回复510B、O952B、header1362B、role2317B、scene3304B、公开proof页3623B、最大动作结果页7903B。Node 输出既有客户端 package 模块类型推断警告，不影响测试或演示通过。

来源报告的全量 check-all 7/7 是实施者证据，本轮 merger 未重复全量执行，不将其冒充独立结果。

## 保留状态与范围

根 cocos-service 用户配置、ST09 审计/README/execution、ST11 execution sidecar 及 ST11-01 合并核验均保留，未 stash/reset/stage。执行状态由父任务管理。

未安装、创建Jira、push/MR、部署、启动GUI/Cocos构建或操作云资源。正式收益域、高等级真实入口、后续技能/AI/资产/奖励、完整效果块与最大并发、浏览器/真机/云SDK及计费仍为来源报告列明的后续范围或 GAP。本固定切片合并核验通过，可作为 ST11-03 基线。
