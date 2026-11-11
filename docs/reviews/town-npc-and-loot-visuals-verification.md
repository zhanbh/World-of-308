# 路径 2 收尾核验：城镇 NPC 像素表现、2x 坐标对齐与地面掉落图标化（2026-11-11）

## 变更范围与实现摘要

1. **地面掉落图标化映射与数据透传**
   - [InventoryPresentation.ts](../../client/assets/scripts/ui/InventoryPresentation.ts)：新增 `dropIconForTemplate(id, kind)`，按模板 ID / 关键字与掉落类别（`equipment` / `stack`）解析为 `client/assets/resources/icons/*_48.png` 规范资源名。
   - [LootVictoryHUDModel.ts](../../client/assets/scripts/LootVictoryHUDModel.ts)：扩展 `GroundDropHUDItem`，向下透传 `templateId`、`quality` 与 `kind`。
   - [LootVictoryPanel.ts](../../client/assets/scripts/ui/LootVictoryPanel.ts)：用对象池化的 `GroundDropSlots`（`ui/slices/slot_grid_base` + `icons/*_48` + `ui/slices/slot_border_<quality>`）替代原有几何菱形点位，配合按品质分级的宽/高光柱（`PILLAR_WIDTH` / `PILLAR_HEIGHT`）、柱内升腾像素星火与近距拾取光环（靠近时槽位缩放提升至 `1.12x`），并按资源路径缓存避免帧内重复换肤调用。

2. **城镇 NPC 动态像素形象与 2x Canvas 对齐**
   - [TownNPCHUD.ts](../../client/assets/scripts/ui/TownNPCHUD.ts)（含 `.meta`）：新增城镇 HUD 与世界层像素角色绘制器，统一覆盖全部 6 个城镇业务点（林纳克斯 `-150`、德利拉 `-80`、玛丽 `-10`、旅店信箱 `50`、行长金库 `120`、格兰之森传送门 `198`）。
   - 修复原 Canvas 文本与 `touchStart` 点击热区错按 `1x` 世界坐标排布导致偏移的问题：容器按 `worldX * 2`（`-300, -160, -20, 100, 240, 396`）与 `2x` 世界建筑严格对齐。
   - 为 6 个点位配置头顶 `24×24` 9-Patch 服务徽章（`slot_grid_base` + `icons/*_48` + 品质边框）、`y = 78` 双行名牌、邻近时（`48` 世界像素）才激活的地面拾取/交互提示胶囊 `PromptPill`（`ui/slices/button_normal`）以及各 NPC 专属待机像素动画（打铁挥锤火星、商人药水、魔导师环绕晶石、信箱猫头鹰震翅信封、金库长官礼帽与金锭、传送门旋转裂隙涡流）。
   - [Prototype.ts](../../client/assets/scripts/Prototype.ts)：替换原零散 NPC 标签字段为 `TownNPCHUD`，将城镇模式下提示语 `roundLabel` 下移至 `y = -104`（地下城恢复 `y = 75`），通过 `townNPCHUD.hitTest(p.x, p.y)` 派发点触业务，并在 `inventoryBlocked` 补充 `dungeonSelectPanel?.isOpen` 拦截。

3. **自动化测试扩充**
   - [loot-victory-cocos.test.mjs](../../backend/test/loot-victory-cocos.test.mjs)：接入真实 `InventoryPresentation`，新增对对象池 `48px` 图标槽位、品质边框映射、靠近放大、复用缓存以及拾取后槽位隐藏的断言。
   - [town-npc-cocos.test.mjs](../../backend/test/town-npc-cocos.test.mjs)：覆盖 `2x` Canvas 坐标对齐、48px 服务徽章换肤、邻近距离独占高亮、`hitTest` 点击区与显隐隔离、`drawTownAvatars` 绘制计数及 `dispose()` 销毁清理。

## 实测验证结果（最终源码状态下执行）

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| Client TypeScript | `tsc -p client/tsconfig.json --noEmit` | Exit 0 |
| Backend TypeScript | `tsc -p backend/tsconfig.json --noEmit` | Exit 0 |
| Tools Models TypeScript | `tsc -p tools/tsconfig.models.json --noEmit` | Exit 0 |
| Combat 纯模型校验 | `node client/tools/check-model.cjs`（`WORLD308_TYPESCRIPT` 指向 Creator 3.8.8 TS） | Exit 0 |
| UI 纯模型校验 | `node client/tools/check-ui-model.cjs`（`WORLD308_TYPESCRIPT` 指向 Creator 3.8.8 TS） | Exit 0（`ALL UI MODEL TESTS PASSED (100% SUCCESS)`） |
| Backend 类型脚本检查 | `node backend/tools/check-types.cjs` | Exit 0 |
| 掉落与城镇 NPC 定向测试 | `node --experimental-strip-types --test backend/test/loot-victory-client.test.mjs backend/test/loot-victory-cocos.test.mjs backend/test/town-npc-cocos.test.mjs` | `15 pass, 0 fail` |
| 全套 Cocos HUD 与展示测试（13 文件） | `node --experimental-strip-types --test ...` | `100 pass, 0 fail` |
| Shared 契约与系统测试 | `node --experimental-strip-types --test shared/test/*.test.mjs` | `232 pass, 0 fail` |
| 微信小游戏离线 CLI 构建 | `node client/tools/build-wechat.cjs "C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe"` | Exit 0（`builder:build-project-total 25851ms`，`mainBytes = 1,779,899` B / 约 `1.70 MiB` < `4 MiB`，`totalBytes = 14,556,105` B，三分包 `internal`/`main`/`resources` 通过） |

## 遗留观察项与非阻塞限制

- 主机 Node 版本为 `v22.17.0`（`tools/check-all.cjs` 门禁要求 Node `24.x`），因此改用分阶段逐项校验并经 Creator 3.8.8 全量构建验证。
- 画面动画观感与触控流畅度已完成程序与无头 AST/Canvas 几何验证；真机/微信开发者工具实机目视巡检仍需在本地开启开发者工具扫码确认。
