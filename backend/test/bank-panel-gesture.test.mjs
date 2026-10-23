import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { InventoryGesture } from '../../client/assets/scripts/ui/InventoryGesture.ts';
const require = createRequire(import.meta.url);
const { loadTypeScript } = require('../../tools/local-typescript.cjs');
const { ts } = loadTypeScript(process.env.WORLD308_TYPESCRIPT);
// Execute the actual panel methods against the actual pure gesture. Rendering is
// intentionally stubbed: these regressions concern pointer ownership and hit data.
const source = readFileSync(new URL('../../client/assets/scripts/ui/BankPanel.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const exported = {};
vm.runInNewContext(code, { exports: exported, require: name => name === 'cc' ? {} : { InventoryGesture }, Date, setTimeout });
const { BankPanel } = exported;
function panel() {
    const p = Object.create(BankPanel.prototype);
    const entry = { kind: 'stack', stackId: 'pot', quantity: 10 };
    p.state = { status: 'ready', backpack: { capacity: 20, version: 1, slots: [{ index: 0, entry }] }, vault: { capacity: 20, version: 1, slots: [] } };
    p.coordinator = { state: p.state };
    p.scroll = { backpack: 0, vault: 0 };
    p.gesture = new InventoryGesture(); p.source = null; p.tappedIndex = null;
    p.modalKind = null; p.modal = { active: false }; p.stamp = 'same';
    p.renderModal = () => {}; p.cancel = () => { p.gesture.cancel(); p.source = null; p.tappedIndex = null; };
    p.scrolled = []; p.scrollBy = (side, delta) => { p.scrolled.push([side, delta]); };
    p.quotes = []; p.quote = side => { p.quotes.push(side); };
    return p;
}
test('actual BankPanel locked-slot tap requests quote while empty/locked cells never arm drag', () => {
    const p = panel(); p.scroll.backpack = 240;
    p.start(1, { x: 95, y: 85 }, false);
    assert.equal(p.gesture.state.sourceIndex, null);
    assert.equal(p.tappedIndex, 20);
    p.end(1, { x: 95, y: 85 });
    assert.deepEqual(p.quotes, ['backpack']);
    p.start(1, { x: 95, y: 85 }, false);
    p.move(1, { x: 95, y: 70 });
    assert.equal(p.gesture.state.mode, 'scroll');
});
test('actual BankPanel secondary pointer cannot steal, end or scroll owner source', () => {
    const p = panel();
    p.start(1, { x: 95, y: 85 }, false);
    p.start(2, { x: -335, y: 85 }, false);
    assert.equal(p.source, 'backpack'); assert.equal(p.gesture.state.id, 1);
    p.move(2, { x: -335, y: 30 });
    assert.equal(p.scrolled.length, 0);
    p.end(2, { x: -335, y: 85 });
    assert.equal(p.source, 'backpack'); assert.equal(p.gesture.state.id, 1);
    p.gesture.updateHold(Date.now() + 300);
    // Restore a monotonic clock after the explicit hold, as in the render loop.
    const oldNow = Date.now; Date.now = () => oldNow() + 400;
    try { p.end(1, { x: -335, y: 85 }); } finally { Date.now = oldNow; }
    assert.equal(p.modalKind, 'quantity'); assert.equal(p.selected.side, 'backpack');
    assert.equal(p.selected.target.stackId, 'pot'); assert.equal(p.quantity, 10);
    assert.equal(p.source, null); assert.equal(p.gesture.state.id, null);
});

const inventorySource = readFileSync(new URL('../../client/assets/scripts/ui/InventoryPanel.ts', import.meta.url), 'utf8');
const inventoryCode = ts.transpileModule(inventorySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const inventoryExports = {};
vm.runInNewContext(inventoryCode, { exports: inventoryExports, require: name => name === 'cc' ? {} : { InventoryGesture }, Date, setTimeout });
test('ordinary InventoryPanel locked tap quotes gold expansion without a bank context', async () => {
    const p = Object.create(inventoryExports.InventoryPanel.prototype);
    const q = { containerId: 'bag', nextCapacity: 40, costs: [{ currency: 'gold', amount: '100' }] };
    let quotes = 0;
    p.state = { status: 'ready', backpack: { version: 1, capacity: 20, slots: [] } };
    p.coordinator = { state: p.state, expansionQuote: async () => { ++quotes; return q; } };
    p.gesture = new InventoryGesture(); p.expansionOpen = false; p.scroll = 272;
    p.visible = true; p.root = { children: [] }; p.expansionModal = { active: false, setSiblingIndex() {} }; p.expansionText = {};
    p.ghost = { node: { active: false } }; p.run = async action => action();
    // Source grid row4 index20 has y68 after scrolling272.
    p.start(1, { x: -342, y: 68 }, false);
    assert.equal(p.tappedIndex, 20); assert.equal(p.gesture.state.sourceIndex, null);
    p.end(1, { x: -342, y: 68 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(quotes, 1); assert.equal(p.expansionOpen, true);
    assert.match(p.expansionText.string, /20 → 40/); assert.match(p.expansionText.string, /金币 100/);
    p.dismissExpansion(); assert.equal(p.expansionModal.active, false);
});
