---
artifact_kind: specification
artifact_id: spec:warrior-loop-st01
spec_hash: 5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c
tracker: local-markdown
plan_status: approved
stories:
  - slug: st01-login-session
    title: 登录会话与原结果恢复
    covers: [US1, US13, AC12]
---
# ST01：登录、接管与原登录结果恢复实施规格

2026-10-22。承接E01本地交付与用户继续推进意图；本文件为新故事实施任务图待确认稿，不授权SDK安装、云资源或部署。来源为[故事卡](../st01.md)、[身份权威合同](../../../backend/identity-adapter-proposal-v1.md)及[真相源索引](../../../backend/source-of-truth.md)。不新增登录玩法，不改跨设备物理启动顺序规则。

## 玩家可验证结果

prepare只签发绑定身份与launch的票据，不创建账号或结束旧场景；commit比较基础epoch、原子初始化或接管。同意图响应丢失可找回原结果，旧回执不能恢复旧会话写权。新launch落当前角色隔离旅店，短恢复不走新登录。不接受请求体身份，不开放匿名/HTTP正式资产。

## 本轮范围

- 本地真实MemoryStore事务实现v2登录能力，保留原v1测试和处理器的隔离标识，不把新协议转发给旧open实现。
- 私有身份端口来自平台Adapter；本轮仅隔离测试身份Adapter与明确部署策略的端口，不将其当微信认证。不可从公开JSON构造VerifiedIdentity。
- 首次账号初始化：identityLink/account/wallet/accountVault/session/openReceipt/loginAttempt/journal同笔，确定候选键在重试间稳定；不提前创建角色或新手角色资产。
- 已有账号接管：票据/baseSessionEpoch校验、旧session撤销、账号栅栏及原结果同笔；当前角色、挑战/H、CP头/在用块与必要体力结算按权威合同加入。completed保留成功，active关闭失败，不重放未确认击杀，不增加磨损或奖励。
- 客户端平台无关LoginCoordinator消费E01真实wire，区分准备/提交/未知/被替代/失败，忽略旧launch异步回调。不安装微信SDK，不假装浏览器已可信登录。
- local demonstration展示有界确定请求/结果和内存事务；SDK/真实手机/线上入口保持platform-gap。

## 公开测试边界

1. Login应用入口（可信端口身份+v2请求→公开响应）：验证prepare/commit原结果、失效及异参；不证明微信上下文真实。
2. 真实MemoryStore事务入口：并发登录、每写点回滚、未知提交与原结果恢复，已确认资产守恒；不证明云SDK事务/索引。
3. LoginCoordinator+传输端口：迟回调/同意图重试/unknown与superseded，不mock应用内部函数；不证明Cocos UI或真机。

测试采用已装Node24/TS5.8.2与E01工具入口，逐项red→green。禁止安装依赖或用固定成功handler代替业务。需要真实平台的断言单列，不因内存通过改标整个ST01 Done。

## 完成与准入

01～06覆盖身份端口、票据、提交、防重/接管、调用方、联合验证。任务粒度及硬依赖需人工确认后进入实现；计划批准与独立产物验收分别记。所有实体字段、API形状和预算以权威合同为准，发现冲突同步相关视图而非只在代码打补丁。

不做创角、战斗模拟、完整成长表、云部署、生产认证、其它业务故事或Jira。E02a可同时准备只读探针计划，但安装/资源另授权。
