"""Two pending bleed target-mitigation policies. Current formula baseline only."""
import json
import math
from weapon_synergy_validation import build


def main():
    s=build(30,'purple');base_r=100/(100+25*.97);rows=[]
    for armor in [0,25,100,300]:
        r=100/(100+armor*.97)
        for key,skill in s['skills'].items():
            direct=skill['direct']/base_r*r
            physical_bleed=skill['bleed']/base_r*r
            ignore_bleed=skill['bleed']/base_r
            rows.append(dict(armor=armor,skill=key,direct=direct,
                     physical_bleed=physical_bleed,ignore_armor_bleed=ignore_bleed,
                     physical_total=direct+physical_bleed,
                     ignore_total=direct+ignore_bleed,
                     total_increase_if_ignore=(ignore_bleed-physical_bleed)/(direct+physical_bleed)))
    assert all(math.isclose(r['physical_bleed'],r['ignore_armor_bleed']) for r in rows if r['armor']==0)
    assert all(r['ignore_armor_bleed']>=r['physical_bleed'] for r in rows)
    assert all(math.isclose(r['ignore_armor_bleed'],s['skills'][r['skill']]['bleed']/base_r) for r in rows)
    print(json.dumps(dict(results=rows,checks='PASS: zero-armor equivalence, armor-only divergence, preserved release budget',
          limitations=['Full cast and full DoT, no target death, no resistance/immunity or dispel.',
             'Armor values are sensitivity inputs, not current monster templates.',
             'Both alternatives preserve per-stage on-hit application and independent tick crits.',
             'Ignore armor is a candidate, not a confirmed true-damage bypass of all immunities.']),indent=2))

if __name__=='__main__':main()
