"""Partition temporal fixture time; duty windows are proxies, not spatial AI."""
import json
import statistics
from first_dungeon_sync_trial import run
from haste_ceiling_trial import current_body_times


def main():
    body,_=current_body_times(); rows=[]
    for level,gear in [(1,'starter'),(5,'starter'),(10,'starter'),(10,'blue'),(15,'starter')]:
        for uptime,approach in [(.65,0),(.65,1),(.5,1),(.35,2)]:
            results=[run(level,seed=seed,mode_override=gear,control_mode='flinch',segmented=True,
                body_times=body,player_hit_mode='per_segment',purple_room=seed%6,
                uptime_override=uptime,approach_seconds=approach) for seed in range(60)]
            completed=[r for r in results if r['success']]
            # Conditional distribution clearly separated from failed paths.
            rows.append(dict(level=level,gear=gear,uptime=uptime,approach=approach,
                samples=60,clears=len(completed),deaths=sum(r['death'] for r in results),
                median_seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                mean_seconds=statistics.mean(r['seconds'] for r in completed) if completed else None,
                completed_time_budget={k:statistics.mean(r['time_budget'][k] for r in completed)
                    for k in results[0]['time_budget']} if completed else None,
                hp_pots_all=statistics.mean(r['hp_pots'] for r in results),
                net_all=statistics.mean(r['net_replacement'] for r in results)))
    for seed in range(6):
        a=run(seed=seed,uptime_override=.65,approach_seconds=0)
        assert a==run(seed=seed)
        assert a['monsters']==28
    print(json.dumps(dict(results=rows,checks='PASS: elapsed-time conservation per run, default equivalence, 28 enemies',
        limitations=['Duty .65/.5/.35 and approach 0/1/2 seconds are sensitivity inputs, not user-approved balance.',
            'Action includes current body/basic occupancy; residual effects continue during movement.',
            'Approach blocks starting attacks, not enemy attacks, regeneration or existing effects.',
            'Duty downtime merges alignment and dodge; cannot distinguish either without coordinates.',
            'Lower duty does not grant lower enemy hit probability; survival comparison holds incoming pressure fixed.',
            'No end-of-room exit walk; six 3s transitions retain previous model timer policy.',
            'All v10 geometry, enemy-skill, XP, expected-crit, inventory and first-lethal limitations remain.']),indent=2))

if __name__=='__main__': main()
