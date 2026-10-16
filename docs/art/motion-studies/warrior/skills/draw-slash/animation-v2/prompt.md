Mode: built-in image_gen, transparent_background=true.

Use case: precise-object-edit. Asset: replace only our DRAW SLASH animation with an approved SINGLE-SWORD variant with a visible charge hold.
Input image1 is the edit target: old 12-frame draw-slash sprite sheet. Input image2 is identity reference only. Preserve original warrior identity, black ponytail red ribbon, navy-white-gold armor coat, red sash, chunky steel sword with gold guard, sharp pixel-art density and body proportions. Change ONLY draw-slash action, not outfit.
CRITICAL WEAPON RULE: exactly ONE sword in EVERY one of all12 poses. Delete the extra off-hand sword completely. One hand grips the SINGLE lead sword throughout; other hand is visibly EMPTY and helps counterbalance torso. Never two-hand grip, never extra blade, never scabbard, never two swords at start/end. The game restores the normal dual-sword guard AFTER this action, so ALL12 source frames must remain SINGLE SWORD.
Composition: 4 columns x3 rows, chronological left-to-right then down, 12 equal square cells. Landscape4:3 sheet, suggested1024x768. Real transparent alpha, NO colored tile backgrounds, no text, no grid, no ground shadow, no floor. Fixed RIGHT-facing3/4 side camera. Maintain stable scale, planted boots at80% of each cell height and centered50%. Whole sprite and sword fully inside each cell with generous blank gutters, no blade or hair crossing cell boundaries.
Sequence:
1 single-sword ready, off-hand empty close to torso.
2 lower hips, bend knees, turn shoulders BACK, pull single blade horizontally toward REAR SIDE WAIST.
3 clear fully wound-up CHARGE POSE: compressed knees, tight waist twist away from right-facing target, sword held at rear hip/waist, empty hand tucked near body. This pose will be HELD FOR200ms. Make intent to explode into a slash very readable, not a standing sword pose.
4 same low coil at moment just before release, subtle cloth tension.
5 hips start uncoiling, single sword still follows waist.
6 explosive shoulder/waist-led HORIZONTAL slash starts, empty hand counterbalances behind torso.
7 strongest single-sword horizontal slash toward RIGHT across chest-waist, arm follows a broad sideways sweep, not a straight fencing thrust.
8 wide rightward horizontal follow-through, torso rotated.
9 HOLD the end pose with sword extended to the side-right.
10 recover torso and sword with feet planted.
11 almost upright recovery, ONE sword only, other hand EMPTY.
12 single-sword neutral guard, ONE sword only; do not restore second blade within sheet.
Short pale-cyan blade-edge motion streak only on6/7, no gigantic crescent or circle baked into sprites, no charge particle effect. Stage effects rendered separately. Strong speed contrast: low compressed preparation vs fast swing vs held recovery. Correct anatomy and hand ownership, no disconnected floating sword, no ghosts or neighboring sprite fragments. Do not copy any DNF game character sprite.
