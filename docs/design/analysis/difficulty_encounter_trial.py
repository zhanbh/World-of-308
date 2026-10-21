"""First candidate difficulty behavior probe; controlled gear, not reward/economy proof."""
import copy
import argparse
import json
import statistics
from pathlib import Path
from first_dungeon_supply_path_trial import WEAR,POTION,TIER,reference
from spatial_growth_encounter_trial import run


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--pressure',action='store_true')
    parser.add_argument('--ablations',action='store_true')
    parser.add_argument('--formation',action='store_true')
    parser.add_argument('--reaction-delay',type=float,default=0)
    parser.add_argument('--reaction-clock',choices=('set','per_hazard'),default='set')
    parser.add_argument('--interrupt-candidate',action='store_true')
    parser.add_argument('--target-hold',type=float,default=0)
    parser.add_argument('--spawn-layout',choices=('front','split_probe'),default='front')
    parser.add_argument('--legacy-approach',action='store_true')
    parser.add_argument('--roles',action='store_true')
    parser.add_argument('--policy-override',choices=('burst','mixed3_safe','basic_only'))
    parser.add_argument('--output',type=Path,default=Path(__file__).parent/'results/difficulty-encounter-v34.json')
    args=parser.parse_args()
    assert not args.ablations or args.pressure
    assert not args.formation or (args.pressure and not args.ablations)
    profiles=(None,'adventure','warrior','king') if args.pressure else ('adventure','warrior','king')
    if args.ablations:profiles=(None,'cadence_only','slow_flank')
    if args.formation:profiles=(None,'warrior','formation_commit')
    assert not args.roles or (args.pressure and not args.formation and not args.ablations)
    role_config=json.loads((Path(__file__).parent/'enemy-role-candidates-v1.json').read_text(encoding='utf-8')) if args.roles else None
    source=Path(__file__).parent/'results/first-dungeon-one-minute-path-v31.json'
    careers=json.loads(source.read_text(encoding='utf-8'))['traces']
    traces=[]
    for career in careers:
        if career['seed']>=6:continue
        if args.policy_override and career['policy']!='burst':continue
        policy=args.policy_override or career['policy']
        for level in (10,14):
            i=next(i for i,r in enumerate(career['path']) if r['entry_level']==level)
            worn=copy.deepcopy(career['path'][i-1]['worn']);tier=TIER(level)
            context=dict(xp=0,loadout=worn,durability={k:v['durability']['current'] for k,v in worn.items() if k in WEAR},
                enemy_reference=reference(level),hp_restore=POTION[tier][0],mp_restore=POTION[tier][1],hp_count=8,mp_count=8)
            for profile in profiles:
                scale=.5 if profile=='king' and not args.pressure else .2
                r=run(level=level,gear='blue',seed=career['seed']*1000+career['path'][i]['run']-1,
                    campaign=copy.deepcopy(context),skill_policy=policy,boss_hp_scale=scale,behavior_profile=profile,observe=args.pressure,reaction_delay=args.reaction_delay,
                    reaction_clock=args.reaction_clock,interrupt_overrides={'ranged':('down',),'charge':('down',)} if args.interrupt_candidate else None,target_hold=args.target_hold,spawn_layout=args.spawn_layout,reachable_approach=not args.legacy_approach,role_config=role_config)
                traces.append(dict(profile=profile,level=level,seed=career['seed'],policy=policy,scale=scale,
                    success=r['success'],timeout=r['timeout'],seconds=r['seconds'],boss_seconds=r['room_seconds'][-1] if len(r['room_seconds'])==7 else None,
                    hp_pots=r['hp_pots'],mp_pots=r['mp_pots'],time_budget=r['time_budget'],room_metrics=r['room_metrics'],worn=worn,
                    **({'telemetry':r['telemetry'],'damage_taken':r['damage_taken'],'cancelled_casts':r['cancelled_casts']} if args.pressure else {}),
                    **({'source_policy':career['policy']} if args.policy_override else {})))
            print(f"{policy}/{career['seed']}/L{level} done",flush=True)
    summaries=[]
    for profile in profiles:
        for level in (10,14):
            for policy in sorted({r['policy'] for r in traces}):
                rows=[r for r in traces if (r['profile'],r['level'],r['policy'])==(profile,level,policy)]
                assert len(rows)==6
                done=[r for r in rows if r['success']]
                summaries.append(dict(profile=profile,level=level,policy=policy,samples=6,clears=len(done),
                    median_boss=statistics.median(r['boss_seconds'] for r in done) if done else None,
                    max_boss=max((r['boss_seconds'] for r in done),default=None),
                    over60=sum(r['boss_seconds']>60 for r in done),mean_hp=statistics.mean(r['hp_pots'] for r in rows),
                    mean_mp=statistics.mean(r['mp_pots'] for r in rows)))
    output=dict(summaries=summaries,traces=traces,limitations=[
        '72 controlled trials: six seeds/two policies/two levels/three profiles, not full difficulty acceptance.',
        'v31 acquired entry gear; reset XP0 and eight current-tier pots each; no continuous cash, reward or difficulty unlock replay.',
        'Chase/flank/retreat, cooldown scales, concurrency and HP profiles are explicit engineering candidates, not approved tuning.',
        'Independent flank targets are a simple local heuristic, not a tactical planner; retreat sweeps bounds and may shoot at walls.',
        'No extra enemy damage/XP/drop multiplier invented; these remain unverified. Expected crit and scripted player, no real device.'])
    output['pressure_control']=args.pressure
    output['reaction_delay']=args.reaction_delay
    output['reaction_clock']=args.reaction_clock
    output['interrupt_candidate']=args.interrupt_candidate
    output['target_hold']=args.target_hold
    output['spawn_layout']=args.spawn_layout
    output['reachable_approach']=not args.legacy_approach
    output['role_config']=role_config
    output['policy_override']=args.policy_override
    output['limitations'][0]=f'{len(traces)} controlled trials: six seeds/{len({r["policy"] for r in traces})} player policies/two levels/{len(profiles)} profiles, not full difficulty acceptance.'
    if args.policy_override:output['limitations'].append('Policy override inherits burst-career acquired entry gear, not an acquisition career generated by the override policy.')
    p=args.output
    with p.open('w',encoding='utf-8',newline='\n') as f:json.dump(output,f,ensure_ascii=False,indent=2)


if __name__=='__main__':main()
