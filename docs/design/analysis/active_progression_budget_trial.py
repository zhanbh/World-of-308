"""Confirmed active-play target vs candidate successful-run and town budgets."""
import json
import math
from progression_award_trial import career


def main():
    rows=[]
    for decay in [False,True]:
        runs=career(decay=decay)['runs']
        for town_seconds in [15,45,90]:
            city=(runs-1)*town_seconds/60
            low=(180-city)/runs*60
            high=(300-city)/runs*60
            assert math.isclose(runs*low/60+city,180)
            assert math.isclose(runs*high/60+city,300)
            rows.append(dict(decay=decay,runs=runs,town_seconds=town_seconds,
                total_town_minutes=city,min_mean_battle_seconds=low,max_mean_battle_seconds=high,
                scenarios=[dict(mean_battle_seconds=t,active_hours=(runs*t/60+city)/60,
                    in_target=180<=runs*t/60+city<=300) for t in [120,180,240,300]]))
    print(json.dumps(dict(results=rows,checks='PASS: confirmed 180/300min active boundaries, excludes idle stamina/offline',
        limitations=['59/60 successful-run XP candidates, not final run count or real battle timings.',
            'Town15/45/90s are sensitivity inputs, not measured user activity.',
            'No failures; failed active battle/town time must be included in future normal-path validation.',
            'Lower bound is normal-path calibration, not a speed limit on experienced or geared players.',
            'No XP retuning or time normalization in gameplay.']),indent=2))

if __name__=='__main__':main()
