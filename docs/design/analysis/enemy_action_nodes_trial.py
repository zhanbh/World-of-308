"""Candidate enemy action timeline; state/reference checks, no game implementation."""
from dataclasses import dataclass,field
import json

# Seconds only; candidate tuning, not final encounter configuration.
NODES={
 'elite_cleave':dict(windup=.6,active_end=.7,end=1.3,contacts=(.6,),cd=3,armor_start=None),
 'elite_sweep':dict(windup=1.,active_end=1.15,end=2.,contacts=(1.,),cd=6,armor_start=0.),
 'boss_hammer':dict(windup=1.,active_end=1.15,end=2.,contacts=(1.,),cd=4,armor_start=0.),
 'boss_roar':dict(windup=1.,active_end=4.,end=4.8,contacts=(1.5,2.,2.5,3.,3.5,4.),cd=12,armor_start=1.),
}

@dataclass
class Actor:
    boss:bool=False
    hp:float=100
    phase:int=1
    pending:bool=False
    active:str|None=None
    started:float=0
    cancelled:bool=False
    cooldowns:dict=field(default_factory=dict)

    def start(self,key,now):
        if self.hp<=0 or self.active or now<self.cooldowns.get(key,0):return False
        self.active=key;self.started=now;self.cancelled=False
        self.cooldowns[key]=now+NODES[key]['cd']
        return True

    def armored(self,now):
        if not self.active or self.hp<=0:return False
        n=NODES[self.active];age=now-self.started
        # Candidate half-open armor interval: recovery restores control.
        return n['armor_start'] is not None and n['armor_start']<=age<n['active_end']

    def damage(self,value,now):
        self.hp=max(0,self.hp-value)
        if self.hp==0:
            self.active=None;self.pending=False
        elif self.boss and self.hp<=50 and self.phase==1:
            self.pending=True
            self.finish_if_idle()

    def finish_if_idle(self):
        if self.hp>0 and self.pending and self.active is None:
            self.phase=2;self.pending=False

    def advance(self,now):
        if self.active and now-self.started>=NODES[self.active]['end']:
            self.active=None
        self.finish_if_idle()

    def control(self,now):
        if self.hp<=0 or self.armored(now):return False
        # This fixture uses a control that interrupts this action when allowed.
        self.active=None;self.cancelled=True;self.finish_if_idle()
        return True

    def contacts_between(self,after,through):
        if not self.active or self.hp<=0:return []
        return [self.started+t for t in NODES[self.active]['contacts'] if after<self.started+t<=through]


def main():
    passed=[]
    a=Actor();assert a.start('elite_cleave',0);a.damage(1,.2)
    assert a.active=='elite_cleave' # Mere damage does not interrupt.
    assert a.control(.3) and not a.contacts_between(.3,2)
    assert a.cooldowns['elite_cleave']==3 and not a.start('elite_cleave',1)
    passed.append('cleave damage does not interrupt; legal control cancels future contact and retains CD')
    for skill in ['elite_sweep','boss_hammer']:
        a=Actor(boss=skill.startswith('boss'));assert a.start(skill,0)
        assert a.armored(0) and not a.control(.5)
        a.damage(10,.5);assert a.hp==90 and a.active==skill
        assert not a.armored(NODES[skill]['active_end'])
        assert a.control(NODES[skill]['active_end'])
    passed.append('sweep/hammer hyperarmor blocks control, not damage; recovery restores control')
    a=Actor(boss=True);a.start('boss_hammer',0);a.damage(51,.5)
    assert a.phase==1 and a.pending and a.active=='boss_hammer'
    a.advance(1.2);assert a.phase==1
    a.advance(2);assert a.phase==2 and a.cooldowns['boss_hammer']==4
    passed.append('half HP waits current full action including recovery; phase does not reset cooldown')
    a=Actor(boss=True);a.start('boss_roar',0);a.damage(51,.2)
    assert a.control(.5) and a.phase==2 and a.cooldowns['boss_roar']==12
    passed.append('candidate roar windup interrupt resolves pending phase without CD refund')
    a=Actor(boss=True);a.start('boss_roar',0)
    assert not a.armored(.99) and a.armored(1) and not a.armored(4)
    assert len(a.contacts_between(1,4))==6
    a.damage(100,2.1);assert not a.contacts_between(2.1,5) and a.phase==1 and not a.pending
    passed.append('roar six candidate ticks; death cancels future caster-owned ticks, no posthumous phase')
    a=Actor(boss=True);a.start('boss_hammer',0);a.damage(50,.5);a.damage(50,1)
    a.advance(3);assert a.hp==0 and a.phase==1
    passed.append('death supersedes pending phase')
    print(json.dumps(dict(nodes=NODES,scenarios=passed,checks='PASS',
        limitations=['All numeric nodes are candidates; not approved art or AI timings.',
            'Roar windup unarmored is a candidate; only its active hyperarmor is already confirmed.',
            'Phase after full recovery and lawful interruption handoff are proposed boundary semantics.',
            'contacts_between is a stateless diagnostic, not a deduplicating damage/event engine.',
            'Roar treated as caster-owned, independent launched effects need a separate lifecycle.',
            'Half-open armor interval versus final contact at active_end requires real same-frame ordering review.',
            'No coordinates, damage calculation, cooldown pause/resume, player revive or network state.']),indent=2))

if __name__=='__main__':main()
