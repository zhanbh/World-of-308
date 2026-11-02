# ST17-03 当前穿戴一键全修合同

2026-11-02。来源为已批准ST17 spec/03票；用户在02推送后“继续吧”。复用[单件修理合同](single-repair-contract-v1.md)的可信身份/当前服务、固定本地TTL、服务端价格、原O/J、角色expected和原子读模型。只实现03，不接Cocos面板或关闭正式配置/SDK/设备GAP。

## 服务器选定完整集合

`equipment.repair.target={kind:allWorn}`和相应`service.quote`现已支持。服务端按固定7槽weapon/shoulder/chest/belt/pants/boots/earring，从当前角色穿戴引用选定实际存在的全部可磨损实例；核验实例所属、绑定、lifecycle、当前穿戴位置和slot。任何选中实例不合法整批拒绝，不跳过坏件。其余6槽不当0耐久；背包/金库不进入该集合，也不远程修理。

报价包含完整选中集合，**满耐久件也保留**，每件有itemId/current/max/missing/unitGold/gold。只实际缺失产生费用，仍要求每件合法价格配置；缺价/坏配置整批拒绝。目标为0～7件，targetVersions恰为当前character、wallet和所有选中equipment版本，最多9项；绑定角色版本同时拦截穿脱替换。报价hash同时绑定allWorn目标、集合/位置、版本、当前context和完整配置，不可把single报价改成全修授权。

空集合用显式`repair.target={kind:allWorn}`、items=[]、0金币报价表示，仍带character/wallet两版本；未标allWorn的旧single报价不能使用空明细。全满集合仍显示其全部实例和版本，总价0。两类合法0费执行不改实例/钱包/角色/账号版本，O/J仅保存固定无资产delta的原结果。

## 原子扣款与原结果

总费用是各件missing×unitGold的精确整数和；候选价格仍仅local-test注入，不因强化/词条额外加价，不更改max或实例固有字段。余额恰足可成功，差1个钱包单位则整批拒绝。旧expected、目标集合/配置/报价改变均拒绝，不能自行替换新价或修部分。

全部实例安全版本递增、属性/套装汇总、角色/钱包/账号递增和每文档预算，均在任何asset tx.set前完成。后序件的版本溢出、缺价、坏目标或角色版本溢出只能产生拒绝原O/J，不能提交前缀。成功最多写7实例及character/wallet/account/J/O共12键；角色version、钱包version及账号writeRevision各只推进一次，statsVersion仅有效属性确有变化时推进一次。equipmentVersion、score、scoreReachedAt和rankingEntry不变。

J在allWorn路径保存实际changes.items[]及钱包/角色版本前后；满耐久件不伪造delta，空/全满changes=null。single原changes.item形状保留。两模式复用同一account/operationId原O/J命名空间和完整tuple；原结果读取仍先于当前context/报价检查。notFound后只能原ID原tuple重试，已提交丢响应或迟写竞争不能二扣。

## 公开读模型与协调器兼容

旧`repair.get {characterId,contextId,itemId}`及其单item响应保持。新增严格互斥请求`{characterId,contextId,target:{kind:allWorn}}`，响应为target、完整items[]及同笔character/stats版本、wallet和当前支持域attributes。全修响应拒绝重复ID/slot、非磨损槽、非当前角色穿戴、漏版本/多版本和single/all字段混合。quote明细的allWorn标识、集合与equipment版本数也一致，不能以空明细伪装仍含7个equipment版本的报价。

`RepairCoordinator.openAll(contextId)`沿同一view→匹配版本quote→显式repair→最低版本刷新流程；旧open(contextId,itemId)、single DTO和已有持久pending key仍兼容。allWorn pending同样可close/重attach后查询原O，跨角色/组件迟包退役；确认后刷新失败保留lastResult，不误当交易未知重扣。empty仍表示未选择目标，选定的空allWorn是明确合法0费用集合。

## 字节与实际调用

7个EquipmentView合法128字符多字节ID、16词条压力夹具实测公开响应75909B，超过旧repair.get默认65536B，旧代码真实拒绝。仅repair.get的wire读取上限增至131072B；旧single形状在解析后继续限65536B，其他query预算不变。纯codec最大标量/32属性形状89203B通过；此为容量编码域，不是自然掉落历史或正式发布内容证明。

普通13穿戴/100格背包样本：all view R19/W0/19调用/5445B响应；7件实际改动R21/W12/33调用/14448B写，最大文档3002B。12个实际set逐点失败均整笔回滚。长ID/16词条真实服务写样本R21/W12/33调用/97623B写，最大文档12858B，原O仍符合16384B预算。未放宽原终局预算；SDK调用、费用、正式内容及设备留后续验证。详细日志/证据见[03验证](../reviews/st17-03-verification.md)。
