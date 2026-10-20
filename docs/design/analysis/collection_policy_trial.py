"""Seeded collection-policy comparison using candidate special-dungeon drops.
Only clear-reward slot selection differs; monster drops remain random.
"""
import json
import math
import random
import statistics

SLOTS=11

def collect(seed,policy='random',difficulty='normal',set_chance=.7):
    rng=random.Random(seed)
    held=set();run=0
    def slot(weighted=False):
        if not weighted:return rng.randrange(SLOTS)
        weights=[2 if i not in held else 1 for i in range(SLOTS)]
        return rng.choices(range(SLOTS),weights=weights,k=1)[0]
    while len(held)<SLOTS and run<1000:
        run+=1
        for chance in [0.02]*20+[0.08]*2+[0.30]:
            if rng.random()<chance and rng.random()<(.99 if difficulty=='normal' else .95) and rng.random()<set_chance:
                held.add(slot())
        if policy=='test_missing':
            missing=list(sorted(set(range(SLOTS))-held))
            held.add(rng.choice(missing) if missing else rng.randrange(SLOTS))
        elif rng.random()<(1 if difficulty=='normal' else .95) and rng.random()<set_chance:
            held.add(slot(policy=='missing_weight2'))
    assert len(held)==SLOTS
    return run


def main():
    rows=[]
    for difficulty in ['normal','adventure']:
        for policy in ['random','missing_weight2','test_missing']:
            runs=sorted(collect(seed,policy,difficulty) for seed in range(10000))
            rows.append(dict(difficulty=difficulty,policy=policy,samples=len(runs),
                 mean=statistics.mean(runs),median=statistics.median(runs),
                 p90=runs[math.ceil(.9*len(runs))-1],p99=runs[math.ceil(.99*len(runs))-1],
                 max_observed=max(runs),within30=sum(r<=30 for r in runs)/len(runs)))
    assert all(row['max_observed']<=11 for row in rows if row['policy']=='test_missing')
    assert collect(1)==collect(1)
    print(json.dumps(dict(results=rows,checks='PASS: all slots collected, test missing <=11, fixed seed replay',
       caveats=['Candidate 20 normal +2 elite +1 boss encounter counts, not final special dungeon content.',
                'Full clear, all gear kept/picked, no disposals or expired mails.',
                'One named set per category and only slot completion, not optimal affixes.',
                'Missing weight2 applies to clear reward only, not monster drops.',
                'Simulation quantiles are sample estimates, not guarantees.',
                'Test missing-first uses 100% legal set clear drop as previously confirmed.']),indent=2))

if __name__=='__main__':main()
