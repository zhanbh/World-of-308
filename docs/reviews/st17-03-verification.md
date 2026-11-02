# ST17-03 本地验证：当前穿戴一键全修

2026-11-02；基线 `def983ee550b61d3c92397b8fd7748dcb1a79c7c`，工作分支feat/st17-03-all-worn-repair。用户在02推送后“继续吧”，root已明确本轮仅推进03。已批准spec/5票只读，历史01-only措辞由最新指示覆盖，README/execution由root维护。未启动04/05，无Jira、安装、云/浏览器/设备、push/MR。

## 交付行为与兼容

复用02 RepairService/RepairCoordinator及现有equipment.repair/service.quote/repair.get。服务端固定7磨损槽选定实际穿戴0～7件，**含满耐久件**绑定完整版本，不扫描背包/金库。13槽+100格背包及金库均有损耗的真实服务夹具只修穿戴7件。单价仍是local-test候选，已知算例武器缺60、另6件各缺30、10档白每点1金币，总价240；强化、词条不另收费，不改实例身份/来源/绑定/max。

空集合与全满是合法0费集合，后者仍保留全部实例版本；执行不改任何资产版本。余额240恰足全部成功，239整批拒绝；缺价/坏末件、旧版本、价格配置改变和集合被真实穿脱替换均拒绝，不自动选新价、不部分修理。成功C/W/A各只更新一次，实际有效属性变化时statsVersion推进一次，score/equipmentVersion/scoreReachedAt和ranking投影不写。

所有目标安全递增、完整属性/套装汇总及资产文档预算先于任何asset set。晚序earring版本上溢、角色版本上溢、末件无效、价格缺失/变更均验证资产快照不变；只持久化拒绝原O/J。12实际set逐点StoreUnavailable也整笔回滚，并能用同一原命令重试。all J新增changes.items实际差额，single的changes.item保留，拒绝/全满不伪造delta。原O优先、固定TTL/身份/context/expected校验沿02，不引入第二套原操作或报价记录。

公开报价repair明细增加可选allWorn标识，空集合才可合法空items。旧single请求/响应及持久pending key保持；repair.get新增与itemId互斥的target=allWorn请求/完整items响应。严格拒绝重复/漏目标版本、混入非当前穿戴/非磨损槽、single/all字段混合、成本与耐久差额不一致，以及空报价仍含装备版本的伪装。02一处“allWorn尚未支持”的阶段性断言改为“single报价不能授权allWorn→QUOTE_CHANGED”，其余权限负测保留。

`RepairCoordinator.openAll`通过真实公开传输读取原子view和匹配版本quote，调用方显式repair；确认后刷新钱包、目标与当前有效属性。7目标总240只扣一次，实际AP从240变260，包/库损耗不变。丢响应、close/重attach后同持久原ID恢复、notFound后迟写与重试竞争均不二扣。跨角色迟回调退役；已确认后旧版本刷新失败保留lastResult，不变回未知交易。

## RED → GREEN 与实际命令

使用已批准公开协议/纯模型、真实服务+MemoryStore+授权传输边界。身份/钱包/装备/属性消费者不mock；初始13槽、破损和100格背包/金库为admitted测试准备，不称自然掉落历史。实际登录、选角、城镇移动/可信repair-open、修理/穿脱/出售与原结果走真实实现；只注入时钟、传输丢包/迟包和Store故障。

- 首RED：allWorn报价被旧single-only拒绝，真实算例预期240；`st17-03-red.log` exit1，最小实现后`st17-03-green-first.log` exit0。
- 客户端纵切RED为尚无openAll，随后完整实际传输GREEN，见`st17-03-client-red.log`/`st17-03-client-green.log`。
- 合法长UTF-8/16词条服务响应超旧64KiB，旧代码真实CONFIG_NOT_READY；`st17-03-envelope-red.log`。只提升all视图预算后GREEN，见最终焦点日志。
- 伪造空all报价却保留原7装备版本原先被接受，协议反例RED见`st17-03-quote-set-red.log`，增加集合/版本计数一致校验后GREEN。

Node24.9.0 / 已安装Creator TypeScript5.8.2，各命令实际exit0：

```bash
node --experimental-strip-types --test backend/test/all-worn-repair.test.mjs backend/test/single-repair.test.mjs shared/test/asset-v2.test.mjs
```

最终[焦点](st17-03-focused-tests.log) **112/112**，含14个新增全修场景、21个02单修场景和共享协议表驱动。覆盖完整集合/非目标、空/满/恰足/不足、后序业务拒绝不提交前缀、12写点、固定原O及同ID不二扣、真实single/full、穿脱、非目标背包出售的共享钱包OCC各两序、迟写/关闭/重绑定/低版本刷新及容量。金币、实例和评分均有实际断言，不以测试数量代替范围。

```bash
node --experimental-strip-types --test backend/test/all-worn-repair.test.mjs backend/test/single-repair.test.mjs backend/test/town-v2.test.mjs backend/test/town-coordinator-v2.test.mjs backend/test/equipment-v2.test.mjs backend/test/equipment-rules.test.mjs backend/test/shop-v2.test.mjs backend/test/bank-v2.test.mjs shared/test/asset-v2.test.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project backend/tsconfig.json
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project tools/tsconfig.models.json
```

[相关回归](st17-03-related-tests.log) **184/184**；[backend/shared类型](st17-03-backend-types.log)、[client模型类型](st17-03-model-types.log)均PASS/exit0。最后只为已有容量场景补实际七件写入断言，再跑112焦点通过，生产代码未变；不重复旧全7阶段/CP大压力。原始RED及兼容阶段失败日志保留，不作为通过证据。

## 实际预算、字节与限制

R/W为真实MemoryStore唯一键，calls为全部get/set，字节为实际JSON UTF-8；不包含夹具准备。不把单纯codec形状当自然可达历史。

| 样本 | R/W | calls | 写B／响应B | 说明 |
| --- | --- | --- | --- | --- |
| 普通13穿戴/100格all view | 19/0 | 19 | 0／5445 | 同笔全当前支持域属性，不读背包/金库 |
| 7件有损全修 | 21/12 | 33 | 14448／953 | 最大文档3002B，12实际set逐点回滚 |
| 7件128字符UTF-8 ID/16词条服务view | 有界真实读 | — | 0／75909 | 合法admitted容量夹具，旧64KiB确实不足 |
| 同域7件实际修理 | 21/12 | 33 | 97623／5881 | 最大文档12858B，O仍过16384B验证 |
| 最大标量/32属性codec-only形状 | 不执行事务 | — | —／89203 | 非自然历史、不替代正式发布器 |

仅repair.get的wire入口上限改为131072B，旧single形状仍解析后限65536B，其他query不变；全修items最多7、每件最多16词条、公开attributes最多32，异常/超界拒绝。普通和容量实际写/响应、原O字节检查未超既有文档门限，未放宽终局R44/W33/80calls/1.5MiB保护。字段/API/状态/物理映射/预算/source-of-truth同步[全修合同](../backend/all-worn-repair-contract-v1.md)。

本片不是Cocos修理面板或全故事验收：04面板/05全7阶段与双轴最终评审、SDK/真实网络/设备/费用、正式价格/最大耐久及完整发布配置仍GAP。没有运行Creator或部署。固定提交的独立合入核验由root另记，实现者不自称独立通过。
