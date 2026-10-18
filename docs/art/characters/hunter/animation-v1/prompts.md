# 猎人跑动与普攻动画 v1 — 提示词

日期：2026-10-18。画面生成和画面修正均使用内置imagegen。身份/风格来源为已审阅的猎人像素姿态稿，接触位修正另引用该稿右下格的远腿支撑。

## 跑动首稿

Use case: stylized-concept. Generate an ANIMATION SPRITE SHEET, not a labeled concept board. Reference is the approved original adult female hunter identity/costume and pixel style. Make exactly EIGHT DISTINCT successive frames of one complete RUN CYCLE facing RIGHT, laid out FOUR equal columns by TWO equal rows, row-major chronological order. Canvas exactly 2:1 aspect, generous equal empty margins inside each equal square cell. No text, labels, numbers, grid lines, floors, scenery, shadows or effects. Genuinely transparent background.
Same ADULT woman in every frame: chestnut high ponytail with short braid and teal ribbon, teal-and-ivory gold-trimmed fitted bodice and short shoulder cape, opaque navy shorts, split teal/ivory skirt panels, continuous semi-sheer BLACK TIGHTS, black ANKLE lace-up combat boots, back quiver and one wood/brass recurve bow held in LEFT hand and lowered beside front hip. SINGLE thin upper-thigh leather strap identifies the CAMERA-NEAR leg throughout. Far leg has no thigh strap. Clearly adult face, compact approximately four-head-high action-game proportions. Simplify gold details into pixel clusters, do not change her outfit. No long boots.
Uniform fixed camera, same head/torso dimensions and limb lengths across all eight frames, NO zooming or per-frame scale changes. Hip center stays at the same horizontal position in every cell. Common floor baseline at 86% cell height; supporting boots touch it, airborne feet remain above it. Small intentional 2-3 source-pixel torso rise/fall over the cycle. Hair and skirt follow with small secondary motion and do not hide both legs. Bow has clear limbs/string and remains in the same left hand, swinging a little naturally but not obstructing feet.
Exact phase sequence:
Frame 1 top-left: NEAR STRAPPED leg extends ahead to RIGHT and heel contacts floor; plain FAR leg extends behind to LEFT.
Frame 2: near knee compresses as weight settles, far foot lifts behind.
Frame 3: near planted foot passes under hip, far knee swings FORWARD crossing past it.
Frame 4: near foot pushes off behind, far leg reaches ahead; brief lifted body.
Frame 5 bottom-left: PLAIN FAR leg extends ahead to RIGHT and heel contacts floor; NEAR STRAPPED leg is BEHIND to LEFT, strap clearly on rearward thigh. Foreground strapped thigh overlaps the rear/plain forward thigh at the hip. This is the opposite support phase from frame1, not the same leading leg.
Frame 6: far knee compresses as weight settles, near strapped foot lifts behind.
Frame 7: far planted foot passes under hip, NEAR STRAPPED knee swings FORWARD past it.
Frame 8: far foot pushes off behind, near strapped leg reaches forward ready for frame1, lifted body.
Do not copy the same leg pose into all cells, do not horizontally mirror any whole character. All face RIGHT. Two arms, two legs, one bow per frame. Strong anatomical consistency and actual alternation of support. Crisp stepped pixel edges, controlled coherent palette, no painterly glow or blur. Source-reference panel labels must not appear in output.

## 跑动后半循环修正

Precise correction of the supplied 4-column 2-row run animation sprite sheet. Preserve the top row and whole character identity, facing RIGHT, scale, clothing, hair, bow, transparent background and exact 4x2 grid. The bottom row currently wrongly repeats the same leading leg. Redraw only the BOTTOM FOUR frames as the OPPOSITE leg-support half cycle from the top row.
The thin leather strap with small gold buckle ALWAYS belongs to the CAMERA-NEAR thigh and must follow that leg, not remain on whichever thigh points forward. The plain far thigh has no strap.
Bottom row cell1: the FAR PLAIN leg extends forward RIGHT and its boot contacts floor; the STRAPPED CAMERA-NEAR thigh angles backward LEFT, knee flexing behind the hip, near boot behind/left. The strapped rearward thigh overlaps in front of the plain forward thigh at hip.
Bottom row cell2: the FAR PLAIN leg remains forward and compresses under body weight; STRAPPED NEAR leg lifts behind and starts swinging forward. Strap is on the BACK/LEFT thigh, not the planted right leg.
Bottom row cell3: FAR PLAIN support foot now under hip, STRAPPED NEAR knee passes it FORWARD, thigh raised to RIGHT; nearest strapped shin folds under that raised knee, distinct bent-knee passing pose.
Bottom row cell4: FAR PLAIN leg pushes off BACK LEFT, STRAPPED NEAR leg reaches FORWARD RIGHT in air, ready to contact in top-left cell. All limbs retain their identities.
Correct the overlapping thigh/knee contours, not merely shift or mirror the entire sprite. The point is that the PLAIN leg is forward/weight-bearing in the first two BOTTOM cells while the STRAPPED leg is trailing, unlike the first two TOP cells. Two legs and two boots in each frame. Keep square cells and all art fully inside each cell with a small transparent margin. No labels, no text, no floors, no shadows.

## 第5帧接触位修正

Use image 1 as EDIT TARGET: a transparent 4x2 running sprite sheet. Image 2 is a SUPPORTING POSE REFERENCE only. Change ONLY the BOTTOM LEFT cell (frame5) of image1. Keep its other seven frames, grid, sizes and transparent background unchanged.
Frame5 incorrectly repeats the strapped leg in front. Replace ONLY that cell's leg anatomy with the correct OPPOSITE leg support clearly depicted in image2 BOTTOM RIGHT panel "FAR CONTACT": the thigh with the small gold-buckle strap goes BACKWARD LEFT, its knee bent and its boot lifted behind the body. The other PLAIN thigh without any strap goes FORWARD RIGHT, boot on floor bearing weight. The strapped rearward thigh lies in front at the overlap because it is nearer the camera. Follow that actual pose from image2, not the incorrect legs in image1.
Keep frame5's head, torso, hair, bow, scale, outfit, location, skirt style and right-facing direction from image1. Only redraw the two legs and minimal skirt overlap needed to reveal them. The entire forward/right leg must have NO thigh strap; the strap must be visibly on the back/left thigh. Two legs total, same black tights and ankle boots, correct connected hips/knees/ankles, no mirroring. No text, no ground, no extra panels. Ensure all sprite parts fit the existing cell.

## 单箭普攻

Use case: stylized-concept. Generate a genuine animation SPRITE SHEET for a single-arrow basic bow attack of the original ADULT female hunter in the reference. EXACTLY EIGHT successive DISTINCT frames, FOUR equal square columns by TWO equal rows, 2:1 canvas, row-major order. No text, labels, numbers, grids, scenery, ground, cast shadows, HUD or magic. True transparent background with ample equal margins in every cell.
Keep identical mature woman identity and pixel style: chestnut braided high ponytail/teal tie, teal and ivory fitted gold-trimmed bodice, short cape, bare midriff, opaque navy shorts, slit teal skirt panels, continuous semi-sheer BLACK TIGHTS, one thin upper-thigh strap, black ANKLE lace-up combat boots, back quiver, one wood/brass recurve bow. Compact roughly four-head-high game proportions, adult face. Left hand holds bow, right hand nocks/draws/releases. Fixed right-facing game camera; same body scale, head size, limb lengths and foot locations in every frame. Common horizontal hip center at 43% cell width, common floor at 86% cell height. Both feet remain planted in a stable side-on shooting stance. Never turn or zoom.
Frame1: READY, bow lowered diagonal forward in LEFT hand, RIGHT hand starting to reach toward quiver.
Frame2: TAKE ARROW, RIGHT hand at shoulder/back quiver visibly taking a single feathered arrow, LEFT hand begins raising bow.
Frame3: NOCK, bow nearly upright ahead to RIGHT, RIGHT hand brings arrow tail onto central string at chest level.
Frame4: DRAW HALF, LEFT bow arm extends right, RIGHT hand draws nocked arrow/string toward face, clearly bent triangular string, arrow points RIGHT.
Frame5: FULL DRAW, LEFT arm extended holding vertical bow to RIGHT, RIGHT fingers at cheek, bow limbs flexed, one nocked arrow horizontal right, maximum recognizable anticipation.
Frame6: RELEASE, RIGHT hand snaps back slightly near ear and fingers open, string visibly springs near straight; NO ARROW LEFT ON THE BOW. Do NOT draw a flying arrow anywhere on sheet: in game the separate projectile will spawn exactly at this frame.
Frame7: FOLLOW THROUGH, bow arm still forward but begins to settle, string straight, RIGHT hand relaxes behind cheek, no second arrow appears.
Frame8: RECOVER, bow lowers to match frame1, RIGHT hand returns to chest ready to reach for the next arrow, no extra nocked arrow.
The nocked arrow exists only in frames2-5; absolutely no arrow on string in frames6-8. No continuous permanently drawn bow in every frame. Keep bowstring and correct hands readable. No recoil like a firearm. Hair and cape minimal lag. Generous right margin keeps complete bow tips and arrowhead inside cells. Clean chunky pixel clusters and stepped edges, controlled palette matching reference, no glossy painted gradients. All 8 frames must have stable stationary feet and recognizable changing arm/bow poses, not eight copies.
