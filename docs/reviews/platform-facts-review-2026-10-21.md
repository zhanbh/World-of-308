# 平台事实补充核对

日期：2026-10-21。仅公开官方资料查询，无登录环境、创建资源、安装SDK或部署。

| 官方来源 | 本次能确认 | 不能据此宣称 |
| --- | --- | --- |
| [CloudBase事务](https://docs.cloudbase.net/en/database/transaction) | 文档列出服务端node-sdk事务、100操作/30秒、doc而非where及DDL影响 | 目标SDK的调用计数、字节、重试/未知提交与本模型预算通过 |
| [运行时列表](https://docs.cloudbase.net/en/cloud-function/runtime-support) | 当前官方列表包含Node 24.11，并列为推荐版本 | 目标区域/环境已可选、精确依赖已兼容或部署已完成 |
| [资源调用](https://docs.cloudbase.net/en/cloud-function/resource-integration/cloudbase) | 事件云函数与HTTP函数的服务端鉴权配置有区别 | 可把HTTP自报账号或服务端SDK权限当玩家身份 |
| [实例复用](https://docs.cloudbase.net/cloud-function/instance) | 请求相关身份不可存跨请求全局状态，混合入口上下文有风险 | 微信小游戏特定链路或HTTP旁路已验证 |

此前中文事务页获取超时，本次从英文官方页补到资料，不能继续说所有事务资料都未核对。微信小游戏wx.login/code2Session的目标官方页面仍未取得可用完整核验材料；不使用第三方搜索结果填为已确认。

建议以Node24目标作为版本方案候选，与仓库Node≥24要求对齐；发布前仍须核对区域、平台类型、SDK精确版本和锁文件。没有因文档列出支持就安装或操作环境。

E07资料核对有进展，V01–V08实测状态不变。该记录为工程综合评审的补充证据，不是独立正式eng-review通过。
