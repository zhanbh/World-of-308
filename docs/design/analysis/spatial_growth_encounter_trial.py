"""Unified seven-room DESIGN simulation: positions, casts, response, kills and XP.
Candidate AI/geometry, expected crit. Not Cocos/backend or a balance configuration.
"""
import heapq
import json
import math
import random
import statistics
from action_warning_timeline_trial import actions
from displacement_boundary_trial import sweep
from first_dungeon_sync_trial import REF,POTS,GOLD
from group_attack_coordination_trial import contact as group_contact
from progression_award_trial import Character,XP,challenge_awards
from skill_displacement_dodge_trial import displacement
from spatial_dodge_trial import at,valid,safe as geometry_safe,travel,segment_distance
from weapon_synergy_validation import build
from difficulty_behavior_trial import PROFILES, destination
from enemy_interrupt_policy_trial import may_interrupt
from enemy_role_contract_trial import assign_roles,retreat_permits,validate_config

DT=1/120
SPAWNS=[
 [('melee',-10,-15),('melee',30,20),('melee',65,55)],
 [('melee',-10,-15),('melee',25,20),('melee',65,55),('melee',110,-15),('melee',145,55)],
 [('melee',-10,-15),('melee',25,20),('melee',65,55),('ranged',135,-15),('ranged',170,55)],
 [('charge',30,-15),('charge',90,55),('melee',0,45),('melee',145,20)],
 [('elite',40,20),('ranged',135,-15),('ranged',170,55)],
 [('melee',-10,-15),('melee',25,20),('melee',65,55),('charge',90,-15),('ranged',135,-15),('ranged',170,55)],
 [('boss',100,20)]]
NODES={
 'melee':dict(times=[.35],end=.85,armor=None,cd=3.5,reach=48),
 'ranged':dict(times=[.8],end=1.3,armor=None,cd=4,reach=210),
 'charge':dict(times=[.7],end=1.75,armor=None,cd=5,reach=150),
 'cleave':dict(times=[.6],end=1.3,armor=None,cd=3,reach=64),
 'sweep':dict(times=[1.],end=2.,armor=(0,1.15),cd=6,reach=64),
 'hammer':dict(times=[1.],end=2.,armor=(0,1.15),cd=4,reach=72),
 'stomp':dict(times=[1.3],end=2.3,armor=(0,1.5),cd=5,reach=72),
 'combo':dict(times=[.8,1.4,2.],end=8.,armor=(0,8.),cd=14,reach=150),
 'roar':dict(times=[1.5,2,2.5,3,3.5,4],end=4.8,armor=(1,4),cd=12,reach=140),
}
ALIASES={'cross':'cross','mountain':'bengshan','draw':'badao','outrage':'earth'}
WEIGHTS={'cross':[.5,.5],'mountain':[.25,.3,.45],'draw':[1.],'outrage':[.25]*4}
ACTION=actions()


def bounded(p,delta):return sweep(p,delta)[0]


def advance_to(p,target,dt,vx=100,vy=45,radius=8):
    dx,dy=target[0]-p[0],target[1]-p[1]
    duration=max(abs(dx)/vx,abs(dy)/vy)
    f=1 if duration==0 else min(1,dt/duration)
    return sweep(p,(dx*f,dy*f),radius=radius)[0]


def run(level=1,gear='starter',seed=0,xp_fraction=0,coordination=True,max_seconds=900,hz=120,use_pots=True,hp_fraction=1,boss_hp_scale=1,boss_recovery_bonus=0,ranged_counter=True,skill_policy='burst',slot_modes=None,campaign=None,behavior_profile=None,observe=False,reaction_delay=0,interrupt_overrides=None,reaction_clock='set',target_hold=0,spawn_layout='front',reachable_approach=True,role_config=None):
    assert (level in REF or (campaign is not None and 1<=level<=15)) and gear in ('starter','blue') and 0<=xp_fraction<1
    assert boss_hp_scale>0 and boss_recovery_bonus>=0
    assert 0<=reaction_delay<=1
    assert 0<=target_hold<=1
    assert spawn_layout in ('front','split_probe')
    assert reaction_clock in ('set','per_hazard')
    assert interrupt_overrides is None or all(k in NODES and all(c in ('stagger','down') for c in v) for k,v in interrupt_overrides.items())
    assert behavior_profile is None or behavior_profile in PROFILES
    behavior=PROFILES.get(behavior_profile)
    role_difficulty={None:'normal','adventure':'adventure','warrior':'warrior','king':'king'}.get(behavior_profile)
    assert role_config is None or role_difficulty is not None
    if role_config is not None:validate_config(role_config)
    assert skill_policy in ('burst','mixed3','mixed6','mixed3_safe','basic_only')
    assert slot_modes is None or (gear=='blue' and slot_modes.get('weapon')=='starter')
    nodes={key:{**value,'end':value['end']+(boss_recovery_bonus if key in ('hammer','stomp','roar','combo') else 0)} for key,value in NODES.items()}
    if behavior:
        nodes={key:{**value,'cd':value['cd']*behavior['cd_scale']} for key,value in nodes.items()}
    assert 0<hp_fraction<=1 and hz in (60,120)
    dt=1/hz;rng=random.Random(seed);hit_rng=random.Random(seed+1000003)
    ilvl={1:10,5:15,10:20,15:25}[level] if campaign is None else campaign['loadout']['weapon']['item_level']
    c=Character(level=level,xp=int(XP[level]*xp_fraction),weapon_level=ilvl,quality='white' if level==1 else 'green')
    if campaign is not None:
        c.xp=campaign['xp'];c.quality=campaign['loadout']['weapon']['quality']
        assert 0<=c.xp<XP[level]
    worn=['weapon'] if gear=='starter' else ['weapon','chest','pants','belt','shoulder','boots','earring']
    if slot_modes is not None:worn=[k for k in worn if k in slot_modes]
    quality_index=0 if level==1 else 1 if gear=='starter' else 2
    durability={k:(60+2*(ilvl-10)+20*quality_index) if k=='weapon' else 100 for k in worn}
    if slot_modes is not None:durability['weapon']=60+2*(ilvl-10)+20*(0 if level==1 else 1)
    if campaign is not None:durability=campaign['durability'].copy()
    initial=durability.copy()
    def stats():return build(c.level,gear,item_level=ilvl,starter_quality=c.quality if c.quality in ('white','green') else None,disabled=[k for k,v in durability.items() if v==0],slot_modes=slot_modes,loadout=campaign['loadout'] if campaign is not None else None)
    if campaign is not None:c.stats=stats
    s=stats();hp=s['hp']*hp_fraction;mp=s['mp'];p=(-180.,20.);simulation_tick=0;now=0.;facing=1
    cd={k:0. for k in ALIASES};basic_stage=0;body=None;casts=[];cast_serial=0
    dots=[];projectiles=[];serial=0
    hp_pots=mp_pots=0;hp_cd=mp_cd=0.;protect=stun=down=0.;death_at=None
    basic_since_skill=6;mana_spent=0;cast_counts={k:0 for k in ('basic',*ALIASES)};room_metrics=[]
    xp_earned=dodge_replans=recovery_casts=0
    attacks=misses=dot_ticks=controls=cancelled=0;damage_taken=0.;kills=[];events=[];room_times=[]
    parts=challenge_awards(level);ordinary=parts[0];purple_room=rng.randrange(6)
    ref,rh,rm=REF[level] if campaign is None else campaign['enemy_reference'];unit=ref*.8
    pot_hp,pot_mp,price=POTS[level] if campaign is None else (campaign['hp_restore'],campaign['mp_restore'],0)
    hp_limit=8 if campaign is None else campaign['hp_count'];mp_limit=8 if campaign is None else campaign['mp_count']
    templates=[list(r) for r in SPAWNS];templates[purple_room].append(('purple',105,20))
    if spawn_layout=='split_probe':
        # Diagnostic only: one existing melee moved behind entry in R3/R6; no extra wave or rewards.
        for room in (2,5):
            i=next(i for i,v in enumerate(templates[room]) if v[0]=='melee')
            templates[room][i]=('melee',-205,55)
    all_weight=sum(4 if k=='elite' else 8 if k=='boss' else 1.5 if k=='charge' else 1 for room in templates for k,_,_ in room)
    cleared=0;free_revive=False;boss_dead=False;actor_lookup={}
    avoidance=None;avoid_goal=None;avoid_signature=None
    time_budget=dict(action=0.,move=0.,control=0.,dead=0.,idle=0.,transition=0.)
    target_cache=None;target_next=0.;target_direction=1

    def choose_target(alive):
        nonlocal target_cache,target_next,target_direction
        if target_cache is None or target_cache['hp']<=0 or now>=target_next:
            target_cache=min(alive,key=lambda e:math.dist(e['p'],p))
            target_direction=1 if target_cache['p'][0]>=p[0] else -1
            target_next=now+target_hold
        return target_cache,target_direction
    telemetry=[dict(enemy_casts=0,damage_nodes=0,received_hits=0,damage_taken=0.,dodge_seconds=0.,flank_seconds=0.,retreat_seconds=0.,chase_seconds=0.,control_cancels=0,death_cancels=0,pending_nodes_cancelled=0,contact_groups={},funnel={},accepted_stagger=0,accepted_down=0,kept_casts_under_control=0,melee_starts_behind=0,melee_starts=0,committed_flank_seconds=0,bilateral_position_seconds=0.,bilateral_ready_seconds=0.,peak_retreaters=0,peak_role_flankers_moving=0) for _ in templates]

    def observe_funnel(e,a,field,n=1):
        if observe:
            key=f"{e['kind']}:{a['key']}"
            row=telemetry[room_index]['funnel'].setdefault(key,dict(starts=0,nodes=0,control_cancels=0,death_cancels=0,pending_cancelled=0,finished=0))
            row[field]+=n

    def observe_cancel(e,reason):
        if observe and e['active']:
            a=e['active'];remaining=len(nodes[a['key']]['times'])-len(a['done'])
            if remaining>0:
                telemetry[room_index][reason]+=1
                telemetry[room_index]['pending_nodes_cancelled']+=remaining
                observe_funnel(e,a,reason)
                observe_funnel(e,a,'pending_cancelled',remaining)

    def cancel_body():
        nonlocal body,cancelled
        if body is not None:
            body['cancelled']=True;body=None;cancelled+=1

    def award(value,key,reason):
        nonlocal hp,mp,s,xp_earned
        if key in c.processed:return
        xp_earned+=value
        c.dead=hp<=0
        pending=[(v['id'],v['q'],v['budget'],v['bleed']) for v in casts]
        old_cd=cd.copy();gained=c.award(value,key)
        if gained:
            s=stats()
            if hp>0:hp=s['hp'];mp=s['mp']
            assert pending==[(v['id'],v['q'],v['budget'],v['bleed']) for v in casts] and old_cd==cd
            events.append(dict(time=now,event='level',levels=gained,hp=hp,mp=mp,reason=reason))
        assert c.weapon_level==ilvl

    def killed(e,indirect=False):
        nonlocal boss_dead,hp,mp,s,protect,free_revive,death_at
        if e['rewarded']:return
        observe_cancel(e,'death_cancels')
        e['rewarded']=True;e['hp']=0;e['active']=None
        kills.append((e['kind'],e['purple']))
        value=parts[-2] if e['kind']=='boss' else ordinary*(4 if e['kind']=='elite' else 2 if e['purple'] else 1)
        award(value,('kill',e['id']),'kill')
        if e['kind']=='boss':
            boss_dead=True
            for other in actors:
                if other['hp']>0:killed(other,True)
            if hp<=0:
                hp=s['hp'];mp=s['mp'];death_at=None;free_revive=True;protect=now+2
                for k in cd:cd[k]=now
                c.dead=False
                events.append(dict(time=now,event='boss_free_revive'))

    def armored(e):
        a=e['active']
        if not a:return False
        if a['key']=='combo':return now-a['start']<a.get('armor_end',8.)
        interval=nodes[a['key']]['armor']
        return interval is not None and interval[0]<=now-a['start']<interval[1]

    def recovering(e):
        a=e['active']
        if not a:return False
        if a['key']=='combo':return 'charge_end' in a and now-a['start']>=a['charge_end']
        node=nodes[a['key']]
        start=node['armor'][1] if node['armor'] else node['times'][-1]+.1
        return now-a['start']>=start

    def hurt_enemy(e,damage,dot=False,force=False):
        nonlocal controls
        if e['hp']<=0:return
        if e['reset_at'] and now>=e['reset_at']:
            e['accumulated']=0.;e['reset_at']=0.
        e['hp']=max(0,e['hp']-damage)
        if e['hp']==0:killed(e);return
        if e['kind']=='boss' and e['phase']==1 and e['hp']<=e['maximum']*.5:e['pending_phase']=True
        if dot or armored(e) or now<e['reset_at']:return
        e['accumulated']+=damage
        ratio=.2 if e['kind'] in ('boss','elite') else .35
        if force or e['accumulated']>=e['maximum']*ratio:
            e['control_until']=now+.8+.24;e['accumulated']=0.;e['reset_at']=e['control_until']
            control='down';controls+=1
        else:
            e['control_until']=max(e['control_until'],now+.28);control='stagger'
        if observe:telemetry[room_index]['accepted_'+control]+=1
        if e['active'] and may_interrupt(e['active']['key'],control,interrupt_overrides):
            observe_cancel(e,'control_cancels');e['active']=None
        elif observe and e['active']:telemetry[room_index]['kept_casts_under_control']+=1

    def hurt_player(raw,origin,roar=None):
        nonlocal hp,stun,down,protect,p,death_at,damage_taken,s
        if hp<=0 or (roar is None and now<protect):return
        actual=min(hp,raw*100/(100+s['armor']));hp-=actual;damage_taken+=actual
        if observe:
            telemetry[room_index]['received_hits']+=1
            telemetry[room_index]['damage_taken']+=actual
        cancel_body();stun=max(stun,now+.24)
        if roar is not None:
            roar['accumulated']+=actual
            if not roar['knocked'] and roar['accumulated']>=roar['max_hp']*.15:
                roar['knocked']=True;down=max(down,now+.8)
        else:protect=now+.72
        dx,dy=p[0]-origin[0],p[1]-origin[1];length=max(1e-9,math.hypot(dx,dy))
        p=bounded(p,(12*dx/length,12*dy/length))
        if hp<=0 and death_at is None:
            death_at=now
            for slot in durability:durability[slot]=max(0,durability[slot]-5)
            s=stats();c.dead=True
            events.append(dict(time=now,event='death'))

    def hazard_safe(a,point):
        if a['key']=='combo' and now-a['start']>2:
            if not a.get('charge_locked'):return True
            end=sweep(a['origin'],(320*a['facing'],0),radius=14)[0]
            return segment_distance(point,a['origin'],end)>22
        mapped=(100+(point[0]-a['origin'][0])*a['facing'],20+point[1]-a['origin'][1])
        return geometry_safe(mapped,'sector' if a['key']=='roar' else 'circle',140 if a['key']=='roar' else 72)

    def escape_point(point,hazards):
        candidates=((float(x),float(y)) for x in range(-210,211,4) for y in range(-27,71,4))
        return min((q for q in candidates if all(hazard_safe(e['active'],q) for e in hazards)),key=lambda q:travel(point,q))

    def enemy_contact(e,a):
        key=a['key'];origin=a['origin'];aim=a['aim']
        if key=='ranged':
            # Projectile is an independently owned effect after release.
            projectiles.append(dict(due=now+.25,origin=origin,aim=aim));return
        if key=='roar':
            hit=not hazard_safe(a,p)
            if hit:hurt_player(unit*.45,origin,a)
        elif key in ('sweep','hammer','stomp','combo'):
            if not hazard_safe(a,p):hurt_player(unit*2.5,origin)
        elif key=='cleave':
            dx=(p[0]-origin[0])*a['facing']
            if -8<=dx<=64 and abs(p[1]-origin[1])<=26:hurt_player(unit*2.5,origin)
        elif group_contact(key,origin,aim,p):hurt_player(unit*(1.5 if key=='charge' else 1),origin)

    def touching(e,cast,index,previous_age,age):
        key=cast['key'];origin=cast['origin'] if cast['launched'] and key in ('cross','outrage') and (key=='outrage' or index==1) else p
        dx=(e['p'][0]-origin[0])*cast['facing'];dy=e['p'][1]-origin[1]
        if key=='basic':return -8<=dx<=48 and abs(dy)<=18
        if key=='cross' and index==1:
            t=cast['times'][1]
            left=29+max(0,previous_age-t)*260-22
            right=29+min(.33,max(0,age-t))*260+22
            return left<=dx<=right and abs(dy)<=34
        if key=='cross':return -8<=dx<=58 and abs(dy)<=34
        if key=='draw':return 0<=dx<=142 and abs(dy)<=24+dx*.11
        return math.hypot(dx,dy)<=(54 if key=='mountain' else 145)

    def available_skill(target,keys):
        if not policy_allows_skill():return None
        dx=(target['p'][0]-p[0])*facing;dy=target['p'][1]-p[1]
        for key in keys:
            if key not in s['skills'] or cd[key]>now or mp<s['skills'][key]['mana']:continue
            inside=(0<=dx<=142 and abs(dy)<=24+dx*.11) if key=='draw' else (-8<=dx<=130 and abs(dy)<=34) if key=='cross' else math.hypot(dx,dy)<=(54 if key=='mountain' else 145)
            if inside:return key
        return None

    def policy_allows_skill():
        # Script-policy sensitivity only, never a player skill restriction.
        if skill_policy=='mixed3_safe':
            return basic_since_skill>=3 or hp<=s['hp']*.5 or any(e['hp']>0 and e['kind'] in ('elite','boss') and recovering(e) for e in actors)
        return skill_policy=='burst' or (skill_policy=='mixed3' and basic_since_skill>=3) or (skill_policy=='mixed6' and basic_since_skill>=6)

    def begin(key):
        nonlocal body,cast_serial,mp,basic_stage,recovery_casts,basic_since_skill,mana_spent
        cast_serial+=1;q=1+s['haste']
        cast_counts[key]+=1
        if any(e['kind'] in ('elite','boss') and recovering(e) for e in actors):
            recovery_casts+=1
        if key=='basic':
            basic_since_skill+=1
            spec=ACTION['basic'+str(basic_stage+1)]
            budget=s['basic_cycle_damage']*[.3,1/3,11/30][basic_stage]
            basic_stage=(basic_stage+1)%3;bleed=0;times=spec['contacts'];weights=[1]
        else:
            basic_since_skill=0
            spec=ACTION[ALIASES[key]];v=s['skills'][key]
            budget=v['direct'];bleed=v['bleed'];times=spec['contacts'];weights=WEIGHTS[key]
            mp-=v['mana'];cd[key]=now+v['cd']
            mana_spent+=v['mana']
        body=dict(id=cast_serial,key=key,start=now,q=q,budget=budget,bleed=bleed,
            duration=spec['duration'],move_at=spec['move_at'],times=times,weights=weights,
            facing=facing,origin=p,hit_score=s['hit_score'],launched=False,cancelled=False,seen=set(),motion=0.,previous=0.)
        casts.append(body)

    for room_index,template in enumerate(templates):
        room_mp_start=mp_pots;room_hp_start=hp_pots;room_mana_start=mana_spent;room_cast_start=cast_counts.copy()
        entered=now;p=(-180.,20.);actors=[];avoidance=None;avoid_goal=None;avoid_signature=None;dots.clear();projectiles.clear();casts.clear();body=None
        reaction_signature=None;reaction_ready=now
        reaction_seen={}
        target_cache=None;target_next=now;target_direction=1
        for index,(kind,x,y) in enumerate(template):
            purple=kind=='purple';kind='melee' if purple else kind
            hpmax=ref*(35 if kind=='elite' else 130)*(1+rh)*(1+rm) if kind in ('elite','boss') else unit*{'melee':3.5,'ranged':2.5,'charge':5}[kind]
            if kind=='boss':hpmax*=boss_hp_scale
            e=dict(id=room_index*10+index,kind=kind,p=(float(x),float(y)),hp=hpmax,maximum=hpmax,purple=purple,
                active=None,cd={},control_until=0.,accumulated=0.,reset_at=0.,rewarded=False,casts=0,
                facing=-1,turn_until=0.,phase=1,pending_phase=False,weak_until=0.)
            actors.append(e);actor_lookup[e['id']]=e
        room_roles={}
        if role_config is not None:
            for e in actors:
                e.update(role_config['candidateAdapter'][e['kind']])
            room_roles=assign_roles(actors,role_difficulty,role_config)
            if observe:telemetry[room_index]['role_assignments']=room_roles.copy()
            flankers=sorted(i for i,role in room_roles.items() if role=='flanker')
            for e in actors:
                e['role']=room_roles[e['id']]
                if e['id'] in flankers:e['role_side']=-1 if flankers.index(e['id'])%2==0 else 1
        while now<max_seconds:
            alive=[e for e in actors if e['hp']>0]
            if boss_dead:break
            if hp<=0 and death_at is not None and now>=death_at+10:break
            if hp>0:
                hp=min(s['hp'],hp+s['hp']*.002*dt);mp=min(s['mp'],mp+s['mp']*.01*dt)
            # Fixed cast snapshot: character growth/wear changes only future casts.
            for cast in list(casts):
                age=(now-cast['start'])*cast['q'];prev=cast['previous'];cast['previous']=age
                if cast is body and not cast['cancelled'] and hp>0:
                    if cast['key'] in ('mountain','outrage'):
                        logical='bengshan' if cast['key']=='mountain' else 'earth'
                        value=displacement(logical,age,34 if logical=='bengshan' else 64)
                        p=bounded(p,((value-cast['motion'])*cast['facing'],0));cast['motion']=value
                launch_time=cast['times'][1] if cast['key']=='cross' else cast['times'][0]
                if not cast['cancelled'] and hp>0 and age+1e-9>=launch_time:
                    if not cast['launched']:cast['origin']=p;cast['launched']=True
                for index,when in enumerate(cast['times']):
                    projectile=cast['key']=='cross' and index==1
                    persistent=cast['launched'] and (projectile or cast['key']=='outrage')
                    if age+1e-9<when or (projectile and prev>when+.33):continue
                    if cast['cancelled'] and not persistent:continue
                    if hp<=0 and not persistent:continue
                    if not projectile and prev>when+1e-8:continue
                    for e in actors:
                        marker=(index,e['id'])
                        if e['hp']<=0 or marker in cast['seen'] or not touching(e,cast,index,prev,age):continue
                        cast['seen'].add(marker);attacks+=1
                        evasion=.10 if e['kind']=='boss' else .08 if e['kind']=='elite' else .05
                        if hit_rng.random()<1-max(0,min(1,cast['hit_score']-evasion)):misses+=1;continue
                        if observe:
                            group=f"{cast['id']}:{index}"
                            contacts=telemetry[room_index]['contact_groups']
                            contacts[group]=contacts.get(group,0)+1
                        weight=cast['weights'][index]
                        force=(cast['key']=='mountain' and index==2) or (cast['key']=='outrage' and index==0)
                        hurt_enemy(e,cast['budget']*weight,force=force)
                        if e['hp']>0 and cast['bleed']>0:
                            for tick in range(1,6):
                                serial+=1;heapq.heappush(dots,(now+tick/cast['q'],serial,e['id'],cast['bleed']*weight/5))
                if cast is body and age>=cast['duration']:
                    body=None
                lifetime=max(cast['duration'],cast['times'][-1]+(.33 if cast['key']=='cross' else 0))
                if age>lifetime+dt*cast['q']:casts.remove(cast)
            while dots and dots[0][0]<=now+1e-9:
                _,_,eid,value=heapq.heappop(dots);e=actor_lookup[eid]
                if e['hp']>0:dot_ticks+=1;hurt_enemy(e,value,dot=True)
            alive=[e for e in actors if e['hp']>0]
            if boss_dead:break
            if hp>0 and not alive and room_index==6:break
            # Commit a safe endpoint through remaining damage nodes; release
            # the dodge as soon as the final node resolves, preserving recovery.
            hazards=[e for e in alive if e['active'] and e['active']['key'] in ('sweep','hammer','stomp','combo','roar')
                and (len(e['active']['done'])<len(nodes[e['active']['key']]['times']) or (e['active']['key']=='combo' and 'charge_end' not in e['active']))
                and now-e['active']['start']>=.2]
            signature=tuple((e['id'],e['active']['start']) for e in hazards)
            if reaction_clock=='per_hazard':
                reaction_seen={key:reaction_seen.get(key,now) for key in signature}
                reaction_ready=min((t+reaction_delay for t in reaction_seen.values()),default=now)
            elif signature!=reaction_signature:
                reaction_signature=signature;reaction_ready=now+reaction_delay
            threatened=any(not hazard_safe(e['active'],p) for e in hazards)
            reaction_due=threatened and now>=reaction_ready
            if reaction_clock=='per_hazard':
                reaction_due=any(not hazard_safe(e['active'],p) and now>=reaction_seen[(e['id'],e['active']['start'])]+reaction_delay for e in hazards)
            if not hazards:
                avoidance=None;avoid_goal=None;avoid_signature=None
            elif reaction_due or avoidance is not None:
                if signature!=avoid_signature:
                    avoid_goal=escape_point(p,hazards);avoid_signature=signature;dodge_replans+=1
                avoidance=True
            movable=hp>0 and now>=max(stun,down) and (body is None or (now-body['start'])*body['q']>=body['move_at'])
            moved=False
            if movable:
                if avoidance:
                    at_safe=all(hazard_safe(e['active'],p) for e in hazards) and math.dist(p,avoid_goal)<2
                    if ranged_counter and at_safe:
                        if body is None and alive:
                            nearest,facing=choose_target(alive)
                            key=available_skill(nearest,['draw','cross'])
                            if key:begin(key)
                    else:
                        if body:cancel_body()
                        proposed=advance_to(p,avoid_goal,dt)
                        moved=math.dist(p,proposed)>1e-9;p=proposed
                elif not alive:
                    proposed=advance_to(p,(200.,20.),dt);moved=math.dist(p,proposed)>1e-9;p=proposed
                elif body is None:
                    nearest,facing=choose_target(alive)
                    dx,dy=nearest['p'][0]-p[0],nearest['p'][1]-p[1]
                    ranged_key=available_skill(nearest,['outrage','draw','mountain','cross']) if ranged_counter else None
                    if ranged_key:
                        begin(ranged_key)
                    elif abs(dx)>42 or abs(dy)>15:
                        desired=sweep(nearest['p'],(-facing*30,0))[0] if reachable_approach else (nearest['p'][0]-facing*30,nearest['p'][1])
                        proposed=advance_to(p,desired,dt)
                        moved=math.dist(p,proposed)>1e-9;p=proposed
                    else:
                        key=next((k for k in ['outrage','draw','mountain','cross'] if policy_allows_skill() and k in s['skills'] and cd[k]<=now and mp>=s['skills'][k]['mana']),None)
                        begin(key or 'basic')
            # Enemy contacts after player effects: candidate same-frame ordering.
            frame_retreaters=frame_flankers=0
            retreat_allowed=None
            if role_config is not None:
                for e in actors:
                    target=destination(behavior_profile,e['kind'],e['id'],e['p'],p) if behavior and e['kind']=='ranged' else None
                    e['wants_retreat']=bool(e['hp']>0 and e['active'] is None and now>=max(e['control_until'],e['weak_until']) and target is not None
                        and math.dist(e['p'],advance_to(e['p'],target,dt,behavior['chase_x'],behavior['chase_y']))>1e-9)
                retreat_allowed=set(retreat_permits(actors,room_roles,role_difficulty,role_config))
            for e in actors:
                if e['hp']<=0:continue
                if e['reset_at'] and now>=e['reset_at']:e['accumulated']=0.;e['reset_at']=0.
                a=e['active']
                if a:
                    node=nodes[a['key']];age=now-a['start']
                    for index,t in enumerate(node['times']):
                        if index not in a['done'] and age+1e-9>=t:
                            a['done'].add(index)
                            if observe:telemetry[room_index]['damage_nodes']+=1
                            observe_funnel(e,a,'nodes')
                            enemy_contact(e,a)
                    if a['key']=='combo':
                        if age>=2.4 and not a.get('charge_locked'):
                            a['facing']=1 if p[0]>=e['p'][0] else -1;a['charge_locked']=True
                        if age>3.2 and 'charge_end' not in a:
                            before=e['p'];remaining=max(0,320-a.get('travelled',0.))
                            e['p'],wall=sweep(before,(min(180*dt,remaining)*a['facing'],0),radius=14)
                            a['travelled']=a.get('travelled',0.)+abs(e['p'][0]-before[0])
                            if not a.get('charge_hit') and segment_distance(p,before,e['p'])<=22:
                                a['charge_hit']=True;hurt_player(unit*3,before)
                            if wall or a['travelled']>=320-1e-8:
                                a['charge_end']=age;a['armor_end']=age;a['end']=age+(3 if wall else .8)+boss_recovery_bonus
                                if wall:
                                    e['weak_until']=now+3+boss_recovery_bonus
                                    events.append(dict(time=now,event='boss_wall',position=e['p']))
                    if age>=a.get('end',node['end']):
                        observe_funnel(e,a,'finished');e['active']=None
                if e['active'] is not None:continue
                if e['pending_phase'] and e['kind']=='boss':
                    e['phase']=2;e['pending_phase']=False
                    events.append(dict(time=now,event='boss_phase',phase=2))
                if hp<=0 or now<max(e['control_until'],e['weak_until']):continue
                dx,dy=p[0]-e['p'][0],p[1]-e['p'][1];desired_facing=1 if dx>=0 else -1
                if desired_facing!=e['facing']:
                    e['facing']=desired_facing;e['turn_until']=now+.25
                kind=e['kind']
                if behavior and (behavior.get('commit_flank') or (role_config is not None and e['role']=='flanker')) and kind=='melee':
                    side=e.get('role_side',1 if e['id']%2 else -1)
                    # Bounded repositioning opportunity, never permanent immunity or forced player movement.
                    if (e['p'][0]-p[0])*side<8 and now>=e.get('flank_retry',0) and (role_config is None or math.dist(e['p'],p)<85):
                        e['flank_until']=now+1.2;e['flank_retry']=now+2.5
                    if (e['p'][0]-p[0])*side>=12:e['flank_until']=0
                    if now<e.get('flank_until',0):
                        target=sweep(p,(side*28,side*20))[0]
                        old=e['p'];e['p']=advance_to(old,target,dt,behavior['chase_x'],behavior['chase_y'])
                        if math.dist(old,e['p'])>1e-9:
                            if observe:
                                telemetry[room_index]['flank_seconds']+=dt
                                telemetry[room_index]['chase_seconds']+=dt
                                telemetry[room_index]['committed_flank_seconds']+=dt
                            if role_config is not None and e['role']=='flanker':frame_flankers+=1
                            continue
                if behavior and kind=='ranged':
                    retreat=destination(behavior_profile,kind,e['id'],e['p'],p)
                    if retreat_allowed is not None and e['id'] not in retreat_allowed:retreat=None
                    if retreat is not None:
                        old=e['p'];e['p']=advance_to(old,retreat,dt,behavior['chase_x'],behavior['chase_y'])
                        # At a wall the ranged actor may shoot; never wait forever for unreachable separation.
                        if math.dist(old,e['p'])>1e-9:
                            if observe:telemetry[room_index]['retreat_seconds']+=dt
                            frame_retreaters+=1
                            continue
                if kind=='elite':options=['sweep','cleave'] if e['casts']%2 else ['cleave','sweep']
                elif kind=='boss':options=['combo','roar','hammer','stomp'] if e['phase']==2 else ['roar','hammer','stomp']
                else:options=[kind]
                key=next((k for k in options if now>=e['cd'].get(k,0) and math.hypot(dx,dy)<=nodes[k]['reach']
                    and (k not in ('melee','cleave') or abs(dy)<=18)
                    and (k!='roar' or (60<=abs(dx)<=140 and abs(dy)<=abs(dx)*.577))),None)
                if key and now>=e['turn_until']:
                    special=kind!='melee'
                    reserved=sum(bool(other['active'] and other['kind']!='melee' and now-other['active']['start']<=nodes[other['active']['key']]['times'][-1]) for other in actors)
                    if coordination and special and reserved>=(behavior['special_cap'] if behavior else 1):continue
                    e['active']=dict(key=key,start=now,origin=e['p'],aim=p,facing=e['facing'],done=set(),accumulated=0.,knocked=False,max_hp=s['hp'])
                    e['cd'][key]=now+nodes[key]['cd'];e['casts']+=1
                    if observe:telemetry[room_index]['enemy_casts']+=1
                    if observe and kind=='melee':
                        telemetry[room_index]['melee_starts']+=1
                        telemetry[room_index]['melee_starts_behind']+=int((e['p'][0]-p[0])*facing<0)
                    observe_funnel(e,e['active'],'starts')
                    if kind=='boss':events.append(dict(time=now,event='boss_cast',skill=key,phase=e['phase']))
                elif kind!='ranged' and (body is not None or key is None):
                    # Moving enemies can still be passed through; bodies never block player.
                    target=destination(behavior_profile,kind,e['id'],e['p'],p) if behavior else (p[0]-e['facing']*28,p[1])
                    if role_config is not None and kind=='melee':
                        target=(p[0]+e['role_side']*28,p[1]+e['role_side']*20) if e['role']=='flanker' else (p[0]-e['facing']*28,p[1])
                    before=e['p']
                    e['p']=advance_to(e['p'],target,dt,behavior['chase_x'] if behavior else 55,behavior['chase_y'] if behavior else 24,radius=14 if kind=='boss' else 8)
                    if observe and math.dist(before,e['p'])>1e-9:
                        telemetry[room_index]['chase_seconds']+=dt
                        if kind=='melee' and (e.get('role')=='flanker' if role_config is not None else behavior and behavior['flank']):telemetry[room_index]['flank_seconds']+=dt
                    if role_config is not None and kind=='melee' and e['role']=='flanker' and math.dist(before,e['p'])>1e-9:frame_flankers+=1
                assert valid(e['p'])
            for projectile in list(projectiles):
                if projectile['due']<=now:
                    if abs(p[0]-projectile['aim'][0])<=22 and abs(p[1]-projectile['aim'][1])<=16:
                        hurt_player(unit,projectile['origin'])
                    projectiles.remove(projectile)
            if hp>0:
                if use_pots and hp<=s['hp']*.4 and now>=hp_cd and hp_pots<hp_limit:
                    hp=min(s['hp'],hp+pot_hp);hp_pots+=1;hp_cd=now+10
                if use_pots and mp<=s['mp']*.25 and now>=mp_cd and mp_pots<mp_limit:
                    mp=min(s['mp'],mp+pot_mp);mp_pots+=1;mp_cd=now+10
            category='dead' if hp<=0 else 'control' if now<max(stun,down) else 'move' if moved else 'action' if body else 'idle'
            if role_config is not None:
                assert frame_retreaters<=role_config['difficulty'][role_difficulty]['maxConcurrentRetreaters']
                assert frame_flankers<=role_config['difficulty'][role_difficulty]['maxFlankers']
            if observe:
                telemetry[room_index]['peak_retreaters']=max(telemetry[room_index]['peak_retreaters'],frame_retreaters)
                telemetry[room_index]['peak_role_flankers_moving']=max(telemetry[room_index]['peak_role_flankers_moving'],frame_flankers)
                near=[e for e in actors if e['hp']>0 and e['kind']=='melee' and abs(e['p'][1]-p[1])<=26 and abs(e['p'][0]-p[0])<=72]
                for field,group in [('bilateral_position_seconds',near),('bilateral_ready_seconds',[e for e in near if now>=max(e['control_until'],e['weak_until'])])]:
                    if any(e['p'][0]-p[0]<-12 for e in group) and any(e['p'][0]-p[0]>12 for e in group):telemetry[room_index][field]+=dt
            if observe and moved and avoidance:telemetry[room_index]['dodge_seconds']+=dt
            time_budget[category]+=dt;simulation_tick+=1;now=simulation_tick/hz
            assert valid(p) and hp>=0 and mp>=-1e-6
            if not alive and hp>0 and math.dist(p,(200,20))<1e-6:break
        room_times.append(now-entered)
        room_metrics.append(dict(room=room_index+1,seconds=now-entered,hp_pots=hp_pots-room_hp_start,mp_pots=mp_pots-room_mp_start,
            mana_spent=mana_spent-room_mana_start,cast_counts={k:cast_counts[k]-room_cast_start[k] for k in cast_counts}))
        if (hp<=0 and not boss_dead) or now>=max_seconds:break
        if any(e['hp']>0 for e in actors) and not boss_dead:break
        cleared+=1
        for slot in durability:durability[slot]=max(0,durability[slot]-1)
        s=stats();hp=min(hp,s['hp']);mp=min(mp,s['mp'])
        if room_index<6:
            simulation_tick+=3*hz;now=simulation_tick/hz;time_budget['transition']+=3
            hp=min(s['hp'],hp+s['hp']*.03);mp=min(s['mp'],mp+s['mp']*.09)
    success=boss_dead and cleared==7
    if success:award(parts[-1],('clear',0),'clear')
    kill_weight=sum(4 if kind=='elite' else 8 if kind=='boss' else 1.5 if kind=='charge' else 1 for kind,_ in kills)
    gross=GOLD(level) if success else math.floor(GOLD(level)*.7*kill_weight/all_weight)
    repair=sum((initial[k]-v)*math.ceil(ilvl/10*(1 if gear=='starter' or (slot_modes is not None and k=='weapon') else 1.5)) for k,v in durability.items())
    assert math.isclose(sum(time_budget.values()),now,abs_tol=1e-4)
    if success:assert len(kills)==28 and xp_earned==sum(parts)
    assert sum(e['event']=='boss_phase' for e in events)<=1
    assert len(kills)<=28 and sum(purple for _,purple in kills)<=1
    return dict(level=level,gear=gear,seed=seed,boss_hp_scale=boss_hp_scale,boss_recovery_bonus=boss_recovery_bonus,ranged_counter=ranged_counter,success=success,death=hp<=0,timeout=now>=max_seconds,
        seconds=now,rooms=cleared,kills=len(kills),room_seconds=room_times,player_level=c.level,
        held_weapon_level=ilvl,mail=c.mail,hp_pots=hp_pots,mp_pots=mp_pots,hp_remaining=hp,
        xp_earned=xp_earned,dodge_replans=dodge_replans,recovery_casts=recovery_casts,damage_taken=damage_taken,controls=controls,cancelled_casts=cancelled,
        hit_attempts=attacks,misses=misses,dot_ticks=dot_ticks,free_boss_revive=free_revive,
        net=gross-repair-(hp_pots+mp_pots)*price,time_budget=time_budget,events=events,
        skill_policy=skill_policy,mana_spent=mana_spent,cast_counts=cast_counts,room_metrics=room_metrics,
        xp_remaining=c.xp,durability=durability.copy(),kill_records=[dict(kind=k,purple=v) for k,v in kills],gross=gross,
        **({'telemetry':telemetry} if observe else {}),
        **({'terminal_debug':dict(player=p,facing=facing,hp=hp,mp=mp,body=None if body is None else body['key'],
            alive=[dict(kind=e['kind'],position=e['p'],hp=e['hp']) for e in actors if e['hp']>0])} if observe and now>=max_seconds else {}))


def main():
    rows=[]
    for level,gear in [(1,'starter'),(5,'starter'),(10,'starter'),(10,'blue'),(15,'starter')]:
        for coordination in [False,True]:
            samples=[run(level,gear,seed,coordination=coordination) for seed in range(12)]
            completed=[r for r in samples if r['success']]
            rows.append(dict(level=level,gear=gear,coordination=coordination,samples=12,clears=len(completed),
                median_seconds=statistics.median(r['seconds'] for r in completed) if completed else None,
                hp_pots=statistics.mean(r['hp_pots'] for r in samples),mp_pots=statistics.mean(r['mp_pots'] for r in samples),
                mean_rooms=statistics.mean(r['rooms'] for r in samples),net=statistics.mean(r['net'] for r in samples)))
    assert run(seed=2)==run(seed=2)
    first=run(seed=0)
    assert first['success'] and first['kills']==28 and first['player_level']==2
    assert first['held_weapon_level']==10 and first['recovery_casts']>0
    assert first['dodge_replans']>0
    assert sum(e['event']=='boss_phase' for e in first['events'])==1
    assert {'hammer','stomp','roar','combo'}<=set(e['skill'] for e in first['events'] if e['event']=='boss_cast')
    assert any(e['event']=='boss_wall' for e in first['events'])
    low=run(seed=0,use_pots=False,hp_fraction=.01)
    assert low['death'] and not low['success'] and low['rooms']<7
    assert low['hp_pots']==low['mp_pots']==0
    mid=run(level=5,seed=0,xp_fraction=.95)
    assert mid['player_level']==6 and mid['held_weapon_level']==15
    assert any(e['event']=='level' and e['time']<mid['seconds'] for e in mid['events'])
    fine=run(seed=0,hz=60)
    assert fine['success'] and fine['kills']==28 and fine['xp_earned']==first['xp_earned']
    assert fine['player_level']==first['player_level']
    # Frame-rate sensitivity can shift attack/control contacts; do not demand exact duration equality.
    print(json.dumps(dict(results=rows,example=first,death_fixture=low,coarser_step=fine,midrun_levelup=mid,checks='PASS: bounds, time partition, kill/XP uniqueness, held gear, cast/CD snapshots, fixed replay',
        limitations=['Prototype-derived geometry and candidate AI, fixed120Hz expected-crit reference; not game-engine validation.',
            '60Hz diagnostic changes decision quantization; integer tick clock avoids accumulated floating-time drift. Not render-FPS comparison.',
            'Only normal first dungeon, checkpoints1/5/10/15; enemy nodes/phase2 combo are candidate choices, not finalized art/AI.',
            'Player chooses reachable skill ranges and non-displacement counters at safe endpoints; still a scripted policy, not real-player completion rates.',
            'Charge lane resolves once; ranged uses locked-point delayed projectile, not continuous swept projectile physics.',
            'Elite/Boss safe endpoint held until final damage node; no forced waiting through recovery.',
            'No revival choice, XP decay, weapon replacement, item inventory or persistent assets; death waits10s for residual Boss kill.',
            'Eight HP/MP pots are carried inventory fixtures; no game use-count limit.',
            'No authored obstacles in room trace; all movement goes through boundary helper, obstacle routing tested separately.',
            'Gameplay parameters remain candidates; no economic or3-5h target claim from these limited trajectories.']),indent=2))

if __name__=='__main__':main()
