"""Source moveAt/contact times + candidate locked enemy warning timeline.
Position is held during the action-lock fixture; not full skill-displacement replay.
"""
import json
import math
import re
from spatial_dodge_trial import ROOT,escape,at,safe


def actions():
    skills=(ROOT/'client/assets/scripts/WarriorSkillAnimation.ts').read_text()
    hits=(ROOT/'client/assets/scripts/WarriorSkillsModel.ts').read_text()
    basics=(ROOT/'client/assets/scripts/WarriorAttackAnimation.ts').read_text()
    out={}
    for key in ['cross','bengshan','badao','earth']:
        match=re.search(r'\b'+key+r':\s*\{[^\n]*?duration:\s*([\d.]+),[^\n]*?moveAt:\s*([\d.]+)',skills)
        contacts=re.search(r'\b'+key+r':\s*\[([\d.,\s]+)\]',hits)
        assert match and contacts,key
        out[key]=dict(duration=float(match[1]),move_at=float(match[2]),contacts=[float(x) for x in contacts[1].split(',')])
    for index,m in enumerate(re.finditer(r"name: '[^']+', duration: ([\d.]+), impact: ([\d.]+), moveAt: ([\d.]+)",basics)):
        out['basic'+str(index+1)]=dict(duration=float(m[1]),move_at=float(m[3]),contacts=[float(m[2])])
    assert len(out)==7
    return out


def timeline(action,q,age,warning,reaction,move):
    assert 1<=q<=2 and 0<=age<=action['duration']/q
    # Reaction can finish while the existing action is still locked.
    unlock=max(0,action['move_at']/q-age)
    start=max(reaction,unlock)
    contacts=[t/q-age for t in action['contacts'] if t/q>=age]
    return dict(remaining_lock=unlock,move_start=start,safe_endpoint_at=start+move,
        enemy_impact=warning,contacts_after_warning=contacts,
        margin=warning-start-move)


def main():
    source=actions();rows=[]
    start=(150,20);target,move=escape(start,'sector',140)
    for key,action in source.items():
        for q in [1,1.45,2]:
            for fraction in [0,.5,.9]:
                age=action['duration']/q*fraction
                for warning in [.6,1,1.4]:
                    t=timeline(action,q,age,warning,.2,move)
                    impact=at(start,target,warning-t['move_start'])
                    rows.append(dict(action=key,q=q,action_progress=fraction,warning=warning,
                        safe_at_impact=safe(impact,'sector',140),**t))
    a=source['badao'];assert math.isclose(a['move_at'],.66)
    # Body tail is already movable: don't delay movement until duration.
    assert timeline(a,1,.7,1,.2,move)['remaining_lock']==0
    assert timeline(a,1,0,1,.2,move)['move_start']==.66
    assert math.isclose(timeline(a,2,0,1,.2,move)['remaining_lock'],.33)
    earth=source['earth'];assert earth['contacts'][-1]>earth['duration']
    # An emitted residual may land after body/movement unlock, not deleted at body end.
    assert timeline(earth,1,earth['duration'],1,.2,move)['contacts_after_warning']
    print(json.dumps(dict(source=source,geometry=dict(start=start,target=target,move_seconds=move),
        results=rows,checks='PASS: source extraction, movable body tail, overlapping reaction, q scaling, post-body contact',
        limitations=['Enemy sector/warning remain v13 candidates, not approved enemy timing configuration.',
          'q1.45/q2 represent confirmed design scaling; current skill update does not yet implement it.',
          'No forced skill movement/basic forward step; start position held during lock as isolated fixture.',
          'Movement input and basic hold release assumed after reaction; no new action is chained.',
          'No frame quantization, hitstop, cancel/event ordering or actual combat replay.',
          'Safe endpoint margin is a sufficient route budget, negative margin does not prove no alternative path.',
          'Contacts report timing only, not guarantee hit, launch, damage, or persistence after cancellation.']),indent=2))

if __name__=='__main__':main()
