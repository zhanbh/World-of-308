# ST20 Standards 独立评审

日期：2026-11-03。
评审者：独立 Standards 评审 Agent（独立于 ST20 开发实施过程）。
评审分支：`feat/st20-05-joint-acceptance`，准备合入主干 `feat-1.0.0`。
评审依据：根目录 `AGENTS.md`、开发真相源 `docs/backend/source-of-truth.md` 及工程交付规范。

## 独立评审条款与审查结果

### 1. Jira 与外部单据约束（AGENTS.md）
- **核查项**：是否创建、同步、回填 Jira Epic/Story/Task，或包含虚拟 SP、外部 Jira URL。
- **实测结果**：**合规（PASS）**。全部文档与任务追踪均在本地持久化（`docs/stories/warrior-loop/st20/` 下 `spec.md`、`task-plan.md`、`execution.json`、`plan-approval.json`、`issues/*.md`），无任何 Jira 键值、虚构工时或外部网络单据调用。

### 2. 设计真相源（Source of Truth）一致性
- **核查项**：实现与派生合同是否符合 `docs/backend/source-of-truth.md` 索引的权威规范（`ranking-query-baseline-v1.md`、`scoring-projection-mapping-v1.md`、`asset-v2.ts`、`asset-physical-mapping-v1.md`）。
- **实测结果**：**合规（PASS）**。
  - 排行榜稳定排序严格遵循三元组：`(score DESC, scoreReachedAt ASC, characterId ASC)`；
  - 评分仅基于当前 13 槽位穿戴装备固有属性（装等、品质、强化等级、词条归一值），背包、金库、临时 buff、当前耐久磨损不参与评分；
  - 首屏数据采用独立确定键物理缓存（`v2:rankCache:${b64}`），参数为 15s fresh TTL、60s max stale fallback、3s CAS lease；
  - 本人名次采用三段式互斥统计求和算法计算，与全量排序排位 100% 严格等价；
  - 协议请求与响应形状完全符合 `asset-v2.ts` 强类型校验。

### 3. Git 分支规范与提交流程
- **核查项**：分支命名是否中性可读（`feat/<topic>`），不得包含 `codex/` 或 Jira key；实现与评审记录是否分步快进合并。
- **实测结果**：**合规（PASS）**。全部 5 张实施票据均采用中性分支：
  - `feat/st20-01-ranking-service-query`（commit `2805636`）
  - `feat/st20-02-cache-lease-ttl`（commit `e13ad34`）
  - `feat/st20-03-own-rank-counter`（commit `ad1de71`）
  - `feat/st20-04-cocos-ranking-panel`（commit `e30bde7`）
  - `feat/st20-05-joint-acceptance`（当前工作分支）
  均通过 `--ff-only` 合入 `feat-1.0.0`。

### 4. 物理存储与网络传输预算实测（Physical Budget Gatekeeper）
- **核查项**：实测单文档尺寸 $\le 16$ KiB，单页网络响应 $\le 64$ KiB。
- **实测结果**：**合规（PASS）**。
  - `rankCaches` 首屏 50 条条目文档尺寸：**12,604 字节** $\le 16,384$ 字节（16 KiB 上限，余量 23%）；
  - `RankingEntryEntity` 单角色条目文档尺寸：**335 字节** $\le 16,384$ 字节（16 KiB 上限）；
  - `ranking.list` 单页 50 条条目网络响应体积：**12,532 字节** $\le 65,536$ 字节（64 KiB 上限，余量 81%）；
  - 缓存命中时写操作为 0，缓存刷新时唯一写键为 1（仅限首屏缓存文档）。

### 5. 查询只读与无副作用不变量（Zero Side-Effects & Asset Non-Pollution）
- **核查项**：查询操作是否修改角色数据？缓存读写失败是否导致资产回滚或脏数据污染？
- **实测结果**：**合规（PASS）**。
  - 打开或查询排行榜为完全只读操作，严禁修改任何角色的 `scoreReachedAt` 或评分数据；
  - 缓存写入失败故障注入实测中，服务安全降级为有界直读，角色实体、装备实体与账户金币 0 写入、0 回滚、0 脏数据污染。

### 6. 防击穿并发抢锁与短租约（Stampede Protection & CAS Short Lease）
- **核查项**：缓存过期时是否存在多工作节点同时穿透数据库？短租约能否防止死锁？
- **实测结果**：**合规（PASS）**。
  - 采用 3 秒短租约与版本 CAS 抢锁机制；
  - 10 并发访问过期缓存实测验证：持锁期间全部 10 笔请求安全回退至旧缓存（`stale: true`），无数据库惊群雪崩；
  - 租约超时（3s）后后续请求可安全接管刷新，租约完成时原子清除。

### 7. 纯模型状态机与代次隔离（State Machine & Generation Isolation）
- **核查项**：客户端协调器是否与表现层解耦？是否具备代次隔离以防止在途迟包错乱？
- **实测结果**：**合规（PASS）**。
  - `RankingCoordinator.ts` 为纯模型组件，独立维护 `closed / loading / ready / paging / failed` 完备状态机；
  - 引入单调递增代次计数器 `generation`，在作用域切换或面板关闭时递增，丢弃在途延迟响应；
  - 游标翻页支持基于 `characterId` 的客户端幂等去重展示。

### 8. 编译类型检查与全量门禁
- **核查项**：TypeScript 编译是否严格无错误？代码风格与模型测试是否全绿？
- **实测结果**：**合规（PASS）**。
  - `backend/tsconfig.json`：Exit Code 0；
  - `tools/tsconfig.models.json`：Exit Code 0；
  - 客户端纯模型与 UI 模型门禁（`check-model.cjs`, `check-ui-model.cjs`）：100% SUCCESS；
  - `git diff --check` 通过，无空白字符或换行异常。

## 结论

ST20 的实现严格遵守工程约束、架构契约与代码规范，**0 项硬阻断性缺陷（0 Blocker Issues）**，通过 Standards 独立评审准入。
