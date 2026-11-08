import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryCoordinator } from '../../client/assets/scripts/net/InventoryCoordinator.ts';
import { InventoryDetails } from '../../client/assets/scripts/ui/InventoryDetails.ts';
import { InventoryGesture } from '../../client/assets/scripts/ui/InventoryGesture.ts';
import { BAG_GRID, inventorySlotAt, inventoryScrollMax, slotCenter, detailBounds, equipmentLines } from '../../client/assets/scripts/ui/InventoryPresentation.ts';
import { createInventoryPreview } from '../../client/tools/inventory-preview-server.mjs';
import { createSandboxInventoryCoordinator } from '../../client/assets/scripts/net/PrototypePreview.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
test('new modal ignores the release from the click that opened it and captures only a new pointer', () => {
    const dismiss = new InventoryGesture();
    assert.equal(dismiss.pointerEnd('mouse', -86, 68, 1), null);
    dismiss.pointerStart({ id: 1, x: 0, y: 0, timeMs: 2, sourceIndex: null, sourceKey: null, bagVersion: null, mouse: false });
    assert.equal(dismiss.pointerEnd('mouse', 0, 0, 3), null);
    assert.equal(dismiss.state.id, 1);
    assert.equal(dismiss.pointerEnd(1, 0, 0, 4).mode, 'tap');
    dismiss.pointerStart({ id: 1, x: 0, y: 0, timeMs: 5, sourceIndex: null, sourceKey: null, bagVersion: null, mouse: false });
    dismiss.pointerMove(1, 0, 40, 6);
    assert.equal(dismiss.pointerEnd(1, 0, 40, 7).mode, 'scroll');
});
async function environment(intercept) {
    const demo = await createInventoryPreview(), calls = [];
    const c = new InventoryCoordinator({ send: async text => {
        const request = JSON.parse(text); calls.push(request);
        const response = await demo.rpc(request);
        return JSON.stringify(intercept ? await intercept(request, response) : response);
    } }, { load: () => null, save: () => {} });
    c.init(demo.bootstrap.identity); await c.open();
    return { c, calls };
}
test('real preview returns complete gear through public read query without sending mutations', async () => {
    const { c, calls } = await environment();
    const before = c.state;
    const item = await c.inspectEquipment('preview:rift-blades');
    assert.equal(item.rolledAffixes.length, 16);
    assert.equal(item.durability.current, 0);
    assert.equal(item.enhancementBonus.attackPower, '60');
    assert.deepEqual(c.state, before);
    assert.equal(calls.filter(r => r.command).length, 0);
    assert.equal(JSON.stringify(item).includes('accountId'), false);
    await assert.rejects(c.inspectEquipment('not-in-the-bag'), /ITEM_NOT_IN_BACKPACK/);
    assert.equal(calls.filter(r => r.query === 'equipment.get').length, 1);
});
test('closed or newly initialized character retires an in-flight equipment detail', async () => {
    let release, started;
    const began = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const { c } = await environment(async (r, response) => {
        if (r.query === 'equipment.get') { started(); await gate; } return response;
    });
    const pending = c.inspectEquipment('preview:rift-blades'); await began;
    c.close(); c.init({ sessionId: 'other', sessionEpoch: 2, characterId: 'other-character' });
    release(); assert.equal(await pending, null); assert.equal(c.state.status, 'closed');
});
test('organizing while a detail is in flight retires the old backpack response', async () => {
    let release, started;
    const began = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const { c } = await environment(async (r, response) => {
        if (r.query === 'equipment.get') { started(); await gate; } return response;
    });
    const pending = c.inspectEquipment('preview:rift-blades'); await began;
    await c.organize('detail-reorder', 'forward'); assert.equal(c.state.status, 'ready');
    release(); assert.equal(await pending, null);
});
test('wrong location, binding, sorting header and equipment version are refused without poisoning write state', async () => {
    const changes = [
        r => { r.data.location.containerId = 'foreign-bag'; },
        r => { r.data.binding.characterId = 'foreign-character'; },
        r => { r.data.quality = 'orange'; },
        r => { r.versions = []; },
    ];
    for (const change of changes) {
        const { c } = await environment((request, response) => { if (request.query === 'equipment.get') change(response); return response; });
        await assert.rejects(c.inspectEquipment('preview:rift-blades'), /EQUIPMENT_VIEW_MISMATCH/);
        assert.equal(c.state.status, 'ready'); assert.equal(c.state.pendingOperationId, null);
    }
});
test('bounded detail cache deduplicates reads and keeps obsolete responses outside a new scope', async () => {
    const calls = [], releases = new Map();
    const details = new InventoryDetails(id => new Promise(resolve => { calls.push(id); releases.set(id, resolve); }), 2);
    details.setScope('bag:1'); details.ensure(['a', 'a', 'b', 'c']); await turn();
    assert.deepEqual(calls, ['a', 'b']);
    details.setScope('bag:2'); details.ensure(['d']); releases.get('a')({ itemId: 'a' }); await turn();
    assert.deepEqual(calls, ['a', 'b', 'd']); assert.equal(details.get('a'), null);
    releases.get('b')({ itemId: 'b' }); releases.get('d')({ itemId: 'd' }); await turn();
    assert.equal(details.get('d').status, 'ready'); assert.equal(details.get('c'), null);
    const copy = details.get('d'); copy.item.itemId = 'changed'; assert.equal(details.get('d').item.itemId, 'd');
});
test('detail read failure requires explicit retry and does not spin forever', async () => {
    let calls = 0;
    const d = new InventoryDetails(async () => { if (++calls === 1) throw new Error('offline'); return { itemId: 'item' }; });
    d.setScope('bag:1'); d.ensure(['item']); await turn();
    assert.equal(d.get('item').status, 'failed');
    d.ensure(['item']); await turn(); assert.equal(calls, 1);
    d.ensure(['item'], true); await turn(); assert.equal(calls, 2); assert.equal(d.get('item').status, 'ready');
});
test('grid render and hit coordinates agree for all 100 slots, ignore gaps and expose the last full row', () => {
    for (let index = 0; index < 100; index++) {
        const scroll = Math.min(inventoryScrollMax(), Math.max(0, Math.floor(index / 5) * 64 - 64));
        const p = slotCenter(index, scroll);
        assert.equal(inventorySlotAt(p.x, p.y, scroll), index);
        assert.equal(inventorySlotAt(p.x + 30, p.y, scroll), null);
    }
    assert.equal(slotCenter(99, inventoryScrollMax()).y - BAG_GRID.cell / 2, BAG_GRID.viewBottom);
    assert.equal(inventorySlotAt(-342, 103, 0), null);
});
test('compact and full cards stay within bounds at every corner and long values remain exact', async () => {
    for (const x of [-460, 460]) for (const y of [-240, 240]) for (const full of [false, true]) {
        const r = detailBounds({ x, y }, full);
        assert(r.x - r.width / 2 >= -440 && r.x + r.width / 2 <= 440);
        assert(r.y - r.height / 2 >= -194 && r.y + r.height / 2 <= 194);
    }
    const { c } = await environment();
    const item = await c.inspectEquipment('preview:rift-blades');
    item.rolledAffixes[0].value = '999999999999999999999999';
    const lines = equipmentLines(item, id => id).map(l => l.text);
    assert(lines.some(l => l.includes('999999999999999999999999')));
    assert(lines.some(l => l === '耐久 0/120'));
    assert.equal(lines.some(l => l.includes('已损坏')), false);
    const ring = await c.inspectEquipment('preview:ring');
    assert.equal(equipmentLines(ring, id => id).some(l => l.text.includes('耐久')), false);
});
test('offline sandbox speaks the same DTOs for detail, organization, assignment and expansion', async () => {
    const { coordinator: c } = createSandboxInventoryCoordinator(); await c.open();
    assert.equal(c.state.status, 'ready');
    assert.equal((await c.inspectEquipment('item-sandbox-weapon')).enhancementLevel, 10);
    await c.organize('sandbox-organize', 'forward'); assert.equal(c.state.status, 'ready');
    await c.assign('sandbox-assign', 2, 'con-hp-potion'); assert.equal(c.state.quickSlots.slots[2].quantity, 15);
    assert.equal((await c.expansionQuote()).nextCapacity, 40);
    await c.expand('sandbox-expand'); assert.equal(c.state.backpack.capacity, 40);
});
