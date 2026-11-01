# ST17-01 本地验证：普通清房/死亡磨损

2026-11-01。基点 `fbfbc72d2f4a7305abff10991e52314c5a63238c`，工作分支 `feat/st17-01-wear`。用户“可以，确认；开始01吧先”；只实施ST17-01，未启动02–05，无Jira/安装/云/浏览器/设备/push。冻结规格及01票只读，执行sidecar由集成会话维护。

## 最终行为

- 首次权威普通房active→cleared各扣7合法磨损槽1；新deathIndex额外5，与金币/XP配置独立，最低0。0不反复写实例，6不磨损槽null不变。既有H阶段/deathIndex及原O/原片前沿去重，不增加客户端击杀/死亡/磨损上报。
- 明确本地策略：新`ChallengeContent.wear`只允许isolated-local-assets-only固定1/5，在真实challenge.start绑定H.wearConfigHash。显式策略不能中途开启/撤除/更换；旧已授权rewards夹具固定1/5兼容，roomWear为0/其它值拒绝，不静默改义。无显式wear且无rewards的no-rewards训练保持无资产磨损。没有开放经济授权或正式发布策略。
- 扣损后重算AP、后续起手/防御读取当前有效装备和套装计件；实际汇总变化才推进C.statsVersion/CP.attributesRevision，评分、scoreReachedAt、equipmentVersion保持。已释放basic/技能/流血快照保留。HP/MP最大值沿已有profile等级/资源配置，未虚构装备HP字段或免费回复/复活。
- 真实传输发现并修复原门禁缺口：普通房cleared后Movement刷新原报CURRENT_SCENE_NOT_ACTIVE，服务confirmed/submission原亦仅开放cleared+completed。现在合法active+cleared能取得全公开证明、走向出口、prepare→activate→ready，途中0武器后仍可普攻和起手十字斩。preparing/awaitingReady/recovery/closed仍拒绝输入，dead空尾/completed移动拾取沿原限制；不冻结怪物/时钟/截止，新挑战继续WEAPON_BROKEN。
- 实际磨损实例、必要角色/CP/H、资产J、原O同事务；收益时复用confirmedKills J，无收益写equipmentWear J，记录房间/死亡事实与前后耐久。无评分投影写。内核旧释放快照不追溯修改。

## RED → GREEN 与验证边界

经已确认的真实服务+MemoryStore+授权传输/纯模型边界。fixture基于真实登录/选角/当前装备/挑战入口，准备合法活动CP不伪造击杀；击杀与死亡由simulation.submit真实内核产生。时钟、事务故障和响应丢失可注入。没有mock身份、资产消费者或生产协议。

先写普通清房无奖励测试，原代码真实提交成功但weapon仍1，预期0，exit1；原始[RED](st17-01-red.log)。最小实现后首纵切exit0，[首GREEN](st17-01-green-first.log)。继续真实Movement纵切又暴露普通cleared证明门禁（旧ST15主要测末房completed，ST10换房多为可信cleared夹具，故未覆盖这一实际连续路径），本次真实清场→移动出门→0武器下一房普攻/技能已GREEN。

实际命令（Node24.9.0 / TypeScript5.8.2；每条均检查最终exit0）：

```bash
node --experimental-strip-types --test backend/test/room-death-wear.test.mjs backend/test/equipment-rules.test.mjs backend/test/next-room-v2.test.mjs backend/test/boss-death-tail.test.mjs backend/test/boss-clear.test.mjs backend/test/earth-submit.test.mjs backend/test/challenge-entry-v2.test.mjs
```

[相关回归日志](st17-01-focused-tests.log)：**75/75**，约61.3秒。覆盖当时9个新用例及66个现有属性、换房、死亡尾伤/同刻终局、奖励、快照和新挑战入口用例，未执行全7阶段。

随后仅补真实start锁策略和loading/recovery/closed反例；未改生产代码，不重跑已有长回归：

```bash
node --experimental-strip-types --test backend/test/room-death-wear.test.mjs
```

[最终新增测试](st17-01-new-tests.log)：**11/11**，约1.0秒。包括全部新增磨损、13槽/7磨损+6不磨损、原O/不同ID旧片、去重/0截断、套装/已释放basic快照、死亡归零尾伤通关奖励、真实传输跨房0武器普攻和十字斩、非法配置/版本上溢、逐写点回滚、丢响应查询原O、真实并发双提交只扣一次。

```bash
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project backend/tsconfig.json
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project tools/tsconfig.models.json
```

[backend/shared类型](st17-01-backend-types.log)、[client模型类型](st17-01-model-types.log)均exit0，明确只是选定类型项目，不冒称全检查。

## 实际事务/字节

13槽穿戴、7槽实际归零、无金币XP奖励普通清房：提交事务R24/W16、41调用（16写调用）、实际写24831 UTF-8字节、最大文档4797B。对16个实际set调用逐点injectWriteFailure，均SERVICE_UNAVAILABLE且完整快照不变，再用原命令可提交；成功丢响应查询operation.get找到committed，重放不二扣。双真实simulation提交经MemoryStore OCC竞争仅一个成功，一个VERSION_CONFLICT，7槽仅扣1；原版本/评分时间不变。实际采样及边界断言在最终新测试日志。

这是普通单CP业务夹具，非8CP/正式最大发布包络或SDK账单验证。沿旧终局R44/W33/80调用/1.5MiB防线，不另立放宽门槛。字段/API/状态/CP/预算/source-of-truth活跃视图同步。

## 后续及限制

只完成01。修理报价/单修/全修、Cocos修理面板、全故事小/8CP联合预算与两轴最终评审仍为02–05。生产SDK/真实网络/设备/正式最大耐久与费用配置未验。此片不改Cocos场景/Prototype，不执行Creator或全7阶段；集成后的独立merger核验另记，不由实现者自称独立通过。

## 独立merger发现后的恢复接缝修复

初始交付`b1dec5e0fa95739d174b84da8e2591203c89ebb5`的上述直接换房/类型结果属实，但未覆盖普通清场后恢复。独立merger发现ready的anchor/acceptingInputs/lastReadyReceipt及客户端RecoveryProof只接active或completed+cleared；真实ordinary cleared进入恢复后connected却无法走出口，初始交付因此尚不可合入。保留前述原日志，不将初次通过改写成已覆盖恢复。

新增真实普通清场→耐久已扣1→LoadingCoordinator重新读取原prepare结果并验资源→CombatRecoveryCoordinator.suspend/resumePrepare/完整页→ready→当前证明→Movement恢复→走出口→prepare/activate/ready→0武器普攻/十字斩。修前owner停loading、预期active，exit1，见[恢复RED](st17-01-recovery-red.log)。沿同一条真实链还捕获RecoveryCoordinator的ready后当前证明分支及recoveryPage原ready回执授权的相同谓词，均同步接受合法active+cleared；无新恢复机制/协议/物理键。

服务端统一inputPhase用于恢复ready、原ready证明、confirmed与simulation，仍只开放active/active和合法cleared(active/combat或completed/looting)。身份、connection、lease/death截止、dead空尾、completed禁攻击与loading/recovery/closed禁输入原门禁不变。客户端RecoveryProof及当前证明分支按相同组合对齐。回归明确验证：首次suspend到期11600，prepare票仍11600；ready重建anchor到3000但acceptedSeq/Tick保持、timeline仅+1，cleared的inputGapBaseAt仍null；7槽仍0且实例版本没有再次推进。合法ready后的新在线lease沿既有规则，不将其称为延长恢复票。

[恢复GREEN](st17-01-recovery-green.log) exit0；随后定向执行：

```bash
node --experimental-strip-types --test backend/test/room-death-wear.test.mjs backend/test/active-combat-recovery.test.mjs backend/test/dead-looting-recovery.test.mjs backend/test/next-room-v2.test.mjs
```

[修复后定向日志](st17-01-recovery-focused.log)：**33/33**、exit0、约1.96秒，包含12个当前新增磨损/恢复用例及active/dead/looting/原截止/换房回归。再次检查[backend/shared类型](st17-01-recovery-backend-types.log)与[client模型类型](st17-01-recovery-model-types.log)，均exit0。无全7/Creator/02/推送；最终独立merger新SHA复核仍由集成会话另记。
