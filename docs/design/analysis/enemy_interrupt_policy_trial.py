"""Candidate separation of damage, accepted control and skill interruption."""

CONTROLS=('stagger','down')


def may_interrupt(skill,control,overrides=None):
    if control is None:return False
    assert control in CONTROLS
    # Historical reference: all accepted controls interrupt; immunity is checked elsewhere.
    return control in (overrides or {}).get(skill,CONTROLS)


if __name__=='__main__':
    assert not may_interrupt('ranged',None)
    assert may_interrupt('ranged','stagger')
    assert not may_interrupt('ranged','stagger',{'ranged':('down',)})
    assert may_interrupt('ranged','down',{'ranged':('down',)})
    assert not may_interrupt('charge','down',{'charge':()})
    print('PASS: accepted control and skill interruption are independently configurable')
