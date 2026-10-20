"""Design counterexamples for the two confirmed combat directions (numeric examples are candidates)."""
import json
import math

# A 100 non-critical bleed budget, five independent crit rolls; expected totals
# compare probabilities only, never copy the triggering hit's crit result.
# Buff active on cast; expires after two ticks.
budget=100; ticks=5; boosted_crit=.4; normal_crit=.2; crit_mult=1.5
locked=budget*(1+boosted_crit*(crit_mult-1))
dynamic=sum(budget/ticks*(1+p*(crit_mult-1)) for p in [boosted_crit]*2+[normal_crit]*3)
locked_times=[i/1.5 for i in range(1,6)]
# If haste is read again after tick 2, remaining intervals change to 1 second.
dynamic_times=[1/1.5,2/1.5]+[2/1.5+i for i in range(1,4)]
assert math.isclose(locked,120) and math.isclose(dynamic,114)
assert math.isclose(locked_times[-1],10/3) and math.isclose(dynamic_times[-1],13/3)

# Confirmed boss control direction: static vulnerability window, not extended by
# repeated hits/forced knockdowns. Real thresholds/window timing are pending.
def boss_controls(events,start=10,end=13,threshold=20):
    accumulated=0;down=False;accepted=[]
    for when,kind,amount in events:
        in_window=start<=when<end
        if not in_window or kind=='dot':continue
        if down:continue  # Down-period damage never seeds the next knockdown.
        accumulated+=amount
        if kind=='force' or accumulated>=threshold:
            down=True;accepted.append(when)
    return accepted,end

outside=[(9,'force',30),(10.2,'direct',8),(10.5,'dot',50),
         (10.7,'direct',12),(11,'force',1),(13.1,'force',40)]
accepted,end=boss_controls(outside)
assert accepted==[10.7] and end==13
print(json.dumps(dict(snapshot=dict(locked_expected_bleed=locked,dynamic_expected_bleed=dynamic,
       locked_tick_times=locked_times,dynamic_tick_times=dynamic_times),
       proposed_boss=dict(accepted_knockdowns=accepted,vulnerability_end=end,
       status='CONFIRMED POLICY; example timing/threshold remains candidate'),
       checks='PASS: independent-crit expectation, haste duration, boss window and no DOT/down carryover'),indent=2))
