"""Candidate bounded failure-credit buckets and success consumption comparison.
Exact arithmetic/renewal calculations, not production or a full player economy.
"""
from dataclasses import dataclass, field
import json
import math
from enhancement_risk_trial import probability as base_probability

@dataclass
class Memory:
    sigma:float=1
    step:float=.03
    source_cap:float=.15
    total_cap:float=.15
    policy:str='weighted'
    buckets:dict=field(default_factory=dict)
    def weight(self,source,target):return math.exp(-.5*((source-target)/self.sigma)**2)
    def bonus(self,target):return min(self.total_cap,sum(v*self.weight(k,target) for k,v in self.buckets.items()))
    def chance(self,target):return min(.95,base_probability(target)+self.bonus(target))
    def failure(self,target):self.buckets[target]=min(self.source_cap,self.buckets.get(target,0)+self.step)
    def success(self,target):
        if self.policy=='all':self.buckets={};return
        for source in list(self.buckets):
            if self.policy=='neighborhood':
                if abs(source-target)<=1:self.buckets[source]=0
            else:self.buckets[source]*=1-self.weight(source,target)
        self.buckets={k:v for k,v in self.buckets.items() if v>1e-15}
    def reset(self):self.buckets={}


def waiting_for_streak(target,n):
    # Infinite prepared stock at target; replaces each dummy after success or
    # failure. Includes only attempt fees, not replacement/preparation costs.
    memory=Memory();reach=1;cycle=0
    for _ in range(n):
        cycle+=reach;reach*=1-memory.chance(target);memory.failure(target)
    return cycle/reach


def main():
    decay=[]
    for sigma in [.75,1,1.5]:
        m=Memory(sigma=sigma)
        for _ in range(3):m.failure(13)
        decay.append(dict(sigma=sigma,three_failure_bonus_pp={d:100*m.bonus(13+d) for d in range(6)},
                          saturated_single_source_bonus_pp={d:15*m.weight(13,13+d) for d in range(6)}))
    consumption=[]
    for policy in ['all','neighborhood','weighted']:
        m=Memory(policy=policy)
        for source in [13,14,18]:
            for _ in range(3):m.failure(source)
        p13=m.chance(13);before={t:100*m.bonus(t) for t in [13,14,18]}
        m.success(13);after={t:100*m.bonus(t) for t in [13,14,18]}
        chain=[p13,m.chance(14)];m.success(14);chain.append(m.chance(15))
        consumption.append(dict(policy=policy,before_bonus_pp=before,after_success13_bonus_pp=after,
                                conditional_success_chain=chain,joint_three_successes=math.prod(chain)))
    padding=[]
    for dummy in [1,11,12,13,14]:
        m=Memory();m.failure(dummy)
        single=m.bonus(13);max_gain=m.source_cap*m.weight(dummy,13)
        threshold=.06
        n=math.ceil(threshold/single-1e-12) if single else 10**99
        if max_gain+1e-12<threshold:
            padding.append(dict(dummy_target=dummy,max_bonus_to13_pp=100*max_gain,
                                can_reach_6pp_alone=False));continue
        attempts=waiting_for_streak(dummy,n)
        cost=10000*2**(dummy-10) if dummy>10 else math.ceil(10000*dummy*dummy/100)
        padding.append(dict(dummy_target=dummy,max_bonus_to13_pp=100*max_gain,
               can_reach_6pp_alone=True,needed_failures=n,expected_dummy_attempts=attempts,
               attempt_fees=cost*attempts,real_target13_probability=.3+min(.15,n*.03)*m.weight(dummy,13)))
    # Boundaries: a source cannot accumulate unlimited strength at distant levels.
    m=Memory()
    for _ in range(10000):m.failure(1)
    assert math.isclose(m.buckets[1],.15) and m.bonus(13)<1e-25
    for _ in range(10000):m.failure(13)
    assert m.chance(13)<1 and m.bonus(13)<=.15
    m.success(13);assert 13 not in m.buckets
    m.reset();assert m.chance(13)==.3
    # All consumers erase the exact-success source, preserving no same-source
    # second use. Far-state policy differences are deliberate, not guaranteed luck.
    for policy in ['all','neighborhood','weighted']:
        r=Memory(policy=policy);r.failure(13);r.success(13);assert r.bonus(13)==0
    assert all(d['three_failure_bonus_pp'][0]>d['three_failure_bonus_pp'][1]>d['three_failure_bonus_pp'][2] for d in decay)
    print(json.dumps(dict(decay=decay,success_consumption=consumption,padding=padding,
        checks='PASS: distance monotonicity, bounded source/total credit, no guaranteed success, exact-source consumption, session reset',
        caveats=['All numbers, source saturation and consumption policy are candidates.',
                 'Prepared dummy stock, no material/acquisition/preparation costs.',
                 'Attempt fees are level30 weapon trial prices only.',
                 'Joint probabilities follow the specified all-success path and initial history.']),indent=2))

if __name__=='__main__':main()
