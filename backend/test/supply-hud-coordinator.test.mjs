import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementCoordinator } from '../../client/assets/scripts/net/MovementCoordinator.ts';
import { LoadingCoordinator } from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import { SupplyHUDModel, SUPPLY_BUTTON_LAYOUT } from '../../client/assets/scripts/SupplyHUDModel.ts';
import { movementFixture } from './fixtures/movement-fixture.mjs';

const HP_POTION = 'item:hp-potion-small-v1';
const MP_POTION = 'item:mp-potion-small-v1';
const TRINKET_ITEM = 'item:trinket-warrior-glory-v1';

async function supplyCoordinatorFixture() {
    const h = await movementFixture();
    const saved = new Map();
    const persistence = {
        load: k => saved.get(k) ?? null,
        save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v))
    };
    let now = 1013;

    const transport = {
        send: async text => {
            const q = JSON.parse(text);
            const r = await (q.query ? h.service.query(q) : h.service.execute(q));
            return JSON.stringify(r);
        }
    };

    const loading = new LoadingCoordinator(transport, persistence, {
        load: (ref, release) => h.service.resolveResource(release, ref)
    });
    await loading.prepare(h.prepareCommand);
    assert.equal(loading.state.status, 'loaded');

    const context = {
        ...h.auth,
        characterId: h.characterId,
        rolePlayEpoch: h.character().rolePlayEpoch,
        challengeId: h.challengeId
    };
    const clock = { now: () => now };
    const client = new MovementCoordinator(transport, persistence, clock);
    await client.load(context, h.config, loading);
    assert.equal(client.state.status, 'active');

    return {
        ...h,
        client,
        context,
        loading,
        persistence,
        transport,
        setNow: v => { now = v; h.clock.now = () => v; }
    };
}

test('ST13-04: SupplyHUDModel triggers item action into MovementCoordinator queue and syncs authoritative status', async () => {
    const h = await supplyCoordinatorFixture();
    h.setNow(1513);

    const hud = new SupplyHUDModel();

    // 1. Initial snapshot sync: QuickSlots has MP potion (qty = 5), HP potion (qty = 5)
    hud.syncFromSnapshot({
        quickSlots: [HP_POTION, MP_POTION, null],
        backpackStacks: [
            { templateId: HP_POTION, quantity: 5 },
            { templateId: MP_POTION, quantity: 5 }
        ],
        equippedTrinket: { itemId: 'inst-trinket-1', templateRef: TRINKET_ITEM },
        trinketEquipWaitUntilTick: 0,
        cooldowns: [],
        buffs: [],
        currentTick: 1,
        lifeState: 'alive',
        isFighting: true
    });

    assert.equal(hud.quickSlots[0].status, 'ready');
    assert.equal(hud.quickSlots[1].status, 'ready');
    assert.equal(hud.trinket.status, 'ready');

    // 2. User presses quickslot 1 (MP Potion) -> ActionInput generated and enqueued
    const mpAction = hud.triggerQuickSlot(1, 1);
    assert.ok(mpAction);
    assert.equal(mpAction.kind, 'item');
    assert.equal(mpAction.quickSlotIndex, 1);
    assert.equal(hud.quickSlots[1].status, 'submitting');

    // Enqueue into real MovementCoordinator alongside a movement intent
    h.client.enqueue({ seq: 1, tick: 1, kind: 'item', quickSlotIndex: 1, templateId: MP_POTION });
    h.client.enqueue({ seq: 2, tick: 1, kind: 'move', x: 1000, y: 0 });
    assert.equal(h.client.state.queued, 2);

    // 3. MovementCoordinator submits inputs to server
    await h.client.submit('submit-supply-and-move', 51);
    assert.equal(h.client.state.status, 'active');

    // 4. Resolve submission in HUD after server returns
    hud.resolveSubmission('quickSlot', 1);

    // 5. Sync from post-submit state: MP potion consumed (5 -> 4), 10s cooldown started (1000 ticks)
    hud.syncFromSnapshot({
        quickSlots: [HP_POTION, MP_POTION, null],
        backpackStacks: [
            { templateId: HP_POTION, quantity: 5 },
            { templateId: MP_POTION, quantity: 4 }
        ],
        equippedTrinket: { itemId: 'inst-trinket-1', templateRef: TRINKET_ITEM },
        trinketEquipWaitUntilTick: 0,
        cooldowns: [{ cooldownId: 'mpPotion', readyAtTick: 1001 }],
        buffs: [],
        currentTick: 51,
        lifeState: 'alive',
        isFighting: true
    });

    assert.equal(hud.quickSlots[1].status, 'cooldown');
    assert.equal(hud.quickSlots[1].quantity, 4);
    assert.ok(hud.quickSlots[1].cooldownLeftSec > 9);
    assert.ok(hud.quickSlots[1].label.includes('s'));
});

test('ST13-04: Trinket activation enqueues trinket action, triggers active buff and cooldown in HUD', async () => {
    const h = await supplyCoordinatorFixture();
    h.setNow(1513);

    const hud = new SupplyHUDModel();

    hud.syncFromSnapshot({
        quickSlots: [null, null, null],
        backpackStacks: [],
        equippedTrinket: { itemId: 'inst-trinket-1', templateRef: TRINKET_ITEM },
        trinketEquipWaitUntilTick: 0,
        cooldowns: [],
        buffs: [],
        currentTick: 1,
        lifeState: 'alive',
        isFighting: true
    });

    assert.equal(hud.trinket.status, 'ready');

    // User triggers trinket
    const trinketAction = hud.triggerTrinket(1);
    assert.ok(trinketAction);
    assert.equal(trinketAction.kind, 'trinket');
    assert.equal(trinketAction.itemId, 'inst-trinket-1');
    assert.equal(hud.trinket.status, 'submitting');

    // Enqueue and submit
    h.client.enqueue({ seq: 1, tick: 1, kind: 'trinket', itemId: 'inst-trinket-1' });
    await h.client.submit('submit-trinket', 51);
    assert.equal(h.client.state.status, 'active');

    hud.resolveSubmission('trinket');

    // Post-submit: Buff active for 15s (1500 ticks), CD active for 120s (12000 ticks)
    hud.syncFromSnapshot({
        quickSlots: [null, null, null],
        backpackStacks: [],
        equippedTrinket: { itemId: 'inst-trinket-1', templateRef: TRINKET_ITEM },
        trinketEquipWaitUntilTick: 0,
        cooldowns: [{ cooldownId: 'trinket', readyAtTick: 12001 }],
        buffs: [{ buffId: 'buff:trinket:1', templateRef: TRINKET_ITEM, endsAtTick: 1501 }],
        currentTick: 51,
        lifeState: 'alive',
        isFighting: true
    });

    assert.equal(hud.trinket.status, 'active');
    assert.ok(hud.trinket.buffLeftSec > 14);

    // Advance beyond buff duration (1600 ticks) -> reverts to cooldown display
    hud.syncFromSnapshot({
        quickSlots: [null, null, null],
        backpackStacks: [],
        equippedTrinket: { itemId: 'inst-trinket-1', templateRef: TRINKET_ITEM },
        trinketEquipWaitUntilTick: 0,
        cooldowns: [{ cooldownId: 'trinket', readyAtTick: 12001 }],
        buffs: [],
        currentTick: 1600,
        lifeState: 'alive',
        isFighting: true
    });

    assert.equal(hud.trinket.status, 'cooldown');
    assert.ok(hud.trinket.cooldownLeftSec > 100);
});
