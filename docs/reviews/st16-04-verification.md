# ST16-04 Cocos生命周期恢复验证

2026-11-01；基线 `4ba7e055b42a9c3dd299e7ce45cf9802c3e725bd`，分支 `feat/st16-04-lifecycle`。来源为已批准的 `docs/stories/warrior-loop/st16/issues/04-cocos-lifecycle-recovery.md`；冻结规格及任务正文未改。

## 实现与边界

`CombatLifecycleAdapter` 是不依赖 cc 的可注入生命周期入口，注入真实 CombatRecoveryCoordinator、Movement、LootScene、宿主认证控制序列工厂、清输入与既有登录路由。Prototype 的 Game.EVENT_HIDE/SHOW、Esc 暂停、Enter 恢复、V 重试，以及公开 pauseCombat/resumeCombat/retryCombat/reenterGame 接此入口。hide 同步清摇杆/按键/普攻持有，冻结预测及 Drop/Terminal；LootScene 额外拒绝新拾取/离开。资源、恢复证明、ready及当前Movement证明全部完成后才放行。dead仍仅合法空尾片，looting允许位移/拾取并保固定回执。

恢复提示严格为“正在恢复战斗状态”；权威到期/关闭或本地首次冻结满10秒后显示“网络中断，请重新进入游戏”。本地UI上限固定，不重试续期，不代替服务端截止结算。销毁/重attach递增代次、关闭旧恢复owner，旧命令工厂与证明回调均被隔离。终止后仅调用注入的既有登录入口，禁止使用旧恢复票据续关；带生命周期的生产attach必须提供登录路由。独立本机预览的重进入口只提示回登录，不冒充完成生产登录/旅店导航。

ChallengePreview 保留 loopback 显式选择及 isolated-local-assets-only 授权；原控制查询通过独立本机传输路由调用真实授权服务。实际连接测试暴露并修复旧预览的资源JSON字节解码及模拟时钟与客户端Date.now不一致问题；本机bootstrap携带当前控制序号/服务时钟，控制前scene.status取得当前lease revision，不伪造确认。资源仍逐项验证实际字节/hash。没有生产协议、CP字段/物理键或服务写事务变更。

## 实际验证

使用已安装 Node 24.9.0 / Creator附带 TypeScript 5.8.2，未安装依赖。

```bash
node --experimental-strip-types --test backend/test/cocos-lifecycle-recovery.test.mjs backend/test/active-combat-recovery.test.mjs backend/test/dead-looting-recovery.test.mjs backend/test/unknown-recovery-barrier.test.mjs backend/test/loot-victory-client.test.mjs
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project tools/tsconfig.models.json
node client/tools/check-model.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```

专项首次RED为生命周期模块尚不存在；首片GREEN后逐片增加真实行为。最终相关测试 **38/38**，含新增生命周期9项；日志 `st16-04-focused-tests.log`。覆盖实际MemoryStore身份/资产/CP/证明、hide/show冻结、到期登录回调、销毁后新attach与迟包、死亡尾效果、真实Boss完成后固定回执/实际拾取、ready成功丢响应、无奖励/显式奖励两类实际connectChallengePreview经fetch边界、固定本地UI截止。网络边界仅注入丢响应或直接转发真实服务，未mock身份、资产或证明。类型检查通过见 `st16-04-model-types.log`，既有客户端模型/Prototype语法转译通过见 `st16-04-client-model.log`。全7阶段由05联合执行，本文不提前声明。

## 离线构建与GAP

批准的离线命令：

```bash
node client/tools/build-inventory.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
```

子任务受限沙盒首次尝试立即exit1且日志为空，已向根会话交付同一批准命令，由根会话在允许环境执行并补真实结果。此处尚不声明Creator构建通过。`st16-04-cocos-build.log`为空是该次失败事实，不是成功证据。

模型/fetch边界测试不代表浏览器、真实HTTP中断、Cocos设备事件、触屏或手机前后台通过。云SDK/正式身份登录与旅店导航、账单、任意高熵最大CP/结果域仍按既有独立GAP保留。新生命周期层零服务写预算增量；本机控制工厂每新控制增加一次授权scene.status读取，完整恢复分页与两次当前状态复核沿01/02既有路径。SDK费用与设备性能未测。
