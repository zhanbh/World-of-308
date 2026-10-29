# ST15-02 独立复核（2026-10-29）

结论：本次独立执行未发现 ST15-02 行为阻塞；存在下列非阻塞维护项。未修改实现、测试或提交，未调用外部服务。

## 被核验快照

工作树：`.worktrees/st15-02-boss-clear`，分支 `feat/st15-02-boss-clear`。
基线 HEAD：`1be90837f2a7a9bae7a0ece95a12ba69f48b9313`；实现为未提交工作树，以上不是实现 commit。

实现与新增测试8文件内容清单的 SHA256：`07fd237c1be05829b52c3948e77285254d11a56da1cd3898acb550c7abedb1a8`。
算法：下列顺序的 `path + 空格 + 小写文件SHA256` 行以 LF 连接、无末尾LF，对 UTF-8 字节取SHA256。本报告及其他文档不在快照中。

```text
backend/src/challenge/challenge-model.ts 8eab44d343aeb882b9ebfbde0fde2bbf62c8f19aa92fe39c23f8a29ec584051b
backend/src/challenge/challenge-service.ts c38b1d2433cdfdea465db20ff5d7ac59fae5083b4a9d6b98ea159b0853a8460e
client/assets/scripts/net/MovementCoordinator.ts e464eed36ac74a911235e293c0a3c510b78b5b6ad72d5f6fe58fcd0e3b227e9a
shared/src/monster-simulation.ts 72ba4b698b6eea5c6380b277eec68bb40cef199981407f2c9ebea6eb2c99d61c
backend/test/boss-clear.test.mjs dd26394e435ec9e05c61759b144371a50a3a56c34ecd36edc3267d42001a3287
backend/test/fixtures/boss-clear-fixture.mjs 696f50594f2363246b134c92ac9720379863dc258daa3661fd10ed5350f9627b
backend/test/fixtures/boss-kernel-fixture.mjs c75d17566c38e0dd28541c7f63967a60a3027f3371579a2fd9c5a2949374ca28
shared/test/boss-terminal.test.mjs 5d6a059fcf89f444a73a104742e87448a73e72f05ac788e707d2c4162d2cd429
```

已读根 AGENTS、source-of-truth、ST15 spec/02 ticket、terminal-integration-notes、state-transitions及终局预算。实际 spec/ticket 文件SHA分别为 `ba94c5afa1c3735075c9622513ba589f7e5f55a1ebfeb451d974c0ece8151315`、`f67726d76410b8dcbd337f61adc7e16f6597fbdb69bcef205cf14eb1aedc5c65`，与 plan-validation-2026-10-29.json 一致；frontmatter 原声明revision错误继续保留，未宣称原hash一致。

## 独立执行证据

Node 24.22.1（指定缓存runtime）、TypeScript 5.8.2（本机Cocos内置），未安装依赖。

- `node --test --test-isolation=none backend/test/boss-clear.test.mjs shared/test/boss-terminal.test.mjs`：11/11通过，0失败。默认进程隔离尝试因sandbox `spawn EPERM`失败，改用Node官方同进程隔离选项成功执行，未把启动失败计作行为失败或通过。
- 两次直接 `node <本机typescript>/bin/tsc --project backend/tsconfig.json` 与 `--project tools/tsconfig.models.json`：均无诊断。
- 已覆盖真实Boss死亡→余怪来源/XP/金币同笔，8目标派生7击杀、7槽磨损至0、真实hostile同刻死亡免费复活、CP/hash和公开协调器恢复、各终局写点失败整笔保持原状态、提交丢响应原O重放、竞争意图不重复、普通击杀提前收益与无奖励训练边界。
- 实测8目标/7磨损槽的该fixture提交：唯一键R20/W18、最大单写5416 UTF-8字节。这是02受限样本，不是03/05最坏域或SDK预算通过。
- 额外stdin独立变体：基本攻击impactUs分别15000、19999、20001、25000，均取得对应精确terminal.at、玩家存活、怪物动作/投射物清空；非整数tick死亡不等待片尾。
- 额外公开服务变体：真实通关后 `drop.list`保留5来源；`challenge.leave(reason:finishLoot)`提交后仍completed且scene closed。
- 先死后残留流血杀Boss为内核测试，非完整跨请求服务验收；新增服务测试的公开证明/运动断言不实际执行drop.collect，故其测试名中的pickup不能独立证明拾取成功。

## 非阻塞发现

1. Standards/维护：challenge-service.ts及MovementCoordinator.ts大面积LF→CRLF使原始diff放大；`git diff --check`失败并报告大量CR尾空白，monster-simulation.ts返回行另有真实尾空格。语义diff仅service42增13删、coordinator2增2删；建议后续统一原文件换行再提交，不能将本轮称为diff-check通过。
2. Standards/维护：challenge-service.ts终局事务内存在两份完全相同的 `if(terminalFact)`动作/基础状态/lane.cast重置块（当前约750和752行），无行为差异但建议移除重复，降低后续修订分叉风险。

## 范围与剩余门禁

本报告是02独立核验，不替代完整两轴发布评审。原作者7/7日志已读，本轮未重新执行全套7门禁；仅上列命令为独立执行事实。03升级、跨级邮件、clearReceipt、专属装备direct/pending、最终体力/解锁完整原子路由仍待实现，不因最小金币XP与磨损已同笔就宣称终局闭环完成。05最坏全域字节/键预算及微信SDK、云DB、Cocos构建、设备验收仍为GAP。
