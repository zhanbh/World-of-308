"""Compare candidate Boss HP vs recovery adjustments in the unified spatial model."""
import json
import statistics
from spatial_growth_encounter_trial import run


def main():
    rows=[]
    options=[('melee_baseline',1,0,False),('ranged_counter',1,0,True),('recovery_plus_0.5',1,.5,False),('boss_hp_80pct',.8,0,False)]
    for level,gear in [(1,'starter'),(10,'starter'),(15,'starter'),(10,'blue')]:
        for label,hp,recovery,policy in options:
            samples=[run(level,gear,seed,boss_hp_scale=hp,boss_recovery_bonus=recovery,ranged_counter=policy) for seed in range(6)]
            completed=[r for r in samples if r['success']]
            rows.append(dict(level=level,gear=gear,candidate=label,samples=6,clears=len(completed),
                median_seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                median_boss_seconds=statistics.median(r['room_seconds'][-1] for r in completed) if completed else None,
                hp_pots=statistics.mean(r['hp_pots'] for r in samples),mp_pots=statistics.mean(r['mp_pots'] for r in samples),
                recovery_casts=statistics.mean(r['recovery_casts'] for r in samples),
                net=statistics.mean(r['net'] for r in samples)))
    assert run(seed=0)==run(seed=0,boss_hp_scale=1,boss_recovery_bonus=0)
    print(json.dumps(dict(results=rows,checks='PASS:96 candidate traces, default equivalence; per-run state/snapshot/boundary invariants',
        limitations=['Only6 seeds per candidate, expected crit/scripted AI, not real player trial or optimal policy.',
            'Recovery+0.5s changes body/weakness duration only, not windup, contact nodes or start-based cooldowns.',
            'HP80% changes Boss HP only; no reward increase, weapon buff or minion HP adjustment.',
            'New nodes/AI remain provisional; higher-level fixtures assume entry-level potion stock.',
            'Comparisons are design sensitivity, not final approved difficulty configuration.']),indent=2))

if __name__=='__main__':main()
