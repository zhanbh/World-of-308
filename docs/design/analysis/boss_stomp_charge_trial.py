"""P2 combo candidate: explicit stomps -> facing lock -> bounded charge -> recovery/weakness."""
import json
import math
from displacement_boundary_trial import sweep,ROOM

# Candidate schedule, source pixels and seconds; not an approved skill asset.
STOMPS=(.8,1.4,2.)
LOCK=2.4
CHARGE_START=3.2
SPEED=180.
BODY=14.


def combo(origin=(100.,20.),player_at_lock=(-100.,20.),max_distance=320.,
          player_after_lock=None,stun_at=None,death_at=None,hz=120,obstacles=()):
    assert max_distance>0
    direction=1 if player_at_lock[0]>=origin[0] else -1
    p=origin;travelled=0.;stomps=[];wall_time=None;finished=None;trail=[]
    duration=CHARGE_START+max_distance/SPEED+4
    # Facing lock references target ONLY at LOCK, never player_after_lock.
    for frame in range(math.ceil(duration*hz)+1):
        now=frame/hz
        if death_at is not None and now+1e-9>=death_at:
            return dict(dead=True,wall_time=wall_time,weak_until=None,end=p,stomps=stomps,
                direction=direction,travelled=travelled,interrupted=False,trail=trail,finished=None)
        # This combo is candidate hyperarmored from start through charge end.
        # stun_at is recorded as rejected while active, not used to cancel it.
        for i,t in enumerate(STOMPS):
            if now+1e-9>=t and i not in stomps:stomps.append(i)
        if now>CHARGE_START and finished is None:
            requested=min(SPEED/hz,max_distance-travelled)
            updated,blocked=sweep(p,(requested*direction,0),room=ROOM,radius=BODY,obstacles=obstacles)
            travelled+=abs(updated[0]-p[0]);p=updated
            trail.append(p)
            if blocked:
                wall_time=now;finished=now
            elif travelled>=max_distance-1e-8:
                finished=now
        if finished is not None:break
    assert finished is not None
    weak_until=wall_time+3 if wall_time is not None else None
    assert all(ROOM[0]+BODY-1e-8<=p[0]<=ROOM[1]-BODY+1e-8 for p in trail)
    return dict(dead=False,wall_time=wall_time,weak_until=weak_until,end=p,stomps=stomps,
        direction=direction,travelled=travelled,interrupted=False,trail=trail,finished=finished,
        control_rejected=stun_at is not None and stun_at<finished,
        recovery_end=weak_until if wall_time is not None else finished+.8)


def summary(result):return {k:v for k,v in result.items() if k!='trail'}


def main():
    rows=[]
    for origin in [(100.,20.),(-100.,20.),(0.,64.)]:
        for player in [(-160.,20.),(160.,20.)]:
            for distance in [60.,320.]:
                a=combo(origin,player,distance,hz=60)
                b=combo(origin,player,distance,hz=120)
                assert math.dist(a['end'],b['end'])<1e-8
                assert (a['wall_time'] is None)==(b['wall_time'] is None)
                rows.append(dict(origin=origin,player=player,max_distance=distance,**summary(b)))
    assert combo(max_distance=60)['wall_time'] is None
    assert combo(player_at_lock=(160,20))['end']==(204.,20.)
    assert combo(player_at_lock=(-160,20))['end']==(-204.,20.)
    # Running across after lock must not reverse the charge.
    locked=combo(player_at_lock=(160,20),player_after_lock=(-160,20))
    assert locked['direction']==1 and locked['end']==(204.,20.)
    controlled=combo(stun_at=3.3)
    assert controlled['control_rejected'] and not controlled['interrupted']
    dead=combo(death_at=1.5)
    assert dead['dead'] and dead['stomps']==[0,1] and dead['weak_until'] is None
    wall=[(150.,151.,-15.,55.)]
    thin=combo(player_at_lock=(160,20),obstacles=wall)
    assert thin['end']==(136.,20.) and thin['wall_time'] is not None
    print(json.dumps(dict(candidates=dict(stomps=STOMPS,lock=LOCK,charge_start=CHARGE_START,
        speed=SPEED,body_radius=BODY,weak_duration=3),results=rows,
        special_checks=dict(locked_facing=summary(locked),death=summary(dead),thin_wall=summary(thin)),
        checks='PASS: 12 bounded combos, 60/120Hz endpoints, lock direction, no false wall weakness, thin wall, death stops combo, active armor',
        limitations=['Full combo hyperarmor, three stomps, precise windups, distance/speed and 3s weakness are candidate settings.',
            'Horizontal charge only; player position after lock is deliberately ignored, not a moving player simulation.',
            'Stomp entries are node indices, not HP/damage/hit reports; no player collision or ordinary enemies.',
            'Thin solid obstacle treated as wall contact in this candidate; breakable obstacles require separate policy.',
            'Weakness restores normal control in design, no automatic damage bonus assumed here.',
            'No combo skill cooldown, AI selection weights, phase transition or actual art animation integration.']),indent=2))

if __name__=='__main__':main()
