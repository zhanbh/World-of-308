"""Offline design arithmetic; no game imports, assets, network or writes.
Run from any directory: python3 <absolute-or-relative-path-to-this-file>
"""
import json
import math


def gold(level):
    # Integer arithmetic for the candidate 500*(1+.08*n+.02*n*n).
    n = level - 1
    return 500 + 40 * n + 10 * n * n


def repair(level, quality, maximum, current, rooms, deaths):
    assert 0 <= current <= maximum and rooms >= 0 and deaths >= 0
    unit = math.ceil(level / 10 * {"white": 1, "purple": 2}[quality])
    remaining = max(0, current - rooms - 5 * deaths)
    return (maximum - remaining) * unit


def scenario(name, gross, rooms, deaths, potions, paid, starter=False):
    bill = repair(10 if starter else 30, "white" if starter else "purple",
                  60 if starter else 160, 60 if starter else 160, rooms, deaths)
    if not starter:
        bill += 6 * repair(30, "purple", 100, 100, rooms, deaths)
    replenishment = potions * (20 if starter else 150)
    cash = gross - replenishment - bill
    return dict(name=name, gross= gross, repair=bill, potion_replacement=replenishment,
                paid_revives=paid, net_before_emblem_replacement=cash,
                net_after_emblem_replacement=cash - paid * 100000)


scenarios = [
    scenario("first_normal", 500, 6, 0, 3, 0, True),
    scenario("level30_normal", gold(30), 6, 0, 2, 0),
    scenario("special_normal", 20000, 6, 0, 2, 0),
    scenario("special_adventure_one_revive", 28000, 6, 1, 4, 1),
    scenario("special_normal_three_revives", 20000, 6, 3, 8, 3),
    # Hypothesis: 60% of kill budget earned; not 60% of rooms or monsters.
    scenario("failed_60pct_kill_budget", 20000 * 70 // 100 * 60 // 100,
             5, 4, 8, 3),
]
net = scenarios[2]["net_before_emblem_replacement"]
probability = {**{t: .8 for t in range(1, 6)},
               **{t: .7 for t in range(6, 8)},
               **{t: .6 for t in range(8, 11)}}
enhancement = []
for slot, c10 in [("weapon", 10000), ("earring", 8000)]:
    c = lambda t: math.ceil(c10 * t * t / 100) if t <= 10 else c10 * 2 ** (t - 10)
    e10 = sum(c(t) / probability[t] for t in range(1, 11))
    # Renewal equation at +10: E10=(C11/.5 + C12)/.4.
    e12_extra = (c(11) / .5 + c(12)) / .4
    enhancement.append(dict(slot=slot, expected_0_to_10=e10,
                            expected_10_to_12=e12_extra,
                            expected_0_to_12=e10 + e12_extra,
                            equivalent_net_runs=(e10 + e12_extra) / net))

# Isolate removal of weapon fixed and enhancement AP only. Weapon secondary
# stats are intentionally held constant: this is NOT the complete broken build.
damage = []
for enhancement_ap in [0, 24]:
    intact_ap = 308.44 + enhancement_ap
    broken_ap = 308.44 - 80
    base, ratio = 12 + (15 - 1) * 2, 1.6  # Cross slash rank 15 candidate.
    damage.append(dict(weapon_enhancement_ap=enhancement_ap,
                       intact_ap=intact_ap, isolated_broken_ap=broken_ap,
                       basic_and_bleed_retained=broken_ap / intact_ap,
                       cross_direct_retained=(base + ratio * broken_ap) /
                                             (base + ratio * intact_ap)))

sensitivity = []
for income in [18000, 20000, 22000]:
    for bottles in [2, 4, 8]:
        retained = income - 252 - bottles * 150
        sensitivity.append(dict(gross=income, bottles=bottles, net=retained,
                                runs_per_emblem=100000 / retained))

# Independent known-value and boundary checks, not gameplay test coverage.
assert [gold(l) for l in [1, 5, 10, 15, 20, 25, 30]] == [500, 820, 1670, 3020, 4870, 7220, 10070]
assert all(gold(l + 1) > gold(l) for l in range(1, 30))
assert [s["repair"] for s in scenarios] == [6, 252, 252, 462, 882, 1050]
assert [s["net_after_emblem_replacement"] for s in scenarios] == [434, 9518, 19448, -73062, -282082, -293850]
assert repair(30, "purple", 160, 1, 1, 0) == 960
assert repair(30, "purple", 160, 0, 99, 99) == 960
assert repair(30, "purple", 160, 160, 0, 0) == 0
assert math.isclose(enhancement[0]["expected_0_to_12"], 259851.19047619047)
assert math.isclose(enhancement[1]["expected_0_to_12"], 207880.95238095237)
assert all(0 < d["basic_and_bleed_retained"] < d["cross_direct_retained"] < 1 for d in damage)
print(json.dumps(dict(scenarios=scenarios, enhancement=enhancement,
                      isolated_damage=damage, income_potion_sensitivity=sensitivity,
                      baseline_revive_break_even_rate=net / (100000 + 210 + 300),
                      check_status="PASS: design arithmetic and boundaries only"),
                 ensure_ascii=False, indent=2))
