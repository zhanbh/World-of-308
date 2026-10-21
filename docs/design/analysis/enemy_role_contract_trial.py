"""Validate a capability-based DESIGN role contract; no movement/AI outcome claim."""
import copy
import json
from pathlib import Path

ROOT=Path(__file__).parent


def validate_config(config):
    assert config['schemaVersion']==1 and config['status']=='analysis_candidate_not_release_config'
    assert set(config['difficulty'])=={'normal','adventure','warrior','king'}
    for role in config['roles'].values():
        assert isinstance(role['requires'],list) and all(isinstance(c,str) and c for c in role['requires'])
        assert len(role['requires'])==len(set(role['requires']))
    for budget in config['difficulty'].values():
        assert all(type(budget[k]) is int and budget[k]>=0 for k in ('maxFlankers','maxConcurrentRetreaters'))
    for actor in config['candidateAdapter'].values():
        assert actor['role'] in config['roles'] and compatible(actor,actor['role'],config)
        assert all(role in config['roles'] for role in actor['alternates'])


def compatible(actor,role,config):
    return set(config['roles'][role]['requires'])<=set(actor['capabilities'])


def assign_roles(actors,difficulty,config):
    assert len({a['id'] for a in actors})==len(actors)
    budget=config['difficulty'][difficulty]['maxFlankers']
    result={}
    for actor in sorted(actors,key=lambda a:a['id']):
        role=actor['role']
        assert compatible(actor,role,config)
        if budget and 'flanker' in actor['alternates'] and compatible(actor,'flanker',config):
            role='flanker';budget-=1
        result[actor['id']]=role
    return result


def retreat_permits(actors,roles,difficulty,config):
    # Scheduling admission only; range, actual cooldown and map feasibility remain caller responsibilities.
    budget=config['difficulty'][difficulty]['maxConcurrentRetreaters']
    return [a['id'] for a in sorted(actors,key=lambda a:a['id'])
            if roles[a['id']]=='artillery' and a.get('wants_retreat',False) and 'ground_move' in a['capabilities']][:budget]


def main():
    from spatial_growth_encounter_trial import SPAWNS
    config=json.loads((ROOT/'enemy-role-candidates-v1.json').read_text(encoding='utf-8'))
    validate_config(config)
    fixtures=[]
    for purple_room in range(6):
        templates=[list(r) for r in SPAWNS];templates[purple_room].append(('purple',105,20))
        assert sum(map(len,templates))==28
        assert max(map(len,templates))<=7
        for difficulty in config['difficulty']:
            for room,template in enumerate(templates):
                actors=[]
                for i,(kind,x,y) in enumerate(template):
                    adapter=config['candidateAdapter']['melee' if kind=='purple' else kind]
                    assert x>=-10 # Preserve current left-entry observation space; rejects the diagnostic rear probe.
                    actors.append(dict(id=room*10+i,**copy.deepcopy(adapter),wants_retreat=True,
                        species='human',rank='ordinary',immune_controls=[],purple=kind=='purple'))
                original=copy.deepcopy(actors)
                roles=assign_roles(actors,difficulty,config)
                assert actors==original
                assert sum(r=='flanker' for r in roles.values())<=config['difficulty'][difficulty]['maxFlankers']
                permits=retreat_permits(actors,roles,difficulty,config)
                assert len(permits)<=config['difficulty'][difficulty]['maxConcurrentRetreaters']
                variant=copy.deepcopy(actors)
                for a in variant:a['species']='mechanical';a['rank']='boss'
                assert assign_roles(variant,difficulty,config)==roles
                assert all(not a['immune_controls'] for a in variant)
                fixtures.append(dict(purple_room=purple_room+1,difficulty=difficulty,room=room+1,actors=len(actors),roles=roles,retreat_permits=permits))
    assert len(fixtures)==168
    a=dict(id=1,role='frontline',alternates=['flanker'],capabilities=['melee_strike'])
    assert assign_roles([a],'king',config)=={1:'frontline'} # Missing ground movement forbids alternate role.
    reloaded=copy.deepcopy(config);reloaded['difficulty']['king']['maxFlankers']=0
    a['capabilities'].append('ground_move')
    assert assign_roles([a],'king',config)=={1:'flanker'}
    assert assign_roles([a],'king',reloaded)=={1:'frontline'}
    for field,value in [('schemaVersion',2),('status','release')]:
        invalid=copy.deepcopy(config);invalid[field]=value
        try:validate_config(invalid)
        except AssertionError:pass
        else:raise AssertionError('invalid candidate config accepted')
    invalid=copy.deepcopy(config);invalid['difficulty']['king']['maxFlankers']=-1
    try:validate_config(invalid)
    except AssertionError:pass
    else:raise AssertionError('negative budget accepted')
    output=dict(fixtures=fixtures,checks='PASS: 168 room contracts; schema/negative-budget rejection, counts, entry space, capability eligibility, bounded role/retreat admission, rank/species independence, no immunity added, no mutation, strategy reload',
        limitations=['Configuration validation only, NOT 168 combat simulations or player samples.',
            'Counts and skill adapter use current normal dungeon fixtures for all profiles solely to isolate roles; higher difficulty final counts not confirmed.',
            'No actual movement, cooldown, line of sight, retreat lifetime/fairness, tactical success, damage or rewards measured.',
            'candidateAdapter maps legacy analysis kinds only; formal roles are independent of species/rank/template identity.'])
    with (ROOT/'results/enemy-role-contract-v44.json').open('w',encoding='utf-8',newline='\n') as f:json.dump(output,f,ensure_ascii=False,indent=2)
    print(output['checks'])


if __name__=='__main__':main()
