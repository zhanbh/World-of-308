# 动作样板：三段双刀普攻、近战对抗与战士四技能

Creator 3.8.8 + TypeScript。当前原型包含三段普攻（基础1000ms，可调攻速）、四技能连续帧及2/3/1/4段命中、移动/急停/受击、流血DOT、顿帧/火花/跳字/落地震动，以及准备→战斗→胜败→手动再挑战。流血与战斗闭环已由用户验收；最新集成构建记录见[H5统一验收](../docs/reviews/h5-integration-review-v1.md)，微信真机性能尚待验收。

## 打开与预览

在 Cocos Dashboard 导入本目录 `client`，使用 Creator 3.8.8 打开。资源导入完成后，双击 `assets/scenes/Prototype.scene`，使用编辑器顶部浏览器预览按钮运行。首次导入可能生成 `.meta`，应随对应资源保留。

- 桌面：WASD / 方向键移动，空格点按或按住普攻，E 十字斩、F 崩山击、Q 拔刀斩、G 崩山裂地斩；1/3 切换单怪或三怪，R 重置遭遇。
- 触控：左下固定摇杆，右下普攻键，其上排列四个技能键。X 按力度变速，Y 越过死区后定速。
- 普攻：三段分别280/300/420ms，默认命中约112/136/163ms；末120ms缓存一次点按，动作结束后300ms接续。按住A→B→C→A循环，松手在本段结束后停招；受击和成功施放技能重置普攻。
- 图集：普攻使用 `assets/resources/warrior-basic-attack-v2.png`，技能使用 `warrior-{cross,bengshan,earth}-v1.png` 与 `warrior-badao-v2.png`，独立非等时帧组。拔刀斩全程单刀、140–340ms收腰蓄力200ms，结束或受击打断回公共双刀守势；其余技能首尾复用公共守势。走跑/急停/受击使用身体动作v1。旧图集保留作历史草稿。
- 技能：十字斩290ms近身、340ms发射穿透十字，共2段；崩山击240/480/680ms共3段，终段击倒；拔刀斩440ms共1段；大崩880/1280/1500/1720ms共4段，1320ms身体结束、2400ms残留结束。大崩沿面向前跳，已发生的地面效果固定在实际落点，目标等整段效果结束后起身。每目标每段最多命中一次；受击可打断未发生的动作，已发射的十字与已生成的地面效果按规则继续。数值仍为本地调试值。
- 对抗：怪物靠近后以红色区域预警并锁定攻击位置；走出区域可躲避。普攻命中会让怪物闪白、僵直和击退；受击会扣血、打断连段并造成击退，短时间内有受击保护。
- 技能命中反馈：十字/拔刀短僵直和小幅后退，小崩击倒，大崩击倒到2400ms整段特效结束后才起身。四招共享5秒流血红色心跳脉冲，重复命中刷新，不叠加；临时每秒扣0.2点，正式数值待定。DOT只跳字，不附带僵直、击退或顿帧。见[反馈规格](../docs/art/motion-studies/warrior/skill-hit-feedback.md)。独立技能预览已加30血耐打靶，最新H5已重建，具体基线见统一验收记录。
- 战斗闭环：点击场地上方“开始战斗”（键盘Enter）；清场或死亡后保留结果，点击结果再挑战，不再自动重开。R回到准备状态，单怪/三怪切换也会回到准备状态。再挑战清空触控、技能、流血与旧反馈；攻速调试档保留。
- 当前调试生命值：玩家 100 点，每次受击 22 点；怪物 3 点，每次有效普攻命中 1 点。死亡或清场后结果保留；点击结果或Enter再挑战，R回到准备状态。

世界按 480×270 构图、2 倍逻辑缩放。根据首轮试玩反馈，v0.2 人物显示比例增加约 20%（人物节点额外 1.2 倍，待机本体约等效 44 个源像素），地面坐标和移动速度不变。UI 使用独立节点，当前固定构图留边；微信安全区与完整宽屏适配需后续真机验证。

v0.2 用程序化关键姿态替换简单摆刀：身体重心、肩部扭转、前后手臂和双刀配合，按实际刀刃位置绘制短暂刀光轨迹。动作间从当前姿态过渡，空闲时平滑回到待机。仍为程序化占位动作，不是生产像素资源，也未复用 Codex 宠物内部代码或 skill。空挥改善不代表受击与命中手感已通过。

动画独立评审页：`node client/tools/animation-preview.cjs <Creator安装目录>`，macOS传`/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents`；http://127.0.0.1:8767 为普攻，http://127.0.0.1:8767/skills 为四技能，支持正常/慢放、步进、镜像和打断检查。共享游戏的帧时序、技能和残留模型。无需先重新构建。

## 无安装的逻辑检查

在仓库根目录执行（引擎路径按实际安装位置替换）：

```powershell
node client/tools/check-model.cjs 'C:\ProgramData\cocos\editors\Creator\3.8.8'
```

检查依赖编辑器随附 TypeScript，不需要 npm install。它验证连段和移动逻辑，不代替 Cocos 运行或 Note20 Ultra 真机验收。

`tools/prepare-scene.cjs` 是从官方 2D 场景模板初始化入口的一次性工具，已执行，请勿对现有场景重复运行。

## 尚未验证

最新集成构建：`client/build/web-mobile-acceptance`，在仓库根目录执行 `node client/tools/serve.cjs web-mobile-acceptance 127.0.0.1 8770`。手机同一Wi-Fi时将监听地址改为电脑当前局域网IPv4；地址可能随网络改变。已有回归和最新构建证据见[统一验收记录](../docs/reviews/h5-integration-review-v1.md)。桌面与触控模拟不替代Note20 Ultra微信真机10分钟性能验收。

已有 Web Mobile 构建产物时，可在仓库根目录运行 `node client/tools/serve.cjs`，默认读取历史目录 `client/build/web-mobile-001`；本轮请显式传 `web-mobile-acceptance` 并在 `http://127.0.0.1:8765` 提供桌面本机预览。参数依次为构建目录名、监听地址和端口；手机与电脑在同一局域网时，把监听地址设为电脑当前 WLAN IPv4（例如 `node client/tools/serve.cjs web-mobile-001 10.200.4.231 8766`），再在手机打开该 IP 和端口（`http://10.200.4.231:8766/`）。服务只绑定指定接口；测试结束后关闭服务。构建刷新需在 Creator 3.8.8 中打开 `client` 并重新构建 Web Mobile。

微信开发者工具路径：`D:\Program Files (x86)\Tencent\微信web开发者工具`。微信构建、AppID 配置、真机多点触摸、刘海/胶囊安全区和 60 FPS 均不能由逻辑检查证明。暂不编造 AppID 或创建云环境。

## 命中反馈对比

独立 `/skills` 评审页可分别开关顿帧、像素火花、伤害跳字、落地震动，点击“同条件重播”恢复相同靶怪与施放起点。建议先1×比较力度和拖沓感，再用慢放/步进观察各段。评审时间与战斗时间之差包含顿帧；游戏Cocos默认开启，本轮Web Mobile已重建，独立页刷新即可。

图集替换前可用只读 `tools/check-atlas.py reference.png candidate.png` 检查尺寸、网格和透明区域（需已有Pillow环境），结构通过不代表美术验收通过。失败的清理候选未用于游戏。

普攻独立评审页增加“逐帧检查”与“残片裁帧”对比，针对v2 A5/A6/B2/B4左侧邻帧残片；Cocos已共用无损显示裁切，PNG源图和脚底锚点不变。拔刀蓄力与十字发射增加微弱像素提示，具体动作图集未重绘。本轮整体取舍与未完成美术项见[可靠度优化记录](../docs/reviews/reliability-first-polish-v1.md)。

身体动作v1已接入：4帧步行/跑动（不同步频）、100ms急停、2帧受击、崩山落地吸震和上挑准备修正。`/skills`新增动作按钮，`/`可检查B2新旧对比。待机使用普攻守势；技能角色按统一标尺调整显示大小，碰撞与移动速度不变。重建后按[统一验收记录](../docs/reviews/body-motion-review-v1.md)一次试玩即可。

普攻攻速与取消：游戏左上可选1/1.25/1.5×，当前一段锁定攻速，下一段使用新倍率。四技能成功施放会立即取消普攻并清空按住/连段缓存；技能不可用时普攻继续。独立技能页有真实规则的“取消普攻接技能”测试按钮（不恢复蓝量/CD），与单招评审按钮分开。[当前规格](../docs/combat-attack-speed.md)。

大崩改为沿面向前跳，默认64源像素，起手按前且超过摇杆死区时100；中途释放不改变本次距离，落地地面效果绑定实际落点。持续按普攻且两轴无输入时，每段自动极轻微前移1.2源像素；松手/受击/技能取消即停，有方向输入时不叠加。均为起调值，重建后统一复评。[记录](../docs/reviews/earth-leap-basic-step-review-v1.md)。

跑步步态修复：移动改用独立 `warrior-gait-v2.png`，包含两腿交替前伸、支撑、后蹬与回摆。8个播放槽/7个独立姿势，跑步400ms、步行约615ms；急停/受击/技能姿势保持原优先级。`/skills`新增步态逐帧选项，来源、选帧与验证见[步态v2归档](../docs/art/motion-studies/warrior/body/gait-v2/README.md)。本轮H5已重建更新。

## 微信小游戏构建与导入

已配置本项目AppID，横屏入口为Prototype。执行 `node client/tools/build-wechat.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator` 完成构建、内置资源分包后处理及主包预算检查，再将 `client/build/wechatgame` 导入微信开发者工具，点击预览扫码。仅通过编辑器重建会覆盖后处理结果，需随后运行 `node client/tools/finalize-wechat-build.cjs` 和 `node client/tools/check-wechat-build.cjs`。本轮已成功生成二维码；具体包体、资源加载与待完成的真机验收见[微信构建记录](../docs/reviews/wechat-build-review-v1.md)。

## ST04 背包实际界面试玩

已接入Prototype的背包按钮与B键（Esc关闭），包含5列滚动/锁格、正倒序整理、3个模板快捷位、鼠标拖入与触屏长按拖入；提交中禁写，结果未知保留原操作身份。默认动作样板没有正式登录时不显示虚构背包。

本机隔离试玩仅使用临时数据、真实v2内存服务，不连接微信或真实资产。Node24下分别启动：

```bash
node client/tools/inventory-preview-server.mjs
node client/tools/serve.cjs web-mobile-inventory 127.0.0.1 8769
```

打开[本机背包试玩](http://127.0.0.1:8769/?inventoryPreview=1)，点击右上背包或按B。生命/法力药各8瓶（初始拆堆用于测试合并），滚动后可见锁格；鼠标直接拖药，触屏先长按250ms再拖入右侧快捷位，先滑动则只滚动。关闭不会删除待确认请求。重启试玩服务会重置测试数据及独立持久化命名空间。

构建产物不入库；另一台机器先构建，不要拿历史H5包当本轮代码：

```bash
node client/tools/build-inventory.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
```

Windows传当地已有Creator3.8.8可执行文件路径，无需下载工具。正式登录连接可调用Prototype.attachInventory，注入已认证InventoryCoordinator和模板展示/资格；该注入接缝不宣称正式传输已完成。预览端口固定8788且只绑定127.0.0.1，不开放局域网/手机访问。

当前证据：[Cocos交互验证](../docs/reviews/st04-cocos-verification.md)。统一检查外另有真实Cocos声明类型检查（需要Creator已导入生成temp/declarations）：

```bash
node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project tools/tsconfig.cocos-inventory.json
```

上述命令从仓库根目录执行。微信真机、正式云SDK和设备性能仍待验收。
