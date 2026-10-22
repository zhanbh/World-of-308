import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryGesture } from '../../client/assets/scripts/ui/InventoryGesture.ts';
const start = (gesture, overrides = {}) => gesture.pointerStart({ id: 1, x: 20, y: 30, timeMs: 100, sourceIndex: 3, sourceKey: 'stack-a', bagVersion: 7, mouse: false, ...overrides });

test('short touch selects; 250 ms hold arms drag without any movement', () => {
  const g = new InventoryGesture(); start(g);
  assert.equal(g.pointerEnd(1, 20, 30, 349).mode, 'tap');
  start(g); g.updateHold(350);
  assert.equal(g.state.mode, 'drag');
  assert.equal(g.pointerEnd(1, 200, -60, 400).mode, 'drag');
  start(g); assert.equal(g.pointerEnd(1, 20, 30, 350).mode, 'drag');
});
test('early touch scroll locks and cannot turn into drag after long hold', () => {
  const g = new InventoryGesture(); start(g);
  assert.deepEqual(g.pointerMove(1, 20, 38, 120), { mode: 'scroll', scrollDelta: 8 });
  g.updateHold(500);
  assert.deepEqual(g.pointerMove(1, 20, 31, 510), { mode: 'scroll', scrollDelta: -7 });
  assert.equal(g.pointerEnd(1, 200, -60, 600).mode, 'scroll');
});
test('cancel discards touch; secondary touch cannot end or overwrite owner', () => {
  const g = new InventoryGesture(); start(g); start(g, { id: 2, sourceKey: 'other' });
  assert.equal(g.pointerEnd(2, 20, 30, 120), null);
  assert.deepEqual(g.pointerMove(2, 200, 300, 130), { mode: 'pending', scrollDelta: 0 });
  assert.equal(g.state.sourceKey, 'stack-a');
  g.cancel(); assert.equal(g.state.mode, 'idle'); assert.equal(g.pointerEnd(1, 20, 30, 400), null);
});
test('mouse requires movement threshold rather than hold and retains source snapshot', () => {
  const g = new InventoryGesture(); start(g, { mouse: true });
  g.updateHold(1000); assert.equal(g.state.mode, 'pending');
  assert.equal(g.pointerMove(1, 27, 30, 1001).mode, 'pending');
  assert.equal(g.pointerMove(1, 28, 30, 1002).mode, 'drag');
  const copy = g.state; copy.sourceKey = 'changed'; copy.bagVersion = 999;
  assert.deepEqual(g.pointerEnd(1, 120, 130, 1003), { mode: 'drag', sourceIndex: 3, sourceKey: 'stack-a', bagVersion: 7, x: 120, y: 130 });
});
test('empty and locked sources never arm drag for touch or mouse', () => {
  for (const mouse of [false, true]) for (const source of [{ sourceIndex: null, sourceKey: null }, { sourceIndex: 98, sourceKey: null }]) {
    const g = new InventoryGesture(); start(g, { mouse, ...source }); g.updateHold(500);
    assert.equal(g.state.mode, 'pending');
    assert.equal(g.pointerMove(1, 100, 30, 510).mode, 'scroll');
    assert.equal(g.pointerEnd(1, 100, 30, 520).mode, 'scroll');
  }
});
test('out of order and nonfinite samples cannot move or prematurely arm active gesture', () => {
  const g = new InventoryGesture(); start(g);
  g.pointerMove(1, 20, 32, 200);
  g.pointerMove(1, 200, 200, 150); g.updateHold(NaN); g.updateHold(150);
  assert.equal(g.pointerEnd(1, 200, 200, 150), null);
  assert.equal(g.state.mode, 'pending'); assert.equal(g.state.y, 32);
  assert.equal(g.pointerEnd(1, NaN, 30, 210).mode, 'cancel'); assert.equal(g.state.mode, 'idle');
});
