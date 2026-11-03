# ST20-04 实现与验证

日期：2026-11-03
实现分支：`feat/st20-04-cocos-ranking-panel`，合入基点 `6b9ee41`，源码提交 `e30bde7`。
范围：Cocos 排行榜面板与纯模型协调器，包含 `RankingCoordinator.ts` 状态机与代次隔离（`generation`）、跨页游标按 `characterId` 幂等去重、异常重试，以及 `RankingPanel.ts` 全榜/分职业榜单切换选项卡、本人名次悬浮条目置顶、前三名颜色标识、缓存新鲜度展示与安全资源释放。
来源：[ST20 实施规格](../stories/warrior-loop/st20/spec.md)、[04 实施任务](../stories/warrior-loop/st20/issues/04-cocos-ranking-panel.md) 及 [真相源](../../backend/source-of-truth.md)。无 Jira、未安装新依赖、未操作云端。

## 实现内容

1. **纯模型协调器（`client/assets/scripts/net/RankingCoordinator.ts`）**：
   - 完备生命周期状态机：`closed` -> `loading` -> `ready` / `paging` / `failed`；
   - 严格代次计数器（`generation`）与窗口隔离：
     - 在 `open`、`switchScope`、`refresh` 及 `close` 时自增 `generation`；
     - 任何在途延迟返回的旧代次网络响应自动被丢弃，彻底消除快速切换榜单或关闭窗口时的异步竞态；
   - 跨页游标翻页与按 `characterId` 幂等去重：
     - `loadMore` 携带 `nextCursor` 请求下一页（1~50条）；
     - 维护已有角色 ID 集合，自动滤除换装并发引起的跨页重复角色；
   - 异常重试与断网恢复：
     - 网络超时或服务异常时迁移至 `failed` 状态并记录 `errorCode`；
     - 提供 `retry()` 动作平滑发起重试，恢复可用。

2. **Cocos 交互表现层组件（`client/assets/scripts/ui/RankingPanel.ts`）**：
   - 标准 960x540 分辨率居中卡片式暗色 UI；
   - **榜单选项卡切换**：支持全服总榜（`all`）、战士榜（`warrior`）、猎人榜（`hunter`）一键切换；
   - **本人名次专属置顶横幅（`OwnRankBanner`）**：
     - 金色边框专属卡片，展示“我的排名: 第 X 名”或“暂不可用（容量熔断或未评级/未参与此榜）”；
   - **三元组排位明细列表**：
     - 呈现名次、角色名称、职业、等级（Lv.1~30）、装备评分；
     - 前三名高光差异化着色（第 1 名金色、第 2 名银白色、第 3 名青铜色）；
   - **缓存新鲜度标识**：
     - 显式区分“实时最新数据”与“15秒缓存快照数据”；
   - **触底翻页与错误重试**：
     - 存在更多数据时展示“加载更多”按钮与加载状态；
     - 失败时展示友好错误提示与“点击重试”按钮；
   - **移动端/桌面端交互保护**：
     - 统一处理 `TOUCH_START`/`TOUCH_END` 与 `MOUSE_DOWN`/`MOUSE_UP` 防重复点击及拖拽误触；
     - `dispose()` 干净注销 coordinator 订阅、移除全局事件监听并安全释放节点树。

## 验证证据

1. **Cocos 表现层与协调器测试套件（`backend/test/ranking-cocos.test.mjs` 6/6 全部通过）**：
   - `状态机流转与生命周期`：验证 `closed` -> `loading` -> `ready` 完整状态机与属性映射；
   - `游标翻页幂等去重`：模拟跨页包含重复角色，验证按 `characterId` 唯一性去重后条目严格准确无重复；
   - `代次隔离防迟包覆盖`：模拟慢速查询被快速切榜中断，验证慢速响应到达时被严格丢弃，当前榜单保持正确；
   - `异常吸收与重试恢复`：模拟网络断网超时（`NETWORK_ERROR`），进入 `failed` 状态，调用 `retry()` 顺利恢复；
   - `RankingPanel 渲染与置顶横幅`：验证本人专属名次置顶行、前三名颜色标识、缓存新鲜度（15秒TTL）正确渲染；
   - `榜单切换与空榜提示`：全服榜切换至猎人榜，验证选项卡激活状态、异职业暂不可用提示及暂无上榜空态提示。

2. **跨模块关联回归套件（47/47 全部通过）**：
   - `ranking-service.test.mjs`：23/23 通过；
   - `ranking-cocos.test.mjs`：6/6 通过；
   - `equipment-v2.test.mjs`：9/9 通过；
   - `equipment-rules.test.mjs`：5/5 通过；
   - `repair-joint-acceptance.test.mjs`：4/4 通过。

3. **TypeScript 类型安全与模型门禁**：
   - `backend/tsconfig.json` 与 `tools/tsconfig.models.json`：Exit Code 0；
   - 客户端纯模型回归（`check-model.cjs`）与 UI 模型回归（`check-ui-model.cjs`）全部 PASS（100% SUCCESS）；
   - 代码格式门禁：`git diff --check` 通过（0 告警）。

## 边界与已知限制

- 本次交付 Cocos 排行榜面板表现层组件与纯模型协调器。
- 端到端换装/强化即时刷新大闭环联合验收、物理预算与两轴评审留待 ST20-05。
- 无 Jira、未向远程 push。
