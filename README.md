# World of 308 — 308世界

面向微信小游戏的原创 2.5D 像素风横版动作 RPG。采用**单人手动战斗 + 在线异步服务**，由一个主开发配合 AI 工具推进。

## 当前状态

整体玩法与架构方向及动作原型规格已落档。Cocos v0.9 已接入三段双刀普攻v2（基础1000ms循环，可调攻速）与十字斩、崩山击、拔刀斩、崩山裂地斩连续帧草稿v1，含固定房间、摇杆、单怪/三怪及独立技能残留。四技能通过TypeScript、模型回归和独立浏览器预览；本轮Cocos H5尚未重建，手机手感、微信真机性能及游戏后端待完成。

本次规划落档日期：2026-10-15。文档标注「已确认」「待设计」「建议」；后两者不视为最终决定。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [评审记录](docs/reviews/README.md) | 全项目独立评审报告、意见状态和后续复核入口 |
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
| [战士动作设计 v1](docs/art/motion-studies/warrior/DESIGN.md) | 三段普攻与四技能分镜、动作时序和衔接；普攻与技能粗动画已接入，待精修与真机评审 |
| [四技能动画草稿 v1](docs/art/motion-studies/warrior/skills/ANIMATION-V1.md) | 图集、生成记录、命中时序、独立残留与无需重建的动画预览 |
| [技能命中反馈 v2](docs/art/motion-studies/warrior/skill-hit-feedback.md) | 十字2/小崩3/拔刀1/大崩4段的新规格，击倒与5秒刷新流血；多段已接入，持续扣血待数值确定；浏览器分段检查已通过，待真机复评 |
| [普攻攻速与取消](docs/combat-attack-speed.md) | 普通加成、三档攻速、每段锁定和普攻取消接技能 |
| [通用受击与死亡规则](docs/combat-hit-rules.md) | 单次技能独立累计倒地：小怪最大生命30%、精英20%，数据配置，Boss按类型；特殊击倒与死亡白影已接入，待真机复评 |

## 下一步

动作原型采用 Cocos Creator 3.8.8 + TypeScript，样板位于 [client](client/README.md)。接下来重建 Web Mobile H5，在手机上验证双刀交替普攻、十字斩、崩山击、拔刀斩、崩山裂地斩和受击表现，再决定是否需要美术制作关键帧小样；之后完成 Note20 Ultra 微信小游戏构建和性能验收。MVP 最终仍包含战士和猎人。

打开与预览方法见 [样板说明](client/README.md)。当前不需要额外安装 npm 依赖，没有后端或部署命令。

## 项目与资源边界

客户端与后端将使用独立于既有棋牌项目的工程与云资源。此仓库的创建不代表小游戏 AppID、CloudBase 环境或部署已完成。

代码与文档使用仓库现有 [MIT License](LICENSE)。素材、字体、音频及第三方资源需分别记录来源和可用范围；现有许可证不替代素材的来源记录。

三段普攻的 [动画v2资源与评审入口](docs/art/motion-studies/warrior/basic-attack/light-sword/animation-v2/README.md) 已归档，生成源、提示词和运行资源分开保存。
