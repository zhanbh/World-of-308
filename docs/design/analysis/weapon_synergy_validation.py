"""Design-only progression, affix, durability and 60s schedule validation.
Run: python3 docs/design/analysis/weapon_synergy_validation.py
No third-party libraries or game/network/file writes; deterministic expected crit.
"""
import json
import math
from weapon_synergy_trial import SLOTS, ARMOR, JEWELRY, SPECIAL, SKILLS

COEFF = (308.44/134-1-.32)/233.05
ALL = set(SLOTS)
NAMES = {'cross':'十字斩','mountain':'崩山击','draw':'拔刀斩','outrage':'大崩'}
CD = {'cross':6, 'mountain':10, 'draw':12, 'outrage':30}
CAST = {'cross':.66, 'mountain':.92, 'draw':.9, 'outrage':2.4}
MANA = {'cross':(8,1), 'mountain':(14,2), 'draw':(18,2), 'outrage':(32,3)}


def build(level, mode='blue', disabled=(), w_enhance=0, e_enhance=0,
          affixes=False, roll=1, main_buff=0, flat_buff=0, flat_buff_stage='final', haste_bonus=0, hit_affixes=False, slot_modes=None, item_level=None, starter_quality=None,loadout=None):
    assert 1 <= level <= 30 and mode in ('starter','blue','purple')
    assert flat_buff_stage in ('base','final')
    assert roll > 0 and haste_bonus >= 0
    assert not (affixes and hit_affixes), 'both fixtures would replace the same secondary slot'
    if slot_modes is not None:
        assert mode=='blue' and not affixes and not hit_affixes
        assert set(slot_modes)<=ALL and slot_modes.get('weapon') in ('starter','blue')
        assert all(v=='blue' or (k=='weapon' and v=='starter') for k,v in slot_modes.items())
    assert item_level is None or item_level in (10,15,20,25,30)
    assert starter_quality in (None,'white','green')
    if loadout is not None:
        assert mode=='blue' and slot_modes is None and not affixes and not hit_affixes
        assert 'weapon' in loadout and set(loadout)<=ALL
        assert all(v['quality'] in ('white','green','blue') and v['item_level'] in (10,15,20,25,30) for v in loadout.values())
        item_level=loadout['weapon']['item_level']
    starter_white=(level<5) if starter_quality is None else starter_quality=='white'
    n=level-1
    item_scale=(.25 if level<5 else .4 if level<10 else .6 if level<15 else .8 if level<20 else 1) if item_level is None else {10:.25,15:.4,20:.6,25:.8,30:1}[item_level]
    weapon=120*item_scale
    equipped={'weapon'} if mode=='starter' else ALL.copy()
    if slot_modes is not None: equipped=set(slot_modes)
    if loadout is not None:equipped=set(loadout)
    active=equipped-set(disabled)
    def scale(slot):
        return {10:.25,15:.4,20:.6,25:.8,30:1}[loadout[slot]['item_level']] if loadout is not None else item_scale
    purple=mode=='purple'
    # Affixes are substituted, never added as an illegal third secondary.
    main=crit_rating=haste_rating=mastery_rating=hp_item=mp_item=armor=0
    for slot in sorted(active):
        s,c,h,m,hp,defense=SLOTS[slot]
        if (slot_modes.get(slot) if slot_modes is not None else mode)=='starter':
            s=0
            if starter_white:
                c=h=m=0
            else:
                h=m=0
        if loadout is not None:
            quality=loadout[slot]['quality']
            if quality!='blue':s=0
            if quality=='white':c=h=m=0
            elif quality=='green':
                # First candidate secondary from equipment-proposal-v1, never a third affix.
                first={'weapon':'c','chest':'m','pants':'m','belt':'h','shoulder':'c','boots':'h',
                       'bracelet':'m','ring':'c','necklace':'h','auxiliary':'h','stone':'m','earring':'m','trinket':'m'}[slot]
                c=c if first=='c' else 0;h=h if first=='h' else 0;m=m if first=='m' else 0
        elif affixes and (slot_modes.get(slot) if slot_modes is not None else mode)!='starter':
            if slot=='weapon': h=0
            if slot=='earring': c=0
        if hit_affixes and mode!='starter':
            if slot=='weapon': h=0
            if slot=='earring': c=0
        main+=s*scale(slot)
        crit_rating+=c*scale(slot)
        haste_rating+=h*scale(slot)
        mastery_rating+=m*scale(slot)
        hp_item+=hp*scale(slot)
        armor+=defense*scale(slot)
    for slot, mp in [('bracelet',20),('ring',20),('necklace',30),('stone',40),('trinket',20)]:
        if slot in active: mp_item+=mp*scale(slot)
    a2=purple and len(active&ARMOR)>=2
    a5=purple and ARMOR<=active
    j=purple and JEWELRY<=active
    sp=purple and SPECIAL<=active
    sets=int(a2)+int(j)+int(sp)
    strength=(20+3*n+.05*n*n+main+8*sets)*(1+main_buff)
    agility=10+n+8*sets
    intelligence=10+n+8*sets
    base=4+(weapon if 'weapon' in active else 0)
    base+=4*scale('auxiliary') if 'auxiliary' in active else 0
    base+=6*scale('earring') if 'earring' in active else 0
    if affixes:
        base+=12*item_scale*roll if 'weapon' in active else 0
        base+=2*item_scale*roll if 'earring' in active else 0
    if flat_buff_stage=='base': base+=flat_buff
    ap=base*(1+COEFF*strength+(.10 if a2 else 0)+(.12 if j else 0)+(.10 if sp else 0))
    ap+=w_enhance if 'weapon' in active else 0
    ap+=e_enhance if 'earring' in active else 0
    if flat_buff_stage=='final': ap+=flat_buff
    hit_rating=((12 if 'weapon' in active else 0)+(2 if 'earring' in active else 0))*item_scale if hit_affixes and mode!='starter' else 0
    hit_bonus=hit_rating*.005+(.05 if j else 0)
    crit=min(1,.04+agility*.002+crit_rating*.005+(.05 if j else 0))
    haste=min(1.0,.02+.48*haste_rating/(10+haste_rating)+(.05 if j else 0)+haste_bonus)
    mastery=.02+.58*mastery_rating/(20+mastery_rating)+(.05 if j else 0)
    dmg=.01*len(active&ARMOR) if purple else 0
    pen=.01*len(active&SPECIAL) if purple else 0
    crit_mult=1.5+(.03*len(active&JEWELRY) if purple else 0)
    mitigation=100/(100+25*(1-pen))
    common=(1+crit*(crit_mult-1))*mitigation
    skills={}
    for name,unlock,b,g,k,bleed in SKILLS:
        if level<unlock: continue
        rank=1+(level-unlock)//2
        fixed=b+(rank-1)*g
        mult=(1+mastery)*(1+dmg+(.12 if a5 else 0))*common
        skills[name]={'rank':rank,'direct':(.25*fixed+(k+.75*fixed/308.44)*ap)*mult,
                      'bleed':ap*bleed*mult,'mana':MANA[name][0]+(rank-1)*MANA[name][1],
                      'cd':CD[name]*(.9 if sp else 1)/(1+haste),
                      'cast':CAST[name]/(1+haste)}
    return {'hit_score':1+hit_bonus,'crit':crit,'ap':ap,'hp':400+40*n+n*n+10*strength+hp_item,
            'mp':100+8*n+3*intelligence+mp_item,'armor':armor,
            'basic_cycle_damage':3*ap*(1+dmg)*common,
            'basic_cycle_time':1/(1+haste),'haste':haste,'skills':skills}


def schedule(s, duration=60):
    """Perfect stationary target, 10ms simulation; cycle basic is aggregate.
    CDs start on cast start, damage occurs at cast end. Five DOT ticks, first
    one interval after hit; never settle ticks beyond duration early.
    """
    dt=.01
    mp=s['mp']; now=busy_until=0
    next_cast={k:0 for k in s['skills']}
    pending=[]; counts={k:0 for k in s['skills']}
    direct=dot=basic=spent=regen=0
    while now<=duration+1e-7:
        if now>0:
            gain=min(s['mp']-mp,s['mp']*.01*dt)
            mp+=gain; regen+=gain
        ready=[event for event in pending if event[0]<=now+1e-7]
        pending=[event for event in pending if event[0]>now+1e-7]
        for _,kind,damage in ready:
            if kind=='direct': direct+=damage
            elif kind=='dot': dot+=damage
            else: basic+=damage
        if now>=busy_until-1e-7 and now<duration-1e-7:
            selected=next((k for k in ['outrage','draw','mountain','cross']
                           if k in s['skills'] and now>=next_cast[k]-1e-7
                           and mp+1e-7>=s['skills'][k]['mana']),None)
            if selected:
                skill=s['skills'][selected]
                mp-=skill['mana']; spent+=skill['mana']; counts[selected]+=1
                next_cast[selected]=now+skill['cd']; busy_until=now+skill['cast']
                pending.append((busy_until,'direct',skill['direct']))
                interval=1/(1+s['haste'])
                for tick in range(1,6):
                    pending.append((busy_until+tick*interval,'dot',skill['bleed']/5))
            else:
                busy_until=now+s['basic_cycle_time']
                pending.append((busy_until,'basic',s['basic_cycle_damage']))
        now=round(now+dt,8)
    assert mp>=-1e-6
    assert math.isclose(s['mp']+regen-spent,mp,abs_tol=1e-6)
    return dict(damage=direct+dot+basic,basic=basic,direct=direct,bleed=dot,
                casts=counts,mana_spent=spent,effective_regen=regen,mana_end=mp,
                unsettled_events=len(pending))


def main():
    reference=build(30,'purple')
    assert math.isclose(reference['ap'],308.44)
    assert math.isclose(reference['mp'],651)
    # Independent +10 arithmetic and slot disable/idempotence checks.
    assert math.isclose(build(30,'purple',w_enhance=24,e_enhance=16)['ap'],348.44)
    assert build(30,'purple',disabled=['weapon','weapon'])==build(30,'purple',disabled=['weapon'])
    assert 'outrage' not in build(19)['skills'] and build(20)['skills']['outrage']['rank']==1
    assert build(30)['skills']['cross']['rank']==15
    growth=[]
    for level in [1,5,10,15,20,25,30]:
        mode='starter' if level<10 else 'blue'
        intact=build(level,mode); broken=build(level,mode,disabled=['weapon'])
        a=schedule(intact); b=schedule(broken)
        growth.append(dict(level=level,mode=mode,ap=intact['ap'],broken_ap=broken['ap'],
                           skills={k:dict(rank=v['rank'],direct=v['direct'],bleed=v['bleed'],
                           broken_retained=(broken['skills'][k]['direct']+broken['skills'][k]['bleed'])/(v['direct']+v['bleed']))
                           for k,v in intact['skills'].items()},
                           schedule=a,broken_schedule=b,broken_schedule_retained=b['damage']/a['damage']))
    cases=[]
    for label,kwargs in [
       ('balanced',{}),('both_plus10',dict(w_enhance=24,e_enhance=16)),
       ('ap_affixes_low',dict(affixes=True,roll=.9)),
       ('ap_affixes_high',dict(affixes=True,roll=1.1)),
       ('primary_buff_20pct',dict(main_buff=.2)),
       ('final_ap_buff_20',dict(flat_buff=20)),
       ('base_ap_buff_20',dict(flat_buff=20,flat_buff_stage='base')),
       ('combined_final_buff',dict(affixes=True,roll=1.1,w_enhance=24,e_enhance=16,flat_buff=20)),
    ]:
        a=build(30,'purple',**kwargs); b=build(30,'purple',disabled=['weapon'],**kwargs)
        sa=schedule(a); sb=schedule(b)
        cases.append(dict(case=label,intact_ap=a['ap'],broken_ap=b['ap'],
                          basic_retained=(b['basic_cycle_damage']/b['basic_cycle_time'])/(a['basic_cycle_damage']/a['basic_cycle_time']),
                          skill_retained={k:(b['skills'][k]['direct']+b['skills'][k]['bleed'])/(v['direct']+v['bleed']) for k,v in a['skills'].items()},
                          schedule=sa,broken_schedule=sb,scheduled_retained=sb['damage']/sa['damage']))
    removal=[]
    r=schedule(reference)
    for slot in sorted(ARMOR|{'earring','weapon'}):
        b=build(30,'purple',disabled=[slot])
        removal.append(dict(slot=slot,ap=b['ap'],scheduled_retained=schedule(b)['damage']/r['damage']))
    # DOT bookkeeping: five shares add to one budget. Casts near the cutoff
    # retain unsettled tails; extending the horizon cannot reduce damage.
    for v in reference['skills'].values(): assert math.isclose(sum([v['bleed']/5]*5),v['bleed'])
    assert schedule(reference,61)['damage']>=r['damage']
    print(json.dumps(dict(growth=growth,endgame_cases=cases,single_slot_disabled=removal,
         checks='PASS: AP/MP anchors, enhancement, disable idempotence, unlock/ranks, mana conservation, DOT shares, time horizon'),ensure_ascii=False,indent=2))

if __name__=='__main__': main()
