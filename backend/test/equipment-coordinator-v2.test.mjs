import test from 'node:test';
import assert from 'node:assert/strict';
import { EquipmentCoordinator } from '../../client/assets/scripts/net/EquipmentCoordinator.ts';

const identity = { sessionId: 's-equip', sessionEpoch: 1, characterId: 'c-equip' };

const characterView = (version, equipped = [{ slotId: 'weapon', itemId: 'w1' }], attributes = [{ statId: 'attack', value: '100' }]) => ({
  character: { characterId: 'c-equip', classId: 'warrior', characterName: '战', level: 10 },
  version,
  equipped,
  skills: [{ skillId: 'cross', level: 1, unlocked: true }],
  attributes,
  location: { kind: 'inn', anchorId: 'c-equip' },
  stamina: 308,
  staminaAsOf: 1,
});

const bagView = version => ({
  containerId: 'bag:c-equip',
  version,
  kind: 'backpack',
  owner: { kind: 'character', characterId: 'c-equip' },
  capacity: 20,
  unlockStage: 0,
  slots: [],
});

const versions = (charVer, bagVer) => [
  { kind: 'character', id: 'c-equip', version: charVer },
  { kind: 'container', id: 'bag:c-equip', version: bagVer },
];

const committed = (operationId, command = 'equipment.equip', itemId = 'w2', slot = 'weapon') => ({
  operationId,
  serverTime: 1,
  replayed: false,
  outcome: {
    status: 'committed',
    resultVersions: [{ kind: 'character', id: 'c-equip', version: 2 }, { kind: 'container', id: 'bag:c-equip', version: 2 }],
    data: { itemId, slot },
  },
});

function setup(override) {
  const saved = new Map();
  const calls = [];
  const state = { charVer: 1, bagVer: 1 };

  const persistence = {
    load: key => saved.get(key) ?? null,
    save: (key, value) => (value === null ? saved.delete(key) : saved.set(key, value)),
  };

  const transport = {
    send: async text => {
      const r = JSON.parse(text);
      calls.push(r);
      const replacement = override?.(r, state);
      if (replacement !== undefined) return JSON.stringify(await replacement);

      if (r.command) {
        state.charVer++;
        state.bagVer++;
        return JSON.stringify(committed(r.operationId, r.command, r.payload.itemId, r.payload.targetSlot ?? r.payload.slot));
      }

      if (r.query === 'character.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1,
          versions: versions(state.charVer, state.bagVer),
          data: characterView(state.charVer),
        });
      }

      if (r.query === 'inventory.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1,
          versions: versions(state.charVer, state.bagVer),
          data: bagView(state.bagVer),
        });
      }

      throw new Error(`Unexpected query: ${r.query}`);
    },
  };

  const coordinator = new EquipmentCoordinator(transport, persistence);
  coordinator.init(identity);
  return { coordinator, transport, persistence, saved, calls, state };
}

test('EquipmentCoordinator loads character equipment, attributes and transitions to ready', async () => {
  const { coordinator, calls } = setup();
  await coordinator.open();

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.characterVersion, 1);
  assert.equal(coordinator.state.backpackVersion, 1);
  assert.deepEqual(coordinator.state.equipped, [{ slotId: 'weapon', itemId: 'w1' }]);
  assert.deepEqual(coordinator.state.attributes, [{ statId: 'attack', value: '100' }]);

  const queries = calls.filter(c => c.query);
  assert.ok(queries.some(q => q.query === 'character.get'));
  assert.ok(queries.some(q => q.query === 'inventory.get'));
});

test('EquipmentCoordinator equip & unequip mutations transition through submitting to ready', async () => {
  const { coordinator, calls, saved } = setup();
  await coordinator.open();

  await coordinator.equip('op-equip-1', 'chest-1', 'chest');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.characterVersion, 2);
  assert.equal(saved.size, 0); // persistence cleared on accept

  const equipCall = calls.find(c => c.command === 'equipment.equip');
  assert.equal(equipCall.payload.itemId, 'chest-1');
  assert.equal(equipCall.payload.targetSlot, 'chest');

  await coordinator.unequip('op-unequip-1', 'chest-1', 'chest');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.characterVersion, 3);
});

test('EquipmentCoordinator handles rejection with failed status and code', async () => {
  const { coordinator } = setup(r => {
    if (r.command === 'equipment.unequip') {
      return {
        operationId: r.operationId,
        serverTime: 1,
        replayed: false,
        outcome: { status: 'rejected', code: 'BAG_FULL' },
      };
    }
    return undefined;
  });

  await coordinator.open();
  await coordinator.unequip('op-fail-bag', 'w1', 'weapon');

  assert.equal(coordinator.state.status, 'failed');
  assert.equal(coordinator.state.code, 'BAG_FULL');
});

test('EquipmentCoordinator handles network loss with unknown status, retryOriginal resends pending command', async () => {
  let failFirst = true;
  const { coordinator, calls } = setup(r => {
    if (r.command && failFirst) {
      failFirst = false;
      return Promise.reject(new Error('Network disconnected'));
    }
    return undefined;
  });

  await coordinator.open();
  await coordinator.equip('op-lost-1', 'w-lost', 'weapon');

  assert.equal(coordinator.state.status, 'unknown');
  assert.equal(coordinator.state.pendingOperationId, 'op-lost-1');

  // retryOriginal resends
  await coordinator.retryOriginal();
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.pendingOperationId, null);

  const commandCalls = calls.filter(c => c.command === 'equipment.equip');
  assert.equal(commandCalls.length, 2);
  assert.equal(commandCalls[0].operationId, 'op-lost-1');
  assert.equal(commandCalls[1].operationId, 'op-lost-1');
});

test('EquipmentCoordinator recovers pending intent from operation.get', async () => {
  const env = setup((r, state) => {
    if (r.command) return Promise.reject(new Error('Timeout'));
    if (r.query === 'operation.get') {
      state.charVer = 2;
      state.bagVer = 2;
      return {
        requestId: r.requestId,
        serverTime: 1,
        versions: [],
        data: {
          status: 'found',
          command: 'equipment.equip',
          result: committed('op-recover-1'),
        },
      };
    }
    return undefined;
  });

  await env.coordinator.open();
  await env.coordinator.equip('op-recover-1', 'w-rec', 'weapon');
  assert.equal(env.coordinator.state.status, 'unknown');

  // Re-instantiate from persistence
  const restored = new EquipmentCoordinator(env.transport, env.persistence);
  restored.init(identity);
  await restored.open();
  assert.equal(restored.state.status, 'unknown');
  assert.equal(restored.state.pendingOperationId, 'op-recover-1');

  await restored.recover();
  assert.equal(restored.state.status, 'ready');
  assert.equal(restored.state.pendingOperationId, null);
  assert.equal(env.saved.size, 0);
});

test('EquipmentCoordinator generation isolation drops late responses after reset', async () => {
  let pendingSend;
  const transport = {
    send: () => new Promise(resolve => { pendingSend = resolve; }),
  };
  const persistence = { load: () => null, save: () => {} };

  const coordinator = new EquipmentCoordinator(transport, persistence);
  coordinator.init(identity);

  // Trigger open
  coordinator.open();
  assert.equal(coordinator.state.status, 'loading');

  // Reset before server responds
  coordinator.reset();
  assert.equal(coordinator.state.status, 'closed');

  // Server responds late
  pendingSend?.(JSON.stringify({
    requestId: 'stale',
    serverTime: 1,
    versions: [],
    data: characterView(1),
  }));

  // Wait tick
  await new Promise(r => setTimeout(r, 10));
  assert.equal(coordinator.state.status, 'closed'); // not overwritten!
});
