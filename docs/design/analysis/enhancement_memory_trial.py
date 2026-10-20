"""Exact candidate session-memory / padding arithmetic and reference scenarios.
No production assets, network or files written. Curves are not approved values.
"""
from dataclasses import dataclass, field
import json
import math


def bonus(failures,step,cap):return min(failures*step,cap)
def chance(base,failures,step,cap):return min(.95,base+bonus(failures,step,cap))

def wait_for_failures(base,n,step,cap):
    # An indefinitely prepared pool of dummy items at the SAME target level;
    # success resets the counter. Preparation/acquisition costs are excluded.
    reach=1;cycle=0
    for f in range(n):
        cycle+=reach
        reach*=1-chance(base,f,step,cap)
    return cycle/reach


def stationary(base,step,cap):
    # Count saturated at K; remaining repeated failures stay in K. Stationary
    # weights: reach(f) for f<K, reach(K)/p(K) for final saturated state.
    k=math.ceil(cap/step);reach=1;weights=[]
    for f in range(k):
        weights.append(reach);reach*=1-chance(base,f,step,cap)
    weights.append(reach/chance(base,k,step,cap))
    total=sum(weights)
    dist=[w/total for w in weights]
    mean=sum(pi*chance(base,f,step,cap) for f,pi in enumerate(dist))
    assert math.isclose(mean,1/total)
    return mean

@dataclass
class Memory:
    grouping:str='global'
    epoch:int=0
    role:str=''
    online:bool=False
    failures:dict=field(default_factory=dict)
    operations:dict=field(default_factory=dict)
    def enter(self,role):
        self.epoch+=1;self.role=role;self.online=True;self.failures={}
    def logout(self):
        self.epoch+=1;self.online=False;self.failures={}
    def key(self,target):return 'all' if self.grouping=='global' else str(target)
    def apply(self,operation,target,success,epoch):
        if not self.online or epoch!=self.epoch:return 'STALE_SESSION'
        if operation in self.operations:
            old=self.operations[operation]
            if old['epoch']!=epoch:return 'OLD_OPERATION'
            if old['target']!=target:return 'MISMATCH'
            return old
        key=self.key(target);before=self.failures.get(key,0)
        self.failures[key]=0 if success else before+1
        result=dict(epoch=epoch,target=target,success=success,before=before,after=self.failures[key])
        self.operations[operation]=result
        return result


def checks():
    passed=[]
    m=Memory();m.enter('warrior');epoch=m.epoch
    r=m.apply('dummy1',13,False,epoch);assert m.apply('dummy1',13,False,epoch)==r
    assert m.failures['all']==1
    passed.append('failure_retry_updates_once')
    m.apply('dummy2',13,False,epoch);r=m.apply('main',13,True,epoch)
    assert r['before']==2 and m.failures['all']==0
    passed.append('dummy_to_main_transfer_and_success_reset')
    m.apply('f',13,False,epoch)
    # A brief transport loss or token refresh does not call enter/logout.
    assert m.failures['all']==1
    passed.append('transport_recovery_same_epoch_preserves_memory')
    m.enter('hunter');assert not m.failures
    assert m.apply('late',13,False,epoch)=='STALE_SESSION'
    m.enter('warrior');assert not m.failures
    passed.append('switch_away_and_back_new_epoch_no_recovery_old_writes_rejected')
    m.apply('fresh',13,False,m.epoch);m.logout();m.enter('warrior')
    assert not m.failures and m.apply('fresh',13,False,m.epoch)=='OLD_OPERATION'
    assert m.operations['fresh']['after']==1
    passed.append('relogin_clears_bonus_but_preserves_auditable_old_result_no_reroll')
    g=Memory(grouping='target');g.enter('warrior')
    g.apply('low',1,False,g.epoch);assert g.failures.get('13',0)==0
    g.apply('high',13,False,g.epoch);assert g.failures['13']==1
    passed.append('target_grouping_counterfactual_blocks_low_target_transfer')
    assert chance(.8,100,.05,.2)==.95
    assert wait_for_failures(.8,3,0,0)>0
    # Independent special case matches the classical run-length formula.
    q=.2
    assert math.isclose(wait_for_failures(.8,3,0,0),(1-q**3)/((1-q)*q**3))
    passed.append('chance_cap_and_independent_run_length_crosscheck')
    return passed


def main():
    curves=[('gentle',.02,.10),('middle',.03,.15),('strong',.05,.20)]
    tables=[]
    for name,step,cap in curves:
        rows=[]
        for n in [3,5]:
            low=wait_for_failures(.8,n,step,cap)
            same=wait_for_failures(.3,n,step,cap)
            rows.append(dict(failures=n,main_target13_probability=chance(.3,n,step,cap),
                  global_low_target_dummy_attempts=low,
                  global_dummy_attempt_fee_lower_bound=low*100,
                  same_target13_dummy_attempts=same,
                  same_target13_attempt_fee_lower_bound=same*80000))
        tables.append(dict(curve=name,step=step,cap=cap,
               unconditional_mean_if_repeating_base30=stationary(.3,step,cap),rows=rows))
    print(json.dumps(dict(curves=tables,checks=checks(),notes=[
      'Global vs target grouping is a pending game-design choice.',
      'Dummy fees use level30 weapon +1=100 (candidate quadratic), +13=80000.',
      'No materials, dummy preparation, item replacement or lucky/commemorative supplies.',
      'Session can end before reaching a streak; computed waits assume uninterrupted session.',
      'Mean probability rises above base; bonus is not zero-sum mean reversion.']),indent=2))

if __name__=='__main__':main()
