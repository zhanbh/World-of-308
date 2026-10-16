# 拔刀斩 v2：单刀与200ms收腰蓄力

2026-10-16。用户确认的方案已接入角色图集、共用时序和独立预览；本轮未重建Cocos H5，尚待手机主观评审。

本轮使用内置 image_gen，经 imagegen 技能修改v1素材。目标图为原拔刀斩v1，身份参考为本项目原创角色概念。完整[初轮提示词](prompt.md)与[去除贴图刀光的修订提示词](cleanup-prompt.md)保留；最终源图见 [generated-source.png](generated-source.png)。所有12格均为单刀，副手空手配合动作；不增加刀鞘和第二条刀路。原v1源图和图集保留供对照。

运行资源：`client/assets/resources/warrior-badao-v2.png`，1664×1248、4列3行、每格416×416，地面锚点(208,352)。

| 技能时间 | 表现 |
| --- | --- |
| 0–140ms | 隐藏副刀，压身、收主刀至侧腰后方，转肩扭腰 |
| 140–340ms | 固定停留在第3帧收腰姿势，蓄力200ms；点按自动完成 |
| 340–440ms | 解开扭腰，单手主刀快速横扫；440ms仍只结算一次伤害 |
| 440–600ms | 保留横斩末势，刀光独立消退，副刀仍隐藏 |
| 600–760ms | 单刀回收；660ms允许移动结束余下后摇 |
| 动作结束或被打断 | 返回公共双刀守势，恢复副刀 |

角色图集中不绘制大范围刀光，也不把双刀守势塞进技能首尾槽位。`pack-skill-atlas.py --single-blade` 保留单刀首尾，结束后由播放器切回公共双刀待机。伤害、范围、法力、CD、440ms命中及760ms总时长保持原值。这里只增加可见蓄力停顿，不新增长按操作。

重现打包（Pillow，仅裁切/最近邻缩放/锚点平移）：

```powershell
python client/tools/pack-skill-atlas.py docs/art/motion-studies/warrior/skills/draw-slash/animation-v2/generated-source.png client/assets/resources/warrior-badao-v2.png --single-blade
```

当前局域网预览：http://10.200.4.231:8767/skills ，页面标题含“拔刀斩v2”。刷新即可，无需先重建；IP随网络变化。游戏场景和已构建的H5需要Cocos重新导入/构建才更新。

验证记录：浏览器200ms和325ms均保持第3帧单刀蓄力、无命中；450ms第7帧单刀挥斩、命中1次；760ms后回双刀守势，蓄力期间模拟受击也回双刀且无命中/残留。预览控制台无错误或警告。模型检查覆盖200ms留帧边界、命中次数、受击取消与恢复移动；TypeScript检查通过。它仍是待评审的像素粗动画，刀尖轨迹、握持及体积细节后续可精修。
