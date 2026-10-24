# ST10-01 本地实现验证

日期：2026-10-24。范围仅Accepted ST10-01；规格、accepted tickets、计划SHA不改。工作树`.worktrees/st10-01-entry`、分支`feat/st10-01-entry`，起点及实现前integration tip均为`2d5276a2a37d84b1a274ac453e105a3ef4ebdc1a`。用户已批准五项线性图及编码；未调用Jira、安装、云服务、push或Cocos。

## 实际行为与公开入口

- `backend/src/challenge/challenge-service.ts`：`ChallengeService.query(dungeon.entry)`签发绑定真实TownState和会话/角色/位置修订/release的上下文，返回难度与A/C expected版本；不会创建挑战。当前没有独立dungeon.options handler，实际客户端使用新窄查询。
- `execute(challenge.start)`只实现创建，身份先于原结果重放；同ID异参拒绝。A双指针、C位置/体力保留、H和账户作用域assetOp/assetJournal原子提交。已知业务拒绝只保留O；同ID重试保留原拒绝。H无CP，sceneEpoch0/currentRoomNo-1/preparing，兼容真实LoginService接管关闭一次。
- 至少1体力即可进，不扣首房。锁release、角色/怪物等级、装备来源/属性和体力；首本额外紫名由服务端密码随机源固定，事务冲突重试复用已抽值，客户端operationId不作随机种子。装备类目配置缺失或缺等级行拒绝，不补默认内容。
- `client/assets/scripts/net/ChallengeEntryCoordinator.ts`：注入transport/pendingStore，显式选择确认前只读；发送前持久化原start，unknown/重开重试同ID，隔离旧异步流程。未伪造Cocos运行或战斗UI。
- `backend/src/challenge/challenge-content.ts`：`entryContentFromE01`验摘要后仅支持现有level1/normal/local-test contract fixture，保留验证release。其他副本/等级测试配置只是明确注入的门槛fixture，不是正式三本发布。

## TDD与真实组合证据

已采用用户确认的public service execute/query、DTO/scene-wire、coordinator transport/pendingStore seams。逐步红绿：缺ChallengeService模块→入口选择；缺execute→创建及原结果；非法minLevel0错误通过→配置校验；start缺monster字段→锁定DTO；缺coordinator→持久确认/重开；已知拒绝在体力变化后被重新执行→原拒绝receipt；缺E01 adapter→摘要校验适配。最大字串fixture又暴露scene statId64与既有装备128不一致，统一为128后绿。

实际组合使用LoginService、CharacterService、TownService、EquipmentService，而非GameService v1或nearDungeon。发现并修复必要ST05前置错误：已确认穿戴条件是`itemLevel <= character.level + 10`，旧实现错误比较角色等级；保留合法10档新手白武器，level1可穿10、不能穿15。旧ST05失败用例改为level10/item25，未更改历史审计结论。严格装备view补充真实初始武器已有`initialEquip(characterId)`来源。

19项focused测试覆盖选项无创建、显式确认、1/0体力与刷新、位置/伪上下文/旧修订、身份、装备有效性与真实卸装重装、普通/特殊等级和账号共享难度/零评分、缺配置、同ID异参/原拒绝、五写点回滚、丢响应、并发创建/重试重读时钟、新launch无CP关闭、durable client重开、E01摘要及实际UTF-8预算。每槽16词条的13实例fixture H/O/J实测81038/6057/1080字节；限制H128KiB、O16KiB、J128KiB，单装备16KiB。

## 命令与结果

基线父会话已执行完整7/7，见`/tmp/st10-baseline-checks.log`（341 backend /112 shared）。本工作树执行：

```sh
node --test backend/test/challenge-entry-v2.test.mjs
node backend/tools/demo-challenge-entry.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
git diff --check
```

Focused19/19。demo输出`choosing`且无挑战→主动确认`unknown`→重建coordinator重放同operation得到`started`，返回E01锁定快照并无首房收费。最终全量7/7（共享112、后端360）；日志`/tmp/st10-01-checks-final.log`、demo`/tmp/st10-01-demo.log`。一次中间全量在后端worker处无进展被停止，重跑及最终全量通过；另一次中间run记录了后续已修复的statId长度失败，不替代最终证据。

## 后续票据接点与缺口

ST10-02可从EntryChallenge的releaseRef、monsterLevel、monsterStatsRef、equipmentSourceRef、equipmentSnapshot/equipmentAttributes、purpleEncounter和roomCost接续。字段与逻辑字典映射已同步到data-dictionary/API/state/physical-mapping。Handoff键和不付费无CP合同保持原样；后续不得用v1 enterRoom替代prepare/activate，也不得放宽全局sceneEpoch约束。

本票据不实现prepare、资源manifest、activate、ready、CP或战斗；E01只含1级普通配置；正式内容、Cocos构建/真机、SDK与云费用未验证。此前Cocos授权拒绝保持未重试。提交SHA由提交完成后的独立交接记录给出，避免文件自引用SHA。
