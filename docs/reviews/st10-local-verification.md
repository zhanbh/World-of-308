# ST10 本地交付与独立评审闭环

2026-10-24开始，2026-10-25收尾；集成分支 `feat-1.0.0`。用户批准五项线性任务后实施，无Jira或外部发布。已批准的来源故事、spec及五项issue的SHA保持不变；其历史状态保留，当前执行状态见[execution](../stories/warrior-loop/st10/execution.json)。

## 已交付的本地行为

真实身份、创角、城镇、装备服务接入副本入口；可信难度/等级/武器/体力门槛，1点体力允许创建。prepare固定同一attempt、manifest及紫名，实际资源字节摘要验证且不扣费；activate一次扣本局快照，完整公开证明和ready后才能预测。首房未激活无CP，激活后的非空CP与真实登录接管兼容。

加载暂停、心跳、恢复准备、原控制回执和到期结算可由真实内存服务/持久客户端协调器重放；不刷新原恢复截止、不重复计费。H唯一转场时钟结算联网前缀及后缀，排除恢复段。后续房验证清场/出口并继承当前血蓝、冷却、buff、装备磨损和体力，明确local-test配置下完成BigInt分段回复及精确余数。两房命令演示经过真实服务到active，不提供客户端设清场旁路。

## 五项实施与合入证据

| 任务 | 实施commit | 验证 | 独立合入 |
| --- | --- | --- | --- |
| ST10-01 入口与创建 | cae0f5d8d14eb3853c6d33c5ace21870d21080d4 | [证据](st10-01-verification.md) | [核验](st10-01-merge-verification.md) |
| ST10-02 prepare与资源 | e61761994f60fbf3f201d50a1c626379a985fd2f | [证据](st10-02-verification.md) | [核验](st10-02-merge-verification.md) |
| ST10-03 activate/ready | 7ab61844f02364182f12285358aec64eac23bfe7 | [证据](st10-03-verification.md) | [核验](st10-03-merge-verification.md) |
| ST10-04 加载恢复 | 83752e76fd9835d908165ccc7c0847e03d7db49c | [证据](st10-04-verification.md) | [核验](st10-04-merge-verification.md) |
| ST10-05 后续房与计时 | bd6cda776e57abda5132ae35e30f2fc81b996a1a | [证据](st10-05-verification.md) | [核验](st10-05-merge-verification.md) |

每项在最新集成tip建立独立项目内工作树，先TDD、独立核验再快进；后续依赖不提前mock。清理工作树保留提交和分支。原有ST09审计工作及用户Cocos配置未纳入本次功能提交。

## 独立评审

固定实施基点 `2d5276a2a37d84b1a274ac453e105a3ef4ebdc1a`。原始评审HEAD为bd6cda7；修复代码HEAD为 `08fb0eba410dfa79477eff30b669717c5fa4d815`（03148cb、08fb0eb两提交），原发现及复核原样保存在各报告。

### Standards

[独立报告及复核](st10-build-standards-review.md)：0项已证实硬性违反；原1项可选分页传输重复判断已由共享RecoveryProof关闭；最终0项待处理。

### Spec

[独立报告及复核](st10-build-spec-review.md)：原P1（ready合法回复改变hash导致客户端卡loading）与P2（CP外层元数据校验不完整）均关闭。客户端现在读取并验证ready后的真实公开记录，再核对新鲜当前状态；复现确认HP1180与CP一致且prediction=true。截止前ready成功、丢响应后跨旧截止重开也通过；证明绑定成功后的固定连接租约，读取/重放/心跳不延期。CP读取与接管共用外层校验。

[集中修复证据](st10-build-review-fixes.md)、[独立合入](st10-build-review-fixes-merge.md)。两轴分别签署通过，未以测试条数代替独立规格判断。

## 最终验证与边界

父会话在修复代码HEAD重新执行 `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`，7/7通过；日志 `/tmp/st10-final-integrated-checks.log`。共享115次、后端/协调器478次harness执行，其中42次为重复导入已有14-case夹具，不能当作478项独立覆盖。另执行Cocos类型项目 `--type-project tools/tsconfig.cocos-inventory.json` 通过；这不是构建或真机证明。无测试重复宣称填补未实现故事。

`node client/tools/demo-next-room.mjs`展示room0/scene1/stamina307→room1/scene2/stamina0，两房均实际校验11份E01公开契约资源。清场与出口是明确服务端夹具；拾取竞争为真实MemoryStore A/H争用和合法来源/背包夹具，完整ST15服务尚未完成。

正式三本内容、正式自然回复/出口交互参数、ST11战斗、完整ST15/16、3648效果/228快照完整战斗包络、云SDK/费用、Cocos构建和手机验收仍是后续GAP。旧Cocos构建授权被拒绝后未重试。资源验证为E01规范JSON字节，不是贴图/Bundle加载验收。本轮仅本地提交，未push或创建PR/MR。
