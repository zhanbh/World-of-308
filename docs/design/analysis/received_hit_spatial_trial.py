"""Spatial reference with damage response and optional enemy body blocking.
Candidate values only; no game imports, asset/network writes or production code.
"""
from functools import lru_cache
import json
import math
from action_warning_timeline_trial import actions
from enemy_action_nodes_trial import NODES
from skill_displacement_dodge_trial import displacement,DEFAULT,FORWARD,MOUNTAIN
from spatial_dodge_trial import BOSS,safe,valid,travel,at
from displacement_boundary_trial import sweep

BODY_RADIUS=26.0 # Candidate sum of player/enemy radii.
DT=1/120


def move(p,delta,solid):
    end,_=sweep(p,delta)
    if not solid:return end
    dx,dy=end[0]-p[0],end[1]-p[1]
    fx,fy=p[0]-BOSS[0],p[1]-BOSS[1]
    a=dx*dx+dy*dy;b=2*(fx*dx+fy*dy);c=fx*fx+fy*fy-BODY_RADIUS**2
    assert c>=-1e-6,'start overlaps candidate enemy body'
    if a<1e-15 or (c<=1e-8 and b>=0):return end
    disc=b*b-4*a*c
    if disc<=1e-12:return end
    t=(-b-math.sqrt(disc))/(2*a)
    if -1e-9<=t<1:
        t=max(0,t)
        end=(p[0]+dx*t,p[1]+dy*t)
    assert math.dist(end,BOSS)>=BODY_RADIUS-1e-6
    return end


@lru_cache(None)
def safe_grid(shape):
    radius=140 if shape=='sector' else 72
    return tuple((x,y) for x in range(-210,211,2) for y in range(-27,71,2)
                 if safe((x,y),shape,radius))


def destination(p,shape,solid):
    radius=140 if shape=='sector' else 72
    if safe(p,shape,radius):return p
    for point in sorted(safe_grid(shape),key=lambda q:travel(p,q)):
        actual=move(p,(point[0]-p[0],point[1]-p[1]),solid)
        if math.dist(actual,point)<1e-6:return point
    raise AssertionError('no direct feasible safe endpoint in fixture')


def run(skill,distance,enemy,strategy,q=1,facing=-1,solid=False,hp_max=1000,push=12):
    action=actions()[skill];node=NODES[enemy]
    shape='sector' if enemy=='boss_roar' else 'circle';radius=140 if shape=='sector' else 72
    p=(150.,20.) if shape=='sector' else (140.,20.)
    hp=float(hp_max);damage=0.;protect_until=stun_until=down_until=0.
    active=True;cancelled=False;launched=False;origin=None;old_forced=0.
    first_manual_ready=None
    target=None;return_point=None;returning=False;hits=[];outgoing=[];seen=set();enemy_seen=set()
    roar_accum=0.;roar_down=False;down_count=0;cancel_time=None
    end_time=node['end']+1.5
    for frame in range(math.ceil(end_time/DT)+1):
        now=frame*DT;age=now*q
        if hp>0:
            if active:
                value=displacement(skill,age,distance)
                p=move(p,((value-old_forced)*facing,0),solid);old_forced=value
            if age>=action['duration']:active=False
            # Existing action unlock + response; do not start another action.
            if strategy=='dodge' and now>=.2 and (not active or age>=action['move_at']) and now>=max(stun_until,down_until):
                if first_manual_ready is None:first_manual_ready=now
                if active:
                    active=False;cancelled=True;cancel_time=now
                if return_point is None:return_point=p
                if target is None:
                    target=destination(p,shape,solid)
                if now>node['active_end'] and safe(p,shape,radius):
                    returning=True
                goal=return_point if returning else target
                proposed=at(p,goal,DT)
                p=move(p,(proposed[0]-p[0],proposed[1]-p[1]),solid)
            # Follow source convention: emission/contact processing before enemy contact.
            if not launched and not cancelled and age>=action['contacts'][0]:
                launched=True;origin=p
        for index,t in enumerate(action['contacts']):
            if index in seen or age+1e-9<t:continue
            seen.add(index)
            persistent=skill=='earth' and launched
            allowed=(hp>0 and not cancelled) or persistent
            if not allowed:continue
            hit_origin=origin if persistent else p
            hit=math.dist(hit_origin,BOSS)<=(145 if skill=='earth' else 54)
            outgoing.append(dict(stage=index,time=now,hit=hit,persistent=persistent,
                after_cancel=cancel_time is not None and now>cancel_time,after_death=hp<=0))
        for index,t in enumerate(node['contacts']):
            if index in enemy_seen or now+1e-9<t:continue
            enemy_seen.add(index)
            if hp<=0:continue
            contact=not safe(p,shape,radius)
            # Same roar continues through down/protection, per confirmed rule.
            blocked=enemy!='boss_roar' and now<protect_until
            if not contact or blocked:continue
            amount=min(hp,90 if enemy=='boss_roar' else 160)
            hp-=amount;damage+=amount
            hits.append(dict(stage=index,time=now,damage=amount,while_down=now<down_until,position=p))
            active=False;cancelled=True
            if cancel_time is None:cancel_time=now
            if enemy=='boss_roar':
                roar_accum+=amount
                if not roar_down and roar_accum>=hp_max*.15:
                    roar_down=True;down_count+=1;down_until=now+.8
                stun_until=max(stun_until,now+.24)
            else:
                protect_until=now+.72;stun_until=now+.24
            # Instantaneous candidate response, always clipped to room/body.
            dx,dy=p[0]-BOSS[0],p[1]-BOSS[1];length=max(1e-9,math.hypot(dx,dy))
            p=move(p,(push*dx/length,push*dy/length),solid)
            if strategy=='dodge':
                target=destination(p,shape,solid);returning=False
        assert valid(p)
        assert 0<=hp<=hp_max and down_count<=1
        assert all(not e['after_cancel'] or e['persistent'] for e in outgoing)
    return dict(skill=skill,distance=distance,enemy=enemy,strategy=strategy,q=q,facing=facing,solid=solid,
        damage=damage,hp_remaining=hp,hits=hits,first_manual_ready=first_manual_ready,down_count=down_count,cancel_time=cancel_time,
        launched=launched,outgoing=outgoing,position=p,dead=hp==0)


def main():
    rows=[]
    for skill,distance in [('bengshan',MOUNTAIN),('earth',DEFAULT),('earth',FORWARD)]:
        for enemy in ['elite_cleave','elite_sweep','boss_hammer','boss_roar']:
            for strategy in ['hold','dodge']:
                for q in [1,2]:
                    for facing in [-1,1]:
                        for solid in [False,True]:
                            rows.append(run(skill,distance,enemy,strategy,q,facing,solid))
    assert move((140,20),(-100,0),True)==(126.,20.)
    assert move((126,20),(10,0),True)==(136.,20.)
    assert move((140,20),(-100,0),False)==(40.,20.)
    # Death stops new action/emission; already launched earth residual survives.
    low=run('earth',FORWARD,'boss_roar','hold',facing=1,hp_max=100,push=0)
    assert low['dead'] and low['damage']==100
    held=run('earth',FORWARD,'boss_roar','hold',facing=1,push=0)
    assert held['down_count']==1
    assert any(h['while_down'] for h in held['hits'])
    assert len(held['hits'])==6 # Down grants no immunity to this ongoing roar.
    # Cancel before release: no phantom later direct/residual contact.
    early=run('earth',DEFAULT,'elite_cleave','hold',facing=-1)
    assert early['cancel_time']<.88 and not early['launched'] and not early['outgoing']
    death_residual=run('earth',DEFAULT,'boss_hammer','hold',facing=-1,hp_max=100)
    assert death_residual['dead'] and any(e['after_death'] for e in death_residual['outgoing'])
    interrupted_dodge=run('earth',DEFAULT,'elite_cleave','dodge',facing=-1)
    assert interrupted_dodge['first_manual_ready']<actions()['earth']['move_at']
    # A cancelled body cannot keep imposing its original moveAt lock after stun ends.
    # After launch, earth residual survives nonlethal interruption.
    late=run('earth',DEFAULT,'boss_hammer','hold',facing=-1)
    assert late['launched'] and any(e['after_cancel'] and e['persistent'] for e in late['outgoing'])
    # Candidate ordinary repeated hits respect short protection; distinct from roar.
    NODES['protection_fixture']={**NODES['elite_cleave'],'contacts':(.6,.65,1.4)}
    protected=run('earth',DEFAULT,'protection_fixture','hold',facing=-1,push=0)
    assert [round(h['time'],2) for h in protected['hits']]==[.6,1.4]
    del NODES['protection_fixture']
    print(json.dumps(dict(scenarios=len(rows),results=rows,reference_scenarios=dict(low_hp=low,unprotected_roar=held,prelaunch=early,postlaunch=late,death_residual=death_residual,ordinary_protection=protected),
        checks='PASS: room/body bounds, once-per-roar down, continued down exposure, cancellation before/after launch, death, no duplicate stages',
        limitations=['Candidate HP1000, direct160/roar90 damage, down15%/0.8s, stun0.24s, normal protection0.72s, instantaneous push12.',
            'Damage is a response fixture, no armor/crit/AP/potions/level-up or economic balance claim.',
            'Collision is an explicit open vs solid-circle comparison, not a decided game rule.',
            'Static enemy, independent one-cast skills; outgoing damage does not kill/control/change enemy actions.',
            'Hold means no manual walking; forced skill movement and knockback still occur.',
            '120Hz reference order is player movement/emission/contact then enemy contact; same-time official rule pending.',
            'Roar damage/knockback ignores same-cast hit protection, no new generic immunity or attack cancel rule is confirmed.',
            'Launched earth residual survives owner death; Boss kill/free revival and rewards are not simulated.',
            'Straight safe-route search, no multi-waypoint navigation or moving enemy body.']),indent=2))

if __name__=='__main__':main()
