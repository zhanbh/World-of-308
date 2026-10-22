import test from 'node:test';
import assert from 'node:assert/strict';
import { organizeBackpack, validateBackpack } from '../src/inventory/organize.ts';
const catalog = { potion: { version: 1, kind: 'consumable', quickAssignable: true }, ore: { version: 2, kind: 'material', quickAssignable: false } };
const stack = (id, quantity, extra = {}) => ({ kind: 'stack', stackId: id, templateRef: { id: 'potion', version: 1 }, quantity, binding: { kind: 'none' }, traceRef: `old:${id}`, ...extra });
const gear = (id, slotKind, quality = 'white', itemLevel = 10) => ({ kind: 'equipment', itemId: id, sortHeader: { slotKind, quality, itemLevel } });
const bag = slots => ({ schemaVersion: 2, id: 'bag', accountId: 'account', characterId: 'char', kind: 'backpack', capacity: 20, stage: 0, slots, version: 1, createdAt: 0, updatedAt: 0 });
const run = (b, direction = 'forward') => organizeBackpack(b, direction, catalog, 'journal');

test('sorts equipment by fixed slot, quality, level with stable ties and stacks by category', () => {
  const b = bag({ 9: stack('ore', 1, { templateRef: { id: 'ore', version: 2 } }), 4: gear('weapon', 'weapon', 'orange', 30), 3: gear('shoulder-low', 'shoulder'), 1: gear('shoulder-high', 'shoulder', 'green', 10), 6: gear('tie-a', 'chest'), 7: gear('tie-b', 'chest'), 8: stack('potion', 1) });
  const result = run(b);
  assert.deepEqual(Object.values(result.slots).map(s => s.itemId ?? s.stackId), ['shoulder-high', 'shoulder-low', 'tie-a', 'tie-b', 'weapon', 'potion', 'ore']);
  assert.deepEqual(result.lineage, { inputs: [], outputs: [] });
  assert.equal(b.slots[8].traceRef, 'old:potion');
  assert.deepEqual(run(b, 'reverse').slots[19], result.slots[0]);
  assert.equal(Object.keys(run(b, 'reverse').slots)[0], '13');
});

test('merges full participating quantities and traces every output including remainder; repeated organize no-op', () => {
  const b = bag({ 2: stack('a', 12), 8: stack('b', 17), 15: stack('c', 8) });
  const result = run(b);
  assert.equal(result.mergedStacks, 1);
  assert.deepEqual(Object.values(result.slots).map(s => [s.stackId, s.quantity, s.traceRef]), [['a', 20, 'journal:0'], ['b', 17, 'journal:1']]);
  assert.equal(result.lineage.inputs.reduce((n, s) => n + s.quantity, 0), 37);
  assert.equal(result.lineage.outputs.reduce((n, s) => n + s.quantity, 0), 37);
  assert.equal(b.slots[2].quantity, 12);
  assert.deepEqual(run({ ...b, slots: result.slots }).lineage, { inputs: [], outputs: [] });
});

test('redistribution with same number of stacks is traced, full and singleton stacks are untouched', () => {
  const result = run(bag({ 0: stack('a', 2), 1: stack('b', 19), 2: stack('c', 20, { binding: { kind: 'account', accountId: 'account' } }), 3: stack('d', 20, { binding: { kind: 'account', accountId: 'account' } }) }));
  assert.equal(result.mergedStacks, 0);
  assert.equal(result.lineage.inputs.length, 2);
  assert.deepEqual(Object.values(result.slots).map(s => s.traceRef), ['journal:0', 'journal:1', 'old:c', 'old:d']);
});

test('does not merge different binding scopes or templates; preserves exact source references', () => {
  const result = run(bag({ 0: stack('a', 2), 1: stack('b', 2, { binding: { kind: 'account', accountId: 'account' } }), 2: stack('c', 2, { binding: { kind: 'character', accountId: 'account', characterId: 'char' } }), 3: stack('d', 2, { templateRef: { id: 'ore', version: 2 } }) }));
  assert.equal(result.lineage.inputs.length, 0);
  assert.equal(Object.keys(result.slots).length, 4);
});

test('rejects malformed trusted data instead of silently sorting or merging it', () => {
  const cases = [bag({ 20: stack('a', 1) }), bag({ '01': stack('a', 1) }), bag({ 0: stack('a', 21) }), bag({ 0: stack('a', 1), 1: stack('a', 2) }), bag({ 0: gear('a', 'bogus') }), bag({ 0: gear('a', 'weapon', 'unknown') }), bag({ 0: stack('a', 1, { traceRef: '' }) }), bag({ 0: stack('a', 1, { templateRef: { id: 'potion', version: 2 } }) }), { ...bag({}), capacity: 100 }, bag({ 0: stack('a', 1, { binding: { kind: 'none', accountId: 'account' } }) })];
  for (const value of cases) assert.throws(() => run(value), /CONFIG_NOT_READY/);
  assert.throws(() => run(bag({ 0: stack('a', 1, { binding: { kind: 'character', accountId: 'account', characterId: 'other' } }) })), /ITEM_NOT_ELIGIBLE/);
  assert.throws(() => validateBackpack({ ...bag({}), kind: 'accountVault' }, catalog), /ITEM_NOT_ELIGIBLE/);
});

test('maximum capacity bounded merge conserves 100 independent input traces', () => {
  const b = { ...bag(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i, stack(`s${i}`, 1)]))), capacity: 100, stage: 4 };
  const result = run(b);
  assert.equal(result.mergedStacks, 95);
  assert.equal(result.lineage.inputs.length, 100);
  assert.equal(result.lineage.outputs.length, 5);
  assert.equal(Object.values(result.slots).reduce((sum, slot) => sum + slot.quantity, 0), 100);
  assert.equal(new Set(result.lineage.outputs.map(s => s.traceRef)).size, 5);
});

test('repeated reverse sorting never retraces already compact groups', () => {
 const b = bag({0:stack('a',20),1:stack('b',5)});
 const once=run(b,'reverse');
 const twice=run({...b,slots:once.slots},'reverse');
 assert.deepEqual(twice.lineage,{inputs:[],outputs:[]});
 assert.deepEqual(new Set(Object.values(twice.slots).map(s=>s.traceRef)),new Set(['old:a','old:b']));
});


test('rejects colliding equipment/stack identities and malformed container versions', () => {
  assert.throws(() => run(bag({0:gear('same','weapon'),1:stack('same',1)})), /CONFIG_NOT_READY/);
  for (const version of [-1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => run({...bag({}),version}), /CONFIG_NOT_READY/);
});
