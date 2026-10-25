# ST11-01 独立合并核验

2026-10-25。独立 merger 核验已批准的 ST11-01 移动切片；本记录不替代后续规格与工程标准两轴独立评审。

## 固定提交与实际执行者

- 合并前 integration `feat-1.0.0`：`f7ff09be3dbcab596852c638a135eee102a8e139`。
- 来源工作树 `.worktrees/st11-01-movement`，分支 `feat/st11-01-movement`，来源提交：`c0017eddaf235120b49bb8c0b155b9a2f25227fa`。
- 独立核对来源工作树干净，来源与 integration 的 merge-base 精确等于上述合并前提交；28 个变更文件，`git diff --check` 通过。
- merger 先报告 READY；实际 fast-forward 由父任务 root 执行，merger 未执行 Git mutation。收到 root 成功通知后独立读取 integration HEAD，结果为 `c0017eddaf235120b49bb8c0b155b9a2f25227fa`，与固定来源完全相同。

## 独立执行证据

已读取根 AGENTS.md、accepted ST11 spec、issue 01、plan-check.json、source-of-truth 索引、来源移动合同与实施报告。未更改已批准任务正文。

在固定来源工作树实际执行：

```text
node --test backend/test/movement-submit.test.mjs backend/test/movement-client.test.mjs shared/test/movement-kernel.test.mjs shared/test/simulation-v2.test.mjs
node client/tools/demo-movement.mjs
git diff --check f7ff09be3dbcab596852c638a135eee102a8e139 c0017eddaf235120b49bb8c0b155b9a2f25227fa
```

29/29 通过：12 服务、6 客户端、7 内核、4 wire。实际用例覆盖五写点回滚、丢响应原结果、身份/版本/摘要/时间前沿整段拒绝、真实 Login 接管两顺序、冲突后重验墙钟、2 秒缺口与恢复原截止、心跳不延期、当前合法新会话查询历史原结果及当前公开证明绑定、连续切片与 30/60/120 渲染调度、薄墙足迹、离散队列溢出与一秒冻结。

真实演示输出 Login → Character → Town → 初始装备 → ST10 prepare/activate/ready → 资源证明 → 移动提交丢响应 → 重开 operation.get → 完整当前公开证明与纠正。最终位置 `(-179834,20350)`、tick `51`、logicalTimeMs `513`、remainderMs `3`；实际 UTF-8：头 `1359`、块 `2065/2305`、O `963`、回复 `521`、H `4167` 字节。Node 出现现有客户端 package 模块类型推断警告，测试与演示均退出 0。

来源报告的全量 7/7、shared 123/123、backend 496/496 属于实施者证据；本 merger 本轮独立重跑范围如上，未将报告计数冒充独立执行。

## 工作区与边界

根工作区已有 cocos-service 用户配置、ST09 审计/README/execution 文档和父任务 ST11 execution sidecar 均原样保留；未 stash/reset/stage。合并后 sidecar 的 ST11-01 merged / ST11-02 implementing 更新由父任务管理。

未执行安装、Jira、push/MR、云资源、GUI 或 Cocos 构建；此前拒绝的 Cocos 构建未重试。微信真机/云 SDK/费用、后续战斗与最大并发验证仍沿实施报告的 GAP。结论：本固定切片可进入 ST11-02 依赖基线。
