# 猎人跑动 v5：8帧骨架绑定版

2026-10-18。当前为分层动画审阅稿，未接入Cocos。使用用户确认的 `run-skeleton-v1/motion.json` 原始坐标制作完整8帧；不再逐帧生成不同的身体姿势。

## 入口

- [正常跑动](run-preview.gif)、[0.25倍慢放](run-slow.gif)
- [交互预览](preview.html)：逐帧、速度、骨架叠加
- [8帧图集](run-atlas.png)、[8帧骨架叠加检查](skeleton-overlay.png)
- [骨架数据](motion.json)、[部件与绑定点](rig.json)、[提示词](prompts.md)

启动 `node client/tools/hunter-animation-preview.cjs`，访问 http://127.0.0.1:8781/v5/ 。根路径也指向本版；旧版入口保留。

## 制作方式

内置 imagegen 生成一张透明部件源图，包括上身、马尾、裙摆、两条大腿、丝袜小腿/短靴及短裤覆盖层。原始生成图未严格均分网格，按实际边界登记裁剪范围。`build.cjs` 生成预览及绑定参数；浏览器Canvas复用相同部件，以固定骨长与骨架关节坐标确定旋转和位置，导出 `rig-rendered.png`。腿部纹理横向比例是统一的部件造型参数，8帧不变，不靠逐帧缩腿伪造步态。

左大腿是唯一带黑腿带、金扣和玉坠的部件，右大腿为纯丝袜；近侧左腿始终绘制在远侧右腿之后。小腿和短靴分开绑定，靴子围绕脚踝旋转，支撑脚保持平放；马尾、裙摆增加小幅周期摆动。上身、双臂及弓目前共用整体部件，因此只随骨盆上下运动，尚无独立肩臂随动。

高精立绘及已认可骨架未修改。原v1—v4保留问题记录。v5仅制作跑动，普攻未更改，仍在animation-v2留档。

## 重建

1. `node docs/art/characters/hunter/animation-v5/build.cjs`
2. 打开预览，待 `window.hunterRig.ready` 为真，将 `#sheet` Canvas 原尺寸导出为 `rig-rendered.png`；需要叠加图时逐帧调用 `window.hunterRig.draw(context,index,true)`。
3. `/private/tmp/world308-hunter-pack docs/art/characters/hunter/animation-v5/animation.json`（编译方式见 `client/tools/pack-hunter-animation.m`）。原尺寸4×2图集，无额外帧级缩放或平移，GIF与预览帧序一致。

## 验证与剩余精修

- `motion.json`与已确认骨架逐字段相同；8帧，每帧80ms，完整640ms；慢放每帧320ms。
- 图集1664×832，单帧416×416，基准地面y352。支撑腿左、左、左、腾空、右、右、右、腾空。
- 已目视检查全部8帧骨架叠加图；浏览器验证源图加载、慢放和第8帧下一帧回到第1帧，页面错误文本为空。
- 立绘v3 SHA-256仍为 `dfb4b70797387703ce2802ef8772c83472e1559712d8b49ec6484a00250ef816`。
- 当前仍可见部件膝部、髋部的分层接缝和源图边缘杂色，原始上身内含部分发束，独立马尾与其衔接也需精修；持弓上身较僵。这些属于未解决的美术质量问题，不以数值检查代替最终验收。
