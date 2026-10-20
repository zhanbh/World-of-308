"""Current asset bodies + segmented hits + confirmed 2x haste cap.
Keeps old default model reproducible; new results explicitly label timing basis.
"""
import json
import math
import statistics
from dungeon_budget_trial import run
from haste_ceiling_trial import current_body_times
from weapon_synergy_validation import build


def main():
    body,basic=current_body_times()
    rows=[]
    for level,mode in [(1,'starter'),(5,'starter'),(10,'starter'),(10,'blue'),(15,'starter'),(15,'blue')]:
        for timing in ['old_model','current_assets']:
            for profile in ['normal','pressure']:
                results=[run(level,profile,seed,mode_override=mode,control_mode='flinch',segmented=True,
                             boss_policy='window',body_times=body if timing=='current_assets' else None)
                         for seed in range(20)]
                completed=[r for r in results if r['success']]
                rows.append(dict(level=level,gear=mode,timing=timing,profile=profile,
                    clears=len(completed),samples=20,
                    median_seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                    hp_pots_mean=statistics.mean(r['hp_pots'] for r in results),
                    mp_pots_mean=statistics.mean(r['mp_pots'] for r in results),
                    net_mean=statistics.mean(r['net_replacement'] for r in results)))
    # Test fixture with hypothetical +100 percentage-point buff; not a current
    # item template or actual playable permanent build.
    capped=build(30,'purple',haste_bonus=1)
    assert capped['haste']==1 and capped['basic_cycle_time']==.5
    saturated=build(30,'purple',haste_bonus=100)
    assert saturated==capped
    normal=build(30,'purple')
    assert math.isclose(normal['haste'],.45)
    assert capped['ap']==normal['ap'] and capped['skills']['cross']['direct']==normal['skills']['cross']['direct']
    assert math.isclose(capped['skills']['cross']['cd'],2.7)
    # Old deliberate model branch remains a historical reference.
    assert run()['seconds']==156
    stress=run(10,'normal',0,mode_override='blue',control_mode='flinch',segmented=True,
               boss_policy='window',body_times=body,haste_bonus=1)
    print(json.dumps(dict(body_times=body,results=rows,cap_fixture=stress,
          checks='PASS: unified q2 cap, no overflow from huge bonus, normal q1.45 retained, cast budget invariant, legacy default replay',
          limitations=['20 fixed seeds, stop at first lethal hit; not a real-player completion rate.',
            'Current bodies + staged hit schedules; no spatial AI, input/animation quality or frame-rate verification.',
            'New sources are capped at cast; already scheduled old snapshots unchanged.',
            'Blue gear at 10/15 is a comparison fixture, not guaranteed drops.',
            'Old stress profile assumptions and candidate monster/potion/economy parameters remain.']),indent=2))

if __name__=='__main__':main()
