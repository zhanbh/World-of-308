# 战士姿势草图生成记录

日期：2026-10-16。模式：内置 image_gen；用途为原创关键姿势评审，不是运行资源或精确动画帧表。

身份参考：[原创战士概念图](../../warrior-pixel-concept-v1.png)。没有把原作视频帧作为生成器的角色外观输入。

第一稿：[poseboard-v1.png](poseboard-v1.png)。评审发现十字斩/拔刀斩部分格子的朝向不一致，拔刀斩刀光过于环绕。第二稿针对这些问题进行定向修改，不能把第一稿直接当成制作分镜通过。

当前选用的评审草图：[poseboard-v2.png](poseboard-v2.png)。已目视检查五行四格、角色外观和修正区域：十字斩及拔刀准备改为面向右侧，拔刀主弧收至面前。该图仍只适合表达姿势意图，手臂和武器的逐帧连续性、脚底一致性、原生像素规格与视频匹配程度尚未验收。v1 仅保留作修订历史，制作入口以 v2 加各动作 `design.md` 为准。

## 初始提示词

```text
Use case: stylized-concept. Asset type: ORIGINAL GAME ANIMATION KEY-POSE REVIEW BOARD, not a finished sprite atlas. Input reference image is ONLY the original character identity/style reference: preserve the black tied ponytail with red ribbon, navy and ivory short armored robe, gold trims, red sash, two broad steel swords, chunky clean pixel-art silhouette. Create a polished dark charcoal landscape animation planning sheet, 5 clearly separated horizontal rows, exactly 4 full-body poses in each row, 20 individual original character poses total. Every character faces screen RIGHT, same body size, consistent clothes and TWO SWORDS with two clearly attached arms/hands. Pixel-art game keyframe look, hard crisp edges, anatomically readable chibi warrior, no DNF characters or copied artwork. Leave ample gutters between the figures, no cropped blades. Tiny English labels only: title WARRIOR / ACTION STUDY 01, rows NORMAL LOOP, CROSS CUT, LEAP SLAM, DRAW SLASH, EARTH BREAK. Row1 normal loop four DIFFERENT poses: torso-twisted cross-body high/low two-sword strike; both hands raised over head, chest lengthened; very low forward crouching follow-through with main sword down at front and other sword high behind; rising into a coiled starting stance. Row2 cross cut: coiled waist-height main sword and raised off-hand; main hand horizontal slash at waist while offhand stays raised; offhand downward vertical cut crossing the first faint horizontal trail to make an upright PLUS sign in front; both hands recovering. NOT simultaneous diagonal X. Row3 leap slam: deep knees compressed with swords gathered; airborne short leap knees tucked, both swords raised; grounded low heavy downward strike with small warm gold impact at front ground; rising recovery with dissipating small dust ring. Show the ground shadow separate from airborne character. Row4 draw slash: low compressed torso with main blade drawn to side waist behind and offhand held close; tight coiled held anticipation; forceful waist-and-shoulder rotation with one broad flattened cyan horizontal blade arc in FRONT and a short secondary blade tail; clear extended follow-through before recovery. No projectile, no full large blue ring that obscures the warrior. Row5 ultimate earth break: deeply compressed charge; HIGH airborne overhead two-sword lift with separated shadow beneath; VERY LOW ground-impact pose with raised broken stone pieces and red cracks; character has risen at SAME impact location with delayed upright crimson ground eruption behind/in front, clear silhouette still visible. Make ultimate visually different from short leap slam. Use restrained ivory/cyan blade trails for rows1-4, restrained crimson/orange ground effects in row5, effects must not hide hands or bodies. This is an expressive key-pose draft for animation planning, never suggest it is a uniform-frame production sprite sheet. No timing numbers, no watermark.
```

## 定向修改提示词

```text
Edit this animation review board, preserve its original character identity, crisp pixel style, all labels, 5-row 4-column layout and all other poses exactly. Correct the inconsistent pose direction: CROSS CUT row 2 column 2 must have the warrior's face and attack directed screen RIGHT, not left; preserve main-hand horizontal stroke and the other hand raised. DRAW SLASH row 4 column 2 must face screen RIGHT in a low coiled side-waist anticipation, head looking right, two distinct swords attached to two hands. DRAW SLASH row 4 column 3 must show a SINGLE broad flattened crescent sweep only on the character's FRONT/RIGHT side, beginning at the near blade and sweeping to the right, without a complete ring behind the character or looping halo, so it clearly represents front-only attack coverage. Keep the second sword as a restrained short tail close to the body. Keep every other cell and the EARTH BREAK row unchanged. The board is a key-pose design draft, not a production animation atlas.
```

草图每行四格仅摘要该动作关键点，不能替代 `design.md` 中各段的全部关键姿势与非均匀时长。生成图还需检查持握连续性、双刀位置、脚底锚点和源像素密度；不得裁成格后直接播放并称为参考动作复刻完成。
