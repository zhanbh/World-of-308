import test from 'node:test';
import assert from 'node:assert/strict';
import { BankCoordinator } from '../../client/assets/scripts/net/BankCoordinator.ts';
import { InventoryDetails } from '../../client/assets/scripts/ui/InventoryDetails.ts';
import { InventoryGesture } from '../../client/assets/scripts/ui/InventoryGesture.ts';
import { detailBounds, equipmentLines, itemIconForTemplate } from '../../client/assets/scripts/ui/InventoryPresentation.ts';
import { createBankPreview } from '../../client/tools/bank-preview-server.mjs';
import { createSandboxBankCoordinator } from '../../client/assets/scripts/net/PrototypePreview.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));

test('Bank confirmation modal pointer isolation ignores the opening release', () => {
    const dismiss = new InventoryGesture();
    assert.equal(dismiss.pointerEnd('mouse', 0, 0, 1), null);
    dismiss.pointerStart({ id: 1, x: 0, y: 0, timeMs: 2, sourceIndex: null, sourceKey: null, bagVersion: null, mouse: false });
    assert.equal(dismiss.pointerEnd('mouse', 0, 0, 3), null);
    assert.equal(dismiss.state.id, 1);
    assert.equal(dismiss.pointerEnd(1, 0, 0, 4).mode, 'tap');
});

async function bankEnvironment(intercept) {
    const demo = await createBankPreview(), calls = [];
    const c = new BankCoordinator({
        send: async text => {
            const request = JSON.parse(text);
            calls.push(request);
            const response = await demo.rpc(request);
            return JSON.stringify(intercept ? await intercept(request, response) : response);
        }
    }, { load: () => null, save: () => {} });
    c.init(demo.bootstrap.identity);
    await c.open(demo.bootstrap.contextId);
    return { c, calls, demo };
}

test('real bank preview returns complete gear through public read query without sending mutations', async () => {
    const { c, calls } = await bankEnvironment();
    const before = c.state;
    const item = await c.inspectEquipment('preview-sword');
    assert.ok(item);
    assert.equal(item.itemId, 'preview-sword');
    assert.equal(item.quality, 'blue');
    assert.equal(item.itemLevel, 10);
    assert.equal(item.durability.current, 20);
    assert.equal(item.durability.max, 100);
    assert.deepEqual(c.state, before);
    assert.equal(calls.filter(r => r.command).length, 0);
    assert.equal(JSON.stringify(item).includes('accountId'), false);
    await assert.rejects(c.inspectEquipment('non-existent-gear'), /ITEM_NOT_IN_BANK_OR_BACKPACK/);
    assert.equal(calls.filter(r => r.query === 'equipment.get').length, 1);
});

test('closing bank or switching tab retires an in-flight equipment detail', async () => {
    let release, started;
    const began = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const { c } = await bankEnvironment(async (r, response) => {
        if (r.query === 'equipment.get') { started(); await gate; }
        return response;
    });
    const pending = c.inspectEquipment('preview-sword');
    await began;
    c.close();
    release();
    assert.equal(await pending, null);
});

test('bank details cache isolates responses by container stamp and deduplicates reads', async () => {
    const { c, calls } = await bankEnvironment();
    const details = new InventoryDetails(id => c.inspectEquipment(id));
    const stamp1 = 'vault1:bag1:1:vault1:1';
    details.setScope(stamp1);
    details.ensure(['preview-sword', 'preview-sword']);
    await turn(); await turn();
    assert.equal(details.get('preview-sword')?.status, 'ready');
    assert.equal(calls.filter(r => r.query === 'equipment.get').length, 1);

    // Switching scope (tab switch or container version increment) clears cache
    const stamp2 = 'vault2:bag1:1:vault2:1';
    details.setScope(stamp2);
    assert.equal(details.get('preview-sword'), null);
});

test('bank grid and hit coordinates agree for all 100 slots on both vault and backpack sides', () => {
    const ROW = 60, CELL = 56;
    for (const side of ['vault', 'backpack']) {
        const baseX = side === 'vault' ? -215 : 215;
        for (let i = 0; i < 100; i++) {
            const col = i % 5;
            const row = Math.floor(i / 5);
            const cx = baseX - 120 + col * ROW;
            const cy = 85 - row * ROW;

            // Compute hit test
            const hitCol = Math.floor((cx - baseX + 150) / ROW);
            const hitRow = Math.floor((115 - cy) / ROW);
            const index = hitRow * 5 + hitCol;
            assert.equal(index, i, `Mismatch at slot ${i} for ${side}`);
            assert.ok(Math.abs(cx - (baseX - 120 + hitCol * ROW)) <= CELL / 2);
            assert.ok(Math.abs(cy - (85 - hitRow * ROW)) <= CELL / 2);
        }
    }
});

test('equipment card detailBounds keeps card inside boundaries for vault and backpack anchors', () => {
    // Vault left anchor (e.g. col 0, row 0)
    const vaultAnchor = { x: -335, y: 85 };
    const cardV = detailBounds(vaultAnchor, false);
    assert.ok(cardV.x - cardV.width / 2 >= -440);
    assert.ok(cardV.x + cardV.width / 2 <= 440);
    assert.ok(cardV.y - cardV.height / 2 >= -194);
    assert.ok(cardV.y + cardV.height / 2 <= 194);
    assert.ok(cardV.x > vaultAnchor.x, 'Vault card should be positioned to the right of anchor');

    // Backpack right anchor (e.g. col 4, row 0)
    const bpAnchor = { x: 335, y: 85 };
    const cardB = detailBounds(bpAnchor, false);
    assert.ok(cardB.x - cardB.width / 2 >= -440);
    assert.ok(cardB.x + cardB.width / 2 <= 440);
    assert.ok(cardB.y - cardB.height / 2 >= -194);
    assert.ok(cardB.y + cardB.height / 2 <= 194);
    assert.ok(cardB.x < bpAnchor.x, 'Backpack card should flip to the left of anchor');
});

test('itemIconForTemplate resolves known items, custom mapper and fallback', () => {
    assert.equal(itemIconForTemplate('con-hp-potion'), 'consumable_hp_potion');
    assert.equal(itemIconForTemplate('con-mp-potion'), 'consumable_mp_potion');
    assert.equal(itemIconForTemplate('preview-hp'), 'consumable_hp_potion');
    assert.equal(itemIconForTemplate('preview-vault-hp'), 'consumable_hp_potion');
    assert.equal(itemIconForTemplate('mat-carbon'), 'material_adamantite');
    assert.equal(itemIconForTemplate('unknown-template-xyz'), 'item_unknown');
    assert.equal(itemIconForTemplate('custom-foo', () => 'custom_icon'), 'custom_icon');
});

test('sandbox bank coordinator speaks valid DTOs and handles equipment.get query', async () => {
    const sandbox = createSandboxBankCoordinator();
    await sandbox.coordinator.open(sandbox.contextId);
    assert.equal(sandbox.coordinator.state.status, 'ready');
    assert.equal(sandbox.coordinator.state.backpack.slots.length, 4);
    assert.equal(sandbox.coordinator.state.vault.slots.length, 1);

    const item = await sandbox.coordinator.inspectEquipment('item-sandbox-weapon');
    assert.ok(item);
    assert.equal(item.itemId, 'item-sandbox-weapon');
    assert.equal(item.slotKind, 'weapon');
    assert.equal(item.quality, 'purple');
    assert.equal(item.itemLevel, 30);
    assert.equal(item.enhancementLevel, 10);
    assert.equal(item.enhancementBonus?.attackPower, '1250');
    assert.equal(item.durability.current, 28);
    assert.equal(item.durability.max, 35);
});

