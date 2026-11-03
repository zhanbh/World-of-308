# Cocos 原型面板大整合与离线构建验证报告

日期：2026-11-03  
分支：`feat-1.0.0`  
关联交付：ST04、ST05、ST09、ST17、ST18、ST20 及 Prototype 综合试玩

---

## 1. 交付目标与整合范围

在 20 个业务故事（ST01~ST20）后端服务与核心模型全部交付的基础上，将所有已交付的 Cocos 交互面板完整挂载至运行时主入口 [Prototype.ts](file:///Users/zhanbohan/IdeaProjects/World-of-308/client/assets/scripts/Prototype.ts)，实现端到端的一站式试玩与离线构建验证：

1. **五大城镇与成长面板全挂载**：
   - **背包面板** (`InventoryPanel`, ST04/ST05)：热键 `B`，HUD 触控区 `(390~470, 225~260)`。
   - **银行面板** (`BankPanel`, ST09)：热键 `N`，HUD 触控区 `(390~470, 180~215)`。
   - **修理面板** (`RepairPanel`, ST17)：热键 `M`，HUD 触控区 `(390~470, 135~170)`。
   - **强化面板** (`EnhancementPanel`, ST18)：热键 `K`，HUD 触控区 `(390~470, 90~125)`。
   - **排行榜面板** (`RankingPanel`, ST20)：热键 `O`，HUD 触控区 `(390~470, 45~80)`。
2. **全局面板互斥与输入隔离**：
   - 任一面板打开时，自动阻断摇杆与 WASD 角色位移、普攻与技能按键输入。
   - `ESC` 键支持依次关闭当前活跃面板。
   - 打开新面板时自动收起其他面板，防止界面层叠错乱。
3. **开箱即用沙盒驱动 ([PrototypePreview.ts](file:///Users/zhanbohan/IdeaProjects/World-of-308/client/assets/scripts/net/PrototypePreview.ts))**：
   - 为单机/离线运行提供确定性数据源：
     - 修理沙盒：包含 7 件穿戴装备耐久度（含 0 耐久破损双刀）、费用试算与一键全修。
     - 强化沙盒：提供 +10 无影剑向 +11 冲击，具备降级警示、材料/金币消耗、纪念品切换与强化结果反馈。
     - 排行榜沙盒：提供全服总榜、战士榜、猎人榜三大维度，展示“狂暴战士(我)”金标置顶横幅（#3，3040分）及前三名专属色彩。

---

## 2. 类型系统与门禁验证证据

### 2.1 Cocos Client TypeScript 项目编译

优化 [client/tsconfig.json](file:///Users/zhanbohan/IdeaProjects/World-of-308/client/tsconfig.json)，配置 `target: ES2022`、`moduleResolution: Bundler` 与 `allowImportingTsExtensions: true`：
```bash
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project client/tsconfig.json
```
- **编译结果**：`PASS: selected type project only.`（Exit Code 0，0 Errors）。
- 修复了 `EnhancementPanel` 攻击力类型访问及 `RepairPanel` 耐久度空值安全校验。

### 2.2 全量 7 阶段自动化门禁

```bash
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript
```
- **Stage 1 (tooling contracts)**: ✅ PASS
- **Stage 2 (shared/backend types)**: ✅ PASS
- **Stage 3 (shared value contracts)**: ✅ PASS (230/230 tests passed)
- **Stage 4 (client pure-model types)**: ✅ PASS
- **Stage 5 (backend regression)**: ✅ PASS (908/908 tests passed, 0 failed, 0 skipped)
- **Stage 6 (client model regression)**: ✅ PASS (22/22 suites passed)
- **Stage 7 (client UI-model regression)**: ✅ PASS (9/9 passed, 100% SUCCESS)
- **门禁结论**：`SUMMARY: 7/7 checks passed.`

### 2.3 Cocos Creator 离线 H5 构建

执行命令：
```bash
node client/tools/build-inventory.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
```
- **构建输出目录**：`client/build/web-mobile-inventory`
- **构建产物验证**：`index.html`、`application.js`、`settings.json`、`cocos-js` 及 assets 资源完整生成。
- **构建结论**：`PASS: Cocos H5 inventory build produced .../client/build/web-mobile-inventory. Runtime checks are separate.`

### 2.4 Cocos Creator 离线微信小游戏构建

执行命令：
```bash
node client/tools/build-wechat.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
```
- **构建输出目录**：`client/build/wechatgame`
- **预算与包体检查**：
  - `appid`: `wxa68f1165ec1284fa`
  - `orientation`: `landscapeRight`
  - `mainBytes`: `1,778,309`（约 1.7MB $\le$ 4.0MB 微信主包硬限制）
  - `totalBytes`: `14,353,045`
  - 分包结构：`internal`、`main`、`resources`
- **构建结论**：`PASS: WeChat AppID, landscape, resource subpackage and main-package budget`

---

## 3. 操作指引

启动 Cocos Creator 或使用本地浏览器打开构建产物后，在 `Prototype` 场景中支持以下全部操作：

| 按键 / 触控热区 | 触发动作 | 界面功能说明 |
|---|---|---|
| **B 键** / 右侧 HUD `(430, 242)` | 打开 / 关闭背包 | 13 槽位装备查看、满包置换、道具整理与快捷位 |
| **N 键** / 右侧 HUD `(430, 198)` | 打开 / 关闭银行 | 个人金库与账号金库跨域存取、分档扩容 |
| **M 键** / 右侧 HUD `(430, 154)` | 打开 / 关闭修理 | 林纳克斯 7 耐久槽明细展示、单件与一键全修扣费 |
| **K 键** / 右侧 HUD `(430, 110)` | 打开 / 关闭强化 | 玛丽装备强化、高段风险降级提示、纪念品选用 |
| **O 键** / 右侧 HUD `(430, 66)` | 打开 / 关闭排行 | 装备评分排行榜、全服/战士/猎人切榜、本人金标横幅 |
| **C 键** | 切换战斗网络模式 | 本地沙盒模式 $\leftrightarrow$ 权威 MovementCoordinator 联调 |
| **ESC 键** | 返回 / 关闭面板 | 快速关闭当前打开的任意 UI 面板 |
| **WASD / 摇杆** | 角色移动 | 八方向移动、跑动翻滚；面板打开时自动锁定 |
| **空格 / E / F / Q / G** | 普攻与技能 | 三段普攻、十字斩、崩山击、拔刀斩、大崩 |
