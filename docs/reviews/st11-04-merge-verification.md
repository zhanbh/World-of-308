# ST11-04 独立合并核验

2026-10-25。已批准崩山击切片的固定来源、实际验证与合并结果；不替代最终两轴独立评审。

## 来源与执行者

- 合并前 integration `feat-1.0.0`：`080e81b5ad993b2128f9ab2a81ec876838bcb07f`。
- 来源 `.worktrees/st11-04-bengshan` / `feat/st11-04-bengshan`：`60a8933949ed2b4521a989fa1940f5e91c6b4881`。
- 独立确认来源运行前后干净、上述基线为来源祖先；23个变更文件仅涉及崩山击实现、客户端、测试、合同与实施证据，冻结故事正文未改；`git diff --check` 通过。
- 实际 source commit 与 fast-forward 执行者均为父任务 root；merger 只读检查，未执行 Git mutation。报告 READY 后收到 root 成功通知，再独立读取 integration HEAD，确认与固定来源一致。

## 实际独立验证

读取根 AGENTS、source-of-truth、冻结 spec、issue04、崩山击合同及来源实施报告。独立计算 spec 正文 SHA-256 为 `605d959c39e9caac16fa7096653c454e13ccf543f568a2288a2d9eebd6f3154b`、issue04 正文为 `057e2179e9114d9507ddf3a64f6ef96cd9b39f1d63dde54150a662fc94311043`，与批准版本一致。

在固定来源执行并全部退出0：

```text
node --test shared/test/bengshan-combat.test.mjs backend/test/bengshan-submit.test.mjs backend/test/bengshan-client.test.mjs
node backend/test/fixtures/bengshan-demo.mjs
git diff --check 080e81b5ad993b2128f9ab2a81ec876838bcb07f 60a8933949ed2b4521a989fa1940f5e91c6b4881
```

18/18通过（7纯核、10真实服务、1客户端）：包括三节点预算与终段特殊倒地、薄墙与足迹边界、所有片段切点及急速封顶、攻端冻结/防端实时、控制中断保留已释放流血并拒绝普攻、拒绝不误取消、MP回复边界、实际写点回滚、共享CP竞争仅提交一次、恢复/旧timeline、紧凑往返/空块稳定以及实际换房清效果保留资源与CD。Node出现既有客户端package模块类型推断警告，未影响结果。

实际demo为 `basic/cross/bengshan/no-rewards`：丢回复 `unknown` → 重开 `active`，预测与确认地面坐标均x0/y20000，acceptedTick26，MP99990，10效果/3块、16事件（15伤害事件）。头1480B、公开第一页7868B；聚焦测试另实测O952B，块2338/4015/997B，1去重snapshot。不是最终四技能最大并发发布证明。

实施报告的全量7/7、shared148/backend528属于实施者证据；merger本轮独立执行范围仅为上述命令，没有冒称重复全量检查。

## 保留与缺口

未修改根用户cocos-service配置、ST09审计/README/execution、父任务ST11 execution及既有核验；未stash/reset/stage。执行状态由父任务维护。

已知cross-only schema2编排的控制期间basic/普通移动同模式疑点由实施报告明确交给06及最终复核，本次schema3已新增保护负测；不得将旧分支疑点记为已验证无问题。正式经验奖励消费者、ST12 AI动态霸体、其余技能与3648效果/228快照/8块混合上界后续继续。未执行Jira、push/MR、安装、部署、GUI/Cocos构建、浏览器/真机或云SDK与费用验证。
