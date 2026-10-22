# E01-03 登录公开协议实施映射

2026-10-22。仅共享DTO、结构校验和调用方wire边界。依据[身份合同](../backend/identity-adapter-proposal-v1.md)、[API](../backend/api-contract-v2.md)、[数据字典](../backend/data-dictionary-v2.md)。本记录细化传输形状，不新增身份认证或资产行为。

## 请求与结果

- 登录前：`{protocolVersion:2,command,payload}`。prepare payload为launchId/prepareOperationId；commit payload为ticketId/launchId/openOperationId。不接收旧session信封或任何body身份字段。
- 登录后创角/选角：`{protocolVersion:2,command,operationId,sessionId,sessionEpoch,expected,payload}`。expected使用kind/id/version列表，同一kind/id不得重复。当前实现expected上限32，普通ID上限128 UTF-16单位，非空、无空白/控制字符/代理项；operationId（含prepare/open意图）依内容包络限制为1～64可见ASCII字符。这些上限不代替真实SDK字节限制。
- 版本、代次是安全整数；version和票据baseSessionEpoch可为0，已建立的sessionEpoch/rolePlayEpoch从1起。sessionEpoch不代替角色游玩代次。目标归属及具体命令必需expected集合由后续应用服务校验。
- 响应公共头：protocolVersion/command/operationId/serverTime/replayed/outcome。登录prepare并非普通资产写；其committed只返回票据视图，不虚构resultVersions或创建账号。commit的committed还包含resultVersions。
- 票据视图：ticketId/launchId/baseSessionEpoch/issuedAt/expiresAt；截止必须晚于签发，但解析旧回执时不因当前时间过期丢弃历史事实，也不在codec固定60秒参数。
- commit会话视图：sessionId/sessionEpoch/sessionState（current或superseded）/characters/selectedCharacter。角色摘要为characterId/classId/characterName/level，最多两角色且每职业唯一；选中角色为空或characterId/rolePlayEpoch。旧挑战交接的完整状态后续通过授权查询获取，此最小视图不伪造结算详情。
- unknown只接受RESULT_UNKNOWN；rejected只接受身份/API合同已有的登录适用错误码，当前不开放details。内部平台异常不可直接作为公开code或details透传。
- 创角/选角普通回执使用parseCharacterResponse：创建返回角色标识/职业/名称/初始化来源引用，选择返回角色标识/rolePlayEpoch/旅店锚点；committed均带resultVersions，可通过授权operation.get查询。它们不复用两步登录的独立openReceipt。

## 命名与安全边界

名称严格保留原文：纯ASCII字母1～12个或统一汉字1～6个Unicode码点，不混用、不含数字/空格/标点/部首/重复符号。大小写、查重键规范化、改名/删角后的释放尚未确定，解析器不擅自小写或预占名称。原子占名、乐观并发、初始化来源由ST02实现。

所有对象校验拒绝额外字段及访问器属性，结果构造新对象。公开DTO不定义VerifiedIdentity，不承载subject/session_key/AppSecret。ID不是凭证；字符串格式检查不能证明归属或权限，票据状态/epoch比较交换和可信身份仍由ST01验证。

`login-wire.ts`是可供实际调用方导入的编码/响应消费接口。它校验响应command、operationId与原意图一致，prepare成功还校验launchId；不发网络请求、不返回固定成功、不认证服务端响应。current也只是服务端结果字段，不能依此绕过受信传输或把历史结果当当前写权限。

## 后续责任

ST01：可信微信适配、票据到期/绑定/CAS、防重、原子接管及旧挑战交接。ST02：原子占名/职业开放配置/初始化/选角状态。E02：SDK及真实微信构建验证。猎人作为合法职业标识保留，不代表其技能已开放。旧v1保持在独立types.ts，本模块不将v2请求路由给旧GameService。
