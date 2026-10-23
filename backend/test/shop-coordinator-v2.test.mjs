import test from 'node:test';
import assert from 'node:assert/strict';
import { ShopCoordinator } from '../../client/assets/scripts/net/ShopCoordinator.ts';

const identity = { sessionId: 's-shop', sessionEpoch: 1, characterId: 'c-shop' };

const characterView = (version) => ({
  character: { characterId: 'c-shop', classId: 'warrior', characterName: '战', level: 10 },
  version,
  equipped: [],
  skills: [{ skillId: 'cross', level: 1, unlocked: true }],
  attributes: [],
  location: { kind: 'town', anchorId: 'blacksmith' },
  stamina: 308,
  staminaAsOf: 1,
});

const accountView = (wallet) => ({
  characters: [{ characterId: 'c-shop', classId: 'warrior', characterName: '战', level: 10 }],
  selectedCharacterId: 'c-shop',
  wallet,
  activeChallengeId: null,
  openSceneChallengeId: null,
});

function setup(override) {
  const saved = new Map();
  const calls = [];
  const state = {
    charVer: 1,
    wallet: { gold: '100000', points: '50' },
  };

  const persistence = {
    load: (key) => saved.get(key) ?? null,
    save: (key, value) => (value === null ? saved.delete(key) : saved.set(key, value)),
  };

  const transport = {
    send: async (text) => {
      const r = JSON.parse(text);
      calls.push(r);
      const replacement = override?.(r, state);
      if (replacement !== undefined) return JSON.stringify(await replacement);

      if (r.command === 'shop.buy') {
        state.charVer++;
        state.wallet.gold = (BigInt(state.wallet.gold) - 250n).toString();
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: 1,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-shop', version: state.charVer },
              { kind: 'wallet', id: 'w1', version: 2 },
            ],
            data: { deliveredQuantity: r.payload.quantity, sourceRef: r.payload.offerId },
          },
        });
      }

      if (r.command === 'shop.sell') {
        state.charVer++;
        state.wallet.gold = (BigInt(state.wallet.gold) + 300n).toString();
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: 1,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-shop', version: state.charVer },
              { kind: 'wallet', id: 'w1', version: 2 },
            ],
            data: { soldQuantity: r.payload.quantity, sourceRef: 'shop_sell' },
          },
        });
      }

      if (r.command === 'wallet.exchange') {
        state.charVer++;
        state.wallet.gold = (BigInt(state.wallet.gold) - 10000n).toString();
        state.wallet.points = (BigInt(state.wallet.points) + 1n).toString();
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: 1,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-shop', version: state.charVer },
              { kind: 'wallet', id: 'w1', version: 2 },
            ],
            data: { fromCurrency: r.payload.fromCurrency, exchangeUnits: r.payload.exchangeUnits },
          },
        });
      }

      if (r.query === 'character.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1,
          versions: [{ kind: 'character', id: 'c-shop', version: state.charVer }],
          data: characterView(state.charVer),
        });
      }

      if (r.query === 'account.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1,
          versions: [{ kind: 'account', id: 'acc1', version: 1 }],
          data: accountView(state.wallet),
        });
      }

      if (r.query === 'operation.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1,
          versions: [],
          data: {
            status: 'found',
            command: 'shop.buy',
            result: {
              operationId: r.payload.operationId,
              serverTime: 1,
              replayed: true,
              outcome: {
                status: 'committed',
                resultVersions: [
                  { kind: 'character', id: 'c-shop', version: 2 },
                  { kind: 'wallet', id: 'w1', version: 2 },
                ],
                data: { deliveredQuantity: 5, sourceRef: 'offer_hp_potion_minor' },
              },
            },
          },
        });
      }

      throw new Error(`UNEXPECTED_REQ: ${text}`);
    },
  };

  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init(identity);
  return { coordinator, transport, persistence, state, calls };
}

test('shop coordinator initializes and transitions from loading to ready', async () => {
  const { coordinator } = setup();
  assert.equal(coordinator.state.status, 'closed');

  await coordinator.open('ctx_1', 'shop', 'quote_v1');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.contextId, 'ctx_1');
  assert.equal(coordinator.state.serviceKind, 'shop');
  assert.equal(coordinator.state.quoteRef, 'quote_v1');
  assert.equal(coordinator.state.wallet.gold, '100000');
  assert.equal(coordinator.state.wallet.points, '50');
});

test('shop coordinator schedules buy and updates wallet and version', async () => {
  const { coordinator } = setup();
  await coordinator.open('ctx_1', 'shop', 'quote_v1');

  await coordinator.buy('offer_hp_potion_minor', 5, 'quote_v1');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.wallet.gold, '99750');
  assert.equal(coordinator.state.characterVersion, 2);
});

test('shop coordinator schedules sell and updates wallet', async () => {
  const { coordinator } = setup();
  await coordinator.open('ctx_1', 'shop', 'quote_v1');

  await coordinator.sell({ kind: 'equipment', itemId: 'w1' }, 1, 'quote_v1');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.wallet.gold, '100300');
  assert.equal(coordinator.state.characterVersion, 2);
});

test('shop coordinator schedules exchange and updates wallet', async () => {
  const { coordinator } = setup();
  await coordinator.open('ctx_1', 'shop', 'quote_v1');

  await coordinator.exchange('gold', 1, 'quote_v1');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.wallet.gold, '90000');
  assert.equal(coordinator.state.wallet.points, '51');
});

test('shop coordinator transitions to failed on rejected outcome', async () => {
  const { coordinator } = setup((req) => {
    if (req.command === 'shop.buy') {
      return {
        operationId: req.operationId,
        serverTime: 1,
        replayed: false,
        outcome: { status: 'rejected', code: 'BAG_FULL' },
      };
    }
  });

  await coordinator.open('ctx_1', 'shop', 'quote_v1');
  await coordinator.buy('offer_hp_potion_minor', 5, 'quote_v1');
  assert.equal(coordinator.state.status, 'failed');
  assert.equal(coordinator.state.code, 'BAG_FULL');
});

test('shop coordinator handles network drop to unknown and recovers via operation.get', async () => {
  let failFirst = true;
  const { coordinator } = setup((req, state) => {
    if (req.command === 'shop.buy' && failFirst) {
      failFirst = false;
      throw new Error('NETWORK_DROP');
    }
  });

  await coordinator.open('ctx_1', 'shop', 'quote_v1');
  await coordinator.buy('offer_hp_potion_minor', 5, 'quote_v1');
  assert.equal(coordinator.state.status, 'unknown');
  assert.equal(coordinator.state.code, 'RESULT_UNKNOWN');

  // Recover
  await coordinator.recover();
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.code, null);
});

test('shop coordinator generation isolation drops late responses after close', async () => {
  let resolveLate;
  const latePromise = new Promise((resolve) => { resolveLate = resolve; });

  const { coordinator } = setup((req) => {
    if (req.command === 'shop.buy') {
      return latePromise;
    }
  });

  await coordinator.open('ctx_1', 'shop', 'quote_v1');
  const buyPromise = coordinator.buy('offer_hp_potion_minor', 5, 'quote_v1');
  assert.equal(coordinator.state.status, 'submitting');

  // Close shop while submit in-flight
  coordinator.close();
  assert.equal(coordinator.state.status, 'closed');

  // Late response arrives
  resolveLate({
    operationId: 'shop-buy-1',
    serverTime: 1,
    replayed: false,
    outcome: {
      status: 'committed',
      resultVersions: [{ kind: 'character', id: 'c-shop', version: 2 }],
      data: { deliveredQuantity: 5, sourceRef: 'offer_hp_potion_minor' },
    },
  });
  await buyPromise;

  // Status must remain closed
  assert.equal(coordinator.state.status, 'closed');
});
