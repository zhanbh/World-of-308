import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryCoordinator } from '../../client/assets/scripts/net/InventoryCoordinator.ts';

const identity = { sessionId: 's', sessionEpoch: 1, characterId: 'c' };
const bag = version => ({ containerId: 'bag', version, kind: 'backpack', owner: { kind: 'character', characterId: 'c' }, capacity: 20, unlockStage: 0, slots: [] });
const versions = version => [{ kind: 'container', id: 'bag', version }, { kind: 'character', id: 'c', version }];
const quick = version => ({ characterId: 'c', version, slots: [0, 1, 2].map(slotIndex => ({ slotIndex, templateId: slotIndex === 0 ? 'potion' : null, quantity: slotIndex === 0 ? 20 : 0 })) });
const committed = (operationId, command = 'inventory.organize') => ({ operationId, serverTime: 1, replayed: false, outcome: { status: 'committed', resultVersions: [], data: command === 'inventory.organize' ? { containerId: 'bag', direction: 'forward', mergedStacks: 1 } : { slotIndex: 1, templateId: null } } });
function setup(override) {
  const saved = new Map(), calls = []; let version = 1;
  const persistence = { load: key => saved.get(key) ?? null, save: (key, value) => value === null ? saved.delete(key) : saved.set(key, value) };
  const transport = { send: async text => {
    const r = JSON.parse(text); calls.push(r);
    const replacement = override?.(r);
    if (replacement !== undefined) return JSON.stringify(await replacement);
    if (r.command) { version++; return JSON.stringify(committed(r.operationId, r.command)); }
    return JSON.stringify({ requestId: r.requestId, serverTime: 1, versions: versions(version), data: r.query === 'inventory.get' ? bag(version) : quick(version) });
  } };
  const c = new InventoryCoordinator(transport, persistence); c.init(identity);
  return { c, transport, persistence, saved, calls };
}

test('loads explicit empty backpack and three authoritative template quickslots; receipt triggers refreshed views', async () => {
  const { c, calls, saved } = setup(); await c.open();
  assert.equal(c.state.status, 'empty'); assert.equal(c.state.quickSlots.slots[0].quantity, 20);
  await c.organize('organize1', 'forward');
  assert.equal(c.state.backpack.version, 2); assert.equal(c.state.lastMergeCount, 1); assert.equal(saved.size, 0);
  const request = calls.find(r => r.command);
  assert.deepEqual(request.expected, [{ kind: 'character', id: 'c', version: 1 }, { kind: 'container', id: 'bag', version: 1 }]);
  await c.assign('assign1', 1, null);
  assert.equal(c.state.quickSlots.version, 3); assert.equal(c.state.status, 'empty');
});

test('lost response persists exact command across controller recreation; notFound never resends mutation', async () => {
  const env = setup(r => r.command ? Promise.reject(new Error('lost')) : r.query === 'operation.get' ? { requestId: r.requestId, serverTime: 1, versions: [], data: { status: 'notFound' } } : undefined);
  await env.c.open(); await env.c.organize('original', 'forward');
  assert.equal(env.c.state.status, 'unknown');
  await assert.rejects(env.c.organize('new', 'forward'), /INVENTORY_NOT_READY/);
  const restored = new InventoryCoordinator(env.transport, env.persistence); restored.init(identity); await restored.open();
  await restored.recover(); assert.equal(restored.state.status, 'unknown');
  assert.equal(env.calls.filter(r => r.command).length, 1);
  assert.equal(env.calls.find(r => r.query === 'operation.get').payload.operationId, 'original');
});

test('restored pending intent queries original operation and merges original outcome then authoritative views', async () => {
  let lost = true;
  const env = setup(r => {
    if (r.command && lost) { lost = false; return Promise.reject(new Error('lost')); }
    if (r.query === 'operation.get') return { requestId: r.requestId, serverTime: 1, versions: [], data: { status: 'found', command: 'inventory.organize', result: committed('original') } };
  });
  await env.c.open(); await env.c.organize('original', 'forward');
  const stored = [...env.saved.values()][0]; assert.equal(JSON.parse(stored).operationId, 'original');
  const restored = new InventoryCoordinator(env.transport, env.persistence); restored.init(identity); await restored.open();
  assert.equal(restored.state.status, 'unknown');
  await restored.recover(); assert.equal(restored.state.status, 'empty'); assert.equal(env.saved.size, 0);
  assert.deepEqual(env.calls.filter(r => r.query === 'operation.get').map(r => r.payload.operationId), ['original']);
  assert.equal(env.calls.filter(r => r.command).length, 1);
});

test('malformed or mismatched mutation receipt remains unknown rather than clearing persisted intent', async () => {
  const env = setup(r => r.command ? committed('wrong-operation') : undefined);
  await env.c.open(); await env.c.organize('original', 'forward');
  assert.equal(env.c.state.status, 'unknown'); assert.equal(env.saved.size, 1);
});

test('late view response cannot overwrite a switched character or closed page', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const env = setup(r => r.query === 'inventory.get' ? gate.then(() => ({ requestId: r.requestId, serverTime: 1, versions: versions(1), data: bag(1) })) : undefined);
  const opening = env.c.open(); env.c.close(); release(); await opening;
  assert.equal(env.c.state.status, 'closed'); assert.equal(env.c.state.backpack, null);
  env.c.init({ ...identity, characterId: 'other' });
  assert.equal(env.c.state.backpack, null);
});

test('persistence failure stops transmission; malformed quickslot and foreign backpack fail loading', async () => {
  const env = setup(); await env.c.open(); env.persistence.save = () => { throw new Error('storage full'); };
  await assert.rejects(env.c.organize('original', 'forward'), /storage full/);
  assert.equal(env.calls.filter(r => r.command).length, 0);
  const bad = setup(r => r.query === 'inventory.get' ? { requestId: r.requestId, serverTime: 1, versions: versions(1), data: { ...bag(1), owner: { kind: 'character', characterId: 'foreign' } } } : undefined);
  await bad.c.open(); assert.equal(bad.c.state.status, 'failed'); assert.equal(bad.c.state.backpack, null);
});

test('older refresh never replaces newer accepted container or character view', async () => {
  let version = 5;
  const env = setup(r => r.query === 'inventory.get' || r.query === 'quickslot.get' ? { requestId: r.requestId, serverTime: 1, versions: versions(version), data: r.query === 'inventory.get' ? bag(version) : quick(version) } : undefined);
  await env.c.open(); assert.equal(env.c.state.backpack.version, 5);
  version = 3; await env.c.open();
  assert.equal(env.c.state.backpack.version, 5); assert.equal(env.c.state.quickSlots.version, 5);
});

test('known committed version prevents a stale read from enabling another command', async () => {
  const env = setup(r => r.command ? { ...committed(r.operationId), outcome: { ...committed(r.operationId).outcome, resultVersions: [{ kind: 'container', id: 'bag', version: 5 }] } } : undefined);
  await env.c.open(); await env.c.organize('original', 'forward');
  assert.equal(env.c.state.status, 'failed'); assert.equal(env.c.state.code, 'VIEW_STALE');
  await assert.rejects(env.c.organize('next', 'forward'), /INVENTORY_NOT_READY/);
});

test('quickslot quantity snapshot must match container version and cannot overwrite with stale bag vector', async () => {
  let stale = false;
  const env = setup(r => {
    if (r.query === 'inventory.get') return { requestId: r.requestId, serverTime: 1, versions: versions(2), data: bag(2) };
    if (r.query === 'quickslot.get') return { requestId: r.requestId, serverTime: 1, versions: [{ kind: 'container', id: 'bag', version: stale ? 1 : 2 }, { kind: 'character', id: 'c', version: 2 }], data: { ...quick(2), slots: quick(2).slots.map(s => ({ ...s, quantity: s.slotIndex === 0 ? (stale ? 20 : 0) : 0 })) } };
  });
  await env.c.open(); assert.equal(env.c.state.quickSlots.slots[0].quantity, 0);
  stale = true; await env.c.open(); assert.equal(env.c.state.status, 'failed');
  assert.equal(env.c.state.quickSlots.slots[0].quantity, 0); assert.equal(env.c.state.code, 'INCONSISTENT_VIEW_VERSIONS');
});

test('closing during mutation preserves unresolved intent and ignores late reply; reopening permits recovery', async () => {
  let finish;
  const env = setup(r => r.command ? new Promise(resolve => { finish = resolve; }) : undefined);
  await env.c.open(); const mutation = env.c.assign('assign-late', 1, null);
  env.c.close(); finish(committed('assign-late', 'quickslot.assign')); await mutation;
  assert.equal(env.c.state.status, 'closed'); assert.equal(env.saved.size, 1);
  await env.c.open(); assert.equal(env.c.state.status, 'unknown'); assert.equal(env.c.state.pendingOperationId, 'assign-late');
});

test('invalid slot is rejected locally before persistence or transport', async () => {
  const env = setup(); await env.c.open();
  await assert.rejects(env.c.assign('invalid-slot', 3, 'potion'));
  assert.equal(env.saved.size, 0); assert.equal(env.calls.filter(r => r.command).length, 0);
});

test('packet lost before backend: notFound stays unknown until explicit retry resends exact original operation', async () => {
  let lost = false;
  const env = setup(r => {
    if (r.command && !lost) { lost = true; return Promise.reject(new Error('packet never arrived')); }
    if (r.query === 'operation.get') return { requestId: r.requestId, serverTime: 1, versions: [], data: { status: 'notFound' } };
  });
  await env.c.open(); await env.c.organize('original-retry', 'reverse');
  const stored = [...env.saved.values()][0];
  await env.c.recover(); assert.equal(env.c.state.status, 'unknown');
  assert.equal(env.calls.filter(r => r.command).length, 1);
  await env.c.retryOriginal();
  const commands = env.calls.filter(r => r.command);
  assert.equal(commands.length, 2); assert.deepEqual(commands[0], commands[1]);
  assert.deepEqual(commands[1], JSON.parse(stored));
  assert.equal(env.c.state.status, 'empty'); assert.equal(env.saved.size, 0);
  await assert.rejects(env.c.retryOriginal(), /NO_PENDING_INVENTORY_COMMAND/);
});

test('explicit retry is guarded on closed or switched roles; late reply preserves pending storage', async () => {
  let finish; let attempt = 0;
  const env = setup(r => {
    if (r.command && ++attempt === 1) return Promise.reject(new Error('packet lost'));
    if (r.command) return new Promise(resolve => { finish = resolve; });
  });
  await env.c.open(); await env.c.assign('retry-late', 1, null);
  const retry = env.c.retryOriginal(); assert.equal(env.c.state.status, 'submitting');
  await assert.rejects(env.c.retryOriginal(), /NO_PENDING_INVENTORY_COMMAND/);
  env.c.close(); finish(committed('retry-late', 'quickslot.assign')); await retry;
  assert.equal(env.c.state.status, 'closed'); assert.equal(env.saved.size, 1);
  await assert.rejects(env.c.retryOriginal(), /NO_PENDING_INVENTORY_COMMAND/);
  env.c.init({ ...identity, characterId: 'other' });
  await assert.rejects(env.c.retryOriginal(), /NO_PENDING_INVENTORY_COMMAND/);
});

test('recovery serializes lookup and blocks concurrent recovery or resend while original lookup is pending', async () => {
  let finish;
  const env = setup(r => {
    if (r.command) return Promise.reject(new Error('lost response'));
    if (r.query === 'operation.get') return new Promise(resolve => { finish = resolve; });
  });
  await env.c.open(); await env.c.organize('recover-once', 'forward');
  const recovering = env.c.recover(); assert.equal(env.c.state.status, 'submitting');
  await assert.rejects(env.c.recover(), /NO_PENDING_INVENTORY_COMMAND/);
  await assert.rejects(env.c.retryOriginal(), /NO_PENDING_INVENTORY_COMMAND/);
  const lookup = env.calls.find(r => r.query === 'operation.get');
  finish({ requestId: lookup.requestId, serverTime: 1, versions: [], data: { status: 'found', command: 'inventory.organize', result: committed('recover-once') } });
  await recovering;
  assert.equal(env.c.state.status, 'empty'); assert.equal(env.c.state.pendingOperationId, null);
  assert.equal(env.calls.filter(r => r.query === 'operation.get').length, 1);
});

test('stale notFound lookup after closing and starting a new recovery cannot undo the completed recovery', async () => {
  const lookups = [];
  const env = setup(r => {
    if (r.command) return Promise.reject(new Error('lost response'));
    if (r.query === 'operation.get') return new Promise(resolve => { lookups.push({ request: r, resolve }); });
  });
  await env.c.open(); await env.c.organize('recover-stale', 'forward');
  const oldRecovery = env.c.recover(); env.c.close(); await env.c.open();
  const currentRecovery = env.c.recover();
  lookups[1].resolve({ requestId: lookups[1].request.requestId, serverTime: 1, versions: [], data: { status: 'found', command: 'inventory.organize', result: committed('recover-stale') } });
  await currentRecovery;
  lookups[0].resolve({ requestId: lookups[0].request.requestId, serverTime: 1, versions: [], data: { status: 'notFound' } });
  await oldRecovery;
  assert.equal(env.c.state.status, 'empty'); assert.equal(env.c.state.pendingOperationId, null); assert.equal(env.saved.size, 0);
});
