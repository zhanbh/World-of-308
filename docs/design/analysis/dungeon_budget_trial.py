"""Seeded design stress model, NOT a game-engine or AI simulation.
Seven rooms, per-target HP, cast/DoT events, incoming attacks, potions and wear.
No network, dependencies, or writes. Print JSON report.
"""
import heapq
import json
import math
import random
import statistics
from weapon_synergy_validation import build

ROOMS=[['melee']*3,['melee']*5,['melee']*3+['ranged']*2,
       ['boar']*2+['melee']*2,['elite']+['ranged']*2,
       ['melee']*3+['boar']+['ranged']*2,['boss']]
REF={1:(36,.02,.02),5:(66.24,.05,.05),10:(104.84,.1,.1),15:(153.44,.15,.15)}
POTS={1:(150,40,20),5:(300,70,40),10:(550,110,70),15:(900,160,100)}
GOLD=lambda l:500+40*(l-1)+10*(l-1)**2
# Enemy attacks use old reference damage U, not current player's stats.
ATTACK={'melee':(3.5,1),'ranged':(4,1),'boar':(5,1.5),'elite':(4,2.5),'boss':(3.5,2.5)}


def run(level=1, profile='normal', seed=0, hp_source='growth', weapon_current=None,
        use_pots=True, max_seconds=900, mode_override=None, control_mode='none', segmented=False, boss_policy='immune', body_times=None, haste_bonus=0, player_hit_mode='guaranteed', hit_affixes=False, enemy_evasion=None):
    assert player_hit_mode in ('guaranteed','per_segment')
    evade=enemy_evasion or {'melee':.05,'ranged':.05,'boar':.05,'elite':.08,'boss':.10}
    hit_rng=random.Random(seed+1000003)
    assert boss_policy in ('immune','damage_window','window')
    assert control_mode in ('none','knockdown','flinch')
    rng=random.Random(seed)
    uptime, hit_chance={'careful':(.8,.1),'normal':(.65,.3),'pressure':(.5,.6)}[profile]
    mode=mode_override or ('starter' if level<10 else 'blue')
    def make(disabled=()):
        result=build(level,mode,disabled=disabled,haste_bonus=haste_bonus,hit_affixes=hit_affixes)
        if body_times is not None:
            for skill,values in result['skills'].items():
                values['cast']=body_times[skill]/(1+result['haste'])
        return result
    original=make(); worn={'weapon'} if mode=='starter' else set(['weapon','chest','pants','belt','shoulder','boots','earring'])
    ilvl={1:10,5:15,10:20,15:25}[level]
    qi=0 if level==1 else 1 if mode=='starter' else 2
    wmax=60+2*(ilvl-10)+20*qi
    maximum={slot:wmax if slot=='weapon' else 100 for slot in worn}
    durability={slot:maximum[slot] for slot in worn}
    if weapon_current is not None: durability['weapon']=weapon_current
    initial=durability.copy()
    assert durability['weapon']>0 # New entry gate. Mid-run zero is allowed.
    s=original
    hp=s['hp']; mp=s['mp']; hp_n=mp_n=0; hp_cd=mp_cd=0
    next_cast={k:0 for k in s['skills']}; busy=now=0
    events=[]; sequence=0
    kills=[]; room_times=[]; cleared=0; dead=False; break_time=None
    knockdowns=flinches=cancelled_attacks=0
    hit_attempts=hit_misses=dot_ticks=0
    hpot,mpot,price=POTS[level]
    def enqueue(t, kind, target, damage):
        nonlocal sequence
        sequence+=1
        heapq.heappush(events,(t,sequence,kind,target,damage))
    def update():
        nonlocal s,hp,mp
        s=make([slot for slot,val in durability.items() if val==0])
        hp=min(hp,s['hp']); mp=min(mp,s['mp'])
    ref,ref_haste,ref_mastery=REF[level]
    unit=ref*.8
    def monster_hp(kind):
        if kind in ('elite','boss') and hp_source=='growth':
            return ref*(35 if kind=='elite' else 130)*(1+ref_haste)*(1+ref_mastery)
        return unit*{'melee':3.5,'ranged':2.5,'boar':5,'elite':22,'boss':80}[kind]
    dt=.05
    for room_index,kinds in enumerate(ROOMS):
        started=now
        enemies=[dict(kind=k,hp=monster_hp(k),maximum=monster_hp(k),next_attack=now+ATTACK[k][0], accumulated=0, down_until=0, protected_until=0, down=False, weak_until=0, phase2_attacks=0) for k in kinds]
        while any(e['hp']>0 for e in enemies) and now<max_seconds:
            hp=min(s['hp'],hp+s['hp']*.002*dt)
            mp=min(s['mp'],mp+s['mp']*.01*dt)
            # Resolve previously started player effects; snapshot budget survives wear.
            while events and events[0][0]<=now+1e-8:
                _,_,kind,target,damage=heapq.heappop(events)
                if enemies[target]['hp']<=0: continue
                e=enemies[target]
                if kind=='segment':
                    payload=damage
                    hit_attempts+=1
                    p=max(0,min(1,payload['hit_score']-evade[e['kind']]))
                    if p<1 and hit_rng.random()>=p:
                        hit_misses+=1
                        continue
                    damage=payload['direct'];kind=payload['kind']
                    if payload['bleed']>0:
                        for tick in range(1,6):
                            enqueue(now+tick*payload['interval'],'dot',target,payload['bleed']/5)
                if kind=='dot':dot_ticks+=1
                if boss_policy!='immune' and e['kind']=='boss' and now<e['weak_until']: damage*=1.2
                e['hp']-=damage
                if e['hp']>0 and kind!='dot' and control_mode!='none' and (e['kind']!='boss' or (boss_policy=='window' and now<e['weak_until'])):
                    if e['down'] and now>=e['down_until']:
                        e['down']=False; e['accumulated']=0
                    if not e['down'] and now>=e['protected_until']:
                        e['accumulated']+=damage
                        threshold=e['maximum']*(.2 if e['kind'] in ('elite','boss') else .35)
                        if kind=='force' or e['accumulated']>=threshold:
                            e['down']=True; e['down_until']=now+.8
                            e['protected_until']=e['down_until']+.24+(.6 if e['kind']=='elite' else 0)
                            e['next_attack']=e['protected_until']+ATTACK[e['kind']][0]
                            if e['kind']=='boss':
                                e['down_until']=min(e['down_until'],e['weak_until'])
                                e['protected_until']=min(e['protected_until'],e['weak_until'])
                            e['accumulated']=0; knockdowns+=1; cancelled_attacks+=1
                        elif control_mode=='flinch' and e['kind'] in ('melee','ranged'):
                            e['next_attack']=max(e['next_attack'],now+.28)
                            flinches+=1

                if e['hp']<=0:
                    kills.append(e['kind'])
                    if e['kind']=='boss':
                        for other in enemies:
                            if other['hp']>0: other['hp']=0; kills.append(other['kind'])
            if not any(e['hp']>0 for e in enemies): break
            # Independent attack avoidance draws. No physics/actual telegraph AI.
            for e in enemies:
                if e['hp']<=0 or now<e['next_attack']-1e-8: continue
                if boss_policy!='immune' and e['kind']=='boss' and now<e['weak_until']:
                    continue
                if control_mode!='none' and now<e['protected_until']:
                    continue
                if e['down'] and now>=e['down_until']:
                    e['down']=False; e['accumulated']=0
                interval,damage_units=ATTACK[e['kind']]
                enraged=e['kind']=='boss' and e['hp']<=e['maximum']*.5
                e['next_attack']=now+interval/(1.15 if enraged else 1)
                if rng.random()<hit_chance:
                    hp-=unit*damage_units*100/(100+s['armor'])
                if boss_policy!='immune' and enraged:
                    e['phase2_attacks']+=1
                    if e['phase2_attacks']%3==0:
                        e['weak_until']=now+3
                        e['accumulated']=0
                        e['next_attack']=max(e['next_attack'],e['weak_until']+interval/1.15)
            if hp<=0:
                dead=True
                for slot in durability: durability[slot]=max(0,durability[slot]-5)
                break
            if use_pots and hp<=s['hp']*.4 and hp_cd<=now and hp_n<8:
                hp=min(s['hp'],hp+hpot); hp_n+=1; hp_cd=now+10
            if use_pots and mp<=s['mp']*.25 and mp_cd<=now and mp_n<8:
                mp=min(s['mp'],mp+mpot); mp_n+=1; mp_cd=now+10
            # Deterministic 5s duty cycle models movement time. Actions started
            # before downtime still finish; thus uptime is intent, not measured DPS.
            if now>=busy-1e-8 and now%5<5*uptime:
                selected=next((k for k in ['outrage','draw','mountain','cross']
                               if k in s['skills'] and now>=next_cast[k]-1e-8
                               and mp>=s['skills'][k]['mana']),None)
                alive=[i for i,e in enumerate(enemies) if e['hp']>0]
                if selected:
                    skill=s['skills'][selected]; mp-=skill['mana']; next_cast[selected]=now+skill['cd']
                    busy=now+skill['cast']
                    # Full per-target budget on at most TWO aligned enemies.
                    stages={'cross':[(.29,.5),(.34,.5)],'mountain':[(.24,.25),(.48,.30),(.68,.45)],
                            'draw':[(.44,1)],'outrage':[(.88,.25),(1,.25),(1.2,.25),(1.4,.25)]}
                    for target in alive[:2]:
                        hits=stages[selected] if segmented else [(skill['cast']*(1+s['haste']),1)]
                        for index,(offset,weight) in enumerate(hits):
                            force=segmented and ((selected=='mountain' and index==2) or (selected=='outrage' and index==0))
                            hit_time=now+offset/(1+s['haste'])
                            if player_hit_mode=='per_segment':
                                enqueue(hit_time,'segment',target,dict(kind='force' if force else 'direct',
                                      direct=skill['direct']*weight,bleed=skill['bleed']*weight,
                                      interval=1/(1+s['haste']),hit_score=s['hit_score']))
                            else:
                                enqueue(hit_time,'force' if force else 'direct',target,skill['direct']*weight)
                                for tick in range(1,6): enqueue(hit_time+tick/(1+s['haste']),'dot',target,skill['bleed']*weight/5)
                else:
                    busy=now+s['basic_cycle_time']
                    if segmented:
                        for offset,weight in [(.112,.3),(.4163636364,1/3),(.7433333333,11/30)]:
                            if player_hit_mode=='per_segment':
                                enqueue(now+offset/(1+s['haste']),'segment',alive[0],dict(kind='basic',
                                      direct=s['basic_cycle_damage']*weight,bleed=0,interval=1/(1+s['haste']),hit_score=s['hit_score']))
                            else:
                                enqueue(now+offset/(1+s['haste']),'basic',alive[0],s['basic_cycle_damage']*weight)
                    else:
                        enqueue(busy,'basic',alive[0],s['basic_cycle_damage'])
            now=round(now+dt,8)
        room_times.append(now-started)
        if dead or any(e['hp']>0 for e in enemies): break
        cleared+=1
        for slot in durability: durability[slot]=max(0,durability[slot]-1)
        if durability['weapon']==0 and break_time is None: break_time=now
        update()
        # Discard room-bound effects; no reward from hitting absent targets.
        events.clear(); busy=now
        if room_index<len(ROOMS)-1:
            hp=min(s['hp'],hp+s['hp']*.01*3)
            mp=min(s['mp'],mp+s['mp']*.03*3)
            now+=3 # Cooldowns advance; no room CD reset.
    success=cleared==7
    # Weight-conserving expected budget, not independent per-monster random gold.
    weight={'melee':1,'ranged':1,'boar':1.5,'elite':4,'boss':8}
    total_weight=sum(weight[k] for room in ROOMS for k in room)
    earned_kill=math.floor(GOLD(level)*.7*sum(weight[k] for k in kills)/total_weight)
    gross=GOLD(level) if success else earned_kill
    unit_price=math.ceil(ilvl/10*(1 if qi<2 else 1.5))
    repair=sum((maximum[k]-v)*unit_price for k,v in durability.items())
    incremental_repair=sum((initial[k]-v)*unit_price for k,v in durability.items())
    potion_replacement=(hp_n+mp_n)*price
    assert all(0<=v<=maximum[k] for k,v in durability.items())
    assert 0<=gross<=GOLD(level)
    assert hp_n<=8 and mp_n<=8
    return dict(success=success,death=dead,timeout=not success and not dead,
                seconds=now,rooms=cleared,room_seconds=room_times,hp_pots=hp_n,mp_pots=mp_n,
                gross=gross,repair_full=repair,repair_this_run=incremental_repair,
                potion_replacement=potion_replacement,net_replacement=gross-repair-potion_replacement,
                hit_attempts=hit_attempts,hit_misses=hit_misses,dot_ticks=dot_ticks,
                knockdowns=knockdowns,flinches=flinches,attack_reschedules=cancelled_attacks,
                hp_remaining=max(0,hp),weapon_remaining=durability['weapon'],weapon_break_time=break_time)


def main():
    results=[]
    for level in [1,5,10,15]:
        for profile in ['careful','normal','pressure']:
            rows=[run(level,profile,seed) for seed in range(20)]
            successes=[r for r in rows if r['success']]
            results.append(dict(level=level,profile=profile,samples=20,clears=len(successes),
                 deaths=sum(r['death'] for r in rows),
                 clear_seconds_median=statistics.median(r['seconds'] for r in successes) if successes else None,
                 hp_pots_mean=statistics.mean(r['hp_pots'] for r in rows),
                 mp_pots_mean=statistics.mean(r['mp_pots'] for r in rows),
                 net_mean=statistics.mean(r['net_replacement'] for r in rows)))
    guaranteed=[]
    for level in [10,15]:
        for profile in ['normal','pressure']:
            rows=[run(level,profile,seed,mode_override='starter') for seed in range(20)]
            successes=[r for r in rows if r['success']]
            guaranteed.append(dict(level=level,profile=profile,samples=20,clears=len(successes),
                  clear_seconds_median=statistics.median(r['seconds'] for r in successes) if successes else None,
                  hp_pots_mean=statistics.mean(r['hp_pots'] for r in rows),
                  mp_pots_mean=statistics.mean(r['mp_pots'] for r in rows),
                  net_mean=statistics.mean(r['net_replacement'] for r in rows)))
    examples={
      'normal_seed0':run(), 'shorter_hp_budget_seed0':run(hp_source='room'),
      'no_pots_seed0':run(use_pots=False),
      'weapon_one_durability_seed0':run(weapon_current=1),
      'level10_guaranteed_only_seed0':run(level=10,mode_override='starter'),
      'level15_guaranteed_only_seed0':run(level=15,mode_override='starter'),
    }
    # Entry gate is distinct from in-challenge zero. Verify zero entry rejected.
    try: run(weapon_current=0)
    except AssertionError: pass
    else: raise AssertionError('zero weapon allowed new entry')
    low=examples['weapon_one_durability_seed0']
    assert low['weapon_break_time'] is not None
    assert low['seconds']>low['weapon_break_time']
    assert examples['normal_seed0']==run(seed=0)
    assert sum(len(r) for r in ROOMS)==27
    print(json.dumps(dict(results=results,guaranteed_weapon=guaranteed,examples=examples,
       checks='PASS: 27 monsters, durability clamps, entry gate, in-run continuation, potion caps, gold bounds, seeded replay'),ensure_ascii=False,indent=2))

if __name__=='__main__': main()
