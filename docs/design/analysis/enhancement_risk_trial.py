"""Analytical rebuild cost, with independent regenerative-cycle cross-check.
No lucky/commemorative policy is assumed. Only optional flat bonuses used as
sensitivity counterfactuals, NOT approved or self-funding material supplies.
"""
import json
import math

# Smooth, monotone proposal for targets 15..20, approaching the known 20% floor.
def probability(t):
    if t<=5:return .8
    if t<=7:return .7
    if t<=10:return .6
    if t==11:return .5
    if t==12:return .4
    if t==13:return .3
    if t==14:return .25
    return .2+.05*math.exp(-.5*((t-14)/2)**2)


def expected(target,c10=10000,bonus=0):
    p=lambda t:min(.95,probability(t)+bonus)
    cost=lambda t:math.ceil(c10*t*t/100) if t<=10 else c10*2**(t-10)
    if target<=10:return sum(cost(t)/p(t) for t in range(1,target+1)),0
    e10=sum(cost(t)/p(t) for t in range(1,11))
    # Each target-12 attempt renews at +10 after a failure.
    e12=e10+(cost(11)/p(11)+cost(12))/p(12)
    if target==11:return e10+cost(11)/p(11),0
    if target==12:return e12,0
    e=e12; destroyed=0
    for t in range(13,target+1):
        # Starting from a new +0 instance after every destruction; acquiring
        # the replacement itself is excluded, so actual cost is higher.
        e=(e+cost(t))/p(t)
        destroyed=(destroyed+1-p(t))/p(t)
    # Regenerative cycle from new equipment to first destruction or success.
    chance=1;cycle=e12
    for t in range(13,target+1):cycle+=chance*cost(t);chance*=p(t)
    assert math.isclose(e,cycle/chance,rel_tol=1e-12)
    assert math.isclose(destroyed,1/chance-1,rel_tol=1e-12)
    return e,destroyed


def main():
    assert math.isclose(expected(10)[0],59851.19047619048)
    assert math.isclose(expected(12)[0],259851.19047619047)
    assert all(probability(t)>probability(t+1) for t in range(14,20))
    tables=[]
    for bonus in [0,.03,.05]:
        rows=[]
        for target in [10,12,13,14,15,16,18,20]:
            gold,destroyed=expected(target,bonus=bonus)
            rows.append(dict(target=target,expected_gold=gold,expected_destroyed=destroyed,
                             net_run_equivalent=gold/19448))
        tables.append(dict(bonus_percentage_points=bonus*100,rows=rows))
    print(json.dumps(dict(proposed_probabilities={t:probability(t) for t in range(1,21)},
           tables=tables,checks='PASS: +10/+12 anchors, monotonic high-level curve, two independent recurrence forms',
           caveats=['Replacement weapon acquisition, materials, time, stamina, lucky/commemorative supply not included.',
                    'Probability curve targets 15..20 remains unconfirmed.',
                    '3/5 percentage-point bonuses are sensitivity bounds, not selected policy.']),indent=2))

if __name__=='__main__':main()
