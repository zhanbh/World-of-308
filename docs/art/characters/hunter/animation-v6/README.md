# 猎人跑动 v6：舒展跑姿与独立摆臂

2026-10-18，美术审阅稿，未接入游戏。用户指出v5像潜行小偷，因此本轮调整整体姿态，而非仅增加帧数。

- [正常跑动](run-preview.gif)、[四分之一慢放](run-slow.gif)
- [交互逐帧与骨架叠加](preview.html)
- [新旧蹬离位对照](posture-comparison.png)、[全部8帧骨架叠加](skeleton-overlay.png)
- [部件绑定](rig.json)、[动作数据](motion.json)、[上身生成提示词](prompts.md)

## 改动

1. 重画上身及双臂，胸口抬起，肩颈舒展；空手臂独立绕肩摆动，持弓臂小幅随动，上身增加小幅反向转动。内置imagegen仅生成部件，8帧姿态仍由绑定合成。
2. 修订先前已确认骨架的下肢轨迹：骨盆提高，承重压缩减少，蹬离腿更充分伸展。该修改针对用户随后否定套装后整体姿态的反馈，原run-skeleton-v1及v5保留不覆盖。
3. 固定60/65大小腿长度、左右腿身份与遮挡层级。腿环沿用唯一左大腿纹理，不重新分配。脚踝继续独立旋转，蹬离位脚尖下压。
4. 完整8帧，每帧70ms，共560ms；慢放每帧280ms。原v5为640ms。图集1664×832，单格416×416。

## 构建与验证

先运行 `node docs/art/characters/hunter/animation-v6/build-motion.cjs`，再运行 `node docs/art/characters/hunter/animation-v6/build.cjs`。动作构建校验脚踝可达、大小腿定长及膝盖低于骨盆。预览启动方式同v5，地址 http://127.0.0.1:8781/v6/ ，根路径也指向本版。

浏览器加载两张部件图后将`#sheet`原尺寸导出为`rig-rendered.png`；骨架叠加导出使用`window.hunterRig.draw(context,index,true)`。随后用`client/tools/pack-hunter-animation.m`的编译产物读取`animation.json`打包；打包器只处理图集/GIF，不改变姿态。

已目视检查完整8帧图集、骨架叠加和新旧蹬离位对照。浏览器实际播放可推进，0.25倍速、逐帧及第8帧返回第1帧可用，页面无加载报错。GIF实际为8帧、每帧70ms，慢放为280ms。高精立绘v3 SHA-256保持 `dfb4b70797387703ce2802ef8772c83472e1559712d8b49ec6484a00250ef816`。

仍是分层动画审阅稿：肩、膝部件接缝、透明边缘杂色、马尾根部衔接以及身体转动细节仍可精修；数值和播放检查不替代用户对跑姿气质的确认。未修改普攻、其他技能或游戏运行时代码。
