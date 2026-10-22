# 小游戏平台适配与验证出口基线 v1

2026-10-21。公开官方资料补证与工程选择，未安装SDK、登录云环境、创建资源或部署。当前AppID为用户提供的wxa68f1165ec1284fa；它是公开应用标识，不是身份凭证或已开通环境证明。

## 选定候选及证据

客户端选择Cocos3.8.8微信小游戏构建中的wx.cloud.init/callFunction，服务端选择微信事件云函数+wx-server-sdk，禁止正式玩家HTTP入口及客户端直接写权威集合。CloudBase[原生小游戏接入](https://docs.cloudbase.net/quick-start/frameworks/wechat-minigame-native)明确给出这两个API；微信团队[小游戏示例](https://github.com/wechat-miniprogram/minigame-demo/blob/master/CLOUD_README.md)也给出云开发环境初始化流程。由此能确认有小游戏原生接入路径，不能继续笼统写“只有小程序资料”；这不证明当前AppID环境/基础库已兼容。

身份Adapter每次调用读取可信运行上下文OPENID/APPID/ENV/SOURCE并校验部署白名单，拒绝请求体提供的身份。官方[微信云函数说明](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)解释getWXContext透传；微信团队[SDK源码](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/index.js)可见上下文缺失返回空对象。缺失即拒绝，不退化匿名正式资产。该说明部分面向小程序，小游戏真实上下文内容仍列V01验证，不把资料组合推断写成平台实测结论。

精确候选SDK选择wx-server-sdk 4.0.2（官方[更新日志](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/CHANGELOG.md)列出的非beta版本），不是直接拉master。当前master package为5.0.1-beta.1，不能用其源码推断4.0.2全部依赖相同；实现接入前锁定4.0.2的真实包与传递依赖、完整性摘要和目标runtime验证。候选服务端Node24.11，依据[运行时表](https://docs.cloudbase.net/en/cloud-function/runtime-support)；区域控制台可选性仍未验。

不额外直连已声明停止维护的@cloudbase/node-sdk作为第二套数据库访问。wx-server-sdk内部依赖升级风险由锁文件与适配测试追踪；若4.0.2不能满足事务/runtime，先形成精确升级差异与兼容报告再换版本，不自动追latest/beta。官方[迁移提示](https://docs.cloudbase.net/api-reference/server/node-sdk/initialization)与旧事务页示例版本不完全统一，是接入核验事项，不以网页标题相同当同版API。

## 适配器接口与权限

IdentityPort.verify(invocation)只产VerifiedIdentity；DatabasePort.transact(readSet,decide)只接受确定doc键和有界操作；ClockPort给服务端时间；RandomPort按私有流/来源返回固定抽样；TelemetryPort只记摘要/耗时/错误与traceId，不记令牌、完整私有CP或装备来源链。业务模块不导入云SDK，SDK异常转成统一结果未知/明确失败，不能把超时统一映射余额不足。

普通玩家事件入口仅开放已注册命令，内部调度/迁移走独立部署权限。代码级command allowlist与云平台触发器配置同时检查；没有可信来源证明的HTTP/控制台调用拒绝玩家身份，不信任任意X-WX头。测试/正式环境独立identity命名空间与配置，不以客户端environment参数选择。管理员能力不随普通game-api发布。

## 分层实施与失败替代

| 阶段 | 验证/出口 | 不通过时 |
| --- | --- | --- |
| V01 可信链 | 当前小游戏构建在开发工具/手机得到同AppID、同用户稳定subject；伪造body/跨AppID/缺上下文拒绝 | 阻断正式登录；若平台原生不适配，另审服务端code交换方案，不接受自报openid |
| V02 精确SDK | Node24.11+锁定包加载、整数编码、事务回调/冲突/未知提交行为 | 调整适配器版本后重验；不换业务规则或偷偷用HTTP |
| V03 事务 | 强化损毁、终局、接管全写集的真实操作计数/字节/回滚 | 重做映射/协议，禁止拆分资产原子性 |
| V04 成本与延迟 | 500ms片段、单段1秒的CPU/P95延迟、重试率、每10分钟及每日费用 | 若确认速度无法限制预测积压，先停相关在线能力；评审更长批次/状态编码，不能只在通关信客户端 |
| V05 恢复/运维 | 独立测试库做备份还原、来源/操作/流水一致性及旧会话拒绝 | 不开放真实玩家资产；保留隔离维护，无自动清档/猜补发 |
| V06 设备 | Note20 Ultra微信构建输入/恢复/峰值8怪/长时稳定性 | 调整表现/分配并复核，不截断逻辑效果或删收益 |

评审前是方案/约束/失败路径清晰；以上实际运行证据为对应接入或发布门禁，不能冒充已通过，也不能无限要求文档阶段先部署。

## 调用增长与恢复边界

候选每500ms一片段，10分钟约1200次提交；最坏写集1.5MiB若每次满载约1800MiB/10分钟，是保守容量压力而非正常实测。即使无资产变化，原结果与检查点也会增长；必须记录常态/峰值差异，不能只按7房结算估费用。operations控制摘要和固定引用，不复制CP；CP覆盖当前状态，历史原操作仍保留摘要/引用，不承诺能回到任意旧战斗帧。

正式运营容量、账单预算和RPO/RTO尚无用户业务输入，不编造已确认SLA。候选上线策略是：隔离测试通过、记录实际单人费用与并发档位，再提交可核对发布预算/恢复目标；未完成不开放正式资产。未来存储增长触发告警/扩容方案，首版不自动TTL权威去重。此限制属于发布出口，不妨碍对本设计执行eng-review。


## 2026-10-22批准10A：隔离验证判据

单次事务尝试数据调用目标≤80（显式commit等额外调用必须计入），应用写集≤1.5MiB；重试累计另计，不把候选79键当实测通过。常态端到端P95≤500ms/P99≤1秒为先验目标，记录冷/热、CPU、字节、重试、预测冻结比例与单人费用。最大8块/8怪/跨级邮件/pending/持有汇总及索引可见性必须覆盖；失败阻断适配，不削收益或信clientHp。不是运营SLA，具体隔离资源操作另授权。见[批准合同](../reviews/eng-review-approved-contracts-2026-10-22.md)10A。
