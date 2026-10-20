"""Difficulty drop-budget comparison. Candidate numbers only."""
import json
import math
import statistics
from collection_policy_trial import collect


def main():
    rows=[]
    for label,difficulty,set_chance in [('normal','normal',.7),('adventure_old','adventure',.7),('adventure_adjusted','adventure',.74)]:
        monster_purple=.99 if difficulty=='normal' else .95
        clear_purple=1 if difficulty=='normal' else .95
        purple=(20*.02+2*.08+.3)*monster_purple+clear_purple
        orange=(20*.02+2*.08+.3)*(1-monster_purple)+(1-clear_purple)
        runs=sorted(collect(seed,'missing_weight2',difficulty,set_chance) for seed in range(10000))
        rows.append(dict(profile=label,purple_set_per_run=purple*set_chance,
            purple_nonset_per_run=purple*(1-set_chance),orange_per_run=orange,
            all_gear_per_run=purple+orange,collect_mean=statistics.mean(runs),
            collect_median=statistics.median(runs),p90=runs[8999],p99=runs[9899]))
    assert all(math.isclose(r['all_gear_per_run'],1.86) for r in rows)
    assert rows[2]['purple_set_per_run']>=rows[0]['purple_set_per_run']
    assert rows[2]['orange_per_run']>rows[0]['orange_per_run']
    threshold=rows[0]['purple_set_per_run']/(1.86*.95)
    print(json.dumps(dict(results=rows,adventure_set_chance_equal_rate=threshold,
      checks='PASS: item budget conservation, adjusted set/legendary opportunities',
      limitations=['Full clear, all drops retained, 10000 fixed seeds; not playtime efficiency.',
          'Adventure .74 set probability is a candidate, not an approved config.',
          'Only clear slot selection is missing-weighted; monsters stay random.',
          'Affix, weapon ownership, difficulty completion rates, revive costs and time excluded.']),indent=2))

if __name__=='__main__':main()
