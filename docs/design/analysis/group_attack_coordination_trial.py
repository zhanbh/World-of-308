"""Room-local attack coordination with fixed route; design pressure fixture.
No extra visual warnings, monster rewards, or production combat implementation.
"""
import json
import math
import random
from spatial_dodge_trial import at,valid,segment_distance
from displacement_boundary_trial import sweep

DT=1/120
# Candidate source-pixel points; purple is added, never replaces a base monster.
ROOMS={
 'R3':[('melee',-10,-15),('melee',20,20),('melee',55,55),('ranged',135,-15),('ranged',170,55)],
 'R5':[('elite',40,20),('ranged',135,-15),('ranged',170,55)],
 'R6':[('melee',-10,-15),('melee',20,20),('melee',55,55),('charge',80,-15),('ranged',135,-15),('ranged',170,55)],
}
TUNING={
 'melee':dict(windup=.35,active=.10,recovery=.40,cd=2.5,reach=46),
 'ranged':dict(windup=.8,active=.10,recovery=.40,cd=4.,reach=210),
 'charge':dict(windup=.7,active=.35,recovery=.70,cd=5.,reach=150),
 'elite':dict(windup=.9,active=.15,recovery=.85,cd=6.,reach=64),
}


def contact(kind,origin,aim,p):
    if kind=='melee':
        facing=1 if aim[0]>=origin[0] else -1
        return -8<=(p[0]-origin[0])*facing<=48 and abs(p[1]-origin[1])<=18
    if kind=='ranged':return abs(p[0]-aim[0])<=22 and abs(p[1]-aim[1])<=16
    if kind=='elite':return math.dist(p,origin)<=72+8
    dx,dy=aim[0]-origin[0],aim[1]-origin[1];length=max(1e-9,math.hypot(dx,dy))
    end,_=sweep(origin,(dx/length*150,dy/length*150))
    # One locked lane contact, not a continuous charge-body movement simulation.
    return segment_distance(p,origin,end)<=20


def run(room='R6',purple=True,policy='special_one',seed=0,duration=24):
    assert policy in ('none','special_one','special_one_melee_two')
    kinds=ROOMS[room]+([('melee',105,20)] if purple else [])
    rng=random.Random(seed)
    actors=[dict(kind=k,p=(float(x),float(y)),ready=0.,active=None,casts=0,
        wait=0.) for k,x,y in kinds]
    rng.shuffle(actors)
    p=(-180.,20.);waypoints=[(-160.,55.),(160.,55.),(160.,-15.),(-160.,-15.)];way=0
    starts=[];contacts=[];peak_special=peak_melee=0
    for frame in range(math.ceil(duration/DT)):
        now=frame*DT
        target=waypoints[way]
        proposed=at(p,target,DT);p,_=sweep(p,(proposed[0]-p[0],proposed[1]-p[1]))
        if math.dist(p,target)<1e-7:way=(way+1)%len(waypoints)
        assert valid(p)
        for a in actors:
            current=a['active'];config=TUNING[a['kind']]
            if current:
                if not current['hit_checked'] and now+1e-9>=current['started']+config['windup']:
                    current['hit_checked']=True
                    contacts.append(dict(actor=actors.index(a),kind=a['kind'],time=now,
                        exposed=contact(a['kind'],current['origin'],current['aim'],p)))
                if now>=current['started']+config['windup']+config['active']+config['recovery']:
                    a['active']=None
            elif a['kind']!='ranged' and math.dist(a['p'],p)>config['reach']:
                # Candidate chase, source-unit independent axes like player movement.
                dx,dy=p[0]-a['p'][0],p[1]-a['p'][1]
                scale=min(1,DT/max(abs(dx)/55,abs(dy)/24))
                proposed=(a['p'][0]+dx*scale,a['p'][1]+dy*scale)
                a['p'],_=sweep(a['p'],(proposed[0]-a['p'][0],proposed[1]-a['p'][1]))
            assert valid(a['p'])
        def reserved(kind):
            return sum(1 for a in actors if (a['kind']=='melee')== (kind=='melee') and a['active']
                and now<a['active']['started']+TUNING[a['kind']]['windup']+TUNING[a['kind']]['active'])
        # Round-robin admission; no spawn delay, no immunity or target loss.
        for index in [(frame+i)%len(actors) for i in range(len(actors))]:
            a=actors[index];config=TUNING[a['kind']]
            if a['active'] or now<a['ready'] or math.dist(a['p'],p)>config['reach']:continue
            category='melee' if a['kind']=='melee' else 'special'
            blocked=(policy!='none' and category=='special' and reserved('special')>=1)
            blocked|=(policy=='special_one_melee_two' and category=='melee' and reserved('melee')>=2)
            if blocked:
                a['wait']+=DT
                continue
            a['active']=dict(started=now,origin=a['p'],aim=p,hit_checked=False)
            a['ready']=now+config['cd'];a['casts']+=1
            starts.append(dict(actor=index,kind=a['kind'],time=now,ready=a['ready']))
        special=reserved('special');melee=reserved('melee')
        peak_special=max(peak_special,special);peak_melee=max(peak_melee,melee)
        if policy!='none':assert special<=1
        if policy=='special_one_melee_two':assert melee<=2
    # Accepted same-actor starts must honor start-based CD, even while waiting.
    for index,a in enumerate(actors):
        times=[s['time'] for s in starts if s['actor']==index]
        assert all(b-a+1e-8>=TUNING[actors[index]['kind']]['cd'] for a,b in zip(times,times[1:]))
    return dict(room=room,purple=purple,policy=policy,seed=seed,monsters=len(actors),
        casts=len(starts),peak_special=peak_special,peak_melee=peak_melee,
        opportunities=len(contacts),exposed=sum(c['exposed'] for c in contacts),
        wait_seconds=sum(a['wait'] for a in actors),actor_casts=[a['casts'] for a in actors],
        ending_position=p)


def obstacle_checks():
    wall=[(10,11,-15,35)]
    direct,blocked=sweep((-40,20),(100,0),obstacles=wall)
    assert blocked and direct==(2.,20.)
    p=(-40.,20.)
    # Authored route goes around the expanded obstacle, never through a body collider.
    for target in [(-40.,55.),(60.,55.),(60.,20.)]:
        for _ in range(1000):
            if math.dist(p,target)<1e-7:break
            proposed=at(p,target,DT)
            p,_=sweep(p,(proposed[0]-p[0],proposed[1]-p[1]),obstacles=wall)
            assert valid(p)
        assert math.dist(p,target)<1e-7
    return dict(direct_stop=direct,authored_route_end=p)


def main():
    rows=[run(room,purple,policy,seed) for room in ROOMS for purple in [False,True]
          for policy in ['none','special_one','special_one_melee_two'] for seed in range(12)]
    assert run(seed=4)==run(seed=4)
    assert run('R6')['monsters']==7
    assert contact('melee',(0,0),(40,0),(20,0)) # Passing through a body gives no immunity.
    assert not contact('melee',(0,0),(40,0),(-20,0))
    print(json.dumps(dict(results=rows,obstacle_checks=obstacle_checks(),checks='PASS: 216 traces, concurrency caps, start-based cooldowns, fixed replay, 7 simultaneous actors, independent obstacle route',
        limitations=['24s fixed route, static ordinary ranged units, candidate melee/charge/elite chase.',
            'No HP, outgoing player attacks/kills, hitstun, protection, reward, XP or complete room clearing.',
            'Exposure counts geometry opportunities, not actual damage/hits after protection.',
            'Concurrency capacities/timing/reach/coordinates are candidates, not confirmed difficulty settings.',
            'Special category groups ranged, charge and elite for conservative capacity sensitivity only.',
            'Charge lane resolves once, no continuous moving charge body; ranged is locked target point, no projectile flight.',
            'Monster bodies do not obstruct the player; monster-monster blocking is not decided by this fixture.',
            'Main room traces have no obstacles; separate authored obstacle route is not automatic pathfinding.',
            'No inferred whole-dungeon time or economy adjustments from these traces.']),indent=2))

if __name__=='__main__':main()
