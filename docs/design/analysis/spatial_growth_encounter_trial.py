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


def run(level=1,gear='starter',seed=0,xp_fraction=0,coordination=True,max_seconds=900,hz=120,use_pots=True,hp_fraction=1,boss_hp_scale=1,boss_recovery_bonus=0,ranged_counter=True):
    assert level in REF and gear in ('starter','blue') and 0<=xp_fraction<1
    assert boss_hp_scale>0 and boss_recovery_bonus>=0
    nodes={key:{**value,'end':value['end']+(boss_recovery_bonus if key in ('hammer','stomp','roar','combo') else 0)} for key,value in NODES.items()}
    assert 0<hp_fraction<=1 and hz in (60,120)
    dt=1/hz;rng=random.Random(seed);hit_rng=random.Random(seed+1000003)
    ilvl={1:10,5:15,10:20,15:25}[level]
    c=Character(level=level,xp=int(XP[level]*xp_fraction),weapon_level=ilvl,quality='white' if level==1 else 'green')
    worn=['weapon'] if gear=='starter' else ['weapon','chest','pants','belt','shoulder','boots','earring']
    quality_index=0 if level==1 else 1 if gear=='starter' else 2
    durability={k:(60+2*(ilvl-10)+20*quality_index) if k=='weapon' else 100 for k in worn}
    initial=durability.copy()
    def stats():return build(c.level,gear,item_level=ilvl,starter_quality=c.quality,disabled=[k for k,v in durability.items() if v==0])
    s=stats();hp=s['hp']*hp_fraction;mp=s['mp'];p=(-180.,20.);simulation_tick=0;now=0.;facing=1
    cd={k:0. for k in ALIASES};basic_stage=0;body=None;casts=[];cast_serial=0
    dots=[];projectiles=[];serial=0
    hp_pots=mp_pots=0;hp_cd=mp_cd=0.;protect=stun=down=0.;death_at=None
    xp_earned=dodge_replans=recovery_casts=0
    attacks=misses=dot_ticks=controls=cancelled=0;damage_taken=0.;kills=[];events=[];room_times=[]
    parts=challenge_awards(level);ordinary=parts[0];purple_room=rng.randrange(6)
    ref,rh,rm=REF[level];unit=ref*.8;pot_hp,pot_mp,price=POTS[level]
    templates=[list(r) for r in SPAWNS];templates[purple_room].append(('purple',105,20))
    all_weight=sum(4 if k=='elite' else 8 if k=='boss' else 1.5 if k=='charge' else 1 for room in templates for k,_,_ in room)
    cleared=0;free_revive=False;boss_dead=False;actor_lookup={}
    avoidance=None;avoid_goal=None;avoid_signature=None
    time_budget=dict(action=0.,move=0.,control=0.,dead=0.,idle=0.,transition=0.)

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
            e['active']=None;controls+=1
        else:
            e['control_until']=max(e['control_until'],now+.28);e['active']=None

    def hurt_player(raw,origin,roar=None):
        nonlocal hp,stun,down,protect,p,death_at,damage_taken,s
        if hp<=0 or (roar is None and now<protect):return
        actual=min(hp,raw*100/(100+s['armor']));hp-=actual;damage_taken+=actual
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
        dx=(target['p'][0]-p[0])*facing;dy=target['p'][1]-p[1]
        for key in keys:
            if key not in s['skills'] or cd[key]>now or mp<s['skills'][key]['mana']:continue
            inside=(0<=dx<=142 and abs(dy)<=24+dx*.11) if key=='draw' else (-8<=dx<=130 and abs(dy)<=34) if key=='cross' else math.hypot(dx,dy)<=(54 if key=='mountain' else 145)
            if inside:return key
        return None

    def begin(key):
        nonlocal body,cast_serial,mp,basic_stage,recovery_casts
        cast_serial+=1;q=1+s['haste']
        if any(e['kind'] in ('elite','boss') and recovering(e) for e in actors):
            recovery_casts+=1
        if key=='basic':
            spec=ACTION['basic'+str(basic_stage+1)]
            budget=s['basic_cycle_damage']*[.3,1/3,11/30][basic_stage]
            basic_stage=(basic_stage+1)%3;bleed=0;times=spec['contacts'];weights=[1]
        else:
            spec=ACTION[ALIASES[key]];v=s['skills'][key]
            budget=v['direct'];bleed=v['bleed'];times=spec['contacts'];weights=WEIGHTS[key]
            mp-=v['mana'];cd[key]=now+v['cd']
        body=dict(id=cast_serial,key=key,start=now,q=q,budget=budget,bleed=bleed,
            duration=spec['duration'],move_at=spec['move_at'],times=times,weights=weights,
            facing=facing,origin=p,hit_score=s['hit_score'],launched=False,cancelled=False,seen=set(),motion=0.,previous=0.)
        casts.append(body)

    for room_index,template in enumerate(templates):
        entered=now;p=(-180.,20.);actors=[];avoidance=None;avoid_goal=None;avoid_signature=None;dots.clear();projectiles.clear();casts.clear();body=None
        for index,(kind,x,y) in enumerate(template):
            purple=kind=='purple';kind='melee' if purple else kind
            hpmax=ref*(35 if kind=='elite' else 130)*(1+rh)*(1+rm) if kind in ('elite','boss') else unit*{'melee':3.5,'ranged':2.5,'charge':5}[kind]
            if kind=='boss':hpmax*=boss_hp_scale
            e=dict(id=room_index*10+index,kind=kind,p=(float(x),float(y)),hp=hpmax,maximum=hpmax,purple=purple,
                active=None,cd={},control_until=0.,accumulated=0.,reset_at=0.,rewarded=False,casts=0,
                facing=-1,turn_until=0.,phase=1,pending_phase=False,weak_until=0.)
            actors.append(e);actor_lookup[e['id']]=e
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
            threatened=any(not hazard_safe(e['active'],p) for e in hazards)
            if not hazards:
                avoidance=None;avoid_goal=None;avoid_signature=None
            elif threatened or avoidance is not None:
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
                            nearest=min(alive,key=lambda e:math.dist(e['p'],p))
                            facing=1 if nearest['p'][0]>=p[0] else -1
                            key=available_skill(nearest,['draw','cross'])
                            if key:begin(key)
                    else:
                        if body:cancel_body()
                        proposed=advance_to(p,avoid_goal,dt)
                        moved=math.dist(p,proposed)>1e-9;p=proposed
                elif not alive:
                    proposed=advance_to(p,(200.,20.),dt);moved=math.dist(p,proposed)>1e-9;p=proposed
                elif body is None:
                    nearest=min(alive,key=lambda e:math.dist(e['p'],p))
                    dx,dy=nearest['p'][0]-p[0],nearest['p'][1]-p[1]
                    facing=1 if dx>=0 else -1
                    ranged_key=available_skill(nearest,['outrage','draw','mountain','cross']) if ranged_counter else None
                    if ranged_key:
                        begin(ranged_key)
                    elif abs(dx)>42 or abs(dy)>15:
                        desired=(nearest['p'][0]-facing*30,nearest['p'][1]);proposed=advance_to(p,desired,dt)
                        moved=math.dist(p,proposed)>1e-9;p=proposed
                    else:
                        key=next((k for k in ['outrage','draw','mountain','cross'] if k in s['skills'] and cd[k]<=now and mp>=s['skills'][k]['mana']),None)
                        begin(key or 'basic')
            # Enemy contacts after player effects: candidate same-frame ordering.
            for e in actors:
                if e['hp']<=0:continue
                if e['reset_at'] and now>=e['reset_at']:e['accumulated']=0.;e['reset_at']=0.
                a=e['active']
                if a:
                    node=nodes[a['key']];age=now-a['start']
                    for index,t in enumerate(node['times']):
                        if index not in a['done'] and age+1e-9>=t:
                            a['done'].add(index);enemy_contact(e,a)
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
                    if age>=a.get('end',node['end']):e['active']=None
                if e['active'] is not None:continue
                if e['pending_phase'] and e['kind']=='boss':
                    e['phase']=2;e['pending_phase']=False
                    events.append(dict(time=now,event='boss_phase',phase=2))
                if hp<=0 or now<max(e['control_until'],e['weak_until']):continue
                dx,dy=p[0]-e['p'][0],p[1]-e['p'][1];desired_facing=1 if dx>=0 else -1
                if desired_facing!=e['facing']:
                    e['facing']=desired_facing;e['turn_until']=now+.25
                kind=e['kind']
                if kind=='elite':options=['sweep','cleave'] if e['casts']%2 else ['cleave','sweep']
                elif kind=='boss':options=['combo','roar','hammer','stomp'] if e['phase']==2 else ['roar','hammer','stomp']
                else:options=[kind]
                key=next((k for k in options if now>=e['cd'].get(k,0) and math.hypot(dx,dy)<=nodes[k]['reach']
                    and (k not in ('melee','cleave') or abs(dy)<=18)
                    and (k!='roar' or (60<=abs(dx)<=140 and abs(dy)<=abs(dx)*.577))),None)
                if key and now>=e['turn_until']:
                    special=kind!='melee'
                    reserved=any(other['active'] and other['kind']!='melee' and now-other['active']['start']<=nodes[other['active']['key']]['times'][-1] for other in actors)
                    if coordination and special and reserved:continue
                    e['active']=dict(key=key,start=now,origin=e['p'],aim=p,facing=e['facing'],done=set(),accumulated=0.,knocked=False,max_hp=s['hp'])
                    e['cd'][key]=now+nodes[key]['cd'];e['casts']+=1
                    if kind=='boss':events.append(dict(time=now,event='boss_cast',skill=key,phase=e['phase']))
                elif kind!='ranged' and (body is not None or key is None):
                    # Moving enemies can still be passed through; bodies never block player.
                    target=(p[0]-e['facing']*28,p[1]);e['p']=advance_to(e['p'],target,dt,55,24,radius=14 if kind=='boss' else 8)
                assert valid(e['p'])
            for projectile in list(projectiles):
                if projectile['due']<=now:
                    if abs(p[0]-projectile['aim'][0])<=22 and abs(p[1]-projectile['aim'][1])<=16:
                        hurt_player(unit,projectile['origin'])
                    projectiles.remove(projectile)
            if hp>0:
                if use_pots and hp<=s['hp']*.4 and now>=hp_cd and hp_pots<8:
                    hp=min(s['hp'],hp+pot_hp);hp_pots+=1;hp_cd=now+10
                if use_pots and mp<=s['mp']*.25 and now>=mp_cd and mp_pots<8:
                    mp=min(s['mp'],mp+pot_mp);mp_pots+=1;mp_cd=now+10
            category='dead' if hp<=0 else 'control' if now<max(stun,down) else 'move' if moved else 'action' if body else 'idle'
            time_budget[category]+=dt;simulation_tick+=1;now=simulation_tick/hz
            assert valid(p) and hp>=0 and mp>=-1e-6
            if not alive and hp>0 and math.dist(p,(200,20))<1e-6:break
        room_times.append(now-entered)
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
    repair=sum(initial[k]-v for k,v in durability.items())*math.ceil(ilvl/10*(1 if gear=='starter' else 1.5))
    assert math.isclose(sum(time_budget.values()),now,abs_tol=1e-4)
    if success:assert len(kills)==28 and xp_earned==sum(parts)
    assert sum(e['event']=='boss_phase' for e in events)<=1
    assert len(kills)<=28 and sum(purple for _,purple in kills)<=1
    return dict(level=level,gear=gear,seed=seed,boss_hp_scale=boss_hp_scale,boss_recovery_bonus=boss_recovery_bonus,ranged_counter=ranged_counter,success=success,death=hp<=0,timeout=now>=max_seconds,
        seconds=now,rooms=cleared,kills=len(kills),room_seconds=room_times,player_level=c.level,
        held_weapon_level=ilvl,mail=c.mail,hp_pots=hp_pots,mp_pots=mp_pots,hp_remaining=hp,
        xp_earned=xp_earned,dodge_replans=dodge_replans,recovery_casts=recovery_casts,damage_taken=damage_taken,controls=controls,cancelled_casts=cancelled,
        hit_attempts=attacks,misses=misses,dot_ticks=dot_ticks,free_boss_revive=free_revive,
        net=gross-repair-(hp_pots+mp_pots)*price,time_budget=time_budget,events=events)


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
