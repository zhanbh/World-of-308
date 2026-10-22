# 共享精确值基础

`src/exact-values.ts` 按精确算术合同 v1 提供品牌类型 Time、LogicTick、ResourceV1。时间和 tick 是非负安全整数；两者不可混用。ResourceV1 为内部 BigInt，范围 0～18446744073709551615，公开编码一律使用规范十进制字符串；其计量精度为每显示单位 1000 内部单位。

`remainder` 将合法回复余量约分，分母最大 4294967295，分子小于分母，零统一为 0/1；`decodeRemainder` 拒绝未约分或多字段的输入。这只是余量值，不推进回复时间。

`src/public-codec.ts` 为显式、扁平字段清单提供 encode/decode。输出字段按字典序固定；数组保留业务顺序，表示集合时调用方必须按所属合同的稳定键排序。encode 只投影声明字段，decode 拒绝未知字段。资源解码仍返回十进制字符串；算术入口显式调用 resource 转换，避免 JSON 中出现 BigInt。

默认边界：64 字段、字段名 64 字符、单字符串 1024 UTF-16 单位、单数组 256 项、整个 JSON 文本 65536 UTF-16 单位。拒绝孤立代理项。它们是基础安全上限，后续 DTO 仍需更严格的业务限制；此文本上限不等于 SDK 的 UTF-8 字节预算。

稳定编码结果可作为摘要输入，但本模块不计算摘要、不代替身份鉴权。私有字段只有在 schema 未声明时才被排除；后续协议必须评审公开字段清单，不能把整个权威状态交给自动序列化。尚不支持嵌套 DTO 或自动集合排序。

从仓库根运行统一检查，命令见 [工具说明](../tools/README.md)。共享测试使用 Node 24 自带测试运行器，无新增依赖。

## 登录协议

`src/protocol/session-v2.ts`提供两步登录、创角/选角会话信封及公开票据/历史结果校验；`login-wire.ts`提供调用方编码和响应消费。字段映射及后续业务责任见[实施映射](../docs/design/e01-session-contract-implementation-v1.md)。旧`protocol/types.ts`继续标识历史v1，不将v2路由到旧业务服务。

## 场景、资产和配置

- 场景：`protocol/simulation-v2.ts`验证有序输入wire，`scene-v2.ts`提供加载/恢复/状态/分页/挑战合同，`scene-wire.ts`提供调用方编码和响应关联。详见[场景映射](../docs/design/e01-simulation-contract-implementation-v1.md)。
- 资产：`protocol/asset-v2.ts`提供业务意图、查询、原回执和公开视图；`encodeAssetRequest/decodeAssetResponse`为调用方边界。详见[资产映射](../docs/design/e01-asset-contract-implementation-v1.md)。
- 配置：`config/release-v1.ts`提供同步结构/引用校验与异步`verifyTestRelease`真实摘要核验；`publicRelease`裁掉私有节点。fixture只支持显式授权的本地测试profile。详见[配置映射](../docs/design/e01-release-fixture-implementation-v1.md)。

组合测试消费真实parser和fixture，没有业务成功服务桩。全套本地结果与后续业务/SDK责任见[E01交付](../docs/reviews/e01-07-integration-verification-2026-10-22.md)。
