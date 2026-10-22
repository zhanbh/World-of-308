# ST01 本地登录实现与边界

2026-10-22，实施中；用户已整体确认6票与公开登录入口/真实MemoryStore事务/调用方传输三个测试边界。来源为[ST01规格](../stories/warrior-loop/st01/spec.md)和[身份合同](../backend/identity-adapter-proposal-v1.md)。不扩展SDK、云资源或部署权限。

## 私有身份与键

backend/src/identity/identity-v2.ts只供后端使用。组合根注入读取可信平台上下文的无请求参数reader，端口每调用重新读取OPENID/APPID/ENV/SOURCE并校验服务端策略。对象是数据属性，访问器拒绝；VerifiedIdentity由模块WeakSet标记，公开JSON或结构相同对象不能通过应用检查。隔离测试reader不是微信SDK证据，测试source字符串也不是已证明的生产来源白名单。

identity映射按provider/appId/subject/environment命名空间隔离。loginKey采用带类型的JSON元组SHA-256 base64url（43字符）及v2类型前缀，记录保留原元组/归属用于完整性核对，不把哈希当权限。私有subject仅进入后端identityLink元组，公开DTO/调用方无subject或凭证。

session候选键按identity+launch确定，一次launch至多建立一份session；已有撤销session阻止旧launch以新prepare意图抢回。prepare多读取一次该候选S以识别已观察的旧launch，因此实际唯一键预算比历史prepare小计多1读：未建号R3/W1、已有账号R4/W1，SDK调用仍待E02实测。已有account的currentSessionId/epoch仍为最终写栅栏。

## prepare与commit

应用为独立LoginService，不将v2请求转给旧GameService。prepare先验证E01 DTO及可信身份，然后在真实Store事务内读取L、可选A、T和候选S；只创建T，保留原base/issuedAt/expiresAt。同票据重试不延期，TTL来自受控配置（测试60秒），不改变战斗10秒恢复规则。

commit先查当前授权身份的原O，再检查T。未提交新意图检查now严格小于票据截止、身份/launch/baseAccount/baseEpoch及一次票据消耗；同open键异参返回OPERATION_MISMATCH，未知结果同原键恢复。已提交原结果不因后来票据过期而丢失；若当前账号S/epoch不同，历史原结果只标superseded，不递增代次。

首次commit原子写L/A/W/V/S/O/J/T八个核心键，并按已批准3A同笔创建账号scope零持有汇总K，总R9/W9（必要配置P另计）。钱包0/0、账号库100格/空slotMap、账号职业与角色为空、解锁和持有domain引用来自服务端配置。不创建角色或礼包，不重置已存在账号钱包/金库；新候选键异常已存在时拒绝调查。九个写点故障及提交丢响应沿真实MemoryStore验证。ST01源spec列核心八键，持有投影增量由其链接的权威合同约束；未改只读spec或删减原八键。

已有账号路径读取/撤销旧S并切账号S/epoch及writeRevision，与T/O同笔。角色/旧挑战交接由任务04提供同笔决定，已去掉初期CONFIG_NOT_READY gate并真实接入handoff；角色摘要、新rolePlayEpoch和resultVersions由该真实事务结果返回。

## 进度与后续

01～06 已全部完成本地实现与联合验证，证据见 [ST01-06 联合验收报告](../reviews/st01-06-local-verification-2026-10-22.md)。`tools/check-all.cjs` 统一检查通过（7/7 组全绿，113 项后端测试无回归，纯模型/UI 检查通过）。独立 Standards 评审（0 违规、0 smell）与 Spec 评审（SR01/SR02 修复并复核闭合）完成。旧 v1 入口 / 49 项仍保留历史语义。真实微信认证、SDK 事务、Cocos 登录页面集成仍保持 platform-gap，后续交接至 ST02 与 E02a。

