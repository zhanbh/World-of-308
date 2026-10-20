"""Design reference: swept footprint clipping for map edges/solid rectangles.
Stop at first contact for this candidate; no wall slide, bounce, or game writes.
"""
import json
import math
from skill_displacement_dodge_trial import displacement,DEFAULT,FORWARD,MOUNTAIN,IMPACTS

ROOM=(-218,218,-35,78)
RADIUS=8


def sweep(p,delta,room=ROOM,radius=RADIUS,obstacles=()):
    xmin,xmax,ymin,ymax=room
    legal=(xmin+radius,xmax-radius,ymin+radius,ymax-radius)
    assert legal[0]<=p[0]<=legal[1] and legal[2]<=p[1]<=legal[3]
    t=1.0
    for value,d,lo,hi in [(p[0],delta[0],legal[0],legal[1]),(p[1],delta[1],legal[2],legal[3])]:
        if d>0:t=min(t,(hi-value)/d)
        elif d<0:t=min(t,(lo-value)/d)
    # Conservative square footprint vs solid rectangles, swept continuously.
    for x0,x1,y0,y1 in obstacles:
        enter=0.;leave=1.
        for value,d,lo,hi in [(p[0],delta[0],x0-radius,x1+radius),(p[1],delta[1],y0-radius,y1+radius)]:
            if abs(d)<1e-12:
                if value<lo or value>hi:enter=2.;break
            else:
                a,b=sorted(((lo-value)/d,(hi-value)/d))
                enter=max(enter,a);leave=min(leave,b)
        if 0<=enter<=leave and leave>1e-12 and enter<=1:
            t=min(t,enter)
    t=max(0,min(1,t))
    result=(p[0]+delta[0]*t,p[1]+delta[1]*t)
    assert legal[0]-1e-9<=result[0]<=legal[1]+1e-9
    assert legal[2]-1e-9<=result[1]<=legal[3]+1e-9
    return result,t<1-1e-12


def trace(skill,distance,start,facing,q,hz):
    p=start;previous=0;blocked=False;frames=math.ceil(IMPACTS[skill]/q*hz)+1
    for frame in range(1,frames+1):
        current=displacement(skill,frame/hz*q,distance)
        p,hit=sweep(p,((current-previous)*facing,0))
        blocked|=hit
        previous=current  # Discard blocked movement; never bank it for a later frame.
    return p,blocked


def main():
    rows=[]
    for skill,distance in [('bengshan',MOUNTAIN),('earth',DEFAULT),('earth',FORWARD)]:
        for start,facing in [((205,20),1),((-205,20),-1),((210,70),1),((-210,-27),-1),((0,20),1)]:
            for q in [1,2]:
                end60,hit=trace(skill,distance,start,facing,q,60)
                end120,hit120=trace(skill,distance,start,facing,q,120)
                assert end60==end120 and hit==hit120
                rows.append(dict(skill=skill,distance=distance,start=start,facing=facing,q=q,end=end120,blocked=hit))
    assert sweep((0,0),(1000,1000))[0]==(70,70)
    assert sweep((0,0),(-1000,-1000))[0]==(-27,-27)
    # A step spanning a thin wall cannot tunnel to the other side.
    wall=[(10,11,-20,60)]
    assert sweep((0,0),(100,0),obstacles=wall)[0]==(2,0)
    assert sweep((2,0),(-10,0),obstacles=wall)[0]==(-8,0)
    assert sweep((210,20),(100,0))[0]==(210,20)
    assert sweep((210,20),(-10,0))[0]==(200,20) # Can leave a boundary normally.
    # With no clipping, both timestep sizes preserve the intended displacement.
    assert trace('earth',FORWARD,(0,20),1,1,120)[0]==(FORWARD,20)
    print(json.dumps(dict(results=rows,checks='PASS: both sides, top/bottom diagonal, corners, 60/120Hz, huge step, thin obstacle, wall exit, open-space distance',
        limitations=['Rectangular room and radius8 footprint are candidate fixtures.',
            'Internal obstacle sweep expands rectangles by square footprint, conservative at corners.',
            'No final terrain mesh, sliding, enemy collision or navigation; blocked start positions rejected.',
            'This design helper is not wired to client/server gameplay and does not establish skill damage/cancel policy.']),indent=2))

if __name__=='__main__':main()
