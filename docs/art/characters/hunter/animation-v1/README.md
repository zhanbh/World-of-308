> 2026-10-18用户复评：腿偏粗，跑动近/远腿视觉交替未通过。此版作为问题对照留档；后续使用[修订版v2](../animation-v2/README.md)。此前播放/元数据检查不能证明人体步态正确。

# 猎人跑动与单箭普攻连续动画 v1

日期：2026-10-18。状态：首版可播放美术草稿，未接入Cocos；外形沿用用户认可的v3。画面由内置imagegen生成并修正，提示词见[prompts.md](prompts.md)。

## 交付

| 内容 | 正常速度 | 0.25×慢放 | 图集 |
| --- | --- | --- | --- |
| 跑动8帧/560ms | [run-preview.gif](run-preview.gif) | [run-slow.gif](run-slow.gif) | [run-atlas.png](run-atlas.png) |
| 单箭普攻8帧/720ms | [attack-preview.gif](attack-preview.gif) | [attack-slow.gif](attack-slow.gif) | [attack-atlas.png](attack-atlas.png) |

[交互预览](preview.html)支持播放/暂停、0.5×/0.25×、逐帧滑块、1.5×放大及独立箭矢示意。HTML可直接在浏览器打开；也可从仓库根目录运行：

```sh
node client/tools/hunter-animation-preview.cjs
```

访问 `http://127.0.0.1:8781/v1/`。只提供本地动画审阅，没有游戏/后台接口。箭矢是单独绘制的示意物，不是实际碰撞或伤害实现；GIF仅包含本体。

## 帧序与事件

跑动0–3为近腿支撑半循环，4–7为远腿支撑半循环。首轮仍重复同一条腿领先；两次生成修正后，第4号帧已明确为无腿带远腿前撑、带腿带近腿后摆，第5号帧远腿承重。源稿全部保留，不把失败版本混入播放。

普攻帧序：准备取箭→取箭→搭箭→半拉弦→充分拉弦→松弦→随动→回收。第5号帧（从0计数，预览第6帧）开始时生成独立箭矢，时点470ms；第5–7号帧弓上不再保留箭。720ms及各阶段时间仅作美术预览，不是正式攻速配置。连续按住普攻的输入/取消规则尚未实现。

## 打包规则

- 图集均为1664×832、4×2、单格416×416，脚底基准为(208,352)，帧序行优先。
- 两组图使用相同0.48倍最近邻缩放；不对单帧缩放身体，不扭曲肢体。源图的两行采用各自公共落地线，腾空帧不钉回地面。
- 跑动第5/6号支撑帧仅做2像素垂直平移，普攻以两脚底部中点做水平平移，减少生成稿整体漂移；平移数据均写入[animation.json](animation.json)。
- 生成源图的相邻格有少量弓尖/箭尖串格，跑动第5/6号帧及普攻第5号帧左侧裁去16源像素空白边，以剔除相邻格残片；不补画人物，也不把裁边伪装成原图无瑕疵。
- 原生CoreGraphics/ImageIO只负责格子裁切、统一打包与GIF编码；人物、服装、腿部及弓弦的画面修正均由imagegen完成。未用程序挪腿或镜像凑半循环。
- GIF正常速度与慢放各8帧，disposal=2，循环播放，避免透明帧残影。

重建（macOS，使用已安装命令行工具）：

```sh
clang -fobjc-arc -fno-modules -framework Foundation -framework CoreGraphics -framework ImageIO client/tools/pack-hunter-animation.m -o /private/tmp/world308-hunter-pack
/private/tmp/world308-hunter-pack docs/art/characters/hunter/animation-v1/animation.json
```

`animation.json`是打包/事件元数据。HTML内嵌相同元数据，若修改时间或帧序需同步更新HTML，不允许预览与导出各用一份不同的时序。

## 实际检查与剩余问题

已读取每帧尺寸、时长和GIF清屏方式；两组输出8帧、透明PNG、统一格子及正常/慢放版本。浏览器检查结果见[审阅记录](REVIEW.md)。

本稿可以审阅连续动作，但还不能作为最终生产动画：跑动过渡帧的腿带/裙片遮挡、双臂反向摆动仍需清稿；普攻充分拉弦时的身体比例和站姿跨度存在小幅跳变，平移不能修复造型变化。部分红绿色杂边、弓尖和饰品仍需逐像素清理。尚未完成角色同屏、手机实际尺寸及实战验证，不将两条动画自动接入当前战士原型。

下一步根据播放效果精修脚滑、体型一致性和弓弦细节，再补待机/受击/转向及客户端猎人状态机，之后制作四技能连续动画。
