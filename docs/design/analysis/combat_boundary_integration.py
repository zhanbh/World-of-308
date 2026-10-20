"""Design reference integration: immutable cast snapshots, boss windows,
post-death residual kills, revive protection and recovery clocks.
No game modules, transactions or network. All numeric examples are candidates.
"""
from dataclasses import dataclass
import json
import math
from challenge_lifecycle_trial import Challenge

@dataclass(frozen=True)
class Cast:
    budget:float
    crit:float
    crit_multiplier:float
    haste_factor:float
    ticks:int=5
    def events(self,rolls):
        assert len(rolls)==self.ticks
        return [(i/self.haste_factor,self.budget/self.ticks*(self.crit_multiplier if roll<self.crit else 1))
                for i,roll in enumerate(rolls,1)]

@dataclass
class Boss:
    hp:float=100
    window_start:float=10
    window_end:float=13
    accumulated:float=0
    down_until:float=0
    threshold:float=20
    def hit(self,when,kind,amount):
        if self.hp<=0:return 'already_dead'
        self.hp-=amount
        if self.hp<=0:return 'dead'  # No control or getup after lethal damage.
        if not self.window_start<=when<self.window_end:return 'immune'
        if kind=='dot':return 'damage_only'
        if when<self.down_until:return 'already_down'
        self.accumulated+=amount
        if kind=='force' or self.accumulated>=self.threshold:
            self.down_until=min(when+.8,self.window_end)
            self.accumulated=0
            return 'down'
        return 'accumulating'


def main():
    cases=[]
    def record(name):cases.append(dict(scenario=name,status='PASS'))
    cast=Cast(100,.4,1.5,1.5)
    rolls=[.9,.1,.9,.1,.9]
    events=cast.events(rolls)
    # A later actor stat change does not mutate the old immutable snapshot.
    current_crit=.2;current_haste=1
    assert sum(v for _,v in events)==120 and math.isclose(events[-1][0],10/3)
    next_cast=Cast(100,current_crit,1.5,current_haste)
    assert next_cast.events(rolls)[-1][0]==5
    record('buff_expiry_keeps_old_cast_timing_and_independent_rolls_new_cast_uses_new_stats')
    c=Challenge(durability=1);c.die();boss_hp=50
    for when,damage in events:
        c.advance(when-c.wall);boss_hp-=damage
        if boss_hp<=0:c.kill('boss',True,['add']);break
    assert c.result=='completed' and c.alive and c.emblems==10 and c.paid==0 and c.durability==0
    record('weapon_zero_death_buff_clear_then_locked_bleed_boss_kill_free_revive')
    c=Challenge();c.die();c.advance(events[0][0]);assert c.kill('ordinary');c.level_up()
    assert not c.alive and c.hp==0 and c.revive('r') and c.hp==120
    record('ordinary_locked_bleed_kill_dead_levelup_requires_manual_revive')
    boss=Boss()
    assert boss.hit(9,'force',1)=='immune' and boss.hp==99
    assert boss.hit(10.1,'direct',8)=='accumulating'
    assert boss.hit(10.2,'dot',30)=='damage_only' and boss.accumulated==8
    assert boss.hit(10.4,'direct',12)=='down'
    end=boss.window_end
    assert boss.hit(10.5,'force',1)=='already_down' and boss.window_end==end
    assert boss.hit(13,'force',1)=='immune' and boss.window_end==end
    record('boss_only_window_control_dot_excluded_force_does_not_extend_window')
    boss=Boss(hp=5)
    assert boss.hit(11,'force',10)=='dead' and boss.down_until==0
    record('boss_lethal_hit_has_priority_over_knockdown')
    c=Challenge();c.die();assert c.revive('r')
    boss=Boss()
    assert boss.hit(0,'force',0)=='immune'
    assert c.protection_until==c.simulation+2
    record('revive_knockback_immune_boss_does_not_cancel_player_protection')
    c=Challenge();c.die();c.advance(4);c.disconnect();c.advance(6)
    assert c.result=='failed' and c.simulation==4 and not c.kill('boss',True)
    record('recovery_pauses_pending_combat_but_wall_death_deadline_ends_challenge')
    c=Challenge();c.die();c.advance(.2);c.disconnect();c.advance(2);assert c.reconnect()
    # Locked DOT uses simulation elapsed .2, not elapsed wall 2.2.
    assert math.isclose(c.simulation,.2) and c.result=='active'
    record('short_recovery_preserves_cast_and_no_offline_bleed_ticks')
    boss=Boss();assert boss.hit(12.9,'force',1)=='down'
    assert boss.down_until==13 and boss.window_end==13
    record('late_window_knockdown_control_is_bounded_by_fixed_end_candidate')
    print(json.dumps(dict(cases=cases,checks='PASS: 9 integration design scenarios',
          limitations=['Sequential reference models, not game/DB verification.',
          '0.8s control and cap-to-window-end are implementation candidates.',
          'No actual geometry, input/animation, concurrent requests or crash replay.']),indent=2))

if __name__=='__main__':main()
