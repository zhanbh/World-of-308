import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEARABLE_SLOTS,
  NON_WEARABLE_SLOTS,
  SLOT_WEIGHTS,
  QUALITY_MULTIPLIERS,
  validateEquipEligibility,
  applyEquipBinding,
  calculateSingleItemScore,
  calculateTotalScore,
  aggregateCombatAttributes,
} from '../src/equipment/equipment-rules.ts';

function createMockCharacter(overrides = {}) {
  return {
    schemaVersion: 2,
    id: 'char-1',
    accountId: 'acc-1',
    classId: 'warrior',
    characterName: 'WarriorTest',
    level: 10,
    version: 0,
    xp: 0,
    rolePlayEpoch: 1,
    statsVersion: 0,
    equipmentVersion: 0,
    equipped: {},
    backpackId: 'bag-1',
    personalVaultId: 'vault-1',
    stamina: { value: 308, refillWindow: 0 },
    quickSlots: [null, null, null],
    location: { kind: 'inn', characterId: 'char-1' },
    progressionConfigRef: { id: 'prog-1', version: 1 },
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function createMockEquipment(overrides = {}) {
  return {
    schemaVersion: 2,
    id: 'item-1',
    accountId: 'acc-1',
    sourceKey: 'test',
    sourceOrdinal: 0,
    sourceLocator: { kind: 'test' },
    templateRef: { id: 'tpl-1', version: 1 },
    itemLevel: 10,
    quality: 'white',
    slotKind: 'weapon',
    rolledAffixes: [],
    setRef: null,
    binding: { kind: 'none' },
    enhancementLevel: 0,
    durability: {
      wearEnabled: true,
      current: 100,
      max: 100,
      policyRef: 'weapon-wear-v1',
    },
    location: { kind: 'container', containerId: 'bag-1' },
    lifecycle: 'active',
    version: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

test('13 slots configuration and categories', () => {
  assert.equal(WEARABLE_SLOTS.length, 7);
  assert.equal(NON_WEARABLE_SLOTS.length, 6);
  assert.deepEqual(
    [...WEARABLE_SLOTS, ...NON_WEARABLE_SLOTS].sort(),
    ['belt', 'boots', 'bracelet', 'chest', 'earring', 'magicStone', 'necklace', 'pants', 'ring', 'shoulder', 'subEquip', 'trinket', 'weapon'].sort()
  );
  assert.equal(SLOT_WEIGHTS.weapon, 2);
  assert.equal(SLOT_WEIGHTS.chest, 1);
  assert.equal(SLOT_WEIGHTS.ring, 0.75);
});

test('validateEquipEligibility checks slot, level, class and binding', () => {
  const char = createMockCharacter({ level: 10, classId: 'warrior' });
  const weapon = createMockEquipment({ slotKind: 'weapon', itemLevel: 10 });

  // Valid match
  assert.doesNotThrow(() => validateEquipEligibility(char, weapon, 'weapon'));

  // Slot mismatch
  assert.throws(() => validateEquipEligibility(char, weapon, 'chest'), /ITEM_NOT_ELIGIBLE/);

  // Level requirement not met
  const highLevelWeapon = createMockEquipment({ itemLevel: 15 });
  assert.throws(() => validateEquipEligibility(char, highLevelWeapon, 'weapon'), /ITEM_NOT_ELIGIBLE/);

  // Class restriction
  const catalog = {
    'tpl-hunter-bow': {
      templateId: 'tpl-hunter-bow',
      name: 'Hunter Bow',
      slotKind: 'weapon',
      itemLevel: 10,
      quality: 'white',
      allowedClasses: ['hunter'],
    },
  };
  const hunterBow = createMockEquipment({
    templateRef: { id: 'tpl-hunter-bow', version: 1 },
    slotKind: 'weapon',
    itemLevel: 10,
  });
  assert.throws(() => validateEquipEligibility(char, hunterBow, 'weapon', catalog), /ITEM_NOT_ELIGIBLE/);

  // Binding restriction
  const boundToOther = createMockEquipment({
    binding: { kind: 'character', characterId: 'char-other' },
  });
  assert.throws(() => validateEquipEligibility(char, boundToOther, 'weapon'), /BINDING_RESTRICTED/);

  // Same character binding is allowed
  const boundToSelf = createMockEquipment({
    binding: { kind: 'character', characterId: 'char-1' },
  });
  assert.doesNotThrow(() => validateEquipEligibility(char, boundToSelf, 'weapon'));
});

test('applyEquipBinding auto-binds purple and orange equipment to character', () => {
  const whiteItem = createMockEquipment({ quality: 'white', binding: { kind: 'none' } });
  assert.deepEqual(applyEquipBinding(whiteItem, 'acc-1', 'char-1'), { kind: 'none' });

  const blueItem = createMockEquipment({ quality: 'blue', binding: { kind: 'none' } });
  assert.deepEqual(applyEquipBinding(blueItem, 'acc-1', 'char-1'), { kind: 'none' });

  const purpleItem = createMockEquipment({ quality: 'purple', binding: { kind: 'none' } });
  assert.deepEqual(applyEquipBinding(purpleItem, 'acc-1', 'char-1'), {
    kind: 'character',
    accountId: 'acc-1',
    characterId: 'char-1',
  });

  const orangeItem = createMockEquipment({ quality: 'orange', binding: { kind: 'none' } });
  assert.deepEqual(applyEquipBinding(orangeItem, 'acc-1', 'char-1'), {
    kind: 'character',
    accountId: 'acc-1',
    characterId: 'char-1',
  });

  // Already bound stays as is
  const alreadyBound = createMockEquipment({
    quality: 'purple',
    binding: { kind: 'character', accountId: 'acc-1', characterId: 'char-1' },
  });
  assert.deepEqual(applyEquipBinding(alreadyBound, 'acc-1', 'char-1'), {
    kind: 'character',
    accountId: 'acc-1',
    characterId: 'char-1',
  });
});

test('calculateSingleItemScore matches ranking-query-baseline-v1 exact checks', () => {
  const catalog = {
    'tpl-weapon-10': {
      templateId: 'tpl-weapon-10',
      name: 'Weapon 10',
      slotKind: 'weapon',
      itemLevel: 10,
      quality: 'white',
      affixMaxValues: { attack: 50 },
    },
  };

  // 1. Level 10 white weapon +0 no affixes = 2000
  const whiteWeapon = createMockEquipment({
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'white',
    enhancementLevel: 0,
    rolledAffixes: [],
  });
  assert.equal(calculateSingleItemScore(whiteWeapon, catalog), 2000);

  // 2. Level 10 green weapon +0, 1 affix rolled to max (50/50 = 1.0) = 2600
  const greenWeapon = createMockEquipment({
    templateRef: { id: 'tpl-weapon-10', version: 1 },
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'green',
    enhancementLevel: 0,
    rolledAffixes: [{ stat: 'attack', value: 50 }],
  });
  assert.equal(calculateSingleItemScore(greenWeapon, catalog), 2600);

  // 3. Level 10 white weapon +10 no affixes = 3000
  const enhancedWeapon = createMockEquipment({
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'white',
    enhancementLevel: 10,
    rolledAffixes: [],
  });
  assert.equal(calculateSingleItemScore(enhancedWeapon, catalog), 3000);

  // 4. P01 check: 0 durability still gives exact same 2000 score!
  const brokenWeapon = createMockEquipment({
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'white',
    enhancementLevel: 0,
    durability: { wearEnabled: true, current: 0, max: 100, policyRef: 'test' },
  });
  assert.equal(calculateSingleItemScore(brokenWeapon, catalog), 2000);

  // 5. Armor piece (weight 1): level 10 white chest +0 = 100 * 10 * 1 * 1 = 1000
  const whiteChest = createMockEquipment({
    slotKind: 'chest',
    itemLevel: 10,
    quality: 'white',
    enhancementLevel: 0,
  });
  assert.equal(calculateSingleItemScore(whiteChest, catalog), 1000);

  // 6. Non-wearable piece (weight 0.75): level 10 purple ring +0 = 100 * 10 * 0.75 * 2 = 1500
  const purpleRing = createMockEquipment({
    slotKind: 'ring',
    itemLevel: 10,
    quality: 'purple',
    enhancementLevel: 0,
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  assert.equal(calculateSingleItemScore(purpleRing, catalog), 1500);
});

test('aggregateCombatAttributes excludes 0-durability items and counts set pieces correctly', () => {
  const setConfigs = {
    'set-iron-v1': {
      setId: 'set-iron-v1',
      name: 'Iron Armor Set',
      bonuses: [
        { pieceCount: 2, affixes: [{ statId: 'defense', value: 30 }] },
        { pieceCount: 3, affixes: [{ statId: 'hp', value: 200 }] },
      ],
    },
  };

  const item1 = createMockEquipment({
    slotKind: 'chest',
    rolledAffixes: [{ stat: 'defense', value: 20 }],
    setRef: { id: 'set-iron-v1', version: 1 },
    durability: { wearEnabled: true, current: 80, max: 100, policyRef: 'wear' },
  });

  const item2 = createMockEquipment({
    slotKind: 'pants',
    rolledAffixes: [{ stat: 'defense', value: 15 }],
    setRef: { id: 'set-iron-v1', version: 1 },
    durability: { wearEnabled: true, current: 50, max: 100, policyRef: 'wear' },
  });

  const item3 = createMockEquipment({
    slotKind: 'boots',
    rolledAffixes: [{ stat: 'defense', value: 10 }],
    setRef: { id: 'set-iron-v1', version: 1 },
    durability: { wearEnabled: true, current: 100, max: 100, policyRef: 'wear' },
  });

  // When all 3 have durability > 0: 3 pieces active -> 2-pc and 3-pc bonuses active
  // Defense: 20 + 15 + 10 + 30 (set 2-pc) = 75
  // HP: 200 (set 3-pc)
  const allActive = aggregateCombatAttributes({ chest: item1, pants: item2, boots: item3 }, setConfigs);
  assert.deepEqual(allActive, [
    { statId: 'defense', value: '75' },
    { statId: 'hp', value: '200' },
  ]);

  // When item3 boots durability drops to 0:
  // item3 affixes excluded, item3 does NOT count towards set pieces!
  // Active pieces = 2 (chest & pants) -> only 2-pc bonus (defense +30) active, 3-pc bonus (hp +200) EXPIRED!
  // Defense: 20 + 15 + 30 = 65. HP: 0 (not in list)
  const bootsBroken = {
    ...item3,
    durability: { wearEnabled: true, current: 0, max: 100, policyRef: 'wear' },
  };
  const partialActive = aggregateCombatAttributes({ chest: item1, pants: item2, boots: bootsBroken }, setConfigs);
  assert.deepEqual(partialActive, [
    { statId: 'defense', value: '65' },
  ]);

  // Non-wearable slot (e.g. ring) contributes stats normally
  const ring = createMockEquipment({
    slotKind: 'ring',
    rolledAffixes: [{ stat: 'crit', value: 5 }],
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  const withRing = aggregateCombatAttributes({ ring }, setConfigs);
  assert.deepEqual(withRing, [
    { statId: 'crit', value: '5' },
  ]);
});
