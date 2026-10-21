"""Candidate behavior profiles for DESIGN trials, not approved game tuning."""
import math

PROFILES={
    'formation_commit':dict(chase_x=55,chase_y=24,flank=True,retreat=True,cd_scale=.9,special_cap=2,commit_flank=True),
    # Ablations isolate cadence versus formation; never named as production difficulties.
    'cadence_only':dict(chase_x=55,chase_y=24,flank=False,retreat=False,cd_scale=.8,special_cap=2),
    'slow_flank':dict(chase_x=55,chase_y=24,flank=True,retreat=True,cd_scale=.9,special_cap=2),
    'adventure':dict(chase_x=62,chase_y=27,flank=False,retreat=False,cd_scale=1.,special_cap=1),
    'warrior':dict(chase_x=65,chase_y=28,flank=True,retreat=True,cd_scale=.9,special_cap=2),
    'king':dict(chase_x=70,chase_y=30,flank=True,retreat=True,cd_scale=.8,special_cap=2),
}


def destination(profile,kind,actor_id,origin,player):
    """Return a desired point; caller must sweep against actual map bounds."""
    config=PROFILES[profile]
    if kind=='ranged':
        if not config['retreat'] or math.dist(origin,player)>=95:return None
        # Ground-plane separation, stable tie direction; never teleport or retarget a cast.
        dx,dy=origin[0]-player[0],origin[1]-player[1]
        length=math.hypot(dx,dy)
        if length<1e-9:dx,dy,length=(1 if actor_id%2 else -1),0,1
        return (player[0]+dx/length*120,player[1]+dy/length*120)
    if config['flank'] and kind=='melee':
        return (player[0]+(28 if actor_id%2 else -28),player[1]+(9 if actor_id%2 else -9))
    return (player[0]-(1 if player[0]>=origin[0] else -1)*28,player[1])


if __name__=='__main__':
    assert destination('warrior','melee',1,(0,0),(0,0))!=destination('warrior','melee',2,(0,0),(0,0))
    assert destination('adventure','ranged',1,(0,0),(0,0)) is None
    assert destination('warrior','ranged',1,(0,0),(150,0)) is None
    assert math.dist(destination('warrior','ranged',1,(0,0),(0,0)),(0,0))==120
    assert all(0<c['cd_scale']<=1 for c in PROFILES.values())
    print('PASS: distinct flank targets, retreat eligibility/tie handling, candidate profile bounds')
