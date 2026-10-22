import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssetCommand, parseAssetQuery, parseEquipmentView, parseContainerView, parseHoldingsView, parseAssetResponse, parseAssetQueryResponse, encodeAssetRequest, decodeAssetResponse } from '../src/protocol/asset-v2.ts';

const payloads = {
  'scene.exitInn': { characterId: 'c', exitAnchorId: 'exit' },
  'service.open': { characterId: 'c', serviceKind: 'bank', anchorId: 'bank' },
  'service.close': { characterId: 'c', contextId: 'ctx' },
  'inventory.transfer': { characterId: 'c', contextId: 'ctx', sourceContainerId: 'bag', targetContainerId: 'vault', target: { kind: 'stack', stackId: 's' }, quantity: 20 },
  'inventory.expand': { characterId: 'c', containerId: 'bag', targetStage: 1, paymentCurrency: 'gold', quoteRef: 'quote' },
  'inventory.organize': { characterId: 'c', direction: 'reverse' },
  'equipment.equip': { characterId: 'c', itemId: 'i', targetSlot: 'weapon' },
  'equipment.unequip': { characterId: 'c', itemId: 'i', slot: 'weapon' },
  'quickslot.assign': { characterId: 'c', slotIndex: 0, templateId: null },
  'shop.buy': { characterId: 'c', contextId: 'ctx', offerId: 'offer', quantity: 2, quoteRef: 'q' },
  'shop.sell': { characterId: 'c', contextId: 'ctx', target: { kind: 'equipment', itemId: 'i' }, quantity: 1, quoteRef: 'q' },
  'wallet.exchange': { characterId: 'c', fromCurrency: 'gold', exchangeUnits: 1, quoteRef: 'q' },
  'equipment.repair': { characterId: 'c', contextId: 'ctx', target: { kind: 'allWorn' }, quoteRef: 'q' },
  'equipment.enhance': { characterId: 'c', contextId: 'ctx', itemId: 'i', targetLevel: 20, useMemento: false, quoteRef: 'q' },
  'mail.markRead': { characterId: 'c', contextId: 'ctx', mailId: 'mail' },
  'mail.claimAttachment': { characterId: 'c', contextId: 'ctx', mailId: 'mail', attachmentId: 'a' },
  'mail.claimAvailable': { characterId: 'c', contextId: 'ctx', cursor: null, batchIntentId: 'batch' },
  'mail.delete': { characterId: 'c', contextId: 'ctx', mailId: 'mail' },
  'reward.claim': { characterId: 'c', contextId: 'ctx', grantId: 'grant' },
};
const envelope = (command, payload) => ({ protocolVersion: 2, command, operationId: 'operation', sessionId: 'session', sessionEpoch: 1, expected: [], payload });
for (const [command, payload] of Object.entries(payloads)) {
  test(`${command} validates its own public intent and rejects missing/extra fields`, () => {
    assert.deepEqual(parseAssetCommand(envelope(command, payload)), envelope(command, payload));
    const { characterId, ...missing } = payload;
    assert.throws(() => parseAssetCommand(envelope(command, missing)));
    assert.throws(() => parseAssetCommand(envelope(command, { ...payload, subject: 'forged' })));
  });
}
test('asset commands reject invalid quantities, duplicates and battle-consumption bypasses', () => {
  for (const quantity of [0, -1, 21, NaN, Infinity, 1.5]) assert.throws(() => parseAssetCommand(envelope('inventory.transfer', { ...payloads['inventory.transfer'], quantity })));
  const duplicate = [{ kind: 'container', id: 'bag', version: 0 }, { kind: 'container', id: 'bag', version: 1 }];
  assert.throws(() => parseAssetCommand({ ...envelope('shop.buy', payloads['shop.buy']), expected: duplicate }));
  for (const command of ['item.use', 'trinket.activate', 'challenge.reportEvents']) assert.throws(() => parseAssetCommand(envelope(command, {})));
});

const queries = {
  'account.get': {}, 'character.get': { characterId: 'c' },
  'inventory.get': { characterId: 'c', containerKind: 'personalVault', contextId: 'ctx' },
  'equipment.get': { characterId: 'c', itemId: 'i' }, 'dungeon.options': { characterId: 'c', dungeonId: 'd' },
  'service.get': { characterId: 'c', serviceContextId: 'ctx' },
  'service.quote': { characterId: 'c', contextId: 'ctx', serviceIntent: { command: 'equipment.repair', payload: payloads['equipment.repair'] } },
  'mail.list': { characterId: 'c', contextId: 'ctx', cursor: null, pageRequest: 20 },
  'reward.list': { characterId: 'c', contextId: 'ctx', cursor: null, pageRequest: 20 },
  'delivery.summary': { characterId: 'c' }, 'ranking.list': { scope: 'all', cursor: null, pageRequest: 20 },
  'operation.get': { operationId: 'operation' }, 'configuration.public': { manifestId: 'manifest' },
};
for (const [query, payload] of Object.entries(queries)) {
  test(`${query} separates query envelope from write/identity fields`, () => {
    const r = { protocolVersion: 2, query, requestId: 'request', sessionId: 'session', sessionEpoch: 1, payload };
    assert.deepEqual(parseAssetQuery(r), r);
    assert.throws(() => parseAssetQuery({ ...r, operationId: 'op' }));
    assert.throws(() => parseAssetQuery({ ...r, payload: { ...payload, accountId: 'forged' } }));
  });
}
test('query pages and bank context are bounded and required', () => {
  const r = { protocolVersion: 2, query: 'inventory.get', requestId: 'r', sessionId: 's', sessionEpoch: 1, payload: { characterId: 'c', containerKind: 'personalVault' } };
  assert.throws(() => parseAssetQuery(r));
  assert.throws(() => parseAssetQuery({ ...r, query: 'ranking.list', payload: { scope: 'all', cursor: null, pageRequest: 51 } }));
  const quote = queries['service.quote'];
  assert.throws(() => parseAssetQuery({ ...r, query: 'service.quote', payload: { ...quote, serviceIntent: { command: 'equipment.repair', payload: { ...payloads['equipment.repair'], characterId: 'other' } } } }));
});

const equipment = () => ({ itemId: 'i', version: 0, templateRef: 'weapon-v1', slotKind: 'weapon', itemLevel: 10, quality: 'white', rolledAffixes: [], enhancementLevel: 0,
  binding: { kind: 'none' }, durability: { wearEnabled: true, current: 0, max: 100, policyRef: 'wear-v1' },
  location: { kind: 'container', containerId: 'bag' }, lifecycle: 'active', source: { kind: 'roomDrop', roomId: 'room', dropId: 'drop' } });
test('equipment public views keep thirteen slots, required durability and exclusive source/location', () => {
  assert.deepEqual(parseEquipmentView(equipment()), equipment());
  const ring = { ...equipment(), slotKind: 'ring', durability: { wearEnabled: false, current: null, max: null, policyRef: 'none-v1' } };
  assert.deepEqual(parseEquipmentView(ring), ring);
  const { durability, ...missing } = equipment();
  for (const value of [missing, { ...equipment(), slotKind: 'head' }, { ...ring, durability }, { ...ring, enhancementLevel: 1 }, { ...equipment(), durability: { ...durability, current: 101 } }, { ...equipment(), source: { kind: 'grant', grantId: 'g', payload: equipment() } }]) assert.throws(() => parseEquipmentView(value));
});
test('containers validate capacity, stack bounds and explicit character/account ownership', () => {
  const bag = { containerId: 'b', version: 0, kind: 'backpack', owner: { kind: 'character', characterId: 'c' }, capacity: 20, unlockStage: 0,
    slots: [{ index: 0, entry: { kind: 'stack', stackId: 's', templateRef: 'potion', quantity: 20, binding: { kind: 'none' }, traceRef: 'trace' } }] };
  assert.deepEqual(parseContainerView(bag), bag);
  for (const value of [{ ...bag, capacity: 21 }, { ...bag, kind: 'accountVault' }, { ...bag, slots: [bag.slots[0], bag.slots[0]] }, { ...bag, slots: [{ ...bag.slots[0], index: 20 }] }]) assert.throws(() => parseContainerView(value));
});
test('holdings are an explicit scoped summary, never a claimable balance', () => {
  const h = { scope: 'character', characterId: 'c', revision: 0, domainRef: 'sets-v1', entries: [{ collectionKey: 'set30.weapon', permanentCount: 1, mailLatestExpiryAt: null }] };
  assert.deepEqual(parseHoldingsView(h), h);
  assert.throws(() => parseHoldingsView({ ...h, claimableQuantity: 1 }));
  assert.throws(() => parseHoldingsView({ ...h, scope: 'account' }));
});

test('original results are bounded versioned summaries, not current balance snapshots', () => {
  const response = { operationId: 'operation', serverTime: 10, replayed: true, outcome: { status: 'committed', data: { containerId: 'bag', direction: 'reverse', mergedStacks: 1 }, resultVersions: [{ kind: 'container', id: 'bag', version: 2 }] } };
  assert.deepEqual(parseAssetResponse('inventory.organize', response), response);
  assert.throws(() => parseAssetResponse('inventory.organize', { ...response, outcome: { ...response.outcome, data: { ...response.outcome.data, walletBalance: '999' } } }));
  for (const outcome of [{ status: 'unknown', code: 'RESULT_UNKNOWN' }, { status: 'rejected', code: 'BAG_FULL' }]) assert.deepEqual(parseAssetResponse('inventory.organize', { ...response, outcome }).outcome, outcome);
  assert.throws(() => parseAssetResponse('inventory.organize', { ...response, outcome: { status: 'rejected', code: 'platform AppSecret=private' } }));
  const q = { requestId: 'request', serverTime: 10, versions: [], data: { status: 'notFound' } };
  assert.deepEqual(parseAssetQueryResponse('operation.get', q), q);
  assert.throws(() => parseAssetQueryResponse('operation.get', { ...q, data: { status: 'notFound', assumeFailed: true } }));
});
test('empty lists stay distinct from query failures and pending never duplicates equipment payload', () => {
  const empty = { requestId: 'r', serverTime: 1, versions: [], data: { entries: [], nextCursor: null } };
  assert.deepEqual(parseAssetQueryResponse('reward.list', empty), empty);
  const failed = { requestId: 'r', serverTime: 1, error: { code: 'SERVICE_UNAVAILABLE' } };
  assert.deepEqual(parseAssetQueryResponse('reward.list', failed), failed);
  assert.throws(() => parseAssetQueryResponse('reward.list', { ...empty, data: { entries: [{ grantId: 'g', itemId: 'i', characterId: 'c', createdAt: 1, state: 'pending', payload: equipment() }], nextCursor: null } }));
});

test('caller wire boundary binds original operation and request IDs before exposing views', () => {
  const request = envelope('inventory.organize', payloads['inventory.organize']);
  assert.deepEqual(JSON.parse(encodeAssetRequest(request)), request);
  const response = { operationId: 'operation', serverTime: 10, replayed: true, outcome: { status: 'committed', data: { containerId: 'bag', direction: 'reverse', mergedStacks: 0 }, resultVersions: [] } };
  assert.deepEqual(decodeAssetResponse(request, JSON.stringify(response)), response);
  assert.throws(() => decodeAssetResponse(request, JSON.stringify({ ...response, operationId: 'other' })));
  assert.throws(() => decodeAssetResponse(request, ' '.repeat(16385)));
});

test('operation.get recognizes the new verified-input receipt without accepting v1 event results', () => {
  const result = { protocolVersion: 2, command: 'simulation.submit', operationId: 'operation', serverTime: 1, replayed: true,
    outcome: { status: 'committed', data: { acceptedSeq: 1, acceptedTick: 100, checkpointRevision: 1, actionResultsRef: 'actions', events: [] }, resultVersions: [] } };
  const query = { requestId: 'r', serverTime: 1, versions: [], data: { status: 'found', command: 'simulation.submit', result } };
  assert.deepEqual(parseAssetQueryResponse('operation.get', query), query);
  assert.throws(() => parseAssetQueryResponse('operation.get', { ...query, data: { ...query.data, command: 'challenge.reportEvents' } }));
  const request = { protocolVersion: 2, query: 'operation.get', requestId: 'r', sessionId: 's', sessionEpoch: 1, payload: { operationId: 'different-operation' } };
  assert.throws(() => decodeAssetResponse(request, JSON.stringify(query)));
});

const resultSamples = {
  'scene.exitInn': { characterId: 'c', anchorId: 'town', locationRevision: 1 },
  'service.open': { contextId: 'ctx', serviceKind: 'bank', locationRevision: 1 },
  'service.close': { contextId: 'ctx', closed: true },
  'inventory.transfer': { sourceContainerId: 'bag', targetContainerId: 'vault', transferredQuantity: 20 },
  'inventory.expand': { containerId: 'bag', targetStage: 1, capacity: 40 },
  'inventory.organize': { containerId: 'bag', direction: 'forward', mergedStacks: 0 },
  'equipment.equip': { itemId: 'i', slot: 'weapon' }, 'equipment.unequip': { itemId: 'i', slot: 'weapon' },
  'quickslot.assign': { slotIndex: 0, templateId: null }, 'shop.buy': { deliveredQuantity: 1, sourceRef: 'purchase' },
  'shop.sell': { soldQuantity: 1, sourceRef: 'sale' }, 'wallet.exchange': { fromCurrency: 'gold', exchangeUnits: 1 },
  'equipment.repair': { repairedItemIds: ['i'], chargedGold: '1000' },
  'equipment.enhance': { itemId: 'i', targetLevel: 1, result: 'failed', deliveryRefs: [] },
  'mail.markRead': { mailId: 'm', read: true }, 'mail.claimAttachment': { mailId: 'm', attachmentId: 'a', deliveredQuantity: 1 },
  'mail.claimAvailable': { batchIntentId: 'batch', state: 'completed', items: [], nextCursor: null },
  'mail.delete': { mailId: 'm', deleted: true }, 'reward.claim': { grantId: 'g', itemId: 'i', state: 'delivered' },
};
for (const [command, data] of Object.entries(resultSamples)) {
  test(`${command} result summary validates independently from current state`, () => {
    const r = { operationId: 'operation', serverTime: 1, replayed: false, outcome: { status: 'committed', data, resultVersions: [] } };
    assert.deepEqual(parseAssetResponse(command, r), r);
    assert.throws(() => parseAssetResponse(command, { ...r, outcome: { ...r.outcome, data: { ...data, privateSeed: 'secret' } } }));
  });
}

test('mail progress and batch summaries cannot claim impossible partial results', () => {
  const result = { requestId: 'r', serverTime: 1, versions: [], data: { entries: [{ mailId: 'm', characterId: 'c', createdAt: 0, expiresAt: 10, read: false,
    attachments: [{ attachmentId: 'a', kind: 'stack', templateRef: 'potion', quantityGranted: 1, quantityClaimed: 2, binding: { kind: 'none' } }] }], nextCursor: null } };
  assert.throws(() => parseAssetQueryResponse('mail.list', result));
  const batch = { operationId: 'op', serverTime: 1, replayed: false, outcome: { status: 'committed', resultVersions: [], data: {
    batchIntentId: 'batch', state: 'partial', items: Array.from({ length: 5 }, (_, i) => ({ childOperationId: `child${i}`, mailId: 'm', attachmentId: `a${i}`, status: 'committed', deliveredQuantity: 1 })), nextCursor: 'next' } } };
  assert.throws(() => parseAssetResponse('mail.claimAvailable', batch));
  const expand = { operationId: 'op', serverTime: 1, replayed: false, outcome: { status: 'committed', resultVersions: [], data: { containerId: 'b', targetStage: 1, capacity: 100 } } };
  assert.throws(() => parseAssetResponse('inventory.expand', expand));
});

test('quotes expose deterministic effects and failure consequences without enhancement probabilities', () => {
  const response = { requestId: 'r', serverTime: 1, versions: [], data: { quoteRef: 'q', serviceKind: 'enhance', configRef: 'prices-v1',
    costs: [{ currency: 'gold', amount: '100' }], materialCosts: [], targetVersions: [],
    displayChanges: [{ kind: 'enhancementLevel', before: '0', after: '1' }], failureConsequences: ['preserve'] } };
  assert.deepEqual(parseAssetQueryResponse('service.quote', response), response);
  assert.throws(() => parseAssetQueryResponse('service.quote', { ...response, data: { ...response.data, successProbability: 0.5 } }));
  assert.equal(parseEquipmentView({ ...equipment(), quality: 'purple', setRef: 'armor30-v1' }).setRef, 'armor30-v1');
});

const brief = { characterId: 'c', classId: 'warrior', characterName: '战士', level: 1 };
const queryViews = {
  'account.get': { characters: [brief], selectedCharacterId: 'c', wallet: { gold: '0', points: '0' }, activeChallengeId: null, openSceneChallengeId: null },
  'character.get': { character: brief, version: 0, equipped: [{ slotId: 'weapon', itemId: 'i' }], skills: [{ skillId: 'cross', level: 1, unlocked: true }], attributes: [], location: { kind: 'inn', anchorId: 'inn' }, stamina: 1, staminaAsOf: 0 },
  'inventory.get': { containerId: 'b', version: 0, kind: 'accountVault', owner: { kind: 'account' }, capacity: 100, unlockStage: null, slots: [] },
  'equipment.get': equipment(),
  'dungeon.options': { dungeonId: 'd', options: [{ difficultyId: 'normal', unlocked: true, canEnter: true, reason: null }] },
  'service.get': { contextId: 'ctx', serviceKind: 'bank', state: 'open', locationRevision: 0, allowedCommands: ['inventory.transfer'] },
  'service.quote': { quoteRef: 'q', serviceKind: 'repair', configRef: 'prices-v1', costs: [], materialCosts: [], targetVersions: [], displayChanges: [], failureConsequences: [] },
  'mail.list': { entries: [{ mailId: 'm', characterId: 'c', createdAt: 0, expiresAt: 100, read: false, attachments: [] }], nextCursor: null },
  'reward.list': { entries: [{ grantId: 'g', itemId: 'i', characterId: 'c', createdAt: 0, state: 'pending' }], nextCursor: null },
  'delivery.summary': { unreadMailCount: 1, pendingCount: 1, asOf: 0 },
  'ranking.list': { entries: [{ character: brief, rank: null, score: { basis: 'intrinsicEquipmentValue', value: '100', scoreConfigRef: 'score-v1', equipmentVersion: 0, scoreReachedAt: 0 } }], ownRank: null, rankAsOf: 1, stale: true, nextCursor: null },
  'operation.get': { status: 'notFound' },
  'configuration.public': { manifestId: 'm', releaseRef: 'release-v1', resources: [{ id: 'weapon', version: 1, hash: 'a'.repeat(64) }] },
};
for (const [query, data] of Object.entries(queryViews)) {
  test(`${query} public response validates its typed view and rejects private fields`, () => {
    const result = { requestId: 'r', serverTime: 1, versions: [], data };
    assert.deepEqual(parseAssetQueryResponse(query, result), result);
    assert.throws(() => parseAssetQueryResponse(query, { ...result, data: { ...data, AppSecret: 'private' } }));
  });
}
