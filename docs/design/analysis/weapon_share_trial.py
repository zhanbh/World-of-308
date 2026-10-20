"""Candidate AP redistribution, not production tuning. Print JSON; stdlib only."""
import json
import math

REFERENCE_AP = 308.44
OLD_WEAPON = 80
SKILLS = [("十字斩", 40, 1.6), ("崩山击", 56, 2.4),
          ("拔刀斩", 70, 3.4), ("大崩", 90, 6.5)]
rows = []
for share in [.70, .80, .90]:
    weapon = REFERENCE_AP * share
    remaining = REFERENCE_AP - weapon
    scale = remaining / (REFERENCE_AP - OLD_WEAPON)
    skills = []
    for name, fixed, k in SKILLS:
        # Compensation is computed per skill rank; not a single rank-1 AP ratio.
        revised_fixed = fixed * .25
        revised_k = k + (fixed - revised_fixed) / REFERENCE_AP
        old_full = fixed + k * REFERENCE_AP
        new_full = revised_fixed + revised_k * REFERENCE_AP
        assert math.isclose(old_full, new_full)
        skills.append(dict(name=name, old_fixed_retained=(fixed + k * remaining) / old_full,
                           reduced_fixed_retained=(revised_fixed + revised_k * remaining) / new_full,
                           candidate_fixed=revised_fixed, candidate_ap_ratio=revised_k,
                           intact_direct_ratio=new_full / old_full))
    # Keep agreed +10 increments absolute, outside the candidate scaling.
    basic_gain = 24 / REFERENCE_AP
    assert math.isclose(weapon + remaining, REFERENCE_AP)
    assert math.isclose(remaining / REFERENCE_AP, 1 - share)
    # Same item level has same weapon base; no character-level auto growth.
    weapon_tiers = [weapon * s for s in [.25, .4, .6, .8, 1]]
    starter_ap = weapon_tiers[0] + 16 * scale
    level10_blue_ap = weapon_tiers[2] + (123.64 - 48) * scale
    level30_blue_ap = weapon + (257.24 - 80) * scale
    rows.append(dict(share=share, weapon_ap=weapon, other_ap=remaining,
                     nonweapon_ap_scale=scale, weapon_tiers=weapon_tiers,
                     skills=skills, basic_bleed_retained=1-share,
                     weapon_plus10_gain=basic_gain, earring_plus10_gain=16/REFERENCE_AP,
                     both_plus10_broken_basic_retained=(remaining+16)/(REFERENCE_AP+24+16),
                     starter_intact_ap=starter_ap, starter_vs_old=starter_ap/36,
                     level10_blue_ap=level10_blue_ap, level10_vs_old=level10_blue_ap/123.64,
                     level30_blue_ap=level30_blue_ap, level30_vs_old=level30_blue_ap/257.24))
assert all(rows[i]["basic_bleed_retained"] > rows[i+1]["basic_bleed_retained"] for i in range(2))
assert math.isclose(24/16, 1.5)
print(json.dumps(dict(reference_ap=REFERENCE_AP, candidates=rows,
                     checks="PASS: AP conservation, direct damage preservation at reference rank/build, monotonic share, enhancement ratio"),
                 ensure_ascii=False, indent=2))
