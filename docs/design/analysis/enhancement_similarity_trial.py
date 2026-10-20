"""Candidate target-level similarity kernel; not production configuration."""
import json
import math


def weight(source,target,sigma=1):
    return math.exp(-.5*((source-target)/sigma)**2)


def probability(target,history,base=.3,step=.03,cap=.15):
    return min(.95,base+min(cap,step*sum(weight(source,target) for source in history)))


def main():
    # Three failed attempts towards +13, evaluate a later target at each distance.
    rows=[dict(distance=d,weight=weight(13,13+d),
           bonus_percentage_points=(probability(13+d,[13]*3)-.3)*100) for d in range(7)]
    assert rows[0]['bonus_percentage_points']>rows[1]['bonus_percentage_points']>rows[2]['bonus_percentage_points']
    assert math.isclose(probability(13,[]),.3)
    assert math.isclose(probability(13,[13]*3),.39)
    assert probability(13,[13]*10000)<1
    # Success resets history in this comparison; reset radius remains design detail.
    # Boosted +13 first, then +14/+15 base probabilities on consecutive successes.
    initial=.45; p14=.25; p15=.2+.05*math.exp(-.5*(1/2)**2)
    consecutive=initial*p14*p15
    assert not math.isclose(consecutive,initial**3)
    assert math.isclose(.3**3,.027)
    print(json.dumps(dict(similarity=rows,
      conditional_three_successes=dict(probabilities=[initial,p14,p15],joint=consecutive,
                                       incorrect_constant_power=initial**3),
      checks='PASS: distance decay, zero history, same-target bonus, no guarantee, conditional probability product',
      status='Kernel sigma/step/cap and success reset scope remain candidates'),indent=2))

if __name__=='__main__':main()
