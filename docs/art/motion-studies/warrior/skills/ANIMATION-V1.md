# 四技能连续帧草稿 v1

> 后续更新：拔刀斩已改用[单刀蓄力v2](draw-slash/animation-v2/README.md)，140–340ms停留200ms，出招结束恢复双刀。下方v1图集与共同首尾说明保留作首版归档，当前拔刀斩不再使用v1。

2026-10-16。状态：角色图集、运行代码与独立预览已接入；尚未重建本轮 Cocos H5，也未完成手机/微信和主观手感验收。

使用内置 image_gen，按 imagegen 技能生成原创角色动作。身份参考为 `docs/art/warrior-pixel-concept-v1.png`；比例参考为已接入的普攻 v2。未把 DNF 角色贴图放进游戏。每招源图为 1448×1086 RGBA，原始像素和 alpha 保存在各招 `animation-v1/generated-source.png`；制作规格与提示词组见 [prompts-v1.md](prompts-v1.md)。

| 动作 | 运行图集（client/assets/resources/） | 动作/命中/可移动（ms） | 源图 |
| --- | --- | --- | --- |
| 十字斩 | warrior-cross-v1.png | 560 / 290 / 460 | [归档](gore-cross/animation-v1/README.md) |
| 崩山击 | warrior-bengshan-v1.png | 880 / 580 / 780 | [归档](mountain-crash/animation-v1/README.md) |
| 拔刀斩 | warrior-badao-v1.png | 760 / 440 / 660 | [归档](draw-slash/animation-v1/README.md) |
| 崩山裂地斩 | warrior-earth-v1.png | 1320 / 880 / 1320 | [归档](outrage-break/animation-v1/README.md) |

每招 12 个播放槽位，4列3行，运行格416×416、图集1664×1248，统一地面锚点(208,352)。所有首尾守势槽位复用十字斩首帧，待机也显示这张透明守势。加大帧框只为容纳刀尖与留白，显示尺寸按416/320补偿，不能因为帧框加大而缩小角色。

`client/tools/pack-skill-atlas.py` 从 alpha 连通区域定位完整角色矩形，绕过生成图的不精确格线；仅裁切原图矩形、最近邻统一缩放（224/362）、按下沿平移和复用守势，不绘画补帧或制造新姿势。源图有部分不均匀间距、刀尖临界和比例变化，脚底自动估计仍需手工精修。十字斩做过一次透明留白修订。运行图检查未见旧裁切方式造成的邻格碎片。

重现：先打包十字斩（提供公共守势），再依次打包其他三招：

```powershell
python client/tools/pack-skill-atlas.py docs/art/motion-studies/warrior/skills/gore-cross/animation-v1/generated-source.png client/assets/resources/warrior-cross-v1.png
python client/tools/pack-skill-atlas.py docs/art/motion-studies/warrior/skills/mountain-crash/animation-v1/generated-source.png client/assets/resources/warrior-bengshan-v1.png
python client/tools/pack-skill-atlas.py docs/art/motion-studies/warrior/skills/draw-slash/animation-v1/generated-source.png client/assets/resources/warrior-badao-v1.png
python client/tools/pack-skill-atlas.py docs/art/motion-studies/warrior/skills/outrage-break/animation-v1/generated-source.png client/assets/resources/warrior-earth-v1.png
```

需要 Pillow，可使用 Codex 已捆绑 Python，本轮未安装依赖。

`WarriorSkillAnimation.ts` 统一非等时帧序、命中、起落高度和可移动时间。每次命中只结算一次；小崩在120–580ms前移34地面单位。受击取消未发生的落地事件并归零高度，伤害/蓝耗/CD沿用原型数值。

`WarriorSkillEffects.ts` 管理只展示、无碰撞的独立残留：横竖十字290ms合成；拔刀以向前扁弧替代直线条带；两种落击在实际落点创建冲击。大崩880ms落地、1280ms开始喷发、1320ms角色结束、2400ms清理，喷发不额外扣血。落点与面向创建后固定；落地后受击可保留既有残留，死亡/房间重置全部清理。地面特效仍是程序草稿，尚非生产像素特效。

预览（无需重建 Cocos）：

```powershell
node client/tools/animation-preview.cjs 'C:\ProgramData\cocos\editors\Creator\3.8.8'
# http://127.0.0.1:8767/skills
```

手机与电脑在同一局域网时，将第三个参数设为电脑实际WLAN IPv4（可选第四个参数为端口）：

```powershell
node client/tools/animation-preview.cjs 'C:\ProgramData\cocos\editors\Creator\3.8.8' 10.200.4.231 8767
# 手机打开 http://10.200.4.231:8767/skills
```

示例IP为2026-10-16本机WLAN地址，网络变化后需要重新确认。只替换浏览器URL而服务仍监听127.0.0.1，手机无法访问。

支持1×/0.25×、暂停、10ms步进、镜像、受击打断、接普攻、游戏显示尺寸与2×检查。预览共用动作/事件/残留模型，Canvas特效只是示意，不代替 Cocos 的实际遮挡和战斗体验。

已执行 TypeScript完整检查、连段/技能逻辑回归、帧与命中对齐、落地前取消、落地后残留及重置清理检查。独立浏览器复查：十字300ms帧7、拔刀450ms帧7、小崩583ms帧8、大崩900ms帧8均显示唯一命中与高度归零；大崩1400ms角色已待机但仍有地裂喷发。左向大崩400ms帧3高度27.4，模拟打断后高度/命中/残留均为0。控制台无错误或警告。手机仍需重新构建 Web Mobile 后复评。

本轮不视为完成全部动作设计：技能输入缓冲与普攻取消链、专用走跑/受击帧、逐像素的刀柄握持与角色体积统一、最终地面特效和手机性能仍待下一轮。四招是可运行的粗动画，不能据截图宣称达到参考游戏动画品质。
