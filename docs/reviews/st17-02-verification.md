# ST17-02 本地验证：林纳克斯单件报价与修理

2026-11-01开始，2026-11-02收尾（Asia/Shanghai）。基线 `4bbe1840cae9e221d90feceeca8a2aa7f2e9d527`，工作分支feat/st17-02-single-repair。用户最新“继续02吧”授权本片，覆盖冻结票正文中的历史01-only范围；spec/5票字节未改。只交付02，03全修/04面板/05最终门禁未启动，README/execution由root维护。

## 交付行为

真实登录/选角→town.move两段走到林纳克斯→可信身份授权repair service.open→本角色穿戴或背包装备版本化报价→显式确认单修→钱包/原实例/当前属性原子刷新可重复执行。复用equipment.repair和service.quote，新增严格repair.get原子读模型；单目标RepairCoordinator沿真实公开传输工作，未直接访问Store或私有身份。

费用只按实际缺失耐久×装等/品质单点价，候选10白1金币/点、30紫6等仅显式local-test配置，不锁定正式经济数值。金币使用钱包精确整数单位，不套HP/位置1000缩放。不改变绑定/词条/强化/来源/实例ID/max；穿戴有效属性确有变化才推进statsVersion，equipmentVersion/score/scoreReachedAt及ranking投影不写。背包目标不计入当前穿戴属性。满耐久返回合法0费用/空修复清单且不改任何资产版本；没有免费赠品、部分修理、赊账或自动修理。

服务端每次验证可信身份、当前账号/会话与选中角色、角色/场景/位置代次、24px NPC距离、open状态及currentServiceContextId，无活动挑战/开放拾取场景。个人/账号金库、他角色/绑定、已毁、不磨损槽均拒绝。上下文候选TTL为签发起固定30000ms，重复报价不续期，等于到期拒绝；只用于本地工程验证，正式参数未锁定。

service.quote为纯读摘要视图，服务端重算完整身份/context/目标/钱包/必要背包版本及实际价格配置。可选repair明细按itemId明确current/max/missing/unitGold/gold和expiresAt；旧通用quote没有明细仍兼容。执行核验完整expected和原quoteRef，不静默替换报价。repair.get同笔读取目标/钱包/角色和最多13槽当前有效attributes，带必要版本，不拼接不同时间的旧视图。

原实例、必要角色/钱包、账号writeRevision、J及O同成同败。J记录真实耐久/余额/版本前后、当前服务来源及报价配置摘要；拒绝/全满changes=null，不伪造资产delta。原O优先于当前报价/地点判定，成功不会因面板关闭或新报价被重算；同ID异参拒绝OPERATION_MISMATCH。notFound不宣告旧写失败，协调器仅原ID/原tuple重试，迟到原写和重试竞争也只能扣一次。确认后的刷新失败保留lastResult，不能再把已确认交易当unknown重扣。

## 修理open的额外闭环

现有Town service.open既有路径没有稳定原O；最初仅给repair contextId加入operationId仍含locationRevision，root复核指出移动后同ID会创建新context/刷新TTL。已在本片新repair分支修正，旧其它服务授权路径保留：

- TownService新增可注入IdentityPort，repair-open必须提供可信身份；新分支校验身份link/currentSession/selected角色。
- 同一assetOp/assetJournal(account,operation)命名空间保存完整tuple/固定原结果，读取先于当前角色/位置。context使用稳定repairContext(account,operation)，新context/角色指针/version/账号writeRevision/J/O同笔。
- 原open同参重放，即使已close、移动离开又返回、其它context成为current，也只回固定原成功，不写ctx/指针/issuedAt，不重开、不续期。同ID异参及其他命令碰撞拒绝。
- 成功丢响应后，RepairService现有授权operation.get能查到command=service.open的原结果；不限定为equipment.repair，不引入第二套原操作体系。
- 新修理open成功5个实际set均逐点故障回滚。其它服务打开在已有修理指针时替换current，使旧修理报价失权。

这是02必要上下文/原结果接口补齐，没有新增TownCoordinator或Cocos面板。现有TownCoordinator UI不在本片增加自动原O恢复；宿主可用公开原查询恢复，面板/打开服务的用户交互整合在04，不声称已设备验收。

## RED → GREEN 和实际检查

遵循已批准协议/纯模型、真实服务+MemoryStore+授权传输边界；没有mock身份、钱包、实例、属性消费者。预置破损与背包资产属于已确认的admitted测试准备，不假称从自然掉落积累；实际登录、选角、城镇移动/open、单修/穿脱/出售及原结果走真实实现。

首条测试建立公开repair模块/纵切，原模块不存在，exit1，保存[RED](st17-02-red.log)；最小报价/单修实现后1项exit0，[首GREEN](st17-02-green-first.log)。随后逐步补背包、满耐久、拒绝、原O、OCC、协调器和open原O反例，不以初版GREEN代替最终结果。

Node24.9.0 / Creator附带TypeScript5.8.2，未安装依赖。每条命令检查实际exit0：

```bash
node --experimental-strip-types --test backend/test/single-repair.test.mjs shared/test/asset-v2.test.mjs
```

最终[焦点日志](st17-02-focused-tests.log)：**96/96**，含19条新增服务/传输场景及共享协议现有/新增表驱动案例，约0.25秒。覆盖穿戴/背包/满耐久、不足金币、非法scope/身份/代次、旧版本/配置/报价、原O/丢响应、notFound后原写迟到、close/rebind迟包、低版本刷新、真实穿脱与出售OCC各两序、open重放/关闭/移动/同ID碰撞/丢响应，以及13穿戴/100格单目标容量；不是全故事测试数量。

```bash
node --experimental-strip-types --test backend/test/single-repair.test.mjs backend/test/town-v2.test.mjs backend/test/town-coordinator-v2.test.mjs backend/test/equipment-v2.test.mjs backend/test/equipment-rules.test.mjs backend/test/shop-v2.test.mjs backend/test/bank-v2.test.mjs shared/test/asset-v2.test.mjs
```

[相关回归](st17-02-related-tests.log)：**168/168**，约0.47秒。原Town测试仅接入其已有真实identity用于新的repair授权，其他旧业务预期不放宽。最终只再重跑焦点，而未重复全套七阶段/最大CP。

```bash
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project backend/tsconfig.json
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project tools/tsconfig.models.json
```

[backend/shared类型](st17-02-backend-types.log)、[client模型类型](st17-02-model-types.log)均exit0；RepairCoordinator已进入models项目且有Cocos.meta，不声称Creator编译或全7通过。

## 实际调用与字节

R/W为唯一物理键，calls计全部get/set，不把同键重复操作漏掉。计量真实MemoryStore事务，不含fixture初始化。

| 样本 | R/W | 实际调用 | 写UTF-8 B | 其他 |
| --- | --- | --- | --- | --- |
| 破损穿戴单修 | 9/6 | 15（6 set） | 6383 | 最大文档1791B，6点逐写失败回滚 |
| 单件背包修理（13穿戴/100格） | 10/6 | 16 | 6401 | 不修非目标，不改变穿戴属性 |
| repair.get（13穿戴/100格） | 21/0 | 21 | 0 | 响应1306B，当前支持属性域 |
| repair-open成功 | 7/5 | 12（5 set） | 3671 | 5点逐写失败回滚 |

quote/repair.get均纯读，原O/J保留；引用价格配置和完整targetVersions使并发变化受OCC约束。普通新样本不代表全7件批修/正式最大装备词条域或云SDK费用。原终局R44/W33/80调用等门限未放宽。

## 交付限制

字段/API/状态/资产映射/预算/source-of-truth已同步[单件修理合同](../backend/single-repair-contract-v1.md)。只交付02，allWorn明确拒绝；03全修、04Cocos面板、05全故事联合/两轴评审未实施。没有浏览器、Creator、设备/云SDK/真实弱网/费用或正式价格发布配置验收，无Jira、安装、云资源、push/MR。独立merger合入核验由root另记，本文不自称独立通过。

## 独立核验发现及根会话修复（2026-11-02）

独立merger在e21afe0复跑96/96和两types后发现NOT READY：openRepair没有校验q.expected，C.version=5时expected=4仍成功推进版本并替换指针。其报告文件尚未写出时子任务执行额度耗尽，原结论依据保留在会话；根会话接手归档和修复，不冒称已获独立复核。

根会话新增真实旧expected反例，原生产代码实际RED exit1，日志`st17-02-expected-red.log`。最小修复为原O之后、当前位置/新ctx之前验证恰好一个当前character expected，缺失/对象错误拒绝INVALID_ARGUMENT，旧版本拒绝VERSION_CONFLICT。夹具和已有回放用例保存原open命令/版本，正常新请求从当前角色读版本。新真实两序OCC用例证明：旧repair-open先提交后新服务合法替代；新服务先提交时旧open重试被版本拦截，current始终保持新服务。原O重放及改expected同ID的OPERATION_MISMATCH同时保留。

根会话实际运行单修+共享协议+Town服务/协调器定向106/106 exit0（`st17-02-expected-focused.log`），backend/shared及client模型两项types均exit0（`st17-02-expected-backend-types.log`、`st17-02-expected-model-types.log`）。未重复168整套或全7/Creator。新open仍5写点、R7/W5/12调用，请求expected入原tuple后写字节为3777B，较初版日志变化属于真实请求数据增量。独立最终复核状态由集成会话另记；根会话测试不是独立复核。
