# ST01-06 联合验收、独立评审与迁移交接本地验证

2026-10-22。ST01 01～06 已完成全部本地实现、合同联合验证与独立双轴代码评审闭合。分支 `feat/e01-repeatable-checks`，基线 `ab195410928f3f887f928d87e56d5d4ad61f71e5`；实现保留在未提交工作区，不假装已合入远程主干。未创建外部单据/Jira、未安装外部 npm 依赖、未部署或操作云资源。

---

## 1. 交付覆盖与任务状态

来源规格为 [只读 spec](../stories/warrior-loop/st01/spec.md)（SHA-256 `5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c`），覆盖 US1、US13 与 AC12。各任务全部达成既定验收标准：

| 任务 | 独立能力 | 状态 | 证据文件 |
| :--- | :--- | :--- | :--- |
| **01** | 私有身份端口与登录持久模型 | `local-verified` | [01 ticket](../stories/warrior-loop/st01/issues/01-identity-foundation.md)、`login-identity-v2.test.mjs` (3项通过) |
| **02** | prepare 票据与不变截止 | `local-verified` | [02 ticket](../stories/warrior-loop/st01/issues/02-prepare-ticket.md)、`login-v2.test.mjs` (同票重试/时钟边界通过) |
| **03** | 首次 commit 与原登录回执 | `local-verified` | [03 ticket](../stories/warrior-loop/st01/issues/03-commit-initialize.md)、`login-v2.test.mjs` (八键+零持有九键、未知恢复通过) |
| **04** | 角色与旧场景原子交接 | `local-verified` | [04 ticket](../stories/warrior-loop/st01/issues/04-takeover-handoff.md)、[04验证](st01-04-local-verification-2026-10-22.md) (23项通过) |
| **05** | 调用方登录流程与迟回调隔离 | `local-verified` | [05 ticket](../stories/warrior-loop/st01/issues/05-login-coordinator.md)、[05验证](st01-05-local-verification-2026-10-22.md) (10项通过) |
| **06** | 联合验收、独立评审与迁移交接 | `local-verified` | 本报告、全量 `tools/check-all.cjs` 7/7 检查组通过日志及评审闭合记录 |

---

## 2. 实际运行与全量回归证据

### 2.1 统一全量检查入口 (check-all)
使用系统现有 Node 24.19.0 与 Cocos Creator 3.8.8 本地内置 TypeScript 5.8.2 执行：

```powershell
$env:WORLD308_TYPESCRIPT='C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
& 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tools/check-all.cjs
```

**运行结果**：**`SUMMARY: 7/7 checks passed.`**
1. **CHECK: tooling contracts** — 7/7 通过 (1650ms)
2. **CHECK: shared/backend types** — PASS (真实 tsc 编译 shared 与 backend，0 错误)
3. **CHECK: shared value contracts** — 36/36 通过 (154ms)
4. **CHECK: client pure-model types** — PASS (LoginCoordinator strict 类型检查，0 错误)
5. **CHECK: backend regression (legacy and v2)** — **113/113 通过 (377ms)**（含 ST01 新增 64 项 v2 测试及 49 项既有回归）
6. **CHECK: client model regression** — 19/19 模块全通过 (40ms)
7. **CHECK: client UI-model regression** — 7/7 契约全通过 (26ms，100% SUCCESS)

### 2.2 ST01 核心业务行为验证矩阵 (64项专项测试)
- **身份隔离与不可伪造**：请求体身份无法进入 VerifiedIdentity；WeakSet 标记防止跨环境伪造；私有 subject 不外泄至公开 DTO；
- **票据稳定性与到期边界**：prepare 仅签发稳定 T，同参数重试不延期，严格在时钟截止边界拒绝；
- **原子九键初始化**：首次 commit 原子写入 L/A/W/V/S/O/J/T 及账号 scope 零持有汇总 K，9 个写点故障注入全额回滚，并发首次登录仅 1 笔成功；
- **未知结果同意图恢复**：响应丢失后使用原 openOperationId 找回原结果，不重复扣费、不重复建号；
- **旧会话撤销与场景交接**：已有账号切换代次，撤销旧 session 并更新账号写栅栏；active 场景关闭为 failed，completed 场景保留通关收益并只结算一次体力；
- **调用方迟到回调防护**：LoginCoordinator 使用代次隔离阻断旧 launch 回调，unknown 状态原键重试不擅自换票抢占。

---

## 3. 独立代码评审与修复闭合

Standards 与 Spec 两轴独立评审，原始发现及修复证据分别归档：

- **[Standards 独立复核](st01-standards-independent-review-2026-10-22.md)**：
  - 硬性违规：0；坏味道 smell：0。
  - 确认身份端口安全读取、内存 Store 深度 clone 隔离、异步代次屏蔽及无多余无益抽象。
- **[Spec 独立评审](st01-spec-independent-review-2026-10-22.md)**：
  - 发现 **SR01 / P1**：业务拒绝结果未占用 open 意图导致异参无法报错 -> 已在 `login-service.ts` 补齐记录业务拒绝原元组与结果；
  - 发现 **SR02 / P1**：异步读取跨截止仍能提交 -> 已在 `login-service.ts` 增加事务提交前最终时刻截止校验，过期整笔放弃不暂存；
  - 两项发现经独立变体直调复核全部闭合，64 项登录测试 100% 通过。

---

## 4. 真实缺口与责任交接 (Platform Gaps)

| 领域 | 当前本地状态 | 后续责任与准入要求 |
| :--- | :--- | :--- |
| **微信可信认证** | 本地 VerifiedIdentity 端口与测试 reader 验证通过 | **E02a**：需接入真实 `wx.login` / code2Session 与服务端鉴权策略 |
| **云数据库与索引** | 真实 MemoryStore 内存原子事务与故障回滚通过 | **E02a**：需验证微信云托管/云开发真实 document 事务与唯一索引 |
| **Cocos 登录页面** | 纯客户端模型 `LoginCoordinator` 状态机与网络传输抽象通过 | **ST02 / UI 集成**：需挂接 Cocos 登录场景与授权按钮 |
| **创角与新手引导** | 登录完成后返回无角色状态及确定性会话上下文 | **ST02**：正式承接角色创建、名字原子占用与新手物品初始化 |

ST01 本地实施范围到此全部完成，状态标记为 `local-verified (platform-gap)`。
