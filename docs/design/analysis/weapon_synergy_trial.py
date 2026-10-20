"""Offline candidate model: weapon base AP multiplied by shared equipment gains.
No game imports/writes. Run with Python 3; results are deterministic JSON.
"""
import json
import math

SLOTS = {
 'weapon': (12, 12, 12, 0, 0, 0),
 'chest': (8, 8, 0, 8, 120, 50),
 'pants': (7, 7, 0, 7, 100, 40),
 'belt': (4, 0, 4, 4, 60, 20),
 'shoulder': (5, 5, 5, 0, 80, 25),
 'boots': (4, 0, 4, 4, 80, 15),
 'bracelet': (3, 3, 0, 3, 0, 0),
 'ring': (3, 3, 3, 0, 0, 0),
 'necklace': (4, 0, 4, 4, 0, 0),
 'auxiliary': (3, 0, 3, 3, 40, 0),
 'stone': (3, 0, 3, 3, 0, 0),
 'earring': (2, 2, 0, 2, 20, 0),
 'trinket': (2, 2, 0, 2, 40, 0),
}
ARMOR = {'chest', 'pants', 'belt', 'shoulder', 'boots'}
JEWELRY = {'bracelet', 'ring', 'necklace'}
SPECIAL = {'auxiliary', 'stone', 'earring'}
REF_AP = 308.44
SKILLS = [('cross',1,12,2,1.6,.4), ('mountain',5,20,3,2.4,.6),
          ('draw',10,30,4,3.4,.8), ('outrage',20,60,6,6.5,1.2)]

def stats(weapon_base, enabled, level=30, purple=True, weapon_plus=0, earring_plus=0):
    n = level-1
    strength = 20+3*n+.05*n*n
    agility = 10+n
    item_scale = {1:.25, 5:.4, 10:.6, 15:.8, 20:1, 25:1, 30:1}[level]
    cr = haste_rating = mastery_rating = hp_item = armor = 0
    for slot in enabled:
        main, crit, haste, mastery, hp, defense = SLOTS[slot]
        # Initial/guaranteed green weapon has no blue main-stat affix.
        strength += main*item_scale if level >= 10 else 0
        cr += crit*item_scale
        haste_rating += haste*item_scale if level >= 10 else 0
        mastery_rating += mastery*item_scale if level >= 10 else 0
        hp_item += hp*item_scale
        armor += defense*item_scale
    armor_set = purple and len(enabled & ARMOR) >= 2
    armor_five = purple and ARMOR <= enabled
    jewelry_set = purple and JEWELRY <= enabled
    special_set = purple and SPECIAL <= enabled
    count = int(armor_set)+int(jewelry_set)+int(special_set)
    strength += 8*count
    agility += 8*count
    # No sample gear agility affix; set grants all primary stats.
    flat = 4 + (weapon_base if 'weapon' in enabled else 0)
    flat += 4 if 'auxiliary' in enabled else 0
    flat += 6 if 'earring' in enabled else 0
    set_ap_pct = (.10 if armor_set else 0)+(.12 if jewelry_set else 0)+(.10 if special_set else 0)
    # Calibrate each candidate at full reference; coefficient is constant
    # across gear states and levels, never fitted separately to missing slots.
    coefficient = (REF_AP/(weapon_base+14)-1-.32)/233.05
    ap = flat*(1+coefficient*strength+set_ap_pct)
    # Preserve the agreed +10 FINAL AP increments; do not multiply them again.
    ap += weapon_plus if 'weapon' in enabled else 0
    ap += earring_plus if 'earring' in enabled else 0
    crit = min(1,.03+.01+agility*.002+cr*.005+(.05 if jewelry_set else 0))
    haste = .02+.48*haste_rating/(10+haste_rating)+(.05 if jewelry_set else 0)
    mastery = .02+.58*mastery_rating/(20+mastery_rating)+(.05 if jewelry_set else 0)
    global_damage = .01*len(enabled & ARMOR) if purple else 0
    penetration = .01*len(enabled & SPECIAL) if purple else 0
    crit_multiplier = 1.5+(.03*len(enabled & JEWELRY) if purple else 0)
    armor_factor = 100/(100+25*(1-penetration))
    expected_crit = 1+crit*(crit_multiplier-1)
    common = armor_factor*expected_crit
    basic_hit = ap*(1+global_damage)*common
    basic_dps = basic_hit*3*(1+haste)
    damage = {}
    for name, unlock, b, growth, k, bleed in SKILLS:
        if level < unlock:
            continue
        rank = 1+(level-unlock)//2
        fixed = b+(rank-1)*growth
        # Rank-specific candidate AP scaling; same calibration anchor as v1.
        new_k = k+.75*fixed/REF_AP
        multiplier = (1+mastery)*(1+global_damage+(.12 if armor_five else 0))*common
        direct = (.25*fixed+new_k*ap)*multiplier
        dot = ap*bleed*multiplier
        damage[name] = dict(direct=direct, bleed=dot, total=direct+dot)
    return dict(ap=ap, base_ap=flat, main_stat_coefficient=coefficient,
                strength=strength, crit=crit, haste=haste, mastery=mastery,
                hp=400+40*n+n*n+10*strength+hp_item, armor=armor,
                basic_hit=basic_hit, basic_dps=basic_dps, skills=damage)

def main():
    assert [sum(row[i] for row in SLOTS.values()) for i in range(6)] == [60,42,38,40,540,150]
    all_slots = set(SLOTS)
    candidates=[]
    for weapon_base in [80,100,120]:
        full=stats(weapon_base,all_slots)
        assert math.isclose(full['ap'],REF_AP)
        states={
          'full':full,
          'weapon_only':stats(weapon_base,{'weapon'}),
          'broken_weapon':stats(weapon_base,all_slots-{'weapon'}),
          'without_armor':stats(weapon_base,all_slots-ARMOR),
          'without_jewelry':stats(weapon_base,all_slots-JEWELRY),
          'without_special':stats(weapon_base,all_slots-SPECIAL),
          'both_plus10':stats(weapon_base,all_slots,weapon_plus=24,earring_plus=16),
          'broken_weapon_earring_plus10':stats(weapon_base,all_slots-{'weapon'},earring_plus=16),
        }
        for row in states.values():
            row['basic_dps_vs_full']=row['basic_dps']/full['basic_dps']
            row['cross_vs_full']=row['skills']['cross']['total']/full['skills']['cross']['total']
        assert math.isclose(states['both_plus10']['ap']-full['ap'],40)
        assert states['weapon_only']['basic_dps'] < full['basic_dps']
        assert states['broken_weapon']['basic_dps'] < states['weapon_only']['basic_dps']
        assert math.isclose(states['broken_weapon_earring_plus10']['ap']-states['broken_weapon']['ap'],16)
        # The candidate rank formula preserves reference pre-mitigation direct budgets.
        for _, unlock, b, growth, k, _ in SKILLS:
            fixed=b+((30-unlock)//2)*growth
            assert math.isclose(.25*fixed+(k+.75*fixed/REF_AP)*REF_AP, fixed+k*REF_AP)
        growth=[]
        for level, old_weapon in [(1,20),(5,32),(10,48),(15,64),(20,80),(25,80),(30,80)]:
            # Only weapon worn. Initial white has no secondaries; green has crit only.
            s=stats(weapon_base,{'weapon'},level=level,purple=False)
            w=weapon_base*old_weapon/80
            # Weapon tier replaces its full-level base; primary conversion constant.
            a=s['main_stat_coefficient']
            primary=20+3*(level-1)+.05*(level-1)**2
            ap=(4+w)*(1+a*primary)  # all milestone greens have no blue main affix
            old_ap=old_weapon+.8*primary
            growth.append(dict(level=level, weapon_ap=w, new_ap=ap, old_ap=old_ap, ratio=ap/old_ap))
        candidates.append(dict(weapon_base=weapon_base,states=states,weapon_only_growth=growth))
    assert all(candidates[i]['states']['broken_weapon']['ap'] > candidates[i+1]['states']['broken_weapon']['ap'] for i in range(2))
    print(json.dumps(dict(candidates=candidates,check_status='PASS: reference AP, gear removal, progression item tiers, monotonic broken AP'),ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
