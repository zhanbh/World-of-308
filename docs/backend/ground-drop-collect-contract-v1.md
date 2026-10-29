# ST15-01 地面来源与原子拾取合同

2026-10-29。仅当前批准的 01 范围。ST15 spec/issues 正文不改；真实冻结哈希见同目录任务的旁置 plan-validation-2026-10-29.json，旧 frontmatter 声明不当作已匹配证据。

## 授权与来源

`ChallengeContent.drops` 是单独显式 `profile: local-test-drops / authorization: isolated-local-assets-only` 的测试资产授权；没有它时原有 no-rewards 战斗不生成来源，不把训练 profile 当正式奖励授权。候选表和数值不是正式掉率。正式配置发布、幸运/缺件完整策略及经济平衡仍待后续实现和发布验证。

真实 simulation.submit 的确认新死亡（按 roomNo+spawnId 去重）在同一事务更新 rooms。每个死亡目前产生一个候选来源，room 至多16条。sourceKey=loginKey(dropSource,[challengeId,roomNo,spawnId])，ordinal=0；dropId=H(sourceKey,0)。候选从 SHA256(sourceKey+固定配置ref) 的固定样本选择，不用拾取operationId、不因重试重新抽样。room 保存配置ref/核心内容hash及固定完整描述，不提前建装备实例。后续配置与该hash不符则拒绝，不重新生成已提交结果。

`room.drops` 保存 sourceId/sourceKey、payload、坐标、collected、交付引用。有效性由当前 openSceneChallengeId、roomNo、sceneEpoch、roomPhase 和 sceneState 共同限定；切房/关闭后的旧来源逻辑失效，原文档及已交付终态仍保留，无自动TTL。preparing/awaitingReady期间禁止拾取。已有回执的同参重放先于场景判断，已入包资产不因后来离场撤销。

## 公开传输与授权

新增 `drop.list` 查询：当前可信会话 + challengeId/sceneEpoch；返回当前roomNo/roomToken、最多16条公开描述及 H/C/B 版本。roomToken使用已有唯一attemptId。公开描述不含账号ID、sourceKey、固定随机样本、装备私有词条或流水正文。

`drop.collect` 沿已冻结协议：challengeId/roomNo/dropId/roomToken/sceneEpoch/positionHint。校验可信身份、当前会话、所选角色及rolePlayEpoch、场景与连接/租约、生存状态、房间token、源归属和已确认击杀。expected要求H/B当前版本。距离由完整已验证CP中玩家坐标与固定掉落坐标计算，单位为 milli-design-pixel，平方距离<=32000²；positionHint永不授权移动或距离。

租约在异步读取后、发布写集前再次检查。明确拒绝仅写稳定O，无资产J；O同ID异参拒绝，J存在O缺失不再次消费。丢响应返回unknown，原意图通过operation.get恢复；不以新ID重试。DropCoordinator保存有界原指令，重建后先查O再原参重发，视图不乐观铸造资产。

## 原子交付

材料按同模板+版本+绑定身份优先合堆，每堆最多20；把整个来源交付或整笔BAG_FULL，不部分扣源。参与旧堆的完整数量与旧traceRef进入J，所有受影响输出获得本J稳定ordinal，未参与堆不拉长谱系。地面来源数量与合堆旧数量按池守恒，无历史祖先递归读取。

装备先检查空格，再按H(sourceKey,ordinal)检查实例不存在并物化，填roomDrop{roomId,dropId}来源、固定词条/耐久/绑定及背包归属。套装新拾取只增加所属角色适用职业的permanentCount，账号scope不增；域不一致或摘要损坏拒绝，地面未拾取不计持有。实例/背包/room来源/角色持有/J/O/A栅栏同笔。

## 当前预算

配置由可信composition root显式注入，P=0不代表未来云配置读取免费。普通材料、2块CP：唯一R12/W5，实际get14/set5（CP头重复核验和提交前H核验分别重复读取）；装备多一个实例不存在读和写，套装再多角色汇总一读一写。CP有n块时R=10+n（装备+1，角色适用套装+1），get=R+2，W5/6/7。drop.list R6/W0，已有同参回执R4/W0。真实SDK数据调用/commit/重试另计。

背包<=256KiB、room<=128KiB、单实例<=16KiB、角色汇总<=16KiB、J<=128KiB、O<=16KiB均以实际UTF-8 JSON守卫。生成新掉落的simulation.submit额外一个room读写；当前仍不是终局R44/W33验证。终局、即时金币/经验、升级邮件、direct/pending通关路线由02/03同事务接续；01不提前伪造完成。

Cocos图标与胜利HUD由04接续；当前只交付纯客户端真实传输协调器及命令演示，不声明手机、微信SDK、真实数据库/网络性能已验收。
