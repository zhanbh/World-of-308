import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTestRelease, publicRelease, verifyTestRelease } from '../src/config/release-v1.ts';

const file = new URL('../fixtures/warrior-first-normal.test.json', import.meta.url);
const auth = { profileId: 'warrior-e01-test', environmentScope: 'local-test', allowTestStrategies: true };
const fixture = () => JSON.parse(readFileSync(file, 'utf8'));

test('a test-authorized consumer loads the immutable minimal warrior release and public projection', () => {
  const loaded = loadTestRelease(JSON.stringify(fixture()), auth);
  assert.equal(loaded.releaseId, 'warrior-first-normal-e01-v1');
  assert.equal(loaded.nodes.find(n => n.id === 'hunter-disabled').data.enabled, false);
  assert.equal(loaded.nodes.find(n => n.id === 'first-normal').data.rooms.length, 7);
  assert.ok(Object.isFrozen(loaded.nodes));
  const visible = publicRelease(loaded);
  assert.equal(visible.nodes.some(n => n.visibility === 'private'), false);
  assert.equal(JSON.stringify(visible).includes('equipmentWeights'), false);
  assert.throws(() => loadTestRelease(JSON.stringify(fixture()), { ...auth, allowTestStrategies: false }));
});

test('dictionary room numbers are zero-based and purple candidates exclude the final room', async () => {
  const loaded = await verifyTestRelease(readFileSync(file, 'utf8'), auth);
  const dungeon = loaded.nodes.find(n => n.id === 'first-normal');
  assert.equal(dungeon.data.rooms[0].roomNo, 0);
  assert.equal(dungeon.data.rooms[6].roomNo, 6);
  assert.deepEqual(dungeon.data.purpleNamed.eligibleRooms, [0, 1, 2, 3, 4, 5]);
  const oneBased = fixture();
  oneBased.nodes.find(n => n.id === 'first-normal').data.rooms.forEach((room, i) => { room.roomNo = i + 1; });
  assert.throws(() => loadTestRelease(JSON.stringify(oneBased), auth), /ROOM_ORDER/);
  const invalidPurple = fixture();
  invalidPurple.nodes.find(n => n.id === 'first-normal').data.purpleNamed.eligibleRooms = [6];
  assert.throws(() => loadTestRelease(JSON.stringify(invalidPurple), auth));
});

test('missing, wrong-version, wrong-kind and recursive references fail before configuration is usable', () => {
  const missing = fixture(); missing.nodes = missing.nodes.filter(n => n.id !== 'white-weapon');
  assert.throws(() => loadTestRelease(JSON.stringify(missing), auth));
  const missingPrice = fixture(); missingPrice.nodes = missingPrice.nodes.filter(n => n.id !== 'weapon-price');
  assert.throws(() => loadTestRelease(JSON.stringify(missingPrice), auth));
  const wrongVersion = fixture(); wrongVersion.entryDungeonRef.version = 2;
  assert.throws(() => loadTestRelease(JSON.stringify(wrongVersion), auth));
  const recursive = fixture(); recursive.nodes.find(n => n.id === 'first-normal').data.rewardRef = { id: 'first-normal', version: 1 };
  assert.throws(() => loadTestRelease(JSON.stringify(recursive), auth));
  const duplicate = fixture(); duplicate.nodes.push(structuredClone(duplicate.nodes[0]));
  assert.throws(() => loadTestRelease(JSON.stringify(duplicate), auth));
});

test('test profiles enforce current warrior, equipment, visibility and encounter invariants', () => {
  const edits = [
    r => { r.nodes.find(n => n.id === 'hunter-disabled').data.enabled = true; },
    r => { r.nodes.find(n => n.id === 'white-weapon').data.itemLevel = 11; },
    r => { r.nodes.find(n => n.id === 'white-weapon').data.durability.wearEnabled = false; },
    r => { r.nodes.find(n => n.id === 'initial-reward').visibility = 'public'; },
    r => { r.nodes.find(n => n.id === 'first-normal').data.rooms[0].spawns[0].role = 'boss'; },
    r => { r.nodes.find(n => n.id === 'cross').data.owner = 'monster'; },
    r => { r.nodes.find(n => n.id === 'white-weapon').data.quality = 'orange'; },
  ];
  for (const edit of edits) { const r = fixture(); edit(r); assert.throws(() => loadTestRelease(JSON.stringify(r), auth)); }
});

test('manifest verification detects tampering and independent illegal fixtures remain unusable', async () => {
  const text = readFileSync(file, 'utf8');
  assert.equal((await verifyTestRelease(text, auth)).releaseId, 'warrior-first-normal-e01-v1');
  const tampered = fixture(); tampered.nodes.find(n => n.kind === 'price').data.amount = '999';
  await assert.rejects(() => verifyTestRelease(JSON.stringify(tampered), auth), /MANIFEST_HASH/);
  for (const name of ['missing-price', 'illegal-equipment-level', 'enabled-hunter']) {
    const invalid = readFileSync(new URL(`../fixtures/${name}.invalid.json`, import.meta.url), 'utf8');
    await assert.rejects(() => verifyTestRelease(invalid, auth));
  }
});

test('unsupported code and durability policy references fail closed instead of becoming defaults', () => {
  const code = fixture(); code.codeCompatibility = 'unknown-engine';
  assert.throws(() => loadTestRelease(JSON.stringify(code), auth));
  const policy = fixture(); policy.nodes.find(n => n.kind === 'equipment').data.durability.policyRef = 'missing-policy';
  assert.throws(() => loadTestRelease(JSON.stringify(policy), auth));
});

test('wire fields, resource precision, quality, binding and declared collection bounds are strict', () => {
  const edits = [
    r => { r.units.logicStepMs = 1; },
    r => { r.nodes.find(n => n.kind === 'equipment').data.attackPower = '18446744073709551616'; },
    r => { r.nodes.find(n => n.kind === 'equipment').data.quality = 'legendary'; },
    r => { r.nodes.find(n => n.kind === 'equipment').data.bindingPolicy = 'tradable'; },
    r => { delete r.nodes.find(n => n.kind === 'equipment').data.durability; },
    r => { r.nodes.find(n => n.id === 'cross').data.nodeOffsetsUs = [1,2,3,4,5]; },
    r => { r.nodes.find(n => n.kind === 'map').data.spawnPoints = Array(9).fill({ x: 0, y: 0 }); },
    r => { r.nodes.find(n => n.kind === 'class').data.initialHp = 1000; },
    r => { r.nodes.find(n => n.kind === 'class').data.session_key = 'forged'; },
  ];
  for (const edit of edits) { const r = fixture(); edit(r); assert.throws(() => loadTestRelease(JSON.stringify(r), auth)); }
  assert.throws(() => loadTestRelease(JSON.stringify(fixture()), { ...auth, profileId: 'other' }));
  assert.throws(() => loadTestRelease(' '.repeat(262145), auth));
});
