"""Forced ground displacement and moveAt source nodes; isolated dodge fixture."""
import json
import math
import re
from action_warning_timeline_trial import actions,timeline
from spatial_dodge_trial import ROOT,escape,at,safe,valid

SOURCE=(ROOT/'client/assets/scripts/WarriorSkillsModel.ts').read_text()
ANIM=(ROOT/'client/assets/scripts/WarriorSkillAnimation.ts').read_text()
LEAP=re.search(r'earthLeapTuning = \{ defaultDistance: ([\d.]+), forwardDistance: ([\d.]+), takeoffAt: ([\d.]+)',SOURCE)
assert LEAP
DEFAULT,FORWARD,TAKEOFF=map(float,LEAP.groups())
MOUNTAIN=float(re.search(r'motionDelta = \(easedProgress - this.movementFraction\) \* ([\d.]+)',SOURCE)[1])
MOUNTAIN_START=float(re.search(r'this.elapsed - ([\d.]+)\) / \(warriorSkillTuning.bengshan.impactAt',SOURCE)[1])
IMPACTS={k:float(re.search(r'\b'+k+r': \{[^\n]*impactAt: ([\d.]+)',ANIM)[1]) for k in ['bengshan','earth']}


def displacement(skill,elapsed,distance):
    start=MOUNTAIN_START if skill=='bengshan' else TAKEOFF
    p=max(0,min(1,(elapsed-start)/(IMPACTS[skill]-start)))
    eased=1-(1-p)**2 if skill=='bengshan' else p*p*(3-2*p)
    return distance*eased


def evaluate(skill,distance,start,facing,progress,q,warning,shape,radius,forced=True):
    action=actions()[skill];age=action['duration']/q*progress
    delay=timeline(action,q,age,warning,.2,0)['move_start']
    old=displacement(skill,age*q,distance)
    def locked_position(t):
        delta=displacement(skill,(age+t)*q,distance)-old if forced else 0
        # This fixture keeps the entire footprint inside room. Prototype clips anchor instead.
        return (max(-210,min(210,start[0]+facing*delta)),start[1])
    release=locked_position(delay)
    target,travel_seconds=escape(release,shape,radius)
    def position(t):
        return locked_position(t) if t<delay else at(release,target,t-delay)
    impact=position(warning)
    samples=[position(t/120) for t in range(math.ceil((warning+3)*120)+1)]
    assert all(valid(p) for p in samples)
    return dict(skill=skill,distance=distance,start=start,facing=facing,progress=progress,q=q,
        warning=warning,shape=shape,radius=radius,forced=forced,move_start=delay,
        remaining_forced=displacement(skill,action['duration'],distance)-old,
        release_position=release,impact_position=impact,target=target,move_seconds=travel_seconds,
        safe_at_impact=safe(impact,shape,radius),
        roar_hit_ticks=sum(not safe(position(warning+i*.5),shape,radius) for i in range(1,7)) if shape=='sector' else None,
        entered_hazard=any(not safe(p,shape,radius) for p in samples))


def main():
    rows=[]
    for skill,distance in [('bengshan',MOUNTAIN),('earth',DEFAULT),('earth',FORWARD)]:
        assert displacement(skill,0,distance)==0
        assert math.isclose(displacement(skill,IMPACTS[skill],distance),distance)
        values=[displacement(skill,i/100,distance) for i in range(201)]
        assert all(a<=b+1e-10 for a,b in zip(values,values[1:]))
        for facing in [-1,1]:
            for progress in [0,.5,.9]:
                for q in [1,2]:
                    for shape,radius,start in [('circle',72,(140,20)),('sector',140,(150,20))]:
                        for warning in [.6,1,1.4]:
                            a=evaluate(skill,distance,start,facing,progress,q,warning,shape,radius)
                            b=evaluate(skill,distance,start,facing,progress,q,warning,shape,radius,forced=False)
                            rows.append(dict(moving=a,fixed=b,changes_safety=a['safe_at_impact']!=b['safe_at_impact']))
    # Ground position remains vulnerable even when the drawing is lifted.
    still=evaluate('earth',DEFAULT,(140,20),1,0,1,.6,'circle',72)
    assert displacement('earth',.6,DEFAULT)>0
    assert still['impact_position']!=(140,20)
    print(json.dumps(dict(source=dict(mountain_distance=MOUNTAIN,mountain_start=MOUNTAIN_START,
        default_leap=DEFAULT,forward_leap=FORWARD,takeoff=TAKEOFF,impact=IMPACTS),
        comparisons=len(rows),changed=sum(r['changes_safety'] for r in rows),results=rows,
        checks='PASS: extracted nodes, displacement endpoints and monotonicity, ground position, valid sampled paths',
        limitations=['Independent time/geometry fixture, not game replay or whole-dungeon validation.',
          'q2 scales animation/forced movement completion time, not manual movement speed or total leap distance.',
          'Source positions are prototype source pixels; enemy geometry and room footprint are candidates.',
          'Footprint-aware wall clipping differs from prototype anchor-only clipping.',
          'No enemy collision or attack state, damage, push, hitstun, hitstop, or knockdown.',
          'No dodge immunity from visual jump height; no new cancel mechanics.',
          '2px route search and 120Hz diagnostics do not prove globally optimal dodging.',
          'Comparison fixed-position fixture shares timing and all other inputs; not older sequential reaction model.']),indent=2))

if __name__=='__main__':main()
