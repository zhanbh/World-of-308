"""Experience/award lifecycle candidate, not a combat duration simulation.
Explicit held weapon tier prevents automatic weapon upgrades on level-up.
"""
from dataclasses import dataclass,field
from pathlib import Path
import csv
import json
import math
from weapon_synergy_validation import build,COEFF

ROOT=Path(__file__).resolve().parents[3]
with (ROOT/'docs/design/combat-numeric-v1.csv').open() as handle:
    XP={int(row['level']):int(float(row['xp_to_next'])) for row in csv.DictReader(handle)}
MILESTONES={5:15,10:20,15:25,20:30,25:30,30:30}

@dataclass
class Character:
    level:int=1
    xp:int=0
    weapon_level:int=10
    quality:str='white'
    dead:bool=False
    hp:float=0
    mp:float=0
    mail:dict=field(default_factory=dict)
    processed:set=field(default_factory=set)

    def stats(self):
        return build(self.level,'starter',item_level=self.weapon_level,starter_quality=self.quality)

    def award(self,amount,key):
        if key in self.processed:return []
        self.processed.add(key)
        assert amount>=0
        if self.level==30:return []
        self.xp+=amount;gained=[]
        while self.level<30 and self.xp>=XP[self.level]:
            self.xp-=XP[self.level];self.level+=1;gained.append(self.level)
            if self.level in MILESTONES:self.mail[self.level]=MILESTONES[self.level]
            if not self.dead:
                s=self.stats();self.hp=s['hp'];self.mp=s['mp']
        if self.level==30:self.xp=0
        return gained

    def claim_best(self):
        if not self.mail:return
        milestone=max(self.mail)
        self.weapon_level=self.mail[milestone];self.quality='green'
        # Test strategy consumes mail entries; real bag/mail transaction not implemented.
        self.mail.clear()


def challenge_awards(monster_level):
    # Fixed XP per complete run; never pay more XP just because player waits longer.
    budget=4*(100+20*(monster_level-1))
    kill_budget=math.floor(budget*.7)
    ordinary=kill_budget//39 # 25 ordinary + purple2 + elite4 + boss8.
    awards=[ordinary]*25+[ordinary*2,ordinary*4,kill_budget-31*ordinary]
    assert sum(awards)==kill_budget and awards[25]==2*ordinary
    return awards+[budget-kill_budget]


def career(run_minutes=4,claim=True,decay=False):
    c=Character();runs=0;ledger=[]
    while c.level<30:
        entry=c.level
        # Second leveling dungeon available at15; use matching monster level.
        locked=max(15,min(30,entry)) if entry>=15 else min(15,entry)
        start_weapon=c.weapon_level
        for index,amount in enumerate(challenge_awards(locked)):
            factor=max(.1,1-.1*max(0,c.level-locked)) if decay else 1
            c.award(math.floor(amount*factor),(runs,index))
            assert c.weapon_level==start_weapon # Mail never auto-equips mid-run.
        if claim:c.claim_best()
        ledger.append(dict(run=runs+1,entry=entry,monster_level=locked,end=c.level,weapon_level=c.weapon_level))
        runs+=1;assert runs<=500
    return dict(run_minutes=run_minutes,claim=claim,decay=decay,runs=runs,hours=runs*run_minutes/60,
        weapon_level=c.weapon_level,mail_pending=len(c.mail),ledger=ledger)


def main():
    assert all(XP[level]>0 for level in range(1,30))
    c=Character();old=c.stats();c.hp=1;c.mp=1
    c.award(sum(XP[i] for i in range(1,6)),'multi')
    assert c.level==6 and c.weapon_level==10 and c.quality=='white'
    assert c.mail=={5:15} and c.hp==c.stats()['hp'] and c.mp==c.stats()['mp']
    assert c.award(99999,'multi')==[] and c.mail=={5:15}
    expected=(4+30)*(1+COEFF*(20+3*5+.05*25))
    assert math.isclose(c.stats()['ap'],expected)
    c.claim_best();assert c.weapon_level==15 and c.quality=='green'
    d=Character(dead=True,hp=0,mp=0)
    d.award(sum(XP[i] for i in range(1,5)),'dead')
    assert d.level==5 and d.hp==0 and d.mp==0 and d.mail=={5:15}
    # Level30 stops XP; milestone mail generated once, no duplicate award retry.
    x=Character();x.award(sum(XP[i] for i in range(1,30))+100,'max')
    assert x.level==30 and x.xp==0 and set(x.mail)==set(MILESTONES)
    x.award(99999,'extra');assert x.xp==0 and len(x.mail)==6
    cases=[career(minutes,claim,decay) for minutes in [3,4,5] for claim in [True,False] for decay in [False,True]]
    # Fixed pacing inputs are independent of claimed weapon; don't fake combat feedback.
    for minutes in [3,4,5]:
        assert career(minutes,True)['runs']==career(minutes,False)['runs']
    print(json.dumps(dict(cases=cases,checks='PASS: multi-level carry, life/death refill, locked held tier, milestone mail once, idempotent awards, max-level cap, XP budget/purple2x',
        limitations=['XP thresholds read existing candidate CSV, not approved final progression configuration.',
            '3/4/5 minutes are input scenarios, not calculated combat duration or proof of target playtime.',
            'Run XP budget fixed to existing 4-minute candidate; no reward for extending run time.',
            'Awards use grouped order, not actual per-room kill times; no mid-cast skill unlock simulation.',
            'Candidate decay evaluated per award, may reduce XP after mid-run leveling; not a confirmed function.',
            'Mail claim/equip is a test strategy at run boundary, not automatic product behavior.',
            'No defeat, stamina waiting, town overhead, inventory pressure, repair, actual drop equipment or material economy.',
            'Experience changes stats snapshots only for new queries; existing casts not represented here.']),indent=2))

if __name__=='__main__':main()
