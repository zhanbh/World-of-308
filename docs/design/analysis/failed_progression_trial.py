"""XP career including retained failed-run kills and active failure time.
Exogenous failure rate and fixed run time are stress inputs, not player predictions.
"""
import json
import math
import random
import statistics
from progression_award_trial import Character,challenge_awards

ROOMS=[['normal']*3,['normal']*5,['normal']*5,['normal']*4,
       ['elite']+['normal']*2,['normal']*6,['boss']]


def career(failure=.1,full_minutes=4,seed=0,town_seconds=45):
    rng=random.Random(seed);c=Character();attempts=clears=failures=0;battle=0.;xp_total=0
    while c.level<30:
        locked=c.level # Match second dungeon interval after15; map template is only a stress fixture.
        parts=challenge_awards(locked);ordinary=parts[0]
        rooms=[list(r) for r in ROOMS];rooms[rng.randrange(6)].append('purple')
        failed=rng.random()<failure
        fail_room=rng.choice([1,3,5,6]) if failed else None
        reached=7;time=full_minutes
        for ri,room in enumerate(rooms):
            count=rng.randrange(len(room)) if failed and ri==fail_room else len(room)
            for index,kind in enumerate(room[:count]):
                amount=parts[-2] if kind=='boss' else ordinary*(4 if kind=='elite' else 2 if kind=='purple' else 1)
                c.award(amount,(attempts,ri,index));xp_total+=amount
            if failed and ri==fail_room:
                reached=ri+1
                fraction=max(.3,(count+.5)/len(room))
                time=full_minutes*(ri+fraction)/7
                break
        if not failed:
            c.award(parts[-1],(attempts,'clear'));xp_total+=parts[-1];clears+=1
        else:failures+=1
        battle+=time;attempts+=1
        c.claim_best() # Policy at return only, not a new auto-equip rule.
        assert attempts<500 and reached<=7
    town=(attempts-1)*town_seconds/60
    return dict(attempts=attempts,clears=clears,failures=failures,battle_minutes=battle,
        town_minutes=town,active_hours=(battle+town)/60,awarded_xp=xp_total)


def main():
    rows=[]
    for failure in [0,.1,.2]:
        for duration in [3,3.5,4,5]:
            samples=[career(failure,duration,seed) for seed in range(60)]
            ordered=sorted(s['active_hours'] for s in samples)
            rows.append(dict(failure=failure,full_minutes=duration,samples=60,
                mean_attempts=statistics.mean(s['attempts'] for s in samples),
                mean_clears=statistics.mean(s['clears'] for s in samples),
                mean_failures=statistics.mean(s['failures'] for s in samples),
                active_median=statistics.median(ordered),active_p90=ordered[math.ceil(.9*len(ordered))-1],
                mean_battle_minutes=statistics.mean(s['battle_minutes'] for s in samples)))
    assert career(0,4,0)['attempts']==59
    assert math.isclose(career(0,4,0)['active_hours'],279.5/60)
    all_failed=career(1,4,3)
    assert all_failed['clears']==0 and all_failed['awarded_xp']>0 and all_failed['attempts']==all_failed['failures']
    assert career(.2,4,9)==career(.2,4,9)
    assert all(career(.2,4,seed)['failures']>0 for seed in range(10))
    print(json.dumps(dict(results=rows,checks='PASS: 720 careers, XP retention on failure, no failure clear reward, no-failure baseline, replay, active-time accounting',
        limitations=['Failure10/20% are imposed sensitivity rates, not simulated player success probabilities.',
            'All gameplay times fixed input, no feedback from gear, skills, refill or actual combat.',
            'R1-7 template extrapolated beyond15 only to stress XP accounting, not second-dungeon design completion.',
            'No probability decay, death residual, revive choice, stamina waiting, gear drops or repair/coin budget.',
            'Failed-room kills use deterministic list order plus randomized count; no actual kill timestamp.',
            'Only active play target measured; no guarantee every failure path falls within3-5h.']),indent=2))

if __name__=='__main__':main()
