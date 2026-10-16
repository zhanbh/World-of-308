# 三段普攻连续动画草稿 v2

2026-10-16。运行资源：`client/assets/resources/warrior-basic-attack-v2.png`，2560×960、8列3行、每格320×320，共24个播放槽位。A8/B1、B8/C1、C8/A1共用连接姿态，因此有21个独立姿态。透明底，脚底锚点(160,290)，向右创作、整体镜像向左。

本轮完成交叉斩→反手上挑→下劈收势的连续动画草稿与运行接入，不代表已逐帧完美复现视频。剑尖轨迹、双手分工、角色体积一致性仍需人工精修和用户复评。四技能专用像素帧尚未制作。

## 播放与命中

共享配置：`client/assets/scripts/WarriorAttackAnimation.ts`。A 200ms/80ms命中；B 220ms/100ms命中；C 360ms/140ms命中，总计780ms。按住直接循环，无额外待机间隔。末120ms允许缓存一次点按，松开按住输入不会自行续下一段；已明确点按缓存保留一次。单段结束后300ms允许接续，受击或成功施放技能重置普攻。

每段8帧采用不等时停留。命中选择各行第4帧，与伤害事件共用时序。脚底通过无缩放平移对齐，连接处复用同一姿态；未从设计姿态板裁四张图冒充连续动画。

## 生成与加工

使用内置 image_gen，经 imagegen 技能制作。身份参考为本项目原创 `docs/art/warrior-pixel-concept-v1.png`；没有复用视频游戏的角色贴图。精修生成结果保存为本目录 `generated-source.png`。完整两轮提示词见 `prompts.md`。

`client/tools/pack-attack-atlas.py` 使用 Pillow，将生成的256×256格逐格搬到320×320透明格；依据鞋底下沿平移对齐、增加留白、复用3个连接姿态。保留像素和 alpha，不通过脚本绘画或合成新动作。重现命令：

```sh
python3 client/tools/pack-attack-atlas.py docs/art/motion-studies/warrior/basic-attack/light-sword/animation-v2/generated-source.png client/assets/resources/warrior-basic-attack-v2.png
```

## 评审

无需重新构建即可打开共用模型和帧配置的动画页，支持1×、0.25×、暂停、10ms步进、转身、单击、按住：

```sh
node client/tools/animation-preview.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents
# http://127.0.0.1:8767
```

逻辑检查 `node client/tools/check-model.cjs <Creator目录>`；macOS传Contents目录。TypeScript检查与Creator Web Mobile构建已执行。浏览器已确认24帧加载、脚底位置、按住遍历A/B/C并循环、松手结束本段后待机，技能期间切回程序姿态。按住1.7秒采样得到7次命中事件。手机及微信真机尚待复评。
