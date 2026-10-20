"""Sequential design reference model; no production transactions or cloud I/O.
Scenario checks establish intended semantics, not implementation conformance.
"""
from dataclasses import dataclass, field
import json

@dataclass
class Challenge:
    wall:float=0
    simulation:float=0
    result:str='active'
    alive:bool=True
    connected:bool=True
    scene:str='combat'
    death_deadline:float|None=None
    recovery_deadline:float|None=None
    hp:float=100
    mp:float=100
    max_hp:float=100
    max_mp:float=100
    emblems:int=10
    paid:int=0
    paid_limit:int|None=None
    durability:int=10
    protection_until:float=0
    skills_until:float=20
    potion_until:float=20
    trinket_until:float=120
    buff:bool=True
    killed:set=field(default_factory=set)
    requests:dict=field(default_factory=dict)
    wear_events:set=field(default_factory=set)
    kill_rewards:int=0
    clear_rewards:int=0
    ground_present:bool=True

    def town(self):
        self.scene='town'; self.ground_present=False
        self.skills_until=self.potion_until=self.trinket_until=self.wall
        self.buff=False

    def advance(self,seconds):
        assert seconds>=0
        end=self.wall+seconds
        while self.wall<end:
            cut=min([end]+[d for d in [self.death_deadline,self.recovery_deadline] if d is not None and d>self.wall])
            if self.connected and self.scene=='combat' and self.result=='active': self.simulation+=cut-self.wall
            self.wall=cut
            expired=((self.death_deadline is not None and self.wall>=self.death_deadline)
                 or (self.recovery_deadline is not None and self.wall>=self.recovery_deadline))
            if expired:
                if self.result=='active': self.result='failed'
                self.death_deadline=self.recovery_deadline=None
                self.town()

    def wear(self,key,points):
        if key not in self.wear_events:
            self.wear_events.add(key); self.durability=max(0,self.durability-points)

    def die(self,key='death1'):
        if self.result!='active' or not self.alive: return False
        self.alive=False;self.hp=0;self.buff=False
        self.death_deadline=self.wall+10
        self.wear(key,5)
        return True

    def level_up(self):
        self.max_hp+=20;self.max_mp+=10
        if self.alive: self.hp=self.max_hp;self.mp=self.max_mp

    def disconnect(self):
        if self.scene=='town':return
        self.connected=False;self.recovery_deadline=self.wall+10

    def reconnect(self):
        if self.scene=='town':return False
        self.connected=True;self.recovery_deadline=None
        return True

    def revive(self,key):
        if key in self.requests:return self.requests[key]
        valid=(self.result=='active' and self.connected and not self.alive
          and self.death_deadline is not None and self.wall<self.death_deadline
          and self.emblems>0 and (self.paid_limit is None or self.paid<self.paid_limit))
        if valid:
            self.emblems-=1;self.paid+=1;self.restore()
            self.protection_until=self.simulation+2
        self.requests[key]=valid
        return valid

    def restore(self):
        self.alive=True;self.hp=self.max_hp;self.mp=self.max_mp
        self.death_deadline=None;self.skills_until=self.wall

    def kill(self,source,boss=False,adds=()):
        if self.result!='active' or not self.connected:return False
        if source in self.killed:return False
        self.killed.add(source);self.kill_rewards+=1
        if boss:
            for add in adds:
                if add not in self.killed:self.killed.add(add);self.kill_rewards+=1
            self.result='completed';self.scene='looting';self.clear_rewards+=1
            if not self.alive:self.restore()
            self.wear('final_room',1)
        return True


def check(name,fn,output):
    fn();output.append(dict(scenario=name,status='PASS'))


def main():
    output=[]
    def broken():
        c=Challenge(durability=1);c.wear('room1',1);c.wear('room1',1);c.advance(3)
        assert c.durability==0 and c.result=='active' and c.alive and c.simulation==3
    check('weapon_zero_continues_without_extra_death',broken,output)
    def paid():
        c=Challenge();c.die();c.advance(1);assert c.revive('request1');assert c.revive('request1')
        assert c.emblems==9 and c.paid==1 and c.hp==100 and c.mp==100
        assert c.skills_until==1 and c.potion_until==20 and c.trinket_until==120
        assert c.protection_until==c.simulation+2 and not c.buff
    check('paid_revive_once_full_resources_only_class_cd_reset',paid,output)
    def free():
        c=Challenge();c.die();c.advance(9);assert c.kill('boss',True,['a','b'])
        assert c.alive and c.emblems==10 and c.paid==0 and c.result=='completed'
        assert c.kill_rewards==3 and c.clear_rewards==1 and c.death_deadline is None
        assert not c.revive('late') and not c.kill('boss',True,['a','b'])
    check('residual_boss_free_revive_adds_and_terminal_dedup',free,output)
    def normal():
        c=Challenge();c.die();c.kill('ordinary');c.level_up()
        assert not c.alive and c.hp==0 and c.max_hp==120 and c.emblems==10
        assert c.revive('r') and c.hp==120 and c.mp==110
    check('ordinary_residual_kill_and_dead_levelup_no_free_revive',normal,output)
    def livelevel():
        c=Challenge(hp=20,mp=10);c.level_up();assert c.hp==120 and c.mp==110
    check('living_levelup_full_resources',livelevel,output)
    def deadwindow():
        c=Challenge();c.die();c.advance(4);c.disconnect();c.advance(6)
        assert c.wall==10 and c.simulation==4 and c.result=='failed' and c.scene=='town'
        assert not c.reconnect() and not c.kill('boss',True)
    check('dead_disconnect_does_not_extend_death_deadline',deadwindow,output)
    def liveconnect():
        c=Challenge();c.advance(2);c.disconnect();c.advance(9);assert c.reconnect()
        assert c.result=='active' and c.simulation==2 and c.potion_until==20
    check('short_recovery_freezes_simulation_no_cd_reset',liveconnect,output)
    def timeout():
        c=Challenge();c.disconnect();c.advance(10)
        assert c.result=='failed' and c.scene=='town' and c.skills_until==10
    check('recovery_timeout_town_clears_all_cds',timeout,output)
    def looting():
        c=Challenge();c.kill('boss',True);c.advance(100000)
        assert c.result=='completed' and c.scene=='looting'
        c.disconnect();c.advance(10)
        assert c.result=='completed' and c.scene=='town' and c.clear_rewards==1 and not c.ground_present
    check('online_looting_unlimited_recovery_timeout_keeps_completion',looting,output)
    def limits():
        c=Challenge(paid_limit=3)
        for i in range(3):c.die('d'+str(i));assert c.revive('r'+str(i))
        c.die('fourth');assert not c.revive('fourth') and c.paid==3 and c.emblems==7
        c.kill('boss',True);assert c.alive and c.paid==3 and c.emblems==7
    check('special_three_paid_revives_does_not_block_free_completion',limits,output)
    def noitem():
        c=Challenge(emblems=0);c.die();assert not c.revive('r') and c.emblems==0
    check('no_emblem_no_substitute_currency',noitem,output)
    def finalwear():
        c=Challenge(durability=1);c.kill('boss',True)
        assert c.result=='completed' and c.durability==0 and c.clear_rewards==1
    check('final_wear_zero_never_reverses_completion',finalwear,output)
    print(json.dumps(dict(results=output,limitations=['Sequential reference only; no persistence/transaction/crash proof.',
      'Deadline equality checked before incoming command as candidate protocol boundary.',
      'Already-committed paid revive vs later boss kill refund policy is not defined here.',
      'CD values are deadlines; short recovery does not clear them. Detailed combat-clock CD policy pending.']),indent=2))

if __name__=='__main__':main()
