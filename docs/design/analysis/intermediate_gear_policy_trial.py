"""Design-only legal intermediate gear fixtures, not a loot-acquisition simulation."""
import argparse
import json
from pathlib import Path
from basic_skill_policy_trial import summarize
from spatial_growth_encounter_trial import run
from weapon_synergy_validation import build

ARMOR=('chest','pants','belt','shoulder','boots')
OTHER=('bracelet','necklace','ring','auxiliary','stone','earring','trinket')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--seeds',type=int,default=12)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    assert 1<=args.seeds<=100
    fixtures={'two_armor':('chest','pants'),'five_armor':ARMOR,'other_seven':OTHER}
    rows=[];traces=[]
    for level in (10,15):
        ilvl={10:20,15:25}[level]
        for name,slots in fixtures.items():
            modes={'weapon':'starter',**{k:'blue' for k in slots}}
            stats=build(level,'blue',slot_modes=modes,item_level=ilvl,starter_quality='green')
            for policy in ('burst','mixed3_safe'):
                samples=[run(level=level,gear='blue',seed=seed,slot_modes=modes,skill_policy=policy) for seed in range(args.seeds)]
                for r in samples:
                    assert r['held_weapon_level']==ilvl
                    assert sum(m['mana_spent'] for m in r['room_metrics'])==r['mana_spent']
                    traces.append(dict(fixture=name,**{k:r[k] for k in ('level','gear','seed','skill_policy','success','seconds','rooms','mp_pots','hp_pots','net','mana_spent','cast_counts','room_metrics')}))
                rows.append(dict(level=level,fixture=name,slots=modes,policy=policy,
                    stats={k:stats[k] for k in ('ap','hp','mp','armor','haste')},**summarize(samples)))
                print(f'{level}/{name}/{policy}: {rows[-1]["clears"]}/{args.seeds}',flush=True)
    result=dict(results=rows,traces=traces,checks='PASS: held green weapon/item level, room mana accounting and underlying spatial invariants',
        limitations=['Same-level blue non-weapon slots are acquired fixture assumptions, not actual drops, time-to-acquire or bag/merchant cash flow.',
            'Green weapon retained in all fixtures; compares groups of slots, not AP alone or one affix isolated.',
            'Durability/repair count only actually worn eligible slots with green-weapon vs blue-armour prices; coefficients remain candidates.',
            'Only 10/15 first-dungeon checkpoints,12 seeds by default, expected crit and scripted policy; no real-player clear-rate claim.',
            'mixed3_safe is a strategy fixture, not an automated gameplay rule. No published balance/configuration change.'])
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':main()
