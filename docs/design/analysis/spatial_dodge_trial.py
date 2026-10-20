"""Source-unit spatial counterexamples, no engine or damage/economy prediction."""
import json
import math
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
SOURCE=(ROOT/'client/assets/scripts/CombatModel.ts').read_text()
VX=float(re.search(r'horizontalSpeed:\s*([\d.]+)',SOURCE)[1])
VY=float(re.search(r'depthSpeed:\s*([\d.]+)',SOURCE)[1])
# Current prototype bounds, not a finalized first-dungeon room.
BOUNDS=(-218,218,-35,78)
BOSS=(100,20)
PLAYER_RADIUS=8.0  # Candidate ground collision radius.


def travel(a,b):
    # Prototype applies independent axes, not normalized diagonal velocity.
    return max(abs(a[0]-b[0])/VX,abs(a[1]-b[1])/VY)


def segment_distance(p,a,b):
    dx=b[0]-a[0];dy=b[1]-a[1]
    squared=dx*dx+dy*dy
    if squared<1e-15:return math.hypot(p[0]-a[0],p[1]-a[1])
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/squared))
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)


def hazard_distance(p,shape,radius,half_angle=math.pi/6):
    x=p[0]-BOSS[0];y=p[1]-BOSS[1];d=math.hypot(x,y)
    if shape=='circle':return max(0,d-radius)
    angle=abs(math.atan2(y,x))
    if angle<=half_angle:
        return max(0,d-radius)
    edges=[(radius*math.cos(half_angle),sign*radius*math.sin(half_angle)) for sign in [-1,1]]
    return min(segment_distance((x,y),(0,0),end) for end in edges)


def safe(p,shape,radius):
    return hazard_distance(p,shape,radius)>PLAYER_RADIUS+1e-7


def valid(p):
    return BOUNDS[0]+PLAYER_RADIUS<=p[0]<=BOUNDS[1]-PLAYER_RADIUS and BOUNDS[2]+PLAYER_RADIUS<=p[1]<=BOUNDS[3]-PLAYER_RADIUS


def escape(start,shape,radius):
    # Search on 2-source-pixel grid: feasible straight route, not exact optimality.
    candidates=[(x,y) for x in range(-210,211,2) for y in range(-27,71,2)
                if safe((x,y),shape,radius)]
    assert valid(start)
    if safe(start,shape,radius):return start,0.0
    target=min(candidates,key=lambda p:travel(start,p))
    return target,travel(start,target)


def at(start,target,seconds):
    duration=travel(start,target)
    f=1 if duration==0 else min(1,max(0,seconds)/duration)
    return (start[0]+f*(target[0]-start[0]),start[1]+f*(target[1]-start[1]))


def trial(start,shape,radius,windup,lock=0,latency=.2,knockback=0):
    target,move=escape(start,shape,radius)
    delay=latency+lock  # Conservative sequential lock+reaction fixture.
    impact=at(start,target,windup-delay)
    first_safe=delay+move
    ticks=[];pos=start;previous=0
    # Six roar ticks; caller does not use this to invent stomp tick structure.
    for index in range(1,7):
        t=windup+index*.5
        # Replan a straight path after push; movement not before delay.
        available=max(0,t-max(previous,delay))
        pos=at(pos,target,available)
        hit=not safe(pos,shape,radius)
        ticks.append(hit)
        if hit and knockback:
            dx=pos[0]-BOSS[0];dy=pos[1]-BOSS[1];d=max(1e-9,math.hypot(dx,dy))
            pos=(max(-210,min(210,pos[0]+knockback*dx/d)),max(-27,min(70,pos[1]+knockback*dy/d)))
        assert valid(pos)
        if safe(pos,shape,radius):
            target=pos  # Hold safety after push; never steer back into the cone.
        elif hit and knockback:
            target,_=escape(pos,shape,radius)
        previous=t
    return dict(start=start,target=target,shape=shape,radius=radius,windup=windup,lock=lock,
        latency=latency,knockback=knockback,move_seconds=move,first_safe_seconds=first_safe,
        safe_at_impact=safe(impact,shape,radius),roar_hit_ticks=sum(ticks) if shape=='sector' else None,
        return_seconds=travel(target,start),route_distance=math.dist(start,target))


def main():
    rows=[]
    for shape,radius,start in [('circle',48,(140,20)),('circle',72,(140,20)),('sector',140,(150,20)),('sector',140,(150,55))]:
        for warning in [.6,1.0,1.4]:
            for lock in [0,.66,1.32]:
                rows.append(trial(start,shape,radius,warning,lock))
    assert segment_distance((3,4),(0,0),(0,0))==5
    assert math.isclose(travel((0,0),(100,45)),1)
    assert not safe((150,20),'sector',140)
    assert safe((50,20),'sector',140)  # Behind locked facing.
    assert not safe((100,20),'sector',140)
    assert not safe((148,20),'circle',48)  # Boundary + player footprint.
    assert all(not valid(p) for p in [(-218,0),(0,78)])
    assert all(valid(r['target']) for r in rows)
    assert all(math.isclose(travel(r['start'],r['target']),r['move_seconds']) for r in rows)
    pushes=[trial((150,20),'sector',140,.6,1.32,knockback=k) for k in [0,6,12]]
    print(json.dumps(dict(source_units='prototype source pixels and seconds',speeds=dict(x=VX,y=VY),
        bounds=BOUNDS,player_radius=PLAYER_RADIUS,results=rows,knockback_fixtures=pushes,
        checks='PASS: anisotropic movement, front/back and footprint boundaries, valid endpoints, route times',
        limitations=['2px grid feasible routes, not proof of shortest path; empty rectangular room only.',
            'Prototype movement bounds are a fixture, not current first-dungeon dimensions.',
            'All enemy ranges, warnings, player radius and knockback are candidate counterexample inputs.',
            'Lock values are conservative occupancies, not an actual moveAt replay or formal dodge cancel rule.',
            'No enemy movement, collision bodies, group coordination, HP or attack-state simulation.',
            'Roar tick1 is windup+0.5s; impact safety is a separate onset diagnostic.',
            'Push is instantaneous fixture displacement, no control lock or cumulative damage knockdown.',
            'Return time retraces to original point after hazard ends, not an actual attack-range optimum.',
            'Not integrated into v12 elapsed time; never add these totals to existing abstract movement blindly.']),indent=2))

if __name__=='__main__':main()
