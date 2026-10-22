# ST01-05：调用方登录流程

2026-10-22。只连接已实现的v2登录合同与传输端口，不导入Cocos、后端实现或微信SDK。来源：[ST01规格](../stories/warrior-loop/st01/spec.md)、[身份合同](../backend/identity-adapter-proposal-v1.md)。

实现为client/assets/scripts/net/LoginCoordinator.ts。组合根注入`LoginTransport.send(jsonText):Promise<string>`；测试适配把同一JSON交给真实LoginService/MemoryStore，未创建固定成功服务器桩。

## Interface

- `start({launchId,prepareOperationId,openOperationId})`：提前验证两类请求的ID。创建当前流程代次，发prepare，仅当前流程响应可进入commit。新的显式start可替换尚在prepare的流程；正在commit或unknown时拒绝新意图，避免未知提交后自动再接管。
- `retry()`：只用于unknown，使用同一原prepare或commit请求，不更换ID/票据/参数，不自动循环。原commit重试由服务端先查原O实现结果恢复，不再初始化或切代。
- `cancel()`：取消本地流程。旧prepare回调不得发送commit；commit在途或结果未知时保留原请求及unknown状态，可显式retry恢复。取消不撤销服务端已经提交的结果，不能用取消绕过未决原意图。
- `state`：返回独立快照，状态为idle/preparing/committing/unknown/authenticated/superseded/error。authenticated只接受已解析的current会话；原回执superseded，以及被替代的VERSION_CONFLICT/SESSION_REVOKED，均不给出可用session。

同一coordinator的generation用于忽略旧异步回调，不作为服务端身份或跨设备物理启动顺序证明。响应由E01 encodeLoginRequest/decodeLoginResponse实际编码、校验并关联command/operationId/launchId；损坏响应或传输异常保守视为unknown，公开状态不转发平台异常内容。

## 验证与边界

10项测试连接真实LoginService与MemoryStore，覆盖成功/状态快照隔离、commit丢响应原键恢复、未知期间新意图拒绝、prepare取消/替换与迟回调、commit取消后保留原意图、历史superseded、prepare未知恢复、非法openID提前拒绝、进行中/身份错误及损坏响应。真实微信认证、SDK、Cocos登录页面、浏览器/手机E2E尚未接入，保持platform-gap。

Node24直接加载客户端.ts时会提示MODULE_TYPELESS_PACKAGE_JSON后按ESM运行；未为消除测试警告修改Creator项目package设置。类型检查使用现有TS5.8.2、ES2022/Bundler/allowImportingTsExtensions，无安装依赖。
