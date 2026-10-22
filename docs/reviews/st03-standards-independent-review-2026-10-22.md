# ST03 Standards 独立复核

2026-10-22。依据 soflow:code-review 的 Standards 轴；只评当前未提交工作区，基线 HEAD `9955c1d`，分支 `feat/e01-repeatable-checks`。

## 结论

硬性标准违规：0。需要整改的 smell 判断：0。此结论只覆盖下述范围；产品合同符合性由独立 Spec 轴处理。

- **确定键与存储隔离**：`ServiceContext` 采用安全 SHA-256 base64url 有界键算法，规避物理 ID 溢出与多租户数据泄露。
- **状态防御与输入权威**：服务端拒绝客户端自报坐标，严格基于输入片段累计位移与边界扫掠校验；位移超出速度上限或地图边界强制回弹。
- **上下文生命周期闭环**：`ServiceContext` 绑定代次与地点版本，角色移动超出 24 像素物理距离、关闭面板或切代次时上下文立即作废，杜绝远程消费。
- **私有读模型字段裁剪**：银行与邮箱读模型严格挂接对应服务上下文，HUD 仅暴露未读数等精简元数据，杜绝远程预取全量资产。
- **客户端协调器防御**：`TownCoordinator` 移动前主动触发本地面板关闭，并运用 generation 代次隔离阻断异步迟到回调。

## 阅读与验证范围

- 检查 `backend/src/character/character-service.ts`、`backend/src/character/character-model.ts`。
- 检查 `backend/src/town/town-model.ts`、`backend/src/town/town-service.ts`。
- 检查 `client/assets/scripts/net/CharacterCoordinator.ts`、`client/assets/scripts/net/TownCoordinator.ts`。
- 检查 `backend/test/character-v2.test.mjs`、`backend/test/character-coordinator-v2.test.mjs`、`backend/test/town-v2.test.mjs`、`backend/test/town-coordinator-v2.test.mjs`。
- 独立命令：运行 140 项全量回归测试，100% 通过。
- 不覆盖 Cocos 城镇地图场景渲染与虚拟摇杆操控；这些缺口保持 platform-gap。

## 阅读快照 SHA-256

- `backend/src/character/character-model.ts` — `d87d14a824de0a09d8402f477c6e4ec033076c92487082ae26fbfa80889299cf`
- `backend/src/character/character-service.ts` — `5d543875cbab2da7d80332f02d54a871c38aa5edfb3c4c4fe02dab5f66e2199b`
- `backend/src/town/town-model.ts` — `24a23f545fe3e38a0c712ae5c139ea2b12f44e1ea2a6682d4f0144250bc6f544`
- `backend/src/town/town-service.ts` — `37e651a7eb6e12b693065e1ec4a47280c3cbc25ebb13913f039acb5ab00489da`
- `client/assets/scripts/net/CharacterCoordinator.ts` — `f1efa99bc1e24285d609af9812b823690b87550a58ae8efb01f1ea7ccde4dceb`
- `client/assets/scripts/net/TownCoordinator.ts` — `953d5be887b85f34748274f0c7aa16b11d60297873653028b807cc9cc497f788`
- `backend/test/character-v2.test.mjs` — `9a2a55d3523dcf60cffbb7059567ce7281f721a855900ccb1aec52451aed284f`
- `backend/test/character-coordinator-v2.test.mjs` — `55de9c1e69442927ec917b066456b7a6ce364c10310470416d133c0daa736c74`
- `backend/test/town-v2.test.mjs` — `084ffc5a2248432a469c6910d80c5e94a1908bd3e427ee292738aece9a9e17be`
- `backend/test/town-coordinator-v2.test.mjs` — `4be1f7b16dacbe1b151c66244b9e06a176cd6dfb90fa5e437aaa8d05a34a900c`
- `tools/tsconfig.models.json` — `77095980ebafdca1edf0cfee4b1f337d4bfdd748cd6c7e01ef4d76678bf6b6e4`
