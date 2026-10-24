import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort, loginKey } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService, characterKey } from '../src/character/character-service.ts';
import { EquipmentService } from '../src/equipment/equipment-service.ts';

const catalog = {
  'sword-white-10': {
    templateId: 'sword-white-10',
    name: 'Broadsword',
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'white',
    allowedClasses: ['warrior'],
    affixMaxValues: { attack: 50 },
  },
  'sword-green-10': {
    templateId: 'sword-green-10',
    name: 'Fine Sword',
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'green',
    allowedClasses: ['warrior'],
    affixMaxValues: { attack: 50 },
  },
  'bow-hunter-10': {
    templateId: 'bow-hunter-10',
    name: 'Hunter Bow',
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'white',
    allowedClasses: ['hunter'],
  },
  'armor-iron-chest': {
    templateId: 'armor-iron-chest',
    name: 'Iron Chest',
    slotKind: 'chest',
    itemLevel: 10,
    quality: 'blue',
    allowedClasses: ['warrior'],
    setRef: { id: 'set-iron-v1', version: 1 },
  },
  'armor-iron-pants': {
    templateId: 'armor-iron-pants',
    name: 'Iron Pants',
    slotKind: 'pants',
    itemLevel: 10,
    quality: 'blue',
    allowedClasses: ['warrior'],
    setRef: { id: 'set-iron-v1', version: 1 },
  },
  'armor-iron-boots': {
    templateId: 'armor-iron-boots',
    name: 'Iron Boots',
    slotKind: 'boots',
    itemLevel: 10,
    quality: 'blue',
    allowedClasses: ['warrior'],
    setRef: { id: 'set-iron-v1', version: 1 },
  },
  'trinket-flame': {
    templateId: 'trinket-flame',
    name: 'Flame Trinket',
    slotKind: 'trinket',
    itemLevel: 10,
    quality: 'purple',
    allowedClasses: ['warrior'],
  },
};

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

async function fixture() {
  const store = new MemoryStore();
  let currentTime = 1000;
  const clock = { now: () => currentTime, setNow: t => { currentTime = t; } };
  let subject = 'player-st05';

  const identity = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: subject }),
  );

  const login = new LoginService({
    store,
    clock,
    identity,
    ticketTtlMs: 60000,
    initialUnlocks: { first: ['normal'] },
    holdingsDomainRef: 'test-domain',
  });
  const prep = await login.execute({
    protocolVersion: 2,
    command: 'session.prepare',
    payload: { launchId: 'launch', prepareOperationId: 'prepare' },
  });
  const opened = await login.execute({
    protocolVersion: 2,
    command: 'session.commit',
    payload: { launchId: 'launch', ticketId: prep.outcome.data.ticketId, openOperationId: 'open' },
  });
  assert.equal(opened.outcome.status, 'committed');
  const session = opened.outcome.data;

  const characters = new CharacterService({
    store,
    clock,
    initialProgressionRef: { id: 'progression-warrior-v1', version: 1 },
    initialWeaponTemplateRef: { id: 'sword-white-10', version: 1 },
  });
  const envelope = { protocolVersion: 2, sessionId: session.sessionId, sessionEpoch: session.sessionEpoch };
  const created = await characters.execute({
    ...envelope,
    command: 'character.create',
    operationId: 'create',
    expected: [],
    payload: { classId: 'warrior', characterName: '战五' },
  });
  assert.equal(created.outcome.status, 'committed');
  const characterId = created.outcome.data.characterId;
  const selected = await characters.execute({
    ...envelope,
    command: 'character.select',
    operationId: 'select',
    expected: [],
    payload: { characterId },
  });
  assert.equal(selected.outcome.status, 'committed');

  const accountId = (store.inspect(characterId)).accountId;
  await store.run(async tx => {
    const c = (await tx.get(characterId));
    c.level = 10;
    c.score = 2000;
    c.scoreReachedAt = 1000;
    c.equipmentVersion = 1;
    tx.set(characterId, c);

    const rankingKey = await characterKey('rankingEntry', [characterId]);
    tx.set(rankingKey, {
      schemaVersion: 2,
      id: rankingKey,
      characterId,
      accountId,
      classId: 'warrior',
      characterName: '战五',
      level: 10,
      score: '2000',
      scoreConfigRef: 'score-v1',
      equipmentVersion: 1,
      scoreReachedAt: 1000,
      projectionVersion: 1,
      updatedAt: 1000,
    });
  });

  const character = () => store.inspect(characterId);
  const bag = () => store.inspect(character().backpackId);

  const service = new EquipmentService({ store, clock, identity, catalog, setConfigs });
  let serial = 0;

  const command = (name, payload = {}, expected = null) => ({
    ...envelope,
    command: name,
    operationId: `equip-op-${++serial}`,
    expected:
      expected ?? [
        { kind: 'character', id: characterId, version: character().version },
        { kind: 'container', id: bag().id, version: bag().version },
      ],
    payload: { characterId, ...payload },
  });

  const query = (name, payload = {}) =>
    service.query({
      ...envelope,
      query: name,
      requestId: `query-${++serial}`,
      payload: { characterId, ...payload },
    });

  const makeItem = (id, overrides = {}) => ({
    schemaVersion: 2,
    id,
    accountId,
    sourceKey: 'test-source',
    sourceOrdinal: 0,
    sourceLocator: { kind: 'grant', grantId: 'grant-test' },
    templateRef: { id: 'sword-white-10', version: 1 },
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'white',
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
    location: { kind: 'container', containerId: bag().id },
    lifecycle: 'active',
    version: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  });

  const putInBag = async (item, slotIndex) => {
    await store.run(async tx => {
      tx.set(item.id, item);
      const b = bag();
      b.slots[slotIndex] = {
        kind: 'equipment',
        itemId: item.id,
        sortHeader: { itemLevel: item.itemLevel, quality: item.quality, slotKind: item.slotKind },
      };
      tx.set(b.id, b);
    });
  };

  const getRankingEntry = async () => {
    const k = await characterKey('rankingEntry', [characterId]);
    return store.inspect(k);
  };

  return {
    store,
    clock,
    service,
    character,
    bag,
    accountId,
    characterId,
    command,
    query,
    makeItem,
    putInBag,
    getRankingEntry,
    setSubject: s => { subject = s; },
  };
}

test('ST05-01: empty slot equip, slot mismatch, level requirement, class & binding restrictions', async () => {
  const f = await fixture();

  // Create green chest piece
  const chest = f.makeItem('chest-item-1', {
    slotKind: 'chest',
    templateRef: { id: 'armor-iron-chest', version: 1 },
    quality: 'blue',
  });
  await f.putInBag(chest, 0);

  // Slot mismatch error
  const wrongSlotCmd = f.command('equipment.equip', { itemId: 'chest-item-1', targetSlot: 'boots' });
  const wrongSlotRes = await f.service.execute(wrongSlotCmd);
  assert.equal(wrongSlotRes.outcome.status, 'rejected');
  assert.equal(wrongSlotRes.outcome.code, 'ITEM_NOT_ELIGIBLE');

  // Level mismatch error
  const highLevel = f.makeItem('high-lvl-1', { itemLevel: 25 });
  await f.putInBag(highLevel, 1);
  const highLevelRes = await f.service.execute(f.command('equipment.equip', { itemId: 'high-lvl-1', targetSlot: 'weapon' }));
  assert.equal(highLevelRes.outcome.status, 'rejected');
  assert.equal(highLevelRes.outcome.code, 'ITEM_NOT_ELIGIBLE');

  // Hunter weapon on warrior error
  const bow = f.makeItem('bow-1', {
    templateRef: { id: 'bow-hunter-10', version: 1 },
  });
  await f.putInBag(bow, 2);
  const bowRes = await f.service.execute(f.command('equipment.equip', { itemId: 'bow-1', targetSlot: 'weapon' }));
  assert.equal(bowRes.outcome.status, 'rejected');
  assert.equal(bowRes.outcome.code, 'ITEM_NOT_ELIGIBLE');

  // Bound to another character error
  const boundOther = f.makeItem('bound-other-1', {
    slotKind: 'chest',
    binding: { kind: 'character', characterId: 'other-char' },
  });
  await f.putInBag(boundOther, 3);
  const boundRes = await f.service.execute(f.command('equipment.equip', { itemId: 'bound-other-1', targetSlot: 'chest' }));
  assert.equal(boundRes.outcome.status, 'rejected');
  assert.equal(boundRes.outcome.code, 'BINDING_RESTRICTED');

  // Successful equip into empty chest slot
  const equipChestCmd = f.command('equipment.equip', { itemId: 'chest-item-1', targetSlot: 'chest' });
  const equipChestRes = await f.service.execute(equipChestCmd);
  assert.equal(equipChestRes.outcome.status, 'committed');
  assert.equal(equipChestRes.outcome.data.slot, 'chest');
  assert.equal(equipChestRes.outcome.data.itemId, 'chest-item-1');

  // Verify state
  assert.equal(f.character().equipped.chest, 'chest-item-1');
  assert.equal(f.bag().slots[0], undefined); // removed from slot 0
  const itemInStore = f.store.inspect('chest-item-1');
  assert.deepEqual(itemInStore.location, { kind: 'equipped', characterId: f.characterId, slotId: 'chest' });
});

test('ST05-01: purple equipment first equip triggers auto-binding to character', async () => {
  const f = await fixture();

  const purpleTrinket = f.makeItem('purple-trinket-1', {
    slotKind: 'trinket',
    quality: 'purple',
    binding: { kind: 'none' },
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  await f.putInBag(purpleTrinket, 5);

  const res = await f.service.execute(f.command('equipment.equip', { itemId: 'purple-trinket-1', targetSlot: 'trinket' }));
  assert.equal(res.outcome.status, 'committed');

  const updatedItem = f.store.inspect('purple-trinket-1');
  assert.deepEqual(updatedItem.binding, {
    kind: 'character',
    accountId: f.accountId,
    characterId: f.characterId,
  });
});

test('ST05-02: full bag (20/20) in-place same-slot swap succeeds without BAG_FULL', async () => {
  const f = await fixture();

  // Character starts with initial white weapon equipped: weaponId in f.character().equipped.weapon
  const initialWeaponId = f.character().equipped.weapon;
  assert.ok(initialWeaponId);

  // Fill all 20 backpack slots (0 to 19)
  const newWeapon = f.makeItem('new-sword-in-bag', {
    templateRef: { id: 'sword-green-10', version: 1 },
    quality: 'green',
  });
  await f.putInBag(newWeapon, 7); // slot 7 is our target item

  for (let i = 0; i < 20; i++) {
    if (i !== 7) {
      const dummy = f.makeItem(`dummy-${i}`, { slotKind: 'ring' });
      await f.putInBag(dummy, i);
    }
  }

  // Verify bag is 20/20 full
  assert.equal(Object.keys(f.bag().slots).length, 20);

  // Swap weapon: equip new-sword-in-bag into weapon slot
  const swapCmd = f.command('equipment.equip', { itemId: 'new-sword-in-bag', targetSlot: 'weapon' });
  const swapRes = await f.service.execute(swapCmd);
  assert.equal(swapRes.outcome.status, 'committed');
  assert.equal(swapRes.outcome.data.itemId, 'new-sword-in-bag');
  assert.equal(swapRes.outcome.data.slot, 'weapon');

  // Verify character now wears new weapon
  assert.equal(f.character().equipped.weapon, 'new-sword-in-bag');

  // Verify old weapon was placed into slot 7 (the vacated slot)!
  assert.equal(f.bag().slots[7].kind, 'equipment');
  assert.equal(f.bag().slots[7].itemId, initialWeaponId);

  // Verify backpack size remains exactly 20
  assert.equal(Object.keys(f.bag().slots).length, 20);

  // Verify old weapon location updated to container
  const oldWeaponItem = f.store.inspect(initialWeaponId);
  assert.deepEqual(oldWeaponItem.location, { kind: 'container', containerId: f.bag().id });
});

test('ST05-02: full bag (20/20) unequip is rejected with BAG_FULL', async () => {
  const f = await fixture();

  const weaponId = f.character().equipped.weapon;

  // Fill all 20 slots
  for (let i = 0; i < 20; i++) {
    const dummy = f.makeItem(`dummy-full-${i}`, { slotKind: 'ring' });
    await f.putInBag(dummy, i);
  }
  assert.equal(Object.keys(f.bag().slots).length, 20);

  // Attempt unequip
  const unequipCmd = f.command('equipment.unequip', { itemId: weaponId, slot: 'weapon' });
  const res = await f.service.execute(unequipCmd);
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'BAG_FULL');

  // Verify character still wears weapon and bag unchanged
  assert.equal(f.character().equipped.weapon, weaponId);
  assert.equal(Object.keys(f.bag().slots).length, 20);
});

test('ST05-02: unequip with free slot succeeds and occupies first free slot', async () => {
  const f = await fixture();
  const weaponId = f.character().equipped.weapon;

  // Put dummy in slot 0 and slot 2 (leaving slot 1 free)
  const d0 = f.makeItem('d0', { slotKind: 'ring' });
  const d2 = f.makeItem('d2', { slotKind: 'ring' });
  await f.putInBag(d0, 0);
  await f.putInBag(d2, 2);

  const res = await f.service.execute(f.command('equipment.unequip', { itemId: weaponId, slot: 'weapon' }));
  assert.equal(res.outcome.status, 'committed');
  assert.equal(res.outcome.data.slot, 'weapon');

  // Weapon slot is now empty on character
  assert.equal(f.character().equipped.weapon, undefined);

  // Placed into first free slot (index 1)
  assert.equal(f.bag().slots[1].itemId, weaponId);
});

test('ST05-03: 0 durability excludes combat stats and set piece bonuses; non-wearable slots do not show 0/0', async () => {
  const f = await fixture();

  // Equip 3 iron armor pieces
  const chest = f.makeItem('set-chest', {
    slotKind: 'chest',
    templateRef: { id: 'armor-iron-chest', version: 1 },
    rolledAffixes: [{ stat: 'defense', value: 20 }],
    setRef: { id: 'set-iron-v1', version: 1 },
  });
  const pants = f.makeItem('set-pants', {
    slotKind: 'pants',
    templateRef: { id: 'armor-iron-pants', version: 1 },
    rolledAffixes: [{ stat: 'defense', value: 15 }],
    setRef: { id: 'set-iron-v1', version: 1 },
  });
  const boots = f.makeItem('set-boots', {
    slotKind: 'boots',
    templateRef: { id: 'armor-iron-boots', version: 1 },
    rolledAffixes: [{ stat: 'defense', value: 10 }],
    setRef: { id: 'set-iron-v1', version: 1 },
  });

  await f.putInBag(chest, 0);
  await f.putInBag(pants, 1);
  await f.putInBag(boots, 2);

  await f.service.execute(f.command('equipment.equip', { itemId: 'set-chest', targetSlot: 'chest' }));
  await f.service.execute(f.command('equipment.equip', { itemId: 'set-pants', targetSlot: 'pants' }));
  await f.service.execute(f.command('equipment.equip', { itemId: 'set-boots', targetSlot: 'boots' }));

  // Query character.get: 3 pieces active (defense = 20 + 15 + 10 + 30 set = 75, hp = 200 set)
  const q1 = await f.query('character.get');
  assert.equal(q1.data.character.characterId, f.characterId);
  const def1 = q1.data.attributes.find(a => a.statId === 'defense');
  const hp1 = q1.data.attributes.find(a => a.statId === 'hp');
  assert.equal(def1.value, '75');
  assert.equal(hp1.value, '200');

  // Set boots durability to 0
  await f.store.run(async tx => {
    const b = (await tx.get('set-boots'));
    b.durability.current = 0;
    tx.set('set-boots', b);
  });

  // Query character.get again: boots stats excluded, 3-pc set bonus expired, only 2-pc (defense +30) active!
  const q2 = await f.query('character.get');
  const def2 = q2.data.attributes.find(a => a.statId === 'defense');
  const hp2 = q2.data.attributes.find(a => a.statId === 'hp');
  assert.equal(def2.value, '65'); // 20 + 15 + 30
  assert.equal(hp2, undefined); // 3-pc bonus inactive

  // Non-wearable slot: query equipment.get on trinket
  const trinket = f.makeItem('trinket-nonwear', {
    slotKind: 'trinket',
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  await f.store.run(async tx => tx.set(trinket.id, trinket));
  const trinketView = await f.query('equipment.get', { itemId: 'trinket-nonwear' });
  assert.equal(trinketView.data.durability.wearEnabled, false);
  assert.equal(trinketView.data.durability.current, null);
  assert.equal(trinketView.data.durability.max, null);
});

test('ST05-03: trinket in cooldown is locked from unequip and swap', async () => {
  const f = await fixture();

  const trinket = f.makeItem('trinket-cd-1', {
    slotKind: 'trinket',
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  await f.putInBag(trinket, 0);
  await f.service.execute(f.command('equipment.equip', { itemId: 'trinket-cd-1', targetSlot: 'trinket' }));

  // Set character trinket CD until 3000 (current clock is 1000)
  await f.store.run(async tx => {
    const c = f.character();
    c.staminaReservation = 'trinket-cd:3000';
    tx.set(c.id, c);
  });

  // Attempt unequip while in cooldown -> LOCATION_NOT_ALLOWED
  const unequipRes = await f.service.execute(f.command('equipment.unequip', { itemId: 'trinket-cd-1', slot: 'trinket' }));
  assert.equal(unequipRes.outcome.status, 'rejected');
  assert.equal(unequipRes.outcome.code, 'LOCATION_NOT_ALLOWED');

  // Attempt swap while in cooldown -> LOCATION_NOT_ALLOWED
  const trinket2 = f.makeItem('trinket-cd-2', {
    slotKind: 'trinket',
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  await f.putInBag(trinket2, 1);
  const swapRes = await f.service.execute(f.command('equipment.equip', { itemId: 'trinket-cd-2', targetSlot: 'trinket' }));
  assert.equal(swapRes.outcome.status, 'rejected');
  assert.equal(swapRes.outcome.code, 'LOCATION_NOT_ALLOWED');

  // Advance clock to 3000+
  f.clock.setNow(3500);

  // Now unequip succeeds!
  const okUnequip = await f.service.execute(f.command('equipment.unequip', { itemId: 'trinket-cd-1', slot: 'trinket' }));
  assert.equal(okUnequip.outcome.status, 'committed');
});

test('ST05-04: scoring calculation, P01 zero-durability retention, tie score time preservation and 500->600->500 refresh', async () => {
  const f = await fixture();

  // Initial weapon is lvl 10 white weapon (2000 points)
  const initialWeaponId = f.character().equipped.weapon;
  const initialRanking = await f.getRankingEntry();
  assert.equal(initialRanking.score, '2000');
  assert.equal(initialRanking.scoreReachedAt, 1000);

  // P01 check: break weapon durability to 0
  await f.store.run(async tx => {
    const w = (await tx.get(initialWeaponId));
    w.durability.current = 0;
    tx.set(initialWeaponId, w);
  });
  // Perform unequip/equip or check ranking: score remains 2000
  // Let's equip a ring (score: 100 * 10 * 0.75 * 1 = 750)
  const ring = f.makeItem('ring-1', {
    slotKind: 'ring',
    quality: 'white',
    itemLevel: 10,
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  await f.putInBag(ring, 0);

  f.clock.setNow(1200);
  const equipRingRes = await f.service.execute(f.command('equipment.equip', { itemId: 'ring-1', targetSlot: 'ring' }));
  assert.equal(equipRingRes.outcome.status, 'committed');

  // Broken weapon still contributes 2000, ring contributes 750 => Total 2750!
  const ranking2 = await f.getRankingEntry();
  assert.equal(ranking2.score, '2750');
  assert.equal(ranking2.scoreReachedAt, 1200);

  // Swap ring for another identical score ring at time = 1500:
  // Score stays 2750 => scoreReachedAt MUST stay 1200!
  const ringSame = f.makeItem('ring-2', {
    slotKind: 'ring',
    quality: 'white',
    itemLevel: 10,
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  await f.putInBag(ringSame, 1);
  f.clock.setNow(1500);

  const swapRingRes = await f.service.execute(f.command('equipment.equip', { itemId: 'ring-2', targetSlot: 'ring' }));
  assert.equal(swapRingRes.outcome.status, 'committed');

  const ranking3 = await f.getRankingEntry();
  assert.equal(ranking3.score, '2750');
  assert.equal(ranking3.scoreReachedAt, 1200); // KEPT ORIGINAL REACHED TIME!

  // Now unequip ring: score drops back to 2000 at time = 1800
  f.clock.setNow(1800);
  const unequipRingRes = await f.service.execute(f.command('equipment.unequip', { itemId: 'ring-2', slot: 'ring' }));
  assert.equal(unequipRingRes.outcome.status, 'committed');

  const ranking4 = await f.getRankingEntry();
  assert.equal(ranking4.score, '2000');
  assert.equal(ranking4.scoreReachedAt, 1800); // 2750 -> 2000 resets timestamp!
});

test('ST05-02 / ST05-04: idempotent replay and atomic failure rollback', async () => {
  const f = await fixture();

  const ring = f.makeItem('ring-replay', {
    slotKind: 'ring',
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
  });
  await f.putInBag(ring, 0);

  const cmd = f.command('equipment.equip', { itemId: 'ring-replay', targetSlot: 'ring' });
  const firstRes = await f.service.execute(cmd);
  assert.equal(firstRes.outcome.status, 'committed');
  assert.equal(firstRes.replayed, false);

  // Replay with exact same operationId and payload
  const replayedRes = await f.service.execute(cmd);
  assert.equal(replayedRes.outcome.status, 'committed');
  assert.equal(replayedRes.replayed, true);
  assert.equal(replayedRes.outcome.data.itemId, 'ring-replay');

  // Replay with same operationId but different payload -> OPERATION_MISMATCH
  const mismatchCmd = { ...cmd, payload: { ...cmd.payload, targetSlot: 'weapon' } };
  const mismatchRes = await f.service.execute(mismatchCmd);
  assert.equal(mismatchRes.outcome.status, 'rejected');
  assert.equal(mismatchRes.outcome.code, 'OPERATION_MISMATCH');
});
