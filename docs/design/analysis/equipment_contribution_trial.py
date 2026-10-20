"""Paired design fixtures; blue upgrade changes affixes, not weapon base tier.
Print JSON, no game writes. Seeds pair scenarios, not individual RNG outcomes.
"""
import json
import math
import statistics
import os
import subprocess
import sys
from pathlib import Path
from weapon_synergy_validation import build, schedule, ALL
from weapon_synergy_trial import ARMOR
from first_dungeon_sync_trial import run
from haste_ceiling_trial import current_body_times


def profiles():
    return {
        'starter': {'weapon':'starter'},
        'weapon_blue': {'weapon':'blue'},
        'armor_blue': {'weapon':'starter', **{k:'blue' for k in ARMOR}},
        'weapon_armor_blue': {k:'blue' for k in ARMOR|{'weapon'}},
        'other_blue': {'weapon':'starter', **{k:'blue' for k in ALL-ARMOR-{'weapon'}}},
        'full_blue': {k:'blue' for k in ALL},
    }


def main():
    body,_=current_body_times(); rows=[]; interactions=[]
    for level in [1,5,10,15]:
        cases={}
        assert build(level,'blue',slot_modes=profiles()['full_blue'])==build(level,'blue')
        assert build(level,'blue',slot_modes=profiles()['starter'])==build(level,'starter')
        for name,slots in profiles().items():
            stats=build(level,'blue',slot_modes=slots)
            for skill,v in stats['skills'].items(): v['cast']=body[skill]/(1+stats['haste'])
            damage=schedule(stats)['damage']
            results=[run(level,seed=seed,mode_override='blue',slot_modes=slots,
                control_mode='flinch',segmented=True,body_times=body,
                player_hit_mode='per_segment',purple_room=seed%6) for seed in range(60)]
            completed=[r for r in results if r['success']]
            assert all(r['monsters']==28 for r in results)
            cases[name]=dict(level=level,profile=name,ap=stats['ap'],hp=stats['hp'],armor=stats['armor'],
                effective_hp=stats['hp']*(1+stats['armor']/100),damage_60s=damage,
                clears=len(completed),samples=len(results),
                seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                hp_pots=statistics.mean(r['hp_pots'] for r in results),
                repair=statistics.mean(r['repair_this_run'] for r in results),
                net=statistics.mean(r['net_replacement'] for r in results))
            if name=='starter':
                assert results[0]==run(level,seed=0,mode_override='starter',control_mode='flinch',
                    segmented=True,body_times=body,player_hit_mode='per_segment')
        base=cases['starter']
        for c in cases.values():
            c['damage_ratio']=c['damage_60s']/base['damage_60s']
            c['effective_hp_ratio']=c['effective_hp']/base['effective_hp']
            rows.append(c)
        # Interaction for the four-state weapon x armor factorial, not additive attribution.
        interactions.append(dict(level=level,damage_interaction=
            cases['weapon_armor_blue']['damage_60s']-cases['weapon_blue']['damage_60s']-
            cases['armor_blue']['damage_60s']+base['damage_60s']))
    code="import json;from weapon_synergy_validation import build;print(json.dumps([build(l,'blue') for l in [1,5,10,15,30]],sort_keys=True))"
    replays=[subprocess.check_output([sys.executable,'-B','-c',code],cwd=Path(__file__).parent,
        env={**os.environ,'PYTHONHASHSEED':str(seed)},text=True) for seed in [0,1,42,123]]
    assert all(v==replays[0] for v in replays)
    print(json.dumps(dict(results=rows,interactions=interactions,
        checks='PASS: full/starter builder equivalence, starter encounter equivalence, 28 enemies, cross-process hash-seed replay',
        limitations=['Same item-level weapon base AP at each level; weapon-blue means affix upgrade, not a higher-level weapon.',
            'Other-blue groups jewelry, special slots and trinket; no active trinket buff or purple sets.',
            'Effective HP is only versus armor-reducible damage, no healing or enemy penetration.',
            'Stationary 60s expected-crit schedule is separate from encounter model.',
            'Full early blue equipment is a sensitivity fixture, not guaranteed or a recommended progression path.',
            'Inherits v10 temporal/geometry/AI/experience/potion inventory limitations.']),indent=2))

if __name__=='__main__': main()
