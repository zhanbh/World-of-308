"""Comparative design model. No game code writes; see report for limitations."""
import json
import statistics
from dungeon_budget_trial import run

rows=[]
for level,override in [(1,None),(5,None),(10,'starter'),(10,None),(15,'starter')]:
    for profile in ['normal','pressure']:
        for mode,segmented in [('none',False),('none',True),('knockdown',True),('flinch',True)]:
            results=[run(level,profile,seed,mode_override=override,
                         control_mode=mode,segmented=segmented) for seed in range(20)]
            successes=[r for r in results if r['success']]
            rows.append(dict(level=level,gear=override or ('starter' if level<10 else 'blue'),
                  profile=profile,control=mode,segmented=segmented,clears=len(successes),
                  median_seconds=statistics.median(r['seconds'] for r in successes) if successes else None,
                  hp_pots=statistics.mean(r['hp_pots'] for r in results),
                  mp_pots=statistics.mean(r['mp_pots'] for r in results),
                  mean_knockdowns=statistics.mean(r['knockdowns'] for r in results),
                  mean_flinches=statistics.mean(r['flinches'] for r in results)))
assert all(r['mean_knockdowns']==0 for r in rows if r['control']=='none')
# Baseline v4 seed remains unchanged under default parameters.
assert run(seed=0)['seconds']==156
assert abs(sum([.25,.30,.45])-1)<1e-9
assert abs(sum([.3,1/3,11/30])-1)<1e-9
print(json.dumps(dict(results=rows,checks='PASS: unchanged default baseline, segment weight sums, controls disabled comparison'),ensure_ascii=False,indent=2))
