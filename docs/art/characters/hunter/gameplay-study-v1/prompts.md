# 猎人像素姿态研究 — 生成记录

日期：2026-10-18。生成方式：内置imagegen。角色身份来源：concept-v3/hunter-key-art-v3.png；造型已获用户认可。

## 完整提示词

Use case: stylized-concept / identity-preserve.
Make a 2-by-2 gameplay pixel pose STUDY board for the original ADULT female archer in reference image 1. Image 1 is the ONLY character identity/outfit reference. Image 2 is ONLY a reference for chunky clean pixel clusters, large readable facial features, outline weight and compact action-game visual scale; do NOT copy that male character, hair, swords or outfit.
Translate the approved mature female hunter into a compact roughly four-head-high action-RPG pixel character with a clear waist and longer leg emphasis than the male warrior, maintaining an adult face, chestnut braided high ponytail, teal hair ribbon, teal/ivory brass-trimmed fitted bodice, small shoulder cape, opaque navy shorts, split teal skirt panels, semi-sheer black tights on BOTH entire legs, single slim thigh strap, BLACK ANKLE lace-up combat boots and back quiver. No tall boots, no bare legs, no childlike facial design. Simplify gold embroidery into a few readable clusters and long trailing skirt panels into controllable distinct shapes. Exactly the same costume, head/torso size, limb lengths and bow in every pose. Thin tights should use restrained dark skin-color clusters instead of glossy black armor.
All four studies face RIGHT and are fully visible with generous margins, one per equally sized cell on a clean opaque charcoal background. Header exactly "HUNTER / GAMEPLAY STUDY 01". Flat 2.5D side-view game camera, no perspective zoom, no illustration lighting haze.
Top left label "READY": grounded alert side-on knees slightly bent, bow relaxed diagonally in LEFT hand, RIGHT drawing hand free near quiver.
Top right label "DRAW": both feet grounded, bow extended in front to the RIGHT in LEFT hand, RIGHT hand drawing taut string to cheek, ONE arrow nocked and pointing right, clear triangular drawn-string shape, no magic effects, no firing particle.
Bottom left label "NEAR CONTACT": forward run near/camera-side foot planted AHEAD under a slightly bent knee, far-side leg bent behind and off the ground; clearly visible near-leg thigh strap and near boot, torso leaning right, bow lowered and kept away from legs.
Bottom right label "FAR CONTACT": half-cycle later at same body height and same torso proportions, FAR-side foot planted AHEAD bearing weight, camera-side leg now bent behind and off the ground. Truly swap leg support and arm counter-swing, NOT the same drawing shifted and NOT an overall horizontal mirror; still facing RIGHT and near/far costume identities maintained.
Crisp pixel clusters, stepped edges, limited coherent palette, no smooth painterly textures, no blurry contours. Dark charcoal floor baseline in each cell. No extra poses or effects, no weapons other than her bow/quiver, no watermark. This is a posture/construction study, not claimed to be a playable animation atlas.


## 首轮检查与修正

首轮保存generated-source-v1.png，待机/拉弓及主要造型可辨，但NEAR CONTACT和FAR CONTACT均以带腿带的同一条腿前撑，未通过支撑腿交替检查；不能直接作为合格跑动帧使用。已针对右下格单独请求修正，其他3格保持原样。最终结果另存，不覆盖原图。

## 支撑腿修正提示词

Precise local edit of the supplied 2x2 hunter pose study. Keep the entire image composition, text, first THREE panels (READY, DRAW, NEAR CONTACT), character identity, costume and art style unchanged. Change ONLY the character's leg pose inside the BOTTOM RIGHT panel labeled FAR CONTACT.
The current bottom-right incorrectly repeats the near leg leading. Redraw the two legs as the opposite half of a run cycle: the CAMERA-NEAR leg, identifiable by its upper-thigh leather strap with gold clasp, now swings BACK to the LEFT of the hip, thigh angled left, knee bent and boot lifted behind the body. Its strap must visibly travel to that rearward/left thigh. The FAR leg has PLAIN black tights with NO upper-thigh strap; it extends FORWARD to the RIGHT from the hip and its boot is PLANTED on the right-hand floor baseline supporting weight. At the hip/thigh intersection the rearward STRAPPED near leg must overlap IN FRONT of the plain forward far leg, making near/far anatomy unambiguous. Both legs remain attached correctly to one pelvis. Exactly two legs. Same ankle boots and tights.
Keep torso, face, ponytail and bow facing RIGHT, unchanged in size. Do NOT mirror the character or rotate her. Keep the front-facing direction and the same ground baseline. The forward/right leg must be the plain leg without the thigh strap, and the rearward/left leg must be the strapped leg; that visible distinction is the purpose of the edit. No additional characters, no text changes, no new effects.

## 修正结果

最终选择hunter-gameplay-study-v1.png：右下格的带腿带近腿已改为后摆，前方落地腿不带腿带，近/远腿身份与左下格有明确区分。待机、拉弓和近腿接触格整体延续首稿，但生成编辑并不保证逐像素不变。四格仍只是关键姿态研究，跑步摆臂尚未形成完整反向周期、脚底/帧框未校准，不能声称连续步态已通过，也不直接作为运行图集。
