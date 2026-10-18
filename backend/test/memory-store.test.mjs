import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { CommitUnknown, StoreUnavailable } from '../src/ports/store.ts';
import { rendezvous } from './helpers.mjs';

test('snapshot conflict on missing document retries concurrent creation instead of overwriting it', async () => {
  const store = new MemoryStore(); rendezvous(store);
  const create = () => store.run(async tx => {
    const previous = await tx.get('unique');
    if (previous) return false;
    tx.set('unique', { count: 1 }); return true;
  });
  const results = await Promise.all([create(), create()]);
  assert.equal(results.filter(Boolean).length, 1); assert.ok(store.conflicts > 0);
  assert.deepEqual(store.inspect('unique'), { count: 1 });
});

test('transactions read their own staged writes without exposing uncommitted data', async () => {
  const store = new MemoryStore();
  await store.run(async tx => {
    tx.set('one', { n: 1 }); assert.deepEqual(await tx.get('one'), { n: 1 });
    assert.equal(store.inspect('one'), undefined);
  });
  assert.deepEqual(store.inspect('one'), { n: 1 });
});

test('reads/inspection return detached values and thrown callbacks discard all staged writes', async () => {
  const store = new MemoryStore();
  await store.run(tx => tx.set('one', { n: 1 }));
  await assert.rejects(() => store.run(async tx => {
    const value = await tx.get('one'); value.n = 99; tx.set('two', 2); throw new Error('abort');
  }), /abort/);
  const view = store.inspect('one'); view.n = 88;
  assert.deepEqual(store.inspect('one'), { n: 1 }); assert.equal(store.inspect('two'), undefined);
});

test('blind writes also conflict; retry budget cannot silently commit stale data', async () => {
  const store = new MemoryStore();
  store.beforeCommit = async () => {
    const hook = store.beforeCommit; store.beforeCommit = undefined;
    await store.run(tx => tx.set('one', 'competitor'));
    store.beforeCommit = hook;
  };
  await assert.rejects(() => store.run(tx => tx.set('one', 'candidate')), StoreUnavailable);
  assert.equal(store.inspect('one'), 'competitor'); assert.equal(store.conflicts, 16);
});

test('a lost response happens after commit and never rolls the data back', async () => {
  const store = new MemoryStore(); store.injectResponseLoss();
  await assert.rejects(() => store.run(tx => tx.set('balance', 10)), CommitUnknown);
  assert.equal(store.inspect('balance'), 10);
});
