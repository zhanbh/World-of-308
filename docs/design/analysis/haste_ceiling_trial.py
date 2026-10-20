"""Haste ceiling comparison anchored to current repository body animations.
Keeps AP, crit and damage budgets identical; tests action/CD resource pressure.
"""
import json
import math
import re
from pathlib import Path
from weapon_synergy_validation import build,schedule,CD


def current_body_times():
    root=Path(__file__).resolve().parents[3]
    source=(root/'client/assets/scripts/WarriorSkillAnimation.ts').read_text()
    mapping={'cross':'cross','mountain':'bengshan','draw':'badao','outrage':'earth'}
    result={}
    for key,native in mapping.items():
        match=re.search(r'\b'+native+r':\s*\{[^\n]*?duration:\s*([0-9.]+)',source)
        assert match,native
        result[key]=float(match.group(1))
    basic=(root/'client/assets/scripts/WarriorAttackAnimation.ts').read_text()
    duration=sum(float(v) for v in re.findall(r'\bduration:\s*([0-9.]+)',basic)[:3])
    assert math.isclose(duration,1)
    return result,duration


def main():
    body,basic=current_body_times();rows=[]
    for q in [1,1.45,1.5,1.75,2]:
        s=build(30,'purple')
        s['haste']=q-1;s['basic_cycle_time']=basic/q
        for name,v in s['skills'].items():
            v['cast']=body[name]/q
            v['cd']=CD[name]*.9/q
        r=schedule(s)
        rows.append(dict(q=q,basic_cycle_ms=1000*basic/q,
               body_ms={k:1000*v/q for k,v in body.items()},
               class_cd={k:v['cd'] for k,v in s['skills'].items()},
               basic_only_dps=s['basic_cycle_damage']/s['basic_cycle_time'],
               direct_and_bleed_per_cast={k:v['direct']+v['bleed'] for k,v in s['skills'].items()},
               schedule=r,dot_duration=5/q,dot_ticks=5))
    budgets=[r['direct_and_bleed_per_cast'] for r in rows]
    assert all(b==budgets[0] for b in budgets)
    assert all(r['dot_ticks']==5 for r in rows)
    assert rows[-1]['basic_cycle_ms']==500
    assert math.isclose(rows[-1]['body_ms']['outrage'],660)
    print(json.dumps(dict(body_source=body,rows=rows,
       checks='PASS: source body timings, 1s basic cycle, invariant per-cast budgets/tick count, q2 durations',
       limitations=['Ceilings are candidates; q fixed across each scenario, not a real build claim.',
          'Stationary expected-crit model; direct damage aggregated at body end.',
          'Earth has post-body residual hits in real segment table; not represented by this aggregate model.',
          'No enemy controls/geometry/animation quality or device frame-rate verification.',
          'Previous model CAST durations .66/.92/.9/2.4 differ from current asset body .56/.88/.76/1.32; historical results remain historical.']),indent=2))

if __name__=='__main__':main()
