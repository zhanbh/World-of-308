# ST01 Standards 独立复核

2026-10-22。依据 soflow:code-review 的 Standards 轴；只评当前未提交工作区，基线 HEAD `ab195410928f3f887f928d87e56d5d4ad61f71e5`，分支 `feat/e01-repeatable-checks`。工作区仍有并行修订，以下 SHA 标识实际读取版本，不代表 HEAD 或最终验收版本。

## 结论

硬性标准违规：0。需要整改的 smell 判断：0。此结论只覆盖下述范围；产品合同符合性由独立 Spec 轴处理。未将进行中的 Spec 修复混入本轴，也不作无益抽象建议。

身份端口逐调用读取可信上下文，拒绝请求体身份及访问器；WeakSet 封印不能由公开 JSON 伪造。公开响应经协议解析，未返回原始 subject/平台上下文。Store 读取、写入和客户端状态均有 clone 隔离。客户端异步取消使用代次屏蔽旧回调，未知提交保留原意图，测试实际经过 LoginService 与 MemoryStore。

## 阅读与验证范围

- 标准：根 AGENTS.md、真相源索引、ST01 spec；检索未发现 CONTRIBUTING 或 CODING_STANDARDS。应用技能的十二项 smell 基线，仅作启发式；不重复工具可检查的风格。
- 逐读 identity-v2、login-model、login-service、login-handoff、LoginCoordinator、身份与调用方测试；抽查登录/交接测试的真实事务、故障注入和并发入口，并读 MemoryStore。核对 check-all 自动纳入 backend/test/*.test.mjs 及 models tsconfig 纳入协调器。E01 仅核对本轮零基房间校验引用，不重做历史评审。
- 独立命令：已装 Node 24，`--test --test-isolation=none backend/test/login-identity-v2.test.mjs backend/test/login-coordinator-v2.test.mjs`，13/13 通过。普通隔离模式因环境 spawn EPERM 未执行，不计业务失败。未安装、联网或操作云资源。
- 不覆盖真实微信认证、SDK事务、Cocos场景集成及手机验收；这些缺口不能由本地通过替代。

## 阅读快照 SHA-256

- `backend/src/identity/identity-v2.ts` — `f6bd49d536a20151732f24c073b4af7a065b5415aaf7f60fae1c718f67bbd7ac`
- `backend/src/identity/login-service.ts` — `a430cff85f1030019c4ffedbd432d9419cddabab6a649c73b6ef91833f324204`
- `backend/src/identity/login-handoff.ts` — `9bfc980a975d21b18ff5c9b4a50f83eb3423f6c3c111dbab6e6ac9d2ddc32022`
- `backend/src/identity/login-model.ts` — `3af10d904fb93b8921f54a34193da5023bc50840c4fb3a33ccd2be7f5774dac4`
- `client/assets/scripts/net/LoginCoordinator.ts` — `046137ec35eec179220787f0c6469ceafbf43f211a98c9e9a684488499c96dfa`
- `backend/test/login-v2.test.mjs` — `effc616c8bd3ed81a01dcca29d5c48a8aac71a6deb8f7ea07bb68a62d0e68c4c`
- `backend/test/login-handoff-v2.test.mjs` — `da185c4ed7631d24577c2fe2cd17a4147c6c281429b6596a6964f8f79bb0ffdf`
- `backend/test/login-coordinator-v2.test.mjs` — `aecc9047b7e7f8c3871ac395e263b1019acc14f32fe94c71ce3acd8e9f990038`
- `backend/test/login-identity-v2.test.mjs` — `9db7fe377c7b7a3835345c5e6733a474a199b95a12c17d12cd61a20809f7a17b`
- `tools/check-all.cjs` — `6c1667209360e2e47a7c0830270d5e1d8ab14782b9482fea7bbe3f22a91b8992`
- `tools/tsconfig.models.json` — `8f81d711e6c614399b212cd4d13bb7535c4c15e5c3938da01739ab69b1809d03`
