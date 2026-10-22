# ST01-04 登录接管的角色与场景交接

2026-10-22。本地实现映射，依据[身份合同§7](../backend/identity-adapter-proposal-v1.md)、[体力字典](../backend/data-dictionary-v2.md)、[CP包络](../backend/simulation-content-envelope-v1.md)。不新增战斗或体力规则。

`backend/src/identity/login-handoff.ts`导出`handoff(tx,account,now,operationId,receiptId)`，只使用调用方正在执行的Transaction，不开启独立事务。返回清理合法旧指针后的account、最多两角色的公开摘要、selectedCharacter及相关resultVersions。调用方负责在同笔事务撤销旧session、建立新session、推进账号栅栏和原登录回执。单独调用handoff并不完成登录接管。

## 私有读取投影与键

Account沿login-model.ts，角色只读取该模块需要的LoginCharacter投影；不是ST02完整角色实体schema。持久记录上id/createdAt/updatedAt及其它既有字段由展开原记录保留，不因为投影未列出就删除。最多读两角色以形成登录摘要；只重置选中角色和实际旧挑战所属角色，不遍历重置其它角色。

HandoffChallenge声明accountId/characterId/sessionId/version、result/sceneState/sceneEpoch、staminaSnapshot/Settlement及可选currentRoomNo/roomPhase/transitionClock。角色和挑战按账号已有物理引用读；CP头使用loginKey('cpHeader',[challengeId])，块使用loginKey('cpChunk',[challengeId,ordinal])。ordinal为0～7，每个最多一次，按头实际activeChunks读取1～8块。

头与块的account/challenge/character/scene归属、引用chunkRevision/hash必须匹配；块不要求与头revision相等。块hash是对其`data`规范编码的SHA-256，正文、完整块80KiB和头16KiB均校验。CP.data是已有权威块的opaque payload：这里只核验引用、元数据、hash及字节，不验证其中完整战斗私有schema。最小closure fixture并非完整战斗CP合法性证明，完整schema由ST10/11提供。

唯一无CP分支是明确首房尚未activate：currentRoomNo=-1、sceneEpoch=0且roomPhase=preparing/result=active；旧已关闭的同种场景可保留closed元数据。其它缺头/块一律拒绝。已激活房号按0～6，UI单独加1，不接受以1～7代替持久语义。

## 原子交接

active挑战转failed/closed；completed仅closed、不撤成功；只改必要H/CP头访问状态，不重写或删除块/房间/地面来源。关闭清transitionClock，不补未确认模拟、不判额外死亡/磨损，不碰钱包、经验或装备。H/头关闭后，后续读取/输入/拾取必须验证其访问状态，不能绕过头直接用旧块。

同一挑战同时被两账号指针引用只读一次；两指针不同、归属错误、版本/引用异常、角色reservation不一致全部fail closed。已有closed指针只清同一旧指针，不重放历史结算loadedValue。已确认来源和资产不被撤销。

体力窗口按北京时间固定四小时。未结算时，同入场窗口加载remaining、跨窗口加载308，并同笔写H.staminaSettlement/角色余额、清reservation。已结算时不把loadedValue覆盖到当前角色；当前余额若确实落后于最新固定刷新窗口，按正常上线加载308，这与重放旧结算不同。

新角色游玩代次增加，location变隔离inn，并写`roleState`初始化事实：alive、HP/MP full、职业/药品/饰品CD cleared、buff/control cleared、HP/MP回复余数0/1。它是新角色上下文资源加载的唯一重置事实；不能在其后回退读取已关闭旧CP中的dead/CD。此事实不创建角色或计算完整属性，ST02/ST10负责按新代次物化完整角色状态。

交接J使用loginKey('handoffJournal',[accountId,receiptId])，保留原元组和openOperationId；不同launch复用同operationId不会覆盖原J。重复登录由外层openReceipt先处理，不能绕过原回执反复调用handoff生成新角色代次。

## 实际局部预算

设n为账号角色数（0～2）、m为实际重置角色数（0～2）、a为在用块数（1～8）。有旧场景且重置角色时，handoff局部读取H/头/全部块/n角色/J：R=3+a+n，写H/头/m角色/J：W=3+m。账号及会话写属于外层commit，不能再把局部当完整登录预算。若closed仅清旧指针，不写H/头，局部W=m+1；无场景但有选中角色时R=n+1/W=2。未选且无场景只读摘要n，不强造J。

以上是代码唯一键计数，不是SDK调用数或实际费用。测试使用真实MemoryStore，云SDK、快照/CAS和费用仍由E02验证。
