# 微信小游戏（wechatgame）全量 UI 切片版离线构建与包体核验报告

2026-11-11。分支 `feat-1.0.0`，基线提交 `6cef789`。在完成城镇全部 8 大功能面板（背包、金库、修理、强化、排行、商店、信箱、地下城入口）及战斗 HUD（玩家状态栏、补给 4 槽位、死亡复活弹窗、通关战利品翻牌）9-Patch 规范化切片改造后，执行微信小游戏平台全量离线命令行构建、资产分包后处理及体积红线校验。

---

## 一、微信小游戏离线构建与包体检查实测

1. **构建执行命令**：
   - 先行清除代理环境注入的 `ELECTRON_RUN_AS_NODE` 环境变量，以原生 Creator 3.8.8 CLI 执行无窗口离线构建与校验管道：
   ```powershell
   Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
   node client/tools/build-wechat.cjs "C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe"
   ```
   - 构建总耗时：**84,245 ms**（约 1 分 24 秒），退出码 0（Creator CLI 内部退出码 36，经脚本规范处理并自动执行 `finalize-wechat-build.cjs` 与 `check-wechat-build.cjs`）。

2. **产物规格与包体预算校验结果**：
   - **构建输出目录**：`client/build/wechatgame`（供微信开发者工具直接导入预览）
   - **AppID**：`wxa68f1165ec1284fa`
   - **屏幕方向**：`landscapeRight`（横屏合规）
   - **主包大小（`mainBytes`）**：`1,779,899` 字节（约 **1.70 MiB**，仅占微信小游戏 **4.00 MiB / 4,194,304 B** 主包红线的 **42.4%**）
   - **构建总体积（`totalBytes`）**：`14,547,149` 字节（约 **13.87 MiB**）
   - **分包结构验证**：
     | 分包名称 | 路径 | 占用字节 | 文件数量 |
     | :--- | :--- | :---: | :---: |
     | `internal` | `subpackages/internal/` | `165,696` | 16 |
     | `main` | `subpackages/main/` | `529,358` | 5 |
     | `resources` | `subpackages/resources/` | `12,072,196` | 155 |

3. **切片资产、图标与脚本编译完整性核实**：
   - **`resources` 资产分包清单**（`subpackages/resources/config.json`）：确认包含 `ui/slices/` 路径记录 **32 条**（16 张 9-Patch PNG 原图与 16 份 SpriteFrame 元数据），包含 `icons/` 路径记录 **98 条**；
   - **脚本合包核验**（`subpackages/main/game.js`）：确认包含场景入口 [`Prototype`](file:///D:/IdeaProjects/World-of-308/client/assets/scripts/Prototype.ts) 及全部 12 份 UI 视图组件（`InventoryPanel`、`BankPanel`、`RepairPanel`、`EnhancementPanel`、`RankingPanel`、`ShopPanel`、`MailPanel`、`DungeonSelectPanel`、`CombatSupplyHUD`、`DeathRevivePanel`、`PlayerStatusHUD`、`LootVictoryPanel`）；
   - **兼容性补丁验证**：确认 `client/build/wechatgame/game.js` 已成功注入微信运行时 `structuredClone` 深拷贝 polyfill。

---

## 二、同步执行的回归与类型门禁记录

1. **三层 TypeScript 类型编译**：
   - `client/tsconfig.json`：**0 错误**；
   - `backend/tsconfig.json`：**0 错误**；
   - `tools/tsconfig.models.json`：**0 错误**。
2. **模型与契约测试**：
   - `shared/test/*.test.mjs`：**232/232 通过**；
   - `client/tools/check-model.cjs`：**21/21 阶段全部 PASS**；
   - `client/tools/check-ui-model.cjs`：**9/9 项全部 PASS（100% SUCCESS）**。
3. **Cocos UI 面板与交互套件回归**（共 11 个测试文件）：
   - 包含 `combat-hud-cocos.test.mjs`、`dungeon-select-cocos.test.mjs`、`mail-cocos.test.mjs`、`shop-cocos.test.mjs`、`repair-cocos.test.mjs`、`enhancement-cocos.test.mjs`、`ranking-cocos.test.mjs`、`loot-victory-cocos.test.mjs`、`inventory-presentation.test.mjs`、`bank-presentation.test.mjs`、`bank-panel-gesture.test.mjs`；
   - 合计 **89/89 用例全部通过**（耗时约 2.28 秒）。

---

## 三、工具链说明与待完事项（GAP）

- **工具链版本声明**：当前主机运行环境为 Node.js `v22.17.0`；`tools/check-all.cjs` 与 `tools/test/check-all.test.cjs` 内置校验要求 Node `24.x`（`TOOLCHAIN_VERSION`），因此本次未执行全套脚本合并命令，而是直接按子阶段运行各 `tsc`、纯模型校验、`shared` 与全部 Cocos UI 测试；未改写仓库工具链门禁规则。
- **平台与真机 GAP**：本次验证已证明全套 9-Patch 切片版工程在 Cocos Creator `wechatgame` 下可完整编译、分包并满足主包体积约束；**微信开发者工具扫码预览、真机运行时 FPS/触控实测、以及 E02 真实微信登录/云开发事务接入**仍需后续独立真机环境实测确认。
