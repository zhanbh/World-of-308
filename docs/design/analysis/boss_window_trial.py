"""Confirmed window-control direction, candidate timing/threshold comparisons."""
import json
import statistics
from dungeon_budget_trial import run
rows=[]
for level in [1,5,10,15]:
    for policy in ['immune','damage_window','window']:
        results=[run(level,'pressure',seed,mode_override='starter',control_mode='flinch',
                     segmented=True,boss_policy=policy) for seed in range(20)]
        cleared=[r for r in results if r['success']]
        rows.append(dict(level=level,policy=policy,clears=len(cleared),
             hp_pots=statistics.mean(r['hp_pots'] for r in results),
             median_seconds=statistics.median(r['seconds'] for r in cleared) if cleared else None,
             mean_knockdowns=statistics.mean(r['knockdowns'] for r in results)))
assert run()['seconds']==156
print(json.dumps(dict(results=rows,checks='PASS: candidate boss policies execute; legacy default unchanged',
      notes=['P2 every 3 attacks gives 3s/+20% window: candidate, not confirmed numbers.',
             'Enemy recovery after knockdown restarts full attack interval: still a model assumption.',
             'No real coordinates/telegraphs or paid revive path; stop at first lethal hit.']),indent=2))
