# ST16 客户端接线预查（2026-10-30）

状态：只读观察，供规格/任务图收敛；不是正式 code/eng review、准入批准或完成证明。观察基线由主任务提供为 `361ea7b`；本次仅新增本文，未改实现、测试或 Git。未安装、开浏览器、操作 Jira/云。

已读根 AGENTS、GLOSSARY、真相源索引及恢复时序、加载握手、CP schema、内容包络、UI纠偏/状态覆盖与 ST16 故事。以这些活跃合同为约束；历史“未实现”措辞不能覆盖当前代码事实。挑战 completed 与场景 looting 分开，恢复不改 sceneEpoch/dropId、不重抽/重扣，原10秒及死亡截止不能延期。

## 已存在的能力与证据边界

| 观察对象 | 直接代码/已有测试内容 | 不足以证明的链路 |
| --- | --- | --- |
| `RecoveryCoordinator.ts` | 持久化原控制意图，重开先 queryOriginalControl；ready未知先查同票据状态；完整基础证明、资源与ready后当前证明/最终状态复核；generation拒绝旧回调 | 该类没有调用 movement/drop/terminal 的原结果恢复，也不重建三者；调用者仍须编排 |
| `RecoveryProof.ts` | 顺序拉取完整页，核对页序/页数、同一票据/代次/修订/hash/截止并完整重算证明；截止要求serverTime严格小于deadline | 不等于8块私有CP都暴露给客户端；不能向客户端增加私有随机/内部CP |
| `LoadingCoordinator.ts` | 固定prepare意图，重试同命令；manifest及每份资源真实字节长度/摘要；cancel/新代次拒绝迟回调 | 当前资源为合同fixture JSON；不是Cocos Bundle/贴图真机加载通过 |
| `MovementCoordinator.ts` | 持久化单在途submit；retry先operation.get再原命令；完整simulation.confirmed及动作结果分页；resumeActive可重建当前状态；getter/enqueue/predict的guardClock在确认后>=1000ms冻结，输入/预测另有100tick上界 | 未与scene.suspend/resumePrepare编排；超界后只是frozen，没有自动恢复及中文状态展示 |
| `DropCoordinator.ts`、`TerminalCoordinator.ts` | 重开保留unknown；先operation.get，同ID重试；generation隔离；leave原结果已知才fade | open会先读取视图，unknown恢复在retry；外层必须在恢复栅栏前处理全部未决写，不能仅重开面板后当新场景使用 |
| `LootSceneCoordinator.ts` | 同一交互lane串行movement/collect/leave，等待在途动作；有confirmed位置、通关receipt/HUD、原结果重试 | close是disposed并关闭全部子协调器；不是可恢复暂停方法；retry对frozen/stale/error仅refreshConfirmed，不发resumePrepare |

现有 `backend/test/recovery-coordinator-v2.test.mjs` 的 `fixtures/recovery-demo.mjs` 确实调用真实ChallengeService/MemoryStore，包含付费awaitingReady暂停、resume响应丢失重开、两次ready丢响应、完整证明、一次房费/固定紫名/有效加载时钟；不是纯mock。但它起于加载场景，最终只断言 RecoveryCoordinator active，未连MovementCoordinator/LootScene/Cocos。

`client-ready-proof.test.mjs` 有真实服务的active恢复、ready后状态证明、篡改/漏记录/换代/准备后竞争等；`loading-recovery-v2.test.mjs` 覆盖加载/原截止/死亡截止、接管、completed超时保通关等服务行为。`loot-victory-client.test.mjs` 有真实Boss提交、拾取/回城unknown、CP移动与HUD以及local-test preview.rpc组合，但没有插入恢复全链。

这些内存服务/直接rpc测试不得称为HTTP弱网、浏览器或手机E2E。

## 真实缺口

1. **运行时入口未接恢复。** `Prototype.ts:176/187/457` 仅注册/注销Game.EVENT_HIDE；onHideInput清按键和部分面板异步代次，没有冻结权威scene、发送suspend或恢复。文件未注册EVENT_SHOW或focus恢复入口。`ChallengePreview.ts` 创建Loading、Movement、LootScene并直接load/resumeActive；没有RecoveryCoordinator，没有为其提供queryOriginalControl，也没有恢复后重绑视图的所有者。需复用现有HUD，不重设计整套UI。
2. **跨协调器原结果顺序未闭合。** 要先冻结全部新写/预测并保留原意图，再先查在途simulation/collect/leave的原结果，再resumePrepare竞争冻结前沿。不能先清pending或换ID；notFound后旧请求仍可能提交，须依赖同栅栏串行决定而非假定未发生。leave已成功应进closed，不再启动恢复；collect已成功不能让旧快照恢复出未领取掉落。
3. **死亡/looting不能复用alive判定冒充完成。** RecoveryCoordinator ready后的active分支使用sameProofState，后者严格要求alive/result active/roomPhase active；predictionEnabled亦只允许这组状态。completed/cleared不走该公开记录分支；active dead会被sameProofState(live,live)拒绝。它目前没有向死亡HUD或looting HUD交付完整已确认状态的恢复出口。MovementCoordinator能读取dead及completed（含死亡残留/通关移动），但没有恢复总控把对应证明、原截止及receipt/掉落一起交接。需分离“完整状态已恢复”与“允许活人战斗预测”，不放宽安全门禁。
4. **预测上界已有内核，无体验闭环。** >=1000ms冻结代码确实存在；Prototype权威帧只在active且predictionEnabled时推进，冻结后没有恢复入口。检索客户端未发现「正在恢复战斗状态」「网络中断，请重新进入游戏」规定文案。中文超时状态需基于服务端原截止/错误，不在客户端追加10秒或自行改终局。
5. **多源迟包需要整体代次。** 单类generation不是整个场景原子换代。旧movement/资源/collect/leave/恢复proof在新场景挂接后均不得覆盖新HUD；历史原结果仍可确认资产事实，不能当当前读模型。测试需跨对象而非只测RecoveryCoordinator.init。

## 建议可演示的垂直任务切片（交主任务图确认）

| 切片 | 可演示结果 | 必要验证边界 |
| --- | --- | --- |
| A：真实alive恢复骨架 | 共用真实service transport/persistence的scene owner，从活动输入→暂停→在途原结果→resumePrepare→资源+全部Proof→ready→Movement重建并继续一段真实输入 | 输入先提交/prepare先提交两顺序；原结果丢响应、prepare/ready丢响应重开；缺/乱/混版页、旧资源回调；1秒冻结、1.9秒/2秒缺口 |
| B：死亡与通关拾取恢复 | dead恢复不复活/不刷新死亡截止；残留杀Boss正确转looting；completed恢复receipt、位置及剩余掉落并可真实拾取/回城 | 真实ST15 Boss/collect/leave结果、unknown/在途竞争、同ID同参/异参；旧死亡弹窗不盖通关；completed超时仅关场景、active超时失败，收益不撤 |
| C：现有Cocos入口及中文体验 | hide/回来或网络不可用驱动同一总控，恢复中禁写/停预测，ready及完整重建后恢复；截止显示规定中文提示 | 可重复命令演示先锁定非GUI链路；随后单列Cocos/H5及手机生命周期、真实传输故障与资源验证，不把无GUI单测当视觉/设备验收 |

A先于B，C依赖A/B稳定出口。若主任务图按后端栅栏/公开证明另切任务，这三项应引用它们，不复制协议或引入第二套截止。ST15依赖按实际能力引用，结果包v2最大域/正式SDK既有GAP仍独立记录；不以生产门禁未全过阻塞本地fixture探索。

## 本次执行证据

静态逐文件观察如上；未新增测试。尝试 `node --test backend/test/recovery-coordinator-v2.test.mjs backend/test/client-ready-proof.test.mjs backend/test/loading-recovery-v2.test.mjs backend/test/loot-victory-client.test.mjs`，测试进程均在spawn阶段EPERM，未执行测试正文；尝试 `--test-isolation=none` 被当前Node判bad option。本次不宣称任何测试通过，不请求提升权限或安装运行时；主任务可用既有匹配运行时补跑。此环境失败不是产品回归证据。
