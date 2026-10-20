"""Single-cast joint spatial/timing reference, not full combat or dungeon AI."""
import json
import math
from action_warning_timeline_trial import actions
from skill_displacement_dodge_trial import displacement,DEFAULT,FORWARD,MOUNTAIN
from enemy_action_nodes_trial import NODES
from spatial_dodge_trial import ROOT,BOSS,escape,at,safe,valid,travel
import re

SKILL_SOURCE=(ROOT/'client/assets/scripts/WarriorSkillsModel.ts').read_text()
RANGES={k:float(re.search(r'\b'+k+r':\s*\{[^\n]*range:\s*([\d.]+)',SKILL_SOURCE)[1]) for k in ['bengshan','earth']}


def run(skill,distance,enemy,strategy,q=1,facing=-1,progress=0):
    node=NODES[enemy];action=actions()[skill]
    shape='sector' if enemy=='boss_roar' else 'circle'
    radius=140 if shape=='sector' else 72
    start=(150,20) if shape=='sector' else (140,20)
    age=action['duration']/q*progress
    unlock=max(.2,action['move_at']/q-age)
    previous=displacement(skill,age*q,distance)
    def forced(t):
        dx=displacement(skill,(age+t)*q,distance)-previous
        return max(-210,min(210,start[0]+facing*dx)),start[1]
    release=forced(unlock)
    target,_=escape(release,shape,radius)
    safe_arrival=unlock+travel(release,target)
    return_at=max(safe_arrival,node['active_end'])
    def position(t):
        if t<=unlock:return forced(t)
        if strategy=='hold':return release
        if strategy=='return' and t>return_at:
            return at(target,release,t-return_at)
        return at(release,target,t-unlock)
    incoming=[]
    for tick in node['contacts']:
        p=position(tick);assert valid(p)
        incoming.append(dict(time=tick,position=p,hit=not safe(p,shape,radius)))
    # Action already in progress; only its future contacts. Earth origin is locked
    # at first release contact and retained by later residual stages.
    origin=forced(max(0,action['contacts'][0]/q-age))
    outgoing=[]
    for index,offset in enumerate(action['contacts']):
        t=offset/q-age
        if t<0:continue
        p=origin if skill=='earth' else position(t)
        outgoing.append(dict(stage=index,time=t,origin=p,
            hit=math.dist(p,BOSS)<=RANGES[skill],boss_armored=
            node['armor_start'] is not None and node['armor_start']<=t<node['active_end']))
    # A distinct hypothetical new cast may only start once the current body ends
    # and player returns to the post-displacement point. No range/CD readiness is implied.
    ready_time=max(action['duration']/q-age,return_at+travel(target,release)) if strategy=='return' else None
    return dict(skill=skill,distance=distance,enemy=enemy,strategy=strategy,q=q,facing=facing,
        progress=progress,incoming=incoming,outgoing=outgoing,
        incoming_contacts=sum(e['hit'] for e in incoming),
        outgoing_contacts=sum(e['hit'] for e in outgoing),
        endpoint=release,safe_arrival=safe_arrival,earliest_returned_body_ready=ready_time,
        recovery_start=node['active_end'],recovery_end=node['end'],
        returned_during_recovery=ready_time is not None and ready_time<node['end'])


def main():
    rows=[]
    for skill,distance in [('bengshan',MOUNTAIN),('earth',DEFAULT),('earth',FORWARD)]:
        for enemy in ['elite_sweep','boss_hammer','boss_roar']:
            for q in [1,2]:
                for facing in [-1,1]:
                    for progress in [0,.5]:
                        for strategy in ['hold','escape','return']:
                            rows.append(run(skill,distance,enemy,strategy,q,facing,progress))
    # Same starting action/position until strategies diverge; escape and return
    # must take identical damage throughout this one enemy cast.
    keyed={(r['skill'],r['distance'],r['enemy'],r['q'],r['facing'],r['progress'],r['strategy']):r for r in rows}
    for key,r in keyed.items():
        if key[-1]=='escape':
            b=keyed[key[:-1]+('return',)]
            assert r['incoming']==b['incoming']
        assert r['incoming_contacts']<=len(NODES[r['enemy']]['contacts'])
        # Contact budget never changes with haste.
        assert len(r['outgoing'])<=len(actions()[r['skill']]['contacts'])
    # Leaving a locked roar removes future exposure; no permanent on-hit tag.
    roar=run('bengshan',MOUNTAIN,'boss_roar','escape',q=2,facing=-1)
    assert roar['incoming_contacts']==0
    # No false invulnerability just because earth is visually airborne.
    airborne=run('earth',DEFAULT,'boss_roar','hold',q=1,facing=1)
    assert airborne['incoming_contacts']>0
    print(json.dumps(dict(results=rows,scenarios=len(rows),source_ranges=RANGES,
        checks='PASS: shared escape/return exposure, contact budget bounds, locked-cone exit, visual jump grants no immunity',
        limitations=['Three candidate enemy timelines, static boss and one player cast only.',
            'No HP, damage, crit, knockback, knockdown, enemy interruption or followup selection.',
            'Hold retains forced displacement; it does not freeze the player at initial coordinates.',
            'One scenario starts with an in-progress action; already emitted earth origin approximated at warning position if release predates warning.',
            'Earth residual location locks at first contact; no skill retarget during return.',
            'Player contact geometry uses prototype circular ranges, not production collision footprints.',
            'Returned-body-ready is geometry/body timing only; no cooldown/mana readiness or guaranteed counterattack.',
            'Candidate safe route and return point are not optimal; no obstacles or group coordination.',
            'Not a full dungeon completion-rate/economy model; does not replace v12 timing.']),indent=2))

if __name__=='__main__':main()
