"""Current bodies, on-hit-only DoT, independent per-segment player hit rolls.
Enemy attack avoidance RNG is separate. Design fixture, not production AI.
"""
import json
import math
import statistics
from dungeon_budget_trial import run
from haste_ceiling_trial import current_body_times
from weapon_synergy_validation import build


def main():
    body,_=current_body_times();rows=[]
    for level,gear in [(1,'starter'),(5,'starter'),(10,'starter'),(10,'blue'),(15,'starter'),(15,'blue')]:
        for profile in ['normal','pressure']:
            for fixture in ['guaranteed','balanced_hit','hit_affixes']:
                if gear=='starter' and fixture=='hit_affixes':continue
                results=[run(level,profile,seed,mode_override=gear,control_mode='flinch',segmented=True,
                         boss_policy='window',body_times=body,
                         player_hit_mode='per_segment',
                         enemy_evasion={k:0 for k in ['melee','ranged','boar','elite','boss']} if fixture=='guaranteed' else None,
                         hit_affixes=fixture=='hit_affixes') for seed in range(100)]
                completed=[r for r in results if r['success']]
                rows.append(dict(level=level,gear=gear,profile=profile,fixture=fixture,
                         samples=len(results),clears=len(completed),
                         median_seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                         hp_pots=statistics.mean(r['hp_pots'] for r in results),
                         mp_pots=statistics.mean(r['mp_pots'] for r in results),
                         mean_knockdowns=statistics.mean(r['knockdowns'] for r in results),
                         observed_miss_fraction=sum(r['hit_misses'] for r in results)/max(1,sum(r['hit_attempts'] for r in results)),
                         net_mean=statistics.mean(r['net_replacement'] for r in results)))
    plain=build(10,'blue');hit=build(10,'blue',hit_affixes=True)
    assert hit['hit_score']>plain['hit_score'] and hit['haste']<plain['haste'] and hit['crit']<plain['crit']
    assert hit['ap']==plain['ap']
    evasion_all={k:2 for k in ['melee','ranged','boar','elite','boss']}
    never=run(1,'normal',0,body_times=body,segmented=True,player_hit_mode='per_segment',enemy_evasion=evasion_all,max_seconds=5)
    assert never['hit_attempts']==never['hit_misses'] and never['dot_ticks']==0 and never['gross']==0
    assert run()['seconds']==156
    print(json.dumps(dict(results=rows,checks='PASS: real secondary replacement, on-miss no bleed/kill income, separate RNG, legacy replay',
       limitations=['100 seeds per scenario, first-lethal truncation; not real player rates.',
                    'Candidate base hit score 1, enemy evasion normal5%/elite8%/boss10%.',
                    'Hit-affix fixture replaces weapon haste and earring crit; rating coefficient .5pp per rating candidate.',
                    'Hit-score snapshot is a model convention; target evasion evaluated at each contact.',
                    'No coordinate geometry, crit RNG variance, persistence, or revival economic path.']),indent=2))

if __name__=='__main__':main()
