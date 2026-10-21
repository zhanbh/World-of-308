"""Design sensitivity: paired scripted attack policies; no gameplay configuration writes."""
import argparse
import json
import statistics
from pathlib import Path

from spatial_growth_encounter_trial import run


def summarize(samples):
    clears = [r for r in samples if r['success']]
    boss = [r['room_metrics'][-1] for r in clears]
    return dict(
        samples=len(samples), clears=len(clears),
        median_seconds=statistics.median(r['seconds'] for r in clears) if clears else None,
        median_boss_seconds=statistics.median(r['seconds'] for r in boss) if boss else None,
        mean_hp_pots=statistics.mean(r['hp_pots'] for r in samples),
        mean_mp_pots=statistics.mean(r['mp_pots'] for r in samples),
        mean_mana_spent=statistics.mean(r['mana_spent'] for r in samples),
        mean_boss_mp_pots=statistics.mean(r['mp_pots'] for r in boss) if boss else None,
        mean_boss_mana_spent=statistics.mean(r['mana_spent'] for r in boss) if boss else None,
        mean_net=statistics.mean(r['net'] for r in samples),
        mean_rooms=statistics.mean(r['rooms'] for r in samples),
        mean_casts={k:statistics.mean(r['cast_counts'][k] for r in samples) for k in samples[0]['cast_counts']},
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds', type=int, default=12)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--policies', nargs='+', choices=('burst','mixed3','mixed6','mixed3_safe','basic_only'), default=('burst','mixed3','mixed6','basic_only'))
    args = parser.parse_args()
    assert 1 <= args.seeds <= 100
    fixtures = [(1, 'starter'), (5, 'starter'), (10, 'starter'), (15, 'starter'), (10, 'blue')]
    policies = args.policies
    rows, traces = [], []
    for level, gear in fixtures:
        for policy in policies:
            samples = [run(level=level, gear=gear, seed=seed, skill_policy=policy) for seed in range(args.seeds)]
            for r in samples:
                assert sum(m['mana_spent'] for m in r['room_metrics']) == r['mana_spent']
                assert sum(m['mp_pots'] for m in r['room_metrics']) == r['mp_pots']
                assert sum(m['hp_pots'] for m in r['room_metrics']) == r['hp_pots']
                if policy == 'basic_only':
                    assert r['mana_spent'] == 0 and r['mp_pots'] == 0
                    assert all(r['cast_counts'][k] == 0 for k in ('cross','mountain','draw','outrage'))
                if r['success']:
                    assert r['kills'] == 28 and r['rooms'] == 7
                traces.append({k:r[k] for k in ('level','gear','seed','skill_policy','success','seconds','rooms','mp_pots','hp_pots','net','mana_spent','cast_counts','room_metrics')})
            rows.append(dict(level=level, gear=gear, policy=policy, **summarize(samples)))
            print(f'{level}/{gear}/{policy}: {rows[-1]["clears"]}/{args.seeds}', flush=True)
    # Deterministic replay and explicit default equivalence at one representative fixture.
    assert run(level=10, seed=0) == run(level=10, seed=0, skill_policy='burst')
    assert run(level=10, seed=1, skill_policy='mixed3') == run(level=10, seed=1, skill_policy='mixed3')
    result = dict(
        schema=1, seeds=args.seeds, results=rows, traces=traces,
        checks='PASS: default/replay equivalence, room mana/potion accounting, basic-only no skill spending, 28-kill clears',
        limitations=[
            'Same spatial model, HP, weapon formula, potion fixture and safe-range counter; only scripted skill gating varies.',
            'mixed3/mixed6 allow next skill after 3/6 basic STARTS, not completed or landed basic hits; interrupted starts still count.',
            'mixed3_safe relaxes the three-start gate when HP<=50% or an elite/Boss is in recovery; 50% is an unapproved strategy fixture, not a gameplay threshold.',
            'No optimal-policy or human-play claim. Action choices change RNG draw order; paired seeds are scenarios, not common-hit random numbers.',
            'Expected crit, candidate AI/control/geometry, up to 8 carried HP/MP potions, no paid resurrection/network/drop equipment acquisition.',
            'Main timing medians are clear-only; costs and clear counts include all attempts. Failed paths must not be hidden by faster survivors.',
            'Net is replacement-inventory gold in this model, not actual wallet cash flow or full material/weapon acquisition cost.',
            'No 1-30 growth, hunter, second/special dungeon or runtime determinism/CloudBase verification.',
        ],
    )
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
