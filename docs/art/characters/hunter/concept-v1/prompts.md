# 女性猎人概念 v1 — 生成记录

日期：2026-10-17。工具：内置 imagegen。用途：角色概念立绘与设计参考，不是可直接播放的角色图集。

用户明确要求：生成猎人角色相关立绘和设计，猎人为女性。其余造型为本轮设计提案；职业、弓箭和四技能方向继承整体规格，不新增种族、宠物或装备槽。

## 01 — hunter-key-art-v1.png

Use case: stylized-concept
Asset type: original female hunter full-body character key art for World of 308, a 2.5D pixel-art action RPG.
Primary request: design one adult human female archer whose visual craft belongs beside a chunky pixel-art Chinese-fantasy dual-blade warrior wearing ivory cloth, dark navy armor and restrained antique brass trim. A completely original character, no existing franchise identities.
Subject: an unmistakably adult woman, athletic slender build, confident focused warm expression, dark chestnut high ponytail with a short practical braid at its base and a muted jade tie, a few strong face-framing locks, human round ears, amber-brown eyes. Stylized adventure-RPG proportions about four and a half heads tall, mature facial design, not a child. Light ivory inner tunic, fitted practical dark navy trousers, warm brown leather chest harness and waist belt, muted moss-teal short split shoulder mantle that ends above the waist, slim antique brass fastenings, sturdy calf-high leather boots, reinforced archery bracer. Fully clothed, mobile and functional. No large shoulder armor. No hood hiding face. No giant cape.
Weapon: one elegant practical recurved longbow, warm dark wood with sparse antique brass reinforcement and an extremely clear taut string, light teal grip wrapping; modest quiver and visibly feathered arrows at the back, fletching ivory with a small teal accent. Bow held naturally in the left hand, right hand holding a single relaxed downward-pointing arrow. No sword or firearm.
Style/medium: polished high-resolution pixel-art character illustration with deliberate square pixel clusters, crisp stepped edges and controlled highlights, attractive readable face and clean material separation, not a photorealistic painting. Match the existing game's chunky pixel character presentation while remaining useful as a larger character-selection illustration. More slender silhouette than a warrior, carefully designed cloth and leather.
Composition/framing: portrait canvas, a single complete head-to-boots figure, centered with comfortable transparent margins; three-quarter view facing right, a relaxed alert standing pose, both feet and the entire bow visible. Hair, bow and quiver separated in silhouette. No cropped extremities. Clean readable anatomy and exactly two arms and two legs, correct hands.
Lighting/mood: restrained warm neutral key light, confident adventurous mood, no dramatic colored glow.
Scene/backdrop: true transparent background, no scenery, no platform, no cast shadow outside character, no UI.
Constraints: one character only, no text, no logo, no watermark, no pet, no wings, no elf ears, no magical aura, no pin-up pose, no armor bikini, no gradients masquerading as pixel art.

## 02 — hunter-design-board-v1.png

以主立绘source作为同角色参考，完整提示词见下方“02完整提示词”。

## 01b — 主立绘背景清理

Use case: background-extraction. Edit target: the supplied original female hunter key art. Change ONLY the background: remove all brown/black backdrop and colored haze, including the holes between bow/string/body/legs, and output a genuinely transparent RGBA background. Preserve the character exactly: same adult woman's face, hair, costume, proportions, pose, bow, taut thin bowstring, held arrow, quiver, colors, pixel texture, full body framing and original composition. Do not repaint, crop or add anything. No shadow, no checkerboard painted into the image, no text. Keep all fine bowstring/arrow details while removing background.

输入：hunter-key-art-source-v1.png。首轮PNG已含Alpha，但仍有棕色背景/色晕观感，因此单独请求背景清理，原图保留为source，不覆盖。清理结果仍有局部背景色晕，作为概念稿归档，不标为生产抠图。

## 02完整提示词 — hunter-design-board-v1.png

Use case: stylized-concept.
Asset type: original female hunter character turnaround and gameplay pose concept board for the pixel-art action RPG World of 308.
Reference image 1 role: identity/costume/weapon reference ONLY. It shows the exact original adult woman to depict throughout this board. Preserve her chestnut braided high ponytail with jade ribbon, warm confident adult face, ivory inner tunic, moss-teal short split shoulder cape, brown leather straps, navy trousers, bronze-trimmed bracers and practical boots, back quiver and wood-and-brass recurve bow. No new character or outfit variants.
Composition: wide landscape professional game character design sheet, clean dark desaturated charcoal background, restrained ivory section rules and generous gutters. Header text exactly "HUNTER / DESIGN STUDY 01". Upper two-thirds: three fully visible, evenly spaced costume turnaround drawings on the same baseline: FRONT, RIGHT SIDE, BACK. Bow can rest beside each figure so the torso/arm construction remains legible; maintain the same bow and quiver. One small bow/string/arrow detail at the far right with a small controlled palette row. No overlapping figures, no cut-off feet or bow tips.
Bottom third: three isolated compact gameplay-pose studies, facing RIGHT, in the same identity and outfit, translated to a chunky four-head-high pixel sprite silhouette similar to the existing game's small warrior. Distinct labels exactly "READY", "DRAW", "RUN". READY: alert knees-bent side-on stance with the bow lowered. DRAW: believable fully drawn recurve bow aiming horizontally right, left arm straight holding the bow at the front, right hand at the cheek drawing string, arrow nocked to the string and pointing right, both feet grounded. RUN: an actual forward running support/swing pose with clearly separated legs, one foot supporting and the opposite knee traveling forward, short cape and ponytail trailing; bow lowered to avoid covering the legs. These are separate key-pose explorations, not sequential animation frames.
Style: refined crisp pixel-inspired fantasy character concept art, squared clusters and stepped edges, strong silhouette, clean costume consistency, controlled ivory/moss-teal/navy/leather/brass palette. Upper turnarounds use the reference illustration's adult proportions; bottom row is explicitly a simplified compact gameplay translation, not child characters. No painterly blur, no photo texture.
Constraints: exact same adult human female, no elf ears or extra species, no pet, no swords, no firearms, no wings, no armor bikini, no cropped extremities, two arms/two legs per figure. Bowstrings visible. No magical effects obscuring anatomy. No extra labels beyond header and section labels, no watermark, no logo. Opaque clean charcoal board, not transparent.

## 输出与检查

- 主立绘source：1024×1536；保留首轮出图。
- 主立绘v1：1024×1536；背景清理版本，PNG含Alpha，但弓与身体之间仍有棕色残余，正式UI使用前需继续抠图精修。
- 设计板v1：1536×1024；不透明深色底，前/侧/背与3个基础姿态均可见。
- 正面栏仍是轻微四分之三朝向，属于造型展示，不当作严格正交三视图；小人RUN只有一个姿势，不能证明完整步态交替。
- 衣服、发型和主配色整体一致；角色源稿偏精细像素质感插画，小人是简化像素方向，均未进行逐像素生产清稿。
- 图片未用脚本修图；仅复制归档并读取尺寸/Alpha元数据，见assets.json。
