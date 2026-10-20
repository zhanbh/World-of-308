"""Latest 28-enemy temporal sensitivity fixture, NOT game-engine or AI simulation.
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
        use_pots=True, max_seconds=900, mode_override=None, control_mode='none', segmented=False, boss_policy='casting', body_times=None, haste_bonus=0, player_hit_mode='guaranteed', hit_affixes=False, enemy_evasion=None, purple_room=0, armor_seconds=2.0, roar_exposure=.3, slot_modes=None, uptime_override=None, approach_seconds=0, progression=False, xp_fraction=0.0, xp_decay=False):
    assert player_hit_mode in ('guaranteed','per_segment')
    evade=enemy_evasion or {'melee':.05,'ranged':.05,'boar':.05,'elite':.08,'boss':.10}
    hit_rng=random.Random(seed+1000003)
    assert boss_policy in ('immune','damage_window','window','casting')
    assert 0 <= purple_room < 6 and armor_seconds > 0 and 0 <= roar_exposure <= 1
    rooms=[list(r) for r in ROOMS]
    rooms[purple_room].append('melee')
    boss_casts=roar_ticks=phase_changes=0
    boss_hyperarmor_hits=boss_control_hits=0
    assert control_mode in ('none','knockdown','flinch')
    rng=random.Random(seed)
    uptime, hit_chance={'careful':(.8,.1),'normal':(.65,.3),'pressure':(.5,.6)}[profile]
    if uptime_override is not None:
        assert 0 < uptime_override <= 1
        uptime=uptime_override
    assert approach_seconds >= 0
    time_budget=dict(action=0.0,approach=0.0,reposition=0.0,ready_idle=0.0,player_down=0.0,transition=0.0)
    player_down_until=0.0
    mode=mode_override or ('starter' if level<10 else 'blue')
    ilvl={1:10,5:15,10:20,15:25}[level]
    assert 0<=xp_fraction<1
    character=None;level_events=[];earned_xp=0
    if progression:
        from progression_award_trial import Character,XP,challenge_awards
        character=Character(level=level,xp=int(XP[level]*xp_fraction),weapon_level=ilvl,quality='white' if level==1 else 'green')
        xp_parts=challenge_awards(level)
        ordinary_xp=xp_parts[0]
    def make(disabled=()):
        result=build(character.level if character else level,mode,disabled=disabled,haste_bonus=haste_bonus,hit_affixes=hit_affixes,slot_modes=slot_modes,
                     item_level=ilvl if character else None,starter_quality=character.quality if character else None)
        if body_times is not None:
            for skill,values in result['skills'].items():
                values['cast']=body_times[skill]/(1+result['haste'])
        return result
    original=make(); worn={'weapon'} if mode=='starter' else set(['weapon','chest','pants','belt','shoulder','boots','earring'])
    if slot_modes is not None: worn &= set(slot_modes)
    qi=0 if level==1 else 1 if mode=='starter' else 2
    wmax=60+2*(ilvl-10)+20*qi
    if slot_modes is not None and slot_modes['weapon']=='starter':
        wmax=60+2*(ilvl-10)+(0 if level==1 else 20)
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
    def award_xp(amount,reason,key):
        nonlocal hp,mp,earned_xp
        if character is None:return
        factor=max(.1,1-.1*max(0,character.level-level)) if xp_decay else 1
        value=math.floor(amount*factor);earned_xp+=value
        character.dead=hp<=0
        pending_before=repr(events);cd_before=next_cast.copy()
        gained=character.award(value,key)
        if gained:
            update()
            for skill in s['skills']:next_cast.setdefault(skill,0)
            if hp>0:hp=s['hp'];mp=s['mp']
            assert repr(events)==pending_before
            assert all(next_cast[k]==v for k,v in cd_before.items())
            assert character.weapon_level==ilvl
            level_events.append(dict(time=now,reason=reason,levels=gained,hp=hp,mp=mp,weapon_level=character.weapon_level,ap=s['ap']))
    ref,ref_haste,ref_mastery=REF[level]
    unit=ref*.8
    def monster_hp(kind):
        if kind in ('elite','boss') and hp_source=='growth':
            return ref*(35 if kind=='elite' else 130)*(1+ref_haste)*(1+ref_mastery)
        return unit*{'melee':3.5,'ranged':2.5,'boar':5,'elite':22,'boss':80}[kind]
    dt=.05
    for room_index,kinds in enumerate(rooms):
        started=now
        approach_until=now+approach_seconds
        enemies=[dict(kind=k,hp=monster_hp(k),maximum=monster_hp(k),next_attack=now+ATTACK[k][0], accumulated=0, down_until=0, protected_until=0, down=False, weak_until=0, phase2_attacks=0, cast_until=0, phase=1, pending_phase=False, roar_cd=0, attack_index=0, roar_damage=0, roar_down=False) for k in kinds]
        for index,e in enumerate(enemies):e['purple']=room_index==purple_room and index==len(enemies)-1
        while any(e['hp']>0 for e in enemies) and now<max_seconds:
            hp=min(s['hp'],hp+s['hp']*.002*dt)
            mp=min(s['mp'],mp+s['mp']*.01*dt)
            # Resolve previously started player effects; snapshot budget survives wear.
            while events and events[0][0]<=now+1e-8:
                _,_,kind,target,damage=heapq.heappop(events)
                if kind.startswith('incoming_'):
                    boss=next(e for e in enemies if e['kind']=='boss')
                    if boss['hp']<=0: continue
                    probability=roar_exposure if kind=='incoming_roar' else hit_chance
                    if rng.random()<probability:
                        actual=damage*100/(100+s['armor']); hp-=actual
                        if kind=='incoming_roar':
                            roar_ticks+=1; boss['roar_damage']+=actual
                            if not boss['roar_down'] and boss['roar_damage']>=s['hp']*.15:
                                boss['roar_down']=True; player_down_until=now+.8; busy=max(busy,player_down_until)
                    continue
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
                if e['kind']=='boss' and kind!='dot':
                    if now < e['cast_until']: boss_hyperarmor_hits+=1
                    else: boss_control_hits+=1
                e['hp']-=damage
                if e['hp']>0 and kind!='dot' and control_mode!='none' and (e['kind']!='boss' or (boss_policy=='window' and now<e['weak_until']) or (boss_policy=='casting' and now>=e['cast_until'])):
                    if e['down'] and now>=e['down_until']:
                        e['down']=False; e['accumulated']=0
                    if not e['down'] and now>=e['protected_until']:
                        e['accumulated']+=damage
                        threshold=e['maximum']*(.2 if e['kind'] in ('elite','boss') else .35)
                        if kind=='force' or e['accumulated']>=threshold:
                            e['down']=True; e['down_until']=now+.8
                            e['protected_until']=e['down_until']+.24+(.6 if e['kind']=='elite' else 0)
                            e['next_attack']=e['protected_until']+ATTACK[e['kind']][0]
                            if e['kind']=='boss' and boss_policy=='window':
                                e['down_until']=min(e['down_until'],e['weak_until'])
                                e['protected_until']=min(e['protected_until'],e['weak_until'])
                            e['accumulated']=0; knockdowns+=1; cancelled_attacks+=1
                        elif control_mode=='flinch' and e['kind'] in ('melee','ranged','boss','elite'):
                            e['next_attack']=max(e['next_attack'],now+.28)
                            flinches+=1

                if e['hp']<=0:
                    kills.append(e['kind'])
                    if character:
                        amount=xp_parts[-2] if e['kind']=='boss' else ordinary_xp*(4 if e['kind']=='elite' else 2 if e['purple'] else 1)
                        award_xp(amount,'kill',('kill',len(kills)))
                    if e['kind']=='boss':
                        for other in enemies:
                            if other['hp']>0: other['hp']=0; kills.append(other['kind'])
            if not any(e['hp']>0 for e in enemies): break
            # Candidate temporal encounter: no coordinates or real AI.
            for e in enemies:
                if e['hp']<=0: continue
                if e['kind']=='boss' and boss_policy=='casting':
                    if e['hp']<=e['maximum']*.5 and e['phase']==1:
                        e['pending_phase']=True
                    if e['pending_phase'] and now>=e['cast_until']:
                        e['phase']=2; e['pending_phase']=False; phase_changes+=1
                    if now<e['protected_until'] or now<e['next_attack']-1e-8: continue
                    # Roar independent cooldown starts at windup, never reset on phase change.
                    roar=now>=e['roar_cd'] and e['attack_index']%3==1
                    duration=3.0 if roar else armor_seconds
                    e['cast_until']=now+duration
                    e['next_attack']=e['cast_until']+2.0
                    e['attack_index']+=1; boss_casts+=1
                    if roar:
                        e['roar_cd']=now+12
                        e['roar_damage']=0; e['roar_down']=False
                        for j in range(1,7):
                            enqueue(now+j*.5,'incoming_roar',0,unit*.45)
                    else:
                        enqueue(now+duration,'incoming_boss',0,unit*(3 if e['phase']==2 else 2.5))
                    continue
                if now<e['next_attack']-1e-8 or now<e['protected_until']: continue
                interval,damage_units=ATTACK[e['kind']]
                e['next_attack']=now+interval
                if rng.random()<hit_chance:
                    hp-=unit*damage_units*100/(100+s['armor'])
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
            if now>=busy-1e-8 and now>=approach_until and now%5<5*uptime:
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
            category=('player_down' if now<player_down_until else 'approach' if now<approach_until else
                      'action' if now<busy else 'reposition' if now%5>=5*uptime else 'ready_idle')
            time_budget[category]+=dt
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
            time_budget['transition']+=3
            now+=3 # Cooldowns advance; no room CD reset.
    success=cleared==7
    if success and character:award_xp(xp_parts[-1],'clear',('clear',0))
    # Weight-conserving expected budget, not independent per-monster random gold.
    weight={'melee':1,'ranged':1,'boar':1.5,'elite':4,'boss':8}
    total_weight=sum(weight[k] for room in rooms for k in room)
    earned_kill=math.floor(GOLD(level)*.7*sum(weight[k] for k in kills)/total_weight)
    gross=GOLD(level) if success else earned_kill
    def unit_price(slot):
        quality=slot_modes[slot] if slot_modes is not None else mode
        return math.ceil(ilvl/10*(1 if quality=='starter' else 1.5))
    repair=sum((maximum[k]-v)*unit_price(k) for k,v in durability.items())
    incremental_repair=sum((initial[k]-v)*unit_price(k) for k,v in durability.items())
    potion_replacement=(hp_n+mp_n)*price
    assert all(0<=v<=maximum[k] for k,v in durability.items())
    assert 0<=gross<=GOLD(level)
    assert hp_n<=8 and mp_n<=8
    assert math.isclose(sum(time_budget.values()),now,abs_tol=1e-6)
    return dict(progression=None if character is None else dict(level=character.level,xp=character.xp,earned_xp=earned_xp,
                locked_monster_level=level,held_weapon_level=character.weapon_level,quality=character.quality,mail=character.mail,level_events=level_events),time_budget=time_budget,monsters=sum(map(len,rooms)),purple_room=purple_room+1,boss_casts=boss_casts,roar_ticks=roar_ticks,phase_changes=phase_changes,boss_hyperarmor_hits=boss_hyperarmor_hits,boss_control_hits=boss_control_hits,success=success,death=dead,timeout=not success and not dead,
                seconds=now,rooms=cleared,room_seconds=room_times,hp_pots=hp_n,mp_pots=mp_n,
                gross=gross,repair_full=repair,repair_this_run=incremental_repair,
                potion_replacement=potion_replacement,net_replacement=gross-repair-potion_replacement,
                hit_attempts=hit_attempts,hit_misses=hit_misses,dot_ticks=dot_ticks,
                knockdowns=knockdowns,flinches=flinches,attack_reschedules=cancelled_attacks,
                hp_remaining=max(0,hp),weapon_remaining=durability['weapon'],weapon_break_time=break_time)



def main():
    from haste_ceiling_trial import current_body_times
    body,_=current_body_times()
    rows=[]
    for level,gear in [(1,'starter'),(5,'starter'),(10,'starter'),(10,'blue'),(15,'starter'),(15,'blue')]:
        for exposure in [.1,.3,.6]:
            results=[run(level,seed=seed,mode_override=gear,control_mode='flinch',segmented=True,
                         body_times=body,player_hit_mode='per_segment',purple_room=seed%6,
                         roar_exposure=exposure) for seed in range(60)]
            completed=[r for r in results if r['success']]
            assert all(r['monsters']==28 and r['phase_changes']<=1 for r in results)
            assert all(0<=r['gross']<=GOLD(level) for r in results)
            rows.append(dict(level=level,gear=gear,roar_exposure=exposure,samples=60,
                clears=len(completed),median_seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                hp_pots=statistics.mean(r['hp_pots'] for r in results),
                mp_pots=statistics.mean(r['mp_pots'] for r in results),
                net=statistics.mean(r['net_replacement'] for r in results),
                boss_casts=sum(r['boss_casts'] for r in results),
                hyperarmor_hits=sum(r['boss_hyperarmor_hits'] for r in results),
                normal_state_hits=sum(r['boss_control_hits'] for r in results)))
    assert run(seed=7)==run(seed=7)
    print(json.dumps(dict(results=rows,checks='PASS: 28 enemies, at most one phase change, budget bounds, seeded replay',
        limitations=['Candidate temporal sensitivity only; no coordinate geometry, knockback exit or true player AI.',
          'Purple melee template and equal room weights are unconfirmed fixtures.',
          'Roar: candidate 3 seconds/6 ticks/12s CD/15% HP knockdown; exposure is an abstract per-tick probability.',
          'Player knockdown delays new actions but does not cancel started attacks; no extra immunity.',
          'Boss candidate 2s cast and 2s recovery; phase completes current cast, cooldown retained.',
          'Elite horizontal sweep and group attack coordination not yet represented.',
          'Armor25 and expected crit are inherited static fixtures; no live-defense changes tested.',
          'Current animation body + historical segment offsets; not full animation or input replay.',
          'First-lethal cutoff, 8 HP/MP pot inventory fixture; not a gameplay limit or player success rate.',
          'No experience/level-up, revival, low-stamina or mid-run dynamic loadout simulation.']),indent=2))

if __name__=='__main__': main()
