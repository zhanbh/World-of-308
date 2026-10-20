"""Seeded, finite-budget, full-rebuild sensitivity model. Not a price release.
Includes weighted session memory, success consumption, costs, materials,
commemorative inventory and destruction. No network or production writes.
"""
import json
import math
import random
import statistics
from enhancement_risk_trial import probability
from enhancement_weighted_memory_trial import Memory

WEIGHTS={t:{s:math.exp(-.5*(s-t)**2) for s in range(1,21)} for t in range(1,21)}


def attempt(memory,target,roll,tokens,use_token,luck,ceiling=.9):
    before=memory.copy()
    history_bonus=min(.15,sum(v*WEIGHTS[target][s] for s,v in memory.items()))
    consumed=5 if use_token and tokens>=5 else 0
    p=min(ceiling,probability(target)+history_bonus+luck+(.05 if consumed else 0))
    success=roll<p
    tokens-=consumed
    if success:
        memory={s:v*(1-WEIGHTS[target][s]) for s,v in memory.items() if v*(1-WEIGHTS[target][s])>1e-15}
        minted=0
    else:
        memory[target]=min(.15,memory.get(target,0)+.03)
        minted=max(0,target-12)
        tokens+=minted
    assert tokens>=0 and 0<p<1 and consumed in (0,5)
    return memory,tokens,success,p,consumed,minted,before


def run(target_goal,seed,luck=0,use_tokens=False,session_attempts=0,ceiling=.9,max_attempts=15000):
    rng=random.Random(seed)
    level=0;tokens=0;memory={};gold=materials=destroyed=consumed=minted=0
    max_prob=0;session_resets=0
    for n in range(max_attempts):
        if session_attempts and n and n%session_attempts==0:
            memory={};session_resets+=1
        t=level+1
        # Model always requests the bonus at +13+ when inventory is sufficient.
        # Nothing forces the actual player to spend tokens this way.
        memory,tokens,success,p,c,m,_=attempt(memory,t,rng.random(),tokens,use_tokens and t>=13,luck,ceiling)
        consumed+=c;minted+=m;max_prob=max(max_prob,p)
        gold+=math.ceil(10000*t*t/100) if t<=10 else 10000*2**(t-10)
        materials+=math.ceil(t/2)
        if success:level=t
        elif t>=13:level=0;destroyed+=1
        elif t>=11:level=10
        if level>=target_goal:break
    assert tokens==minted-consumed
    return dict(completed=level>=target_goal,attempts=n+1,gold=gold,materials=materials,
                destroyed=destroyed,tokens_left=tokens,tokens_minted=minted,tokens_consumed=consumed,
                session_resets=session_resets,max_probability=max_prob)


def main():
    # Compare no-memory exact anchor separately in enhancement_risk_trial.py.
    modes=[('memory_only',0,False,0,.9),('memory_tokens',0,True,0,.9),
           ('memory_tokens_luck5',.05,True,0,.9),
           ('session50_tokens_luck5',.05,True,50,.9),
           ('cap95_tokens_luck5',.05,True,0,.95)]
    summaries=[]
    for label,luck,tokens,resets,cap in modes:
        for goal in [12,13,14,15]:
            rows=[run(goal,seed,luck,tokens,resets,cap) for seed in range(400)]
            completed=[r for r in rows if r['completed']]
            costs=sorted(r['gold'] for r in completed)
            summaries.append(dict(mode=label,target=goal,samples=400,completed=len(completed),
                median_gold_completed=statistics.median(costs) if costs else None,
                p90_gold_completed=costs[math.ceil(len(costs)*.9)-1] if costs else None,
                mean_gold_spent_including_cutoffs=statistics.mean(r['gold'] for r in rows),
                mean_destroyed=statistics.mean(r['destroyed'] for r in rows),
                mean_tokens_minted=statistics.mean(r['tokens_minted'] for r in rows),
                mean_tokens_consumed=statistics.mean(r['tokens_consumed'] for r in rows)))
    # Bookkeeping checks independent of RNG outcomes and full-rebuild path.
    m,t,ok,p,c,g,_=attempt({},13,.99,5,True,0)
    assert not ok and t==1 and c==5 and g==1 and m[13]==.03
    m,t,ok,p,c,g,_=attempt({13:.09,18:.09},13,0,5,True,0)
    assert ok and c==5 and g==0 and 13 not in m and m[18]>.089
    _,_,_,p,_,_,_=attempt({1:.15},1,.99,5,True,.05)
    assert p==.9
    assert run(13,0)==run(13,0)
    print(json.dumps(dict(summaries=summaries,checks='PASS: consumed/minted conservation, success/failure spend, weighted success, probability cap, fixed-seed replay',
        limitations=['400 fixed-seed paths, at most 15000 attempts per path; not theoretical expectations.',
                     'Completed quantiles are conditional if any path is censored.',
                     'Replacement equipment and material acquisition excluded; materials are counted only.',
                     'No prepared junk-padding strategy; direct full rebuild only.',
                     '5pp luck is a constant sensitivity fixture, not a validated attainable gear bonus.',
                     'Session length measured in attempts for sensitivity, not a gameplay logout threshold.',
                     'Costs/rewards/materials/probability curves remain candidates.']),indent=2))

if __name__=='__main__':main()
