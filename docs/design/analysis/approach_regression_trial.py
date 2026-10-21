"""Reproduce the design-player wall stall and verify reachable approach destinations."""
import copy
import json
from pathlib import Path
from first_dungeon_supply_path_trial import WEAR,POTION,TIER,reference
from spatial_growth_encounter_trial import run,advance_to
from displacement_boundary_trial import sweep


def main():
    folder=Path(__file__).parent/'results'
    probe=json.loads((folder/'difficulty-spawn-layout-v41.json').read_text(encoding='utf-8'))
    failed=[r for r in probe['traces'] if not r['success']]
    assert len(failed)==1
    r=failed[0]
    careers=json.loads((folder/'first-dungeon-one-minute-path-v31.json').read_text(encoding='utf-8'))['traces']
    c=next(c for c in careers if (c['seed'],c['policy'])==(r['seed'],r['policy']))
    entry=next(e for e in c['path'] if e['entry_level']==r['level'])
    worn=r['worn'];tier=TIER(r['level'])
    context=dict(xp=0,loadout=worn,durability={k:v['durability']['current'] for k,v in worn.items() if k in WEAR},
        enemy_reference=reference(r['level']),hp_restore=POTION[tier][0],mp_restore=POTION[tier][1],hp_count=8,mp_count=8)
    args=dict(level=r['level'],gear='blue',seed=r['seed']*1000+entry['run']-1,skill_policy=r['policy'],
        behavior_profile='warrior',boss_hp_scale=.2,spawn_layout='split_probe',observe=True)
    old=run(**args,campaign=copy.deepcopy(context),reachable_approach=False,max_seconds=60)
    fixed=run(**args,campaign=copy.deepcopy(context))
    assert old['timeout'] and not old['death'] and fixed['success'] and fixed['seconds']<200
    assert fixed==run(**args,campaign=copy.deepcopy(context))
    for player,enemy,facing in [((-210,20),(-210,44),1),((210,20),(210,44),-1)]:
        unreachable=(enemy[0]-facing*30,enemy[1])
        assert advance_to(player,unreachable,1/120)==player
        reachable=sweep(enemy,(-facing*30,0))[0]
        assert advance_to(player,reachable,1/120)[1]>player[1]
    output=dict(old_60s=old,fixed=fixed,checks='PASS: legacy bounded stall, fixed clear and exact replay, both wall counterexamples; sweep semantics unchanged')
    with (folder/'approach-stall-regression-v42.json').open('w',encoding='utf-8',newline='\n') as f:
        json.dump(output,f,ensure_ascii=False,indent=2)
    print(output['checks'])


if __name__=='__main__':main()
