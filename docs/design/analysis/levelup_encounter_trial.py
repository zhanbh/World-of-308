"""XP/refill in existing seven-room model; old spatial limitations still apply."""
import json
import statistics
from first_dungeon_sync_trial import run
from progression_award_trial import challenge_awards
from haste_ceiling_trial import current_body_times


def main():
    body,_=current_body_times();rows=[]
    for level,gear in [(1,'starter'),(5,'starter'),(10,'starter'),(10,'blue'),(15,'starter')]:
        for enabled,fraction in [(False,0),(True,0),(True,.95)]:
            results=[run(level,seed=seed,mode_override=gear,control_mode='flinch',segmented=True,
                body_times=body,player_hit_mode='per_segment',purple_room=seed%6,
                progression=enabled,xp_fraction=fraction) for seed in range(60)]
            completed=[r for r in results if r['success']]
            if enabled:
                assert all(r['progression']['locked_monster_level']==level for r in results)
                assert all(r['progression']['held_weapon_level']=={1:10,5:15,10:20,15:25}[level] for r in results)
                assert all(r['progression']['earned_xp']==sum(challenge_awards(level)) for r in completed)
            rows.append(dict(level=level,gear=gear,enabled=enabled,xp_fraction=fraction,samples=60,clears=len(completed),
                seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                hp_pots=statistics.mean(r['hp_pots'] for r in results),
                mp_pots=statistics.mean(r['mp_pots'] for r in results),
                net=statistics.mean(r['net_replacement'] for r in results),
                final_levels=sorted(set(r['progression']['level'] for r in results)) if enabled else [level]))
    assert run(progression=False)==run()
    first=run(1,seed=0,mode_override='starter',control_mode='flinch',segmented=True,
        body_times=body,player_hit_mode='per_segment',progression=True)
    assert first['progression']['level']==2 and first['progression']['quality']=='white'
    assert first['progression']['held_weapon_level']==10
    print(json.dumps(dict(results=rows,first_run=first,
        checks='PASS: entry level lock, XP/purple budget, no automatic gear upgrades, immutable queued cast/CD state on level-up, default equivalence',
        limitations=['Candidate existing XP table and 4-minute fixed XP budget, not final XP rewards.',
            '15 groups/900 fixed seeds; no real player completion rate.',
            'Existing first-lethal cutoff, no revival/death residual state; no full career battle simulation.',
            'Potion/gear tier fixed on entry; milestone mail generated but never auto-claimed/equipped.',
            'Coordinates/new enemy nodes/group coordination are independent models, not combined into this old seven-room model.',
            'Inherits expected crit, random avoidance, abstract attack duty and old monster/price parameters.',
            'No per-hit actual input replays, sustained farming, fatigue waiting or town overhead.']),indent=2))

if __name__=='__main__':main()
