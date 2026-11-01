# ST17-02 单件修理执行合同

2026-11-02；来源为已批准ST17 spec/02票，用户“继续02吧”。仅本地可注入配置及真实服务/MemoryStore/传输纵切，不代表生产定价或设备验收。沿主规格、耐久方案、评分映射及资产物理映射；不改变已确认玩法。

## 服务权限与报价

- `TownService.openService(serviceKind=repair)`新分支必须由组合根提供可信IdentityPort；身份link、当前账号/会话、选中角色及当前城镇地图/林纳克斯anchor 24设计像素范围均在服务端核对。其他既有服务路径保留；有修理历史后打开任何新服务都会更新角色`currentServiceContextId`，旧修理上下文不再授权。
- 修理open原操作使用既有`assetOp(accountId,operationId)`/`assetJournal`命名空间与canonical完整tuple。原O先于当前位置/角色检查，同ID原参只返回固定原结果，不重写上下文或issuedAt；不同参数/其他命令碰撞拒绝OPERATION_MISMATCH。成功丢响应可通过现有授权operation.get查原service.open，关闭/移动/切换服务不把原成功改为失败。不存在J/O错配时不覆盖已存在来源。
- 私有上下文键为`repairContext(accountId,operationId)`，与位置revision无关；上下文仍绑定签发时rolePlayEpoch、sceneEpoch、locationRevision、anchor、issuedAt。新open成功同笔写context、角色指针/version、账号writeRevision、J和O；响应含新角色版本。原open重放不重新打开已关闭context，必须另发新open意图才能获得新上下文。
- 每次报价、视图、执行都验证当前选中角色、当前pointer、open状态、代次、地图/位置及活动挑战/开放场景不存在；旧/关闭/移走/重开/切角/重登不能继续用旧报价。
- 显式`RepairConfig`只支持profile=local-test、authorization=isolated-local-assets-only；必须注入ref及装等/品质→规范正整数字符串单点价，无缺省价。候选表来自耐久方案，金币沿钱包整数字符串单位，不套战斗1000缩放。只支持single，allWorn明确ITEM_NOT_ELIGIBLE留03。
- 候选工程参数`contextTtlMs`正整数且≤60000；本片夹具30000ms，截止固定为ctx.issuedAt+TTL，now>=截止拒绝。重复quote/视图/原open重放不续期，过期需显式新open。此为local-test限制，不锁定正式产品有效期。
- 报价是无持久写的有界视图，quoteRef重算摘要绑定账号/会话/角色代次、完整context、字符/目标/钱包/必要背包版本、完整价格配置、真实耐久和成本。执行完全重算，不信客户端价格或期限；即使客户端知道摘要算法也不能改变服务端计算的扣款。QUOTE_CHANGED或VERSION_CONFLICT后必须重新展示并确认，禁止自动用新价重提旧意图。

## 目标、原子提交与评分

- 目标须为本角色实际穿戴引用或背包唯一实际引用的active装备，核对账号、角色绑定/持有与location；金库、他角色、retired/pending、不磨损槽拒绝。所有实例先过现有严格EquipmentView验证。背包最多100格，不能以任意容器ID远程修理。
- cost=missing×unitGold精确BigInt计算并约束资源编码；不受强化、词条、最大耐久规模本身额外加价。满耐久合法0费用，不修改钱包/装备/角色版本，也不生成虚假资产delta。
- 钱包余额不足整笔拒绝。成功时原实例修到其max，保留ID、来源、绑定、词条、强化、max。穿戴目标读取至多13件当前装备并复用属性/套装汇总，只有实际有效属性改变时推进statsVersion；背包修理不改当前属性。HP/MP正式装备映射未新增。
- 改动实例、角色、钱包、账号writeRevision、实际差额J及原O同事务。J保存实例耐久/版本、钱包余额/版本、角色/stats前后事实、原expected、context来源、价格configRef/hash及quoteRef；拒绝/全满changes=null。磨损/修理不读写rankingEntry，不改equipmentVersion/score/scoreReachedAt。
- 每次执行要求完整报价targetVersions集合；其余真实穿脱/出售及修理共享角色/实例/钱包/必要背包的OCC。原O在当前资格/报价检查前恢复，成功不因新报价/上下文关闭被重算。notFound仅说明当前没找到；客户端只用原ID/原tuple安全重试，旧在途写晚到仍最多提交一次。

## 公开读模型与客户端

`service.quote`原通用形状保留，增加可选repair明细：expiresAt及有界items(最多7，02只产1)，逐项itemId/current/max/missing/unitGold/gold。严格验证唯一目标、耐久差额、规范正单价与精确总和，未知字段仍拒绝；没有该明细的旧报价保持兼容。

新增`repair.get {characterId,contextId,itemId}`返回同笔原子读模型：contextId、characterId/characterVersion/statsVersion、现有EquipmentView、钱包id/version/gold/points、当前支持域的有效attributes。versions必须包含相符角色/目标/钱包及背包目标时的容器版本。此视图不下发账号私有字段或报价权威。

`RepairCoordinator`用真实公开传输，先取得原子view及相同版本的quote，再由调用方显式确认repair。持久保存一个原命令，unknown阻止新写；recover先operation.get，found合并原结果，notFound仅原ID原tuple重试。提交确认后按最低版本刷新钱包/实例/属性；刷新失败保留已确认lastResult并报失败，不伪称资产未知再扣款。close/init/rebind代次隔离旧异步回调，关闭不取消服务端交易或删除未决持久意图。empty指当前未选择目标，不冒充资产目录为空。

本片未接Cocos面板或更改TownCoordinator UI恢复行为；原open结果传输/查询由真实协议测试演示，面板及宿主打开服务恢复在04整合，不冒称已有设备操作。

## 实际预算与验证

最终单件穿戴样本R9/W6、15实际调用，6个set均逐点故障原子回滚；单件背包R10/W6、16调用。13槽穿戴+100格背包的单目标原子视图R21/W0、21调用、1306B响应；不修非目标。新repair-open R7/W5、12调用，5个实际写点均逐点回滚。准确UTF-8/J增量与测试日志见02验证，最大7目标批修/8CP和正式SDK费用另验。

## 02独立核验后的角色版本修复（2026-11-02）

新repair-open必须携带且仅携带当前角色的character expected一项：缺少、错误对象或额外集合为INVALID_ARGUMENT；版本过旧为VERSION_CONFLICT，且不创建上下文或替换current指针。验证放在已认证原O回放之后、新上下文写入之前；同ID原tuple重放不受当前版本/地点变化影响，改expected也属于OPERATION_MISMATCH。旧其它服务路径不在本片重新定义。真实夹具从当前角色取得版本，回放保存原命令，不再用空expected绕过该合同。
