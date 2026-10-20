"""Fixed-refresh stamina calendar over candidate XP run count.
No day/login rewards or extra stamina grants; all timings are explicit inputs.
"""
import json
import math
from progression_award_trial import career


def calendar(runs,run_minutes=4,town_minutes=.75,until_refresh=240,initial_stamina=308):
    assert runs>0 and run_minutes>0 and town_minutes>=0 and 0<until_refresh<=240
    now=0.;stamina=initial_stamina;next_refresh=float(until_refresh);wait=0.;ledger=[]
    def refresh(t):
        nonlocal stamina,next_refresh
        if t+1e-9>=next_refresh:
            intervals=math.floor((t-next_refresh+1e-9)/240)+1
            next_refresh+=240*intervals;stamina=308
    for index in range(runs):
        refresh(now)
        if stamina==0:
            wait+=next_refresh-now;now=next_refresh;refresh(now)
        assert stamina>=1
        entry=stamina;refresh_boundary=next_refresh
        remaining=max(0,entry-7) # All seven rooms may continue even after zero.
        now+=run_minutes
        crossed=now+1e-9>=refresh_boundary
        if crossed:refresh(now) # New global generation, never refill this old challenge snapshot.
        else:stamina=remaining
        ledger.append(dict(run=index+1,entry=entry,snapshot_after=remaining,
            return_stamina=stamina,crossed_refresh=crossed,return_time=now))
        assert 0<=remaining<=308 and 0<=stamina<=308
        if index<runs-1:
            now+=town_minutes;refresh(now)
    return dict(runs=runs,run_minutes=run_minutes,town_minutes=town_minutes,
        until_refresh=until_refresh,battle_minutes=runs*run_minutes,
        active_minutes=runs*run_minutes+(runs-1)*town_minutes,
        wait_minutes=wait,online_minutes=now,ledger=ledger)


def main():
    rows=[]
    for decay in [False,True]:
        runs=career(decay=decay)['runs']
        for minutes in [3,4,5]:
            for phase in [15,60,120,240]:
                result=calendar(runs,minutes,until_refresh=phase)
                assert math.isclose(result['online_minutes'],result['active_minutes']+result['wait_minutes'])
                rows.append(dict(decay=decay,**result))
    low=calendar(1,initial_stamina=1)
    assert low['ledger'][0]['entry']==1 and low['ledger'][0]['snapshot_after']==0
    crossing=calendar(1,run_minutes=4,until_refresh=2,initial_stamina=10)
    assert crossing['ledger'][0]['snapshot_after']==3 and crossing['ledger'][0]['return_stamina']==308
    exhausted=calendar(45,run_minutes=3,town_minutes=0,until_refresh=240)
    assert exhausted['wait_minutes']==108
    assert exhausted['ledger'][44]['entry']==308
    print(json.dumps(dict(results=rows,checks='PASS: 24 calendars, time accounting, 1-stamina entry, zero-entry wait, cross-refresh old snapshot/new generation',
        limitations=['59/60 successful runs from XP candidate; 3/4/5 minute run inputs, no simulated real combat.',
            'Town45s is a candidate, excluded after final run; no failure/revival/loading/offline time.',
            'Assumes new character starts full308; fixed refresh phase swept, no claim of universal login timing.',
            'Snapshot generation logic is reference only, not authoritative transaction or persistence implementation.',
            'No XP gains while waiting; cannot infer final 3-5h target compliance without deciding the time definition.']),indent=2))

if __name__=='__main__':main()
