# ST01-05 本地验证

2026-10-22。当前未提交工作区，不代表真实平台登录通过。实现边界见[调用方映射](../design/st01-login-coordinator-v1.md)。

按已确认的LoginCoordinator传输边界推进：首次真实服务组合测试因缺模块失败，补实现通过；unknown commit用例因缺retry失败，补原请求恢复；取消prepare用例因缺cancel失败，补generation隔离。非法openOperationId用例出现Missing expected rejection，改为在prepare前完成两类意图校验后通过。其余控制时序测试用真实应用响应加延迟/截断包装，未mock应用内部函数或返回固定成功。

最终执行：现有Node24.19.0运行`--test backend/test/login-coordinator-v2.test.mjs`，10/10通过。现有TS5.8.2对LoginCoordinator.ts及其共享依赖进行strict/noEmit/ES2022/ESNext/Bundler/allowImportingTsExtensions检查，退出0。主会话负责纳入统一入口并记录最终联合结果。

测试只使用隔离context reader与真实MemoryStore，不安装SDK、操作云资源或修改登录服务。没有真实微信上下文、网络或Cocos场景证据，不将此结果称ST01整故事Done。
