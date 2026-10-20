"""Exact conditional on geometric contact; probability examples, not config."""
import json
import math


def binomial(n,k,p):return math.comb(n,k)*p**k*(1-p)**(n-k)


def main():
    rows=[]
    for p in [.8,.9,.95,1]:
        n=4;budget=100
        per_segment=[dict(hits=k,probability=binomial(n,k,p),direct_damage=budget*k/n,
                          applied_bleed_fraction=k/n) for k in range(n+1)]
        mean=sum(r['probability']*r['direct_damage'] for r in per_segment)
        variance=sum(r['probability']*(r['direct_damage']-mean)**2 for r in per_segment)
        assert math.isclose(mean,budget*p) and math.isclose(variance,budget**2*p*(1-p)/n,abs_tol=1e-9)
        assert math.isclose(sum(r['probability'] for r in per_segment),1)
        rows.append(dict(hit_probability=p,per_segment_distribution=per_segment,
                         segment_all_miss=(1-p)**n,cast_all_miss=1-p,
                         mean_damage=mean,segment_variance=variance,
                         cast_variance=budget**2*p*(1-p)))
    assert math.isclose(rows[2]['segment_all_miss'],.05**4)
    print(json.dumps(dict(results=rows,checks='PASS: exact mass/expectation/variance, four-stage shares and independent special case',
      limitations=['All four geometric contacts valid, equal weights, no early death/interrupts.',
                   'Direct and bleed budgets are illustrative; actual unequal weights change variance.',
                   'Hit probability is an input fixture, not a confirmed character stat.',
                   'Per-target per-stage vs per-target per-cast remains a user design choice.']),indent=2))

if __name__=='__main__':main()
