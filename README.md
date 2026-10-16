# World of 308 — 308世界

面向微信小游戏的原创 2.5D 像素风横版动作 RPG。采用**单人手动战斗 + 在线异步服务**，由一个主开发配合 AI 工具推进。

## 当前状态

整体玩法与架构方向及动作原型规格已落档。Cocos v0.8 已接入三段双刀普攻连续动画草稿：交叉斩→反手上挑→下劈收势，780ms循环；包含固定房间、摇杆、单怪/三怪及十字斩、崩山击、拔刀斩、崩山裂地斩程序动画。已完成桌面浏览器构建与运行检查，手机动作手感待复评。四技能专用像素帧、微信真机性能和游戏后端尚未完成。

本次规划落档日期：2026-10-15。文档标注「已确认」「待设计」「建议」；后两者不视为最终决定。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [整体规格](docs/spec.md) | 当前玩法基线、12 系统、首版边界、用户故事与验收标准 |
| [动作原型规格](docs/action-prototype.md) | 双刀战士最小样板、摇杆规则、小人物画面与 Note20 Ultra 真机验收 |
| [技术架构](docs/architecture.md) | 客户端、后端、资产权威、断网、交易与资源隔离 |
| [分阶段路线图](docs/roadmap.md) | 原型、MVP、后续版本及模块设计顺序 |
| [Wayfinder 决策地图](docs/wayfinder/map.md) | 已完成的整体决策记录、未定细节与交接入口 |
| [领域术语](GLOSSARY.md) | 账号、角色、装等、绑定、奖励等统一名称 |
| [早期技术与内容蓝图](docs/game-technical-blueprint.md) | 历史参考；与当前规格冲突时以当前规格为准 |
| [战士概念参考](docs/art/warrior-pixel-concept-v1.md) | 早期视觉探索，尚非生产动画资源 |
| [战士动作小样美术 brief](docs/art/warrior-animation-sample-brief.md) | 给单角色动作样片的范围、交付物与手机验收要求 |
| [战士动作参考索引](docs/art/motion-studies/README.md) | 普攻与四技能分别归档的来源、视频时间、动作拆解和待确认差异 |
| [战士动作设计 v1](docs/art/motion-studies/warrior/DESIGN.md) | 三段普攻与四技能分镜、动作时序和衔接；普攻动画草稿已接入，技能像素帧待制作 |

## 下一步

动作原型采用 Cocos Creator 3.8.8 + TypeScript，样板位于 [client](client/README.md)。接下来重建 Web Mobile H5，在手机上验证双刀交替普攻、十字斩、崩山击、拔刀斩、崩山裂地斩和受击表现，再决定是否需要美术制作关键帧小样；之后完成 Note20 Ultra 微信小游戏构建和性能验收。MVP 最终仍包含战士和猎人。

打开与预览方法见 [样板说明](client/README.md)。当前不需要额外安装 npm 依赖，没有后端或部署命令。

## 项目与资源边界

客户端与后端将使用独立于既有棋牌项目的工程与云资源。此仓库的创建不代表小游戏 AppID、CloudBase 环境或部署已完成。

代码与文档使用仓库现有 [MIT License](LICENSE)。素材、字体、音频及第三方资源需分别记录来源和可用范围；现有许可证不替代素材的来源记录。

三段普攻的 [动画v2资源与评审入口](docs/art/motion-studies/warrior/basic-attack/light-sword/animation-v2/README.md) 已归档，生成源、提示词和运行资源分开保存。
