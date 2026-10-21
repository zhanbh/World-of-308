"""Candidate first-dungeon 1->15 supply path, not a production economy profile."""
import argparse
import csv
import json
import math
import random
import statistics
from pathlib import Path

from spatial_growth_encounter_trial import run, REF, POTS
from weapon_synergy_trial import SLOTS
from weapon_synergy_validation import build

ROOT=Path(__file__).resolve().parents[3]
with (ROOT/'docs/design/combat-numeric-v1.csv').open(encoding='utf-8') as f:
    NUMERIC={int(r['level']):r for r in csv.DictReader(f)}
Q={'white':0,'green':1,'blue':2}
TIER=lambda level:10 if level<5 else 15 if level<10 else 20 if level<15 else 25
MIN_LEVEL={10:1,15:5,20:10,25:15}
SELL={10:20,15:40,20:80,25:120}
POTION={10:(150,40,20),15:(300,70,40),20:(550,110,70),25:(900,160,100)}
WEAR={'weapon','chest','pants','belt','shoulder','boots','earring'}


def reference(level):
    # Preserve historical checkpoints; intermediate levels explicitly use the old CSV candidate.
    return REF.get(level,(float(NUMERIC[level]['total_ap']),max(.02,level/100),max(.02,level/100)))


def item(slot,tier,quality,source):
    maximum=(60+2*(tier-10)+20*Q[quality]) if slot=='weapon' else 100
    return dict(slot=slot,item_level=tier,quality=quality,source=source,
                durability=dict(wearEnabled=slot in WEAR,current=maximum if slot in WEAR else None,max=maximum if slot in WEAR else None))


def path(seed,policy='burst',max_runs=60,boss_hp_scale=1):
    loot_rng=random.Random(seed+2000003);mat_rng=random.Random(seed+3000003)
    equipped={'weapon':item('weapon',10,'white','initial_weapon')}
    bag=[];pending=[];mail=[];issued=set();sources=set();claim_sources={'starter_mail'};ledger=[];rows=[]
    stock={('hp',10,'gift'):8,('mp',10,'gift'):8}
    acquired={k:v for k,v in stock.items()};used={};materials=0;wallet=0;xp=0;level=1
    seconds=0.;stamina=308;window=0;waiting=0.;stopped=None;generated=ground_lost=0

    def occupancy():
        return len(bag)+sum(math.ceil(n/20) for n in stock.values() if n)+math.ceil(materials/20)+1 # ten unused revival crests

    def money(delta,reason):
        nonlocal wallet
        assert wallet+delta>=0,(seed,reason,wallet,delta)
        wallet+=delta;ledger.append(dict(delta=delta,reason=reason,balance=wallet))

    def receive(value,source,clear=False):
        nonlocal generated,ground_lost
        assert source not in sources
        sources.add(source);generated+=1
        if occupancy()<20:bag.append(value)
        elif clear:pending.append(value)
        else:ground_lost+=1

    def town():
        nonlocal seconds,level
        # Candidate player strategy: equip by higher item tier, then quality; sell leftovers.
        def equip_sell():
            for value in sorted(list(bag),key=lambda x:(x['item_level'],Q[x['quality']]),reverse=True):
                if MIN_LEVEL[value['item_level']]>level:continue
                old=equipped.get(value['slot'])
                if old is None or (value['item_level'],Q[value['quality']])>(old['item_level'],Q[old['quality']]):
                    bag.remove(value);equipped[value['slot']]=value
                    if old:bag.append(old) # replaced item uses the freed cell
            for value in list(bag):
                money(SELL[value['item_level']]*(1,2,3)[Q[value['quality']]],'sell_equipment')
                bag.remove(value)
        equip_sell()
        while pending and occupancy()<20:
            bag.append(pending.pop(0))
        equip_sell()
        for attachment in list(mail):
            if occupancy()>=20:continue
            assert attachment['source'] not in claim_sources
            bag.append(attachment);claim_sources.add(attachment['source']);mail.remove(attachment)
        equip_sell()
        damaged=[v for v in equipped.values() if v['durability']['wearEnabled'] and v['durability']['current']<v['durability']['max']]
        def price(v):return (v['durability']['max']-v['durability']['current'])*math.ceil(v['item_level']/10*(1 if v['quality']!='blue' else 1.5))
        all_cost=sum(price(v) for v in damaged)
        targets=damaged if wallet>=all_cost else [equipped['weapon']]
        for value in targets:
            cost=price(value)
            if cost and wallet>=cost:
                money(-cost,'repair');value['durability']['current']=value['durability']['max']
        # Use remaining character-bound gift first; otherwise buy this level's tier, no free refill.
        tier=TIER(level)
        selected={}
        for kind in ('hp','mp'):
            gift=(kind,10,'gift')
            if stock.get(gift,0)>0:selected[kind]=gift;continue
            key=(kind,tier,'bought');selected[kind]=key
            cost=POTION[tier][2]
            for _ in range(max(0,8-stock.get(key,0))):
                old_slots=math.ceil(stock.get(key,0)/20)
                new_slots=math.ceil((stock.get(key,0)+1)/20)
                if wallet<cost or occupancy()+new_slots-old_slots>20:break
                money(-cost,'buy_'+kind);stock[key]=stock.get(key,0)+1;acquired[key]=acquired.get(key,0)+1
        assert occupancy()<=20
        return selected

    selected=town()
    for index in range(max_runs):
        if level>=15:break
        if equipped['weapon']['durability']['current']==0:
            stopped='broken_weapon_no_affordable_repair';break
        if stamina==0:
            next_window=(window+1)*14400
            waiting+=max(0,next_window-seconds);seconds=max(seconds,next_window);window+=1;stamina=308
        entry=level;entry_wallet=wallet;entry_effective=seconds-waiting;entry_slots=occupancy()
        tier=TIER(entry)
        context=dict(xp=xp,loadout=equipped,durability={k:v['durability']['current'] for k,v in equipped.items() if k in WEAR},
                     enemy_reference=reference(entry),hp_restore=POTION[selected['hp'][1]][0],mp_restore=POTION[selected['mp'][1]][1],
                     hp_count=stock.get(selected['hp'],0),mp_count=stock.get(selected['mp'],0))
        r=run(level=entry,gear='blue',seed=seed*1000+index,skill_policy=policy,campaign=context,boss_hp_scale=boss_hp_scale)
        level=r['player_level'];xp=r['xp_remaining'];seconds+=r['seconds']
        room_count=len(r['room_metrics']);paid=min(stamina,room_count);stamina-=paid
        for kind,n in (('hp',r['hp_pots']),('mp',r['mp_pots'])):
            key=selected[kind];assert stock.get(key,0)>=n
            stock[key]=stock.get(key,0)-n;used[key]=used.get(key,0)+n
        for k,current in r['durability'].items():equipped[k]['durability']['current']=current
        money(r['gross'],'challenge_gold')
        materials_before=materials;room_materials=0
        for ordinal,kill in enumerate(r['kill_records']):
            chance=.30 if kill['kind']=='boss' else .08 if kill['kind']=='elite' else .02
            source=f'{index}:kill:{ordinal}'
            if loot_rng.random()<chance:
                quality=loot_rng.choices(('white','green','blue'),weights=(70,25,5),k=1)[0]
                slot=loot_rng.choice(tuple(SLOTS))
                receive(item(slot,tier,quality,source),source)
            if room_materials<20 and mat_rng.random()<6/28:
                room_materials+=1
                extra=math.ceil((materials+1)/20)-math.ceil(materials/20)
                if occupancy()+extra<=20:materials+=1
        if r['success']:
            source=f'{index}:clear'
            receive(item(loot_rng.choice(tuple(SLOTS)),tier,'white',source),source,clear=True)
        for milestone,mail_tier in sorted(r['mail'].items()):
            key=f'level_mail:{milestone}'
            assert key not in issued
            issued.add(key);mail.append(item('weapon',mail_tier,'green',key))
        seconds+=30 # explicit town-time fixture, not an actual route timing
        new_window=int(seconds//14400)
        if new_window>window:window=new_window;stamina=308
        selected=town()
        assert sum(x['delta'] for x in ledger)==wallet
        assert all(acquired.get(k,0)-used.get(k,0)==v for k,v in stock.items())
        assert 0<=stamina<=308 and occupancy()<=20 and xp>=0
        rows.append(dict(run=index+1,entry_level=entry,end_level=level,success=r['success'],seconds=r['seconds'],boss_seconds=r['room_seconds'][-1] if len(r['room_seconds'])==7 else None,
                         hp_pots=r['hp_pots'],mp_pots=r['mp_pots'],wallet_before=entry_wallet,wallet_after=wallet,
                         bag_slots_before=entry_slots,bag_slots_after=occupancy(),materials_gained=materials-materials_before,
                         worn={k:dict(item_level=v['item_level'],quality=v['quality'],source=v['source'],durability=v['durability'].copy()) for k,v in equipped.items()},
                         blue_worn=sum(v['quality']=='blue' for v in equipped.values()),paid_stamina=paid,effective_seconds=seconds-waiting-entry_effective))
    if level<15 and stopped is None:stopped='max_runs'
    return dict(seed=seed,policy=policy,reached15=level>=15,level=level,xp=xp,runs=len(rows),clears=sum(r['success'] for r in rows),
                effective_seconds=seconds-waiting,waiting_seconds=waiting,wallet=wallet,materials=materials,
                generated_equipment=generated,ground_lost=ground_lost,remaining_pending=len(pending),remaining_mail=len(mail),milestone_claims=sorted(claim_sources),
                potion_purchases=-sum(r['delta'] for r in ledger if r['reason'].startswith('buy_')),
                repair=-sum(r['delta'] for r in ledger if r['reason']=='repair'),sales=sum(r['delta'] for r in ledger if r['reason']=='sell_equipment'),
                stock=[dict(kind=k[0],tier=k[1],binding=k[2],remaining=v,acquired=acquired.get(k,0),used=used.get(k,0)) for k,v in sorted(stock.items())],
                stopped=stopped,ledger=ledger,path=rows)


def main():
    p=argparse.ArgumentParser();p.add_argument('--seeds',type=int,default=12);p.add_argument('--seed-start',type=int,default=0);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--boss-hp-scale',type=float,default=1);args=p.parse_args()
    assert args.boss_hp_scale>0
    assert 1<=args.seeds<=100
    assert 0<=args.seed_start<=1000
    for level,value in REF.items():assert reference(level)==value
    # Candidate mixed-quality aggregation preserves all-blue and initial-white endpoints.
    all_blue={k:item(k,20,'blue',k) for k in SLOTS}
    assert build(10,'blue',loadout=all_blue)==build(10,'blue',item_level=20)
    assert build(1,'blue',loadout={'weapon':item('weapon',10,'white','w')})==build(1,'starter',item_level=10,starter_quality='white')
    results=[];summaries=[]
    cases=[(seed,policy) for policy in ('burst','mixed3_safe') for seed in range(args.seed_start,args.seed_start+args.seeds)]
    for seed,policy in cases:
        r=path(seed,policy,boss_hp_scale=args.boss_hp_scale);results.append(r);print(f'{r["policy"]}/{r["seed"]}: level {r["level"]}, {r["runs"]} attempts',flush=True)
    for policy in ('burst','mixed3_safe'):
        samples=[r for r in results if r['policy']==policy];reached=[r for r in samples if r['reached15']]
        summaries.append(dict(policy=policy,samples=len(samples),reached15=len(reached),median_attempts=statistics.median(r['runs'] for r in reached) if reached else None,
                              median_effective_minutes=statistics.median(r['effective_seconds']/60 for r in reached) if reached else None,
                              mean_wallet=statistics.mean(r['wallet'] for r in samples),mean_purchase_cost=statistics.mean(r['potion_purchases'] for r in samples),
                              mean_failures=statistics.mean(r['runs']-r['clears'] for r in samples),mean_blue_worn_end=statistics.mean(r['path'][-1]['blue_worn'] for r in samples if r['path'])))
    if args.seed_start==0:assert results[0]==path(0,boss_hp_scale=args.boss_hp_scale)
    output=dict(boss_hp_scale=args.boss_hp_scale,summaries=summaries,traces=results,checks='PASS: gold and real potion conservation, 20-slot budget, milestone source uniqueness, preserved held gear/durability, reference and build endpoint equivalence, deterministic replay',
                limitations=['Only first dungeon normal1->15; no full1->30 target, hunter, second or special dungeon.',
                    'All drop rates,13-slot uniform pool, highest unlocked item tier, fixed first green secondary, prices and30s town overhead are explicit candidate fixtures.',
                    'White clear reward and70/25/5 monster qualities come from old D03 candidates, not a finalized normal acquisition profile.',
                    'Random affix types/rolls, paid resurrection, bank, consumable drops and enchant spending are not simulated; materials accumulate and enhancement cost is zero.',
                    'Player strategy equips by item tier then quality, sells spare gear, prioritizes repair and HP then MP, consumes gift tier first; not optimal or automatic game behaviour.',
                    'Inventory binding gift/bought potion buckets are explicit. One selected HP and one MP template per challenge; no free tier upgrade or mid-fight shopping.',
                    'Milestone mail and permanent clear-pending queues are separate; all visits occur before expiry in this path, not a mail-expiry implementation.',
                    'Intermediate enemy reference AP uses old CSV; existing1/5/10/15 REF preserved (15 CSV145.44 differs from historical REF153.44). Not newly finalized enemy tuning.',
                    'Expected crit/candidate geometry and AI; no real-player or runtime/cloud verification.'])
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':main()
