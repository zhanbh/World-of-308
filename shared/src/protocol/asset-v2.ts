import { parseExpected, parseCharacterResponse } from './session-v2.ts';
import { object, optional, nullable, choice, boolean, integer, id, operationId, text, list, union, bounded, wire } from './asset-schema.ts';
import type { Value, Parse } from './asset-schema.ts';
import { resource, encodeResource, time } from '../exact-values.ts';
import { parseRoomResponse, parseSimulationResponse, parseChallengeResponse } from './scene-v2.ts';

export const EQUIPMENT_SLOTS = ['shoulder', 'chest', 'belt', 'pants', 'boots', 'trinket', 'bracelet', 'necklace', 'ring', 'subEquip', 'magicStone', 'earring', 'weapon'] as const;
const slot = choice(...EQUIPMENT_SLOTS);
const currency = choice('gold', 'points');
const serviceKind = choice('bank', 'mailbox', 'shop', 'repair', 'enhance', 'pointsShop');
const containerKind = choice('backpack', 'personalVault', 'accountVault');
const target = union(object({ kind: choice('equipment'), itemId: id }), object({ kind: choice('stack'), stackId: id }));
const batchSelection = list(object({ mailId: id, attachmentId: id }), 20);
const commandParsers = {
  'scene.exitInn': object({ characterId: id, exitAnchorId: id }),
  'service.open': object({ characterId: id, serviceKind, anchorId: id }),
  'service.close': object({ characterId: id, contextId: id }),
  'inventory.transfer': object({ characterId: id, contextId: id, sourceContainerId: id, targetContainerId: id, target, quantity: integer(1, 20) }),
  'inventory.expand': object({ characterId: id, containerId: id, targetStage: integer(1, 4), paymentCurrency: currency, quoteRef: id, contextId: optional(id) }),
  'inventory.organize': object({ characterId: id, direction: choice('forward', 'reverse') }),
  'equipment.equip': object({ characterId: id, itemId: id, targetSlot: slot }),
  'equipment.unequip': object({ characterId: id, itemId: id, slot }),
  'quickslot.assign': object({ characterId: id, slotIndex: integer(0, 2), templateId: nullable(id) }),
  'shop.buy': object({ characterId: id, contextId: id, offerId: id, quantity: integer(1, 20), quoteRef: id }),
  'shop.sell': object({ characterId: id, contextId: id, target, quantity: integer(1, 20), quoteRef: id }),
  'wallet.exchange': object({ characterId: id, fromCurrency: currency, exchangeUnits: integer(1), quoteRef: id, contextId: optional(id) }),
  'equipment.repair': object({ characterId: id, contextId: id, target: union(object({ kind: choice('single'), itemId: id }), object({ kind: choice('allWorn') })), quoteRef: id }),
  'equipment.enhance': object({ characterId: id, contextId: id, itemId: id, targetLevel: integer(1, 20), useMemento: boolean, quoteRef: id }),
  'mail.markRead': object({ characterId: id, contextId: id, mailId: id }),
  'mail.claimAttachment': object({ characterId: id, contextId: id, mailId: id, attachmentId: id }),
  'mail.claimAvailable': union(object({ characterId: id, contextId: id, cursor: nullable(text(512, 1)), batchIntentId: operationId }), object({ characterId: id, contextId: id, selection: batchSelection, batchIntentId: operationId })),
  'mail.delete': object({ characterId: id, contextId: id, mailId: id }),
  'reward.claim': object({ characterId: id, contextId: id, grantId: id }),
};
export type AssetCommandName = keyof typeof commandParsers;
export type AssetPayloads = { [K in AssetCommandName]: Value<typeof commandParsers[K]> };
export type AssetCommand = { [K in AssetCommandName]: { protocolVersion: 2; command: K; operationId: string; sessionId: string; sessionEpoch: number; expected: ReturnType<typeof parseExpected>; payload: AssetPayloads[K] } }[AssetCommandName];
const commandEnvelope = object({ protocolVersion: choice(2), command: id, operationId, sessionId: id, sessionEpoch: integer(1), expected: parseExpected, payload: (value: unknown) => value });
export function parseAssetCommand(value: unknown): AssetCommand {
  const r = commandEnvelope(value);
  if (!Object.hasOwn(commandParsers, r.command)) throw new TypeError('UNSUPPORTED_COMMAND');
  const command = r.command as AssetCommandName;
  const payload = commandParsers[command](r.payload);
  if ((command === 'inventory.transfer' || command === 'shop.sell') && 'target' in payload && 'quantity' in payload && payload.target && typeof payload.target === 'object' && 'kind' in payload.target && payload.target.kind === 'equipment' && payload.quantity !== 1) throw new TypeError('INVALID_EQUIPMENT_QUANTITY');
  if (command === 'inventory.transfer' && 'sourceContainerId' in payload && 'targetContainerId' in payload && payload.sourceContainerId === payload.targetContainerId) throw new TypeError('SAME_CONTAINER');
  return bounded(() => ({ ...r, command, payload } as AssetCommand), 16384)(null);
}
export const decodeAssetCommand = (textValue: string): AssetCommand => parseAssetCommand(wire(textValue, 16384));

const serviceIntent = (value: unknown) => {
  const r = object({ command: id, payload: (p: unknown) => p })(value);
  if (!['inventory.expand', 'shop.buy', 'shop.sell', 'wallet.exchange', 'equipment.repair', 'equipment.enhance'].includes(r.command)) throw new TypeError('INVALID_SERVICE_INTENT');
  const command = r.command as AssetCommandName;
  return { command, payload: commandParsers[command](r.payload) };
};
const queryParsers = {
  'bank.get': object({ characterId: id, contextId: id, vaultKind: choice('personalVault', 'accountVault') }),
  'bank.itemVersion': object({ characterId: id, contextId: id, containerId: id, itemId: id }),
  'inventory.expansionQuote': object({ characterId: id, containerId: id, targetStage: integer(1, 4), contextId: optional(id) }),
  'account.get': object({}),
  'character.get': object({ characterId: id }),
  'inventory.get': object({ characterId: id, containerKind, contextId: optional(id) }),
  'quickslot.get': object({ characterId: id }),
  'equipment.get': object({ characterId: id, itemId: id }),
  'dungeon.options': object({ characterId: id, dungeonId: id }),
  'service.get': object({ characterId: id, serviceContextId: id }),
  'service.quote': object({ characterId: id, contextId: id, serviceIntent }),
  'mail.list': object({ characterId: id, contextId: id, cursor: nullable(text(512, 1)), pageRequest: integer(1, 100) }),
  'reward.list': object({ characterId: id, contextId: id, cursor: nullable(text(512, 1)), pageRequest: integer(1, 100) }),
  'delivery.summary': object({ characterId: id }),
  'ranking.list': object({ scope: choice('all', 'warrior', 'hunter'), cursor: nullable(text(512, 1)), pageRequest: integer(1, 50) }),
  'operation.get': object({ operationId }),
  'configuration.public': object({ manifestId: id }),
};
export type AssetQueryName = keyof typeof queryParsers;
export type AssetQuery = { [K in AssetQueryName]: { protocolVersion: 2; query: K; requestId: string; sessionId: string; sessionEpoch: number; payload: Value<typeof queryParsers[K]> } }[AssetQueryName];
export function parseAssetQuery(value: unknown): AssetQuery {
  const r = object({ protocolVersion: choice(2), query: id, requestId: operationId, sessionId: id, sessionEpoch: integer(1), payload: (p: unknown) => p })(value);
  if (!Object.hasOwn(queryParsers, r.query)) throw new TypeError('UNSUPPORTED_QUERY');
  const query = r.query as AssetQueryName;
  const payload = queryParsers[query](r.payload);
  if (query === 'inventory.get' && 'containerKind' in payload && payload.containerKind !== 'backpack' && (!('contextId' in payload) || !payload.contextId)) throw new TypeError('BANK_CONTEXT_REQUIRED');
  if (query === 'service.quote') {
    const quote = payload as Value<typeof queryParsers['service.quote']>;
    const intent = quote.serviceIntent.payload as { characterId: string; contextId?: string };
    if (intent.characterId !== quote.characterId || (intent.contextId !== undefined && intent.contextId !== quote.contextId)) throw new TypeError('SERVICE_INTENT_MISMATCH');
  }
  return bounded(() => ({ ...r, query, payload } as AssetQuery), 16384)(null);
}
export const decodeAssetQuery = (textValue: string): AssetQuery => parseAssetQuery(wire(textValue, 16384));

const resourceWire = (value: unknown): string => { if (typeof value !== 'string') throw new TypeError('INVALID_RESOURCE_WIRE'); return encodeResource(resource(value)); };
const binding = union(object({ kind: choice('none') }), object({ kind: choice('account') }), object({ kind: choice('character'), characterId: id }));
// Internal account identifiers and random seeds are deliberately absent from public bindings.
const sourceLocator = union(object({ kind: choice('roomDrop'), roomId: id, dropId: id }), object({ kind: choice('mailAttachment'), mailId: id, attachmentId: id }), object({ kind: choice('grant'), grantId: id }), object({ kind: choice('challengeClear'), challengeId: id, ordinal: integer(0, 55) }));
const durability = union(object({ wearEnabled: choice(true), current: integer(), max: integer(1), policyRef: id }), object({ wearEnabled: choice(false), current: choice(null), max: choice(null), policyRef: id }));
const location = union(object({ kind: choice('container'), containerId: id }), object({ kind: choice('equipped'), characterId: id, slotId: slot }), object({ kind: choice('pending'), grantId: id }), object({ kind: choice('retired'), reason: choice('destroyed', 'sold', 'expired'), sourceRef: id }));
const quality = choice('white', 'green', 'blue', 'purple', 'orange');
const itemLevel = choice(10, 15, 20, 25, 30);
const affix = object({ statId: id, value: resourceWire });
const equipmentParser = object({ itemId: id, version: integer(), templateRef: id, slotKind: slot, itemLevel, quality, rolledAffixes: list(affix, 16), setRef: optional(id), enhancementLevel: integer(0, 20), binding, durability, location, lifecycle: choice('active', 'destroyed', 'sold', 'expired'), source: sourceLocator });
export type EquipmentView = Value<typeof equipmentParser>;
export function parseEquipmentView(value: unknown): EquipmentView {
  const e = equipmentParser(value);
  const wears = ['weapon', 'shoulder', 'chest', 'belt', 'pants', 'boots', 'earring'].includes(e.slotKind);
  if (e.durability.wearEnabled !== wears || (e.durability.wearEnabled && e.durability.current > e.durability.max)) throw new TypeError('INVALID_DURABILITY');
  if (!['weapon', 'earring'].includes(e.slotKind) && e.enhancementLevel !== 0) throw new TypeError('INVALID_ENHANCEMENT');
  if (e.location.kind === 'equipped' && e.location.slotId !== e.slotKind) throw new TypeError('INVALID_EQUIPMENT_SLOT');
  if ((e.lifecycle === 'active') === (e.location.kind === 'retired')) throw new TypeError('INVALID_LIFECYCLE');
  const affixIds = e.rolledAffixes.map(a => a.statId);
  if (new Set(affixIds).size !== affixIds.length) throw new TypeError('DUPLICATE_AFFIX');
  return e;
}
const slotEntry = union(object({ kind: choice('equipment'), itemId: id, sortHeader: object({ itemLevel, quality, slotKind: slot }) }), object({ kind: choice('stack'), stackId: id, templateRef: id, quantity: integer(1, 20), binding, traceRef: id }));
const containerParser = object({ containerId: id, version: integer(), kind: containerKind, owner: union(object({ kind: choice('character'), characterId: id }), object({ kind: choice('account') })), capacity: integer(20, 100), unlockStage: nullable(integer(0, 4)), slots: list(object({ index: integer(0, 99), entry: slotEntry }), 100) });
export type ContainerView = Value<typeof containerParser>;
export function parseContainerView(value: unknown): ContainerView {
  const c = containerParser(value);
  if (c.kind === 'accountVault' ? c.capacity !== 100 || c.unlockStage !== null || c.owner.kind !== 'account' : c.unlockStage === null || c.capacity !== 20 + c.unlockStage * 20 || c.owner.kind !== 'character') throw new TypeError('INVALID_CONTAINER_CAPACITY');
  const indexes = new Set<number>(), ids = new Set<string>();
  for (const s of c.slots) {
    const entryId = s.entry.kind === 'equipment' ? s.entry.itemId : s.entry.stackId;
    if (indexes.has(s.index) || ids.has(entryId) || s.index >= c.capacity) throw new TypeError('INVALID_CONTAINER_SLOT');
    indexes.add(s.index); ids.add(entryId);
    if (c.kind === 'accountVault' && s.entry.kind === 'stack' && s.entry.binding.kind === 'character') throw new TypeError('BINDING_RESTRICTED');
  }
  return c;
}
const holdingEntry = object({ collectionKey: id, permanentCount: integer(), mailLatestExpiryAt: nullable(time) });
const holdingsParser = union(object({ scope: choice('character'), characterId: id, revision: integer(), domainRef: id, entries: list(holdingEntry, 64) }), object({ scope: choice('account'), revision: integer(), domainRef: id, entries: list(holdingEntry, 64) }));
export function parseHoldingsView(value: unknown): Value<typeof holdingsParser> {
  const h = holdingsParser(value);
  if (new Set(h.entries.map(e => e.collectionKey)).size !== h.entries.length || (h.scope === 'account' && h.entries.some(e => e.mailLatestExpiryAt !== null))) throw new TypeError('INVALID_HOLDINGS');
  return bounded(() => h, 16384)(null);
}

const publicError = choice('AUTH_REQUIRED', 'SESSION_REVOKED', 'INVALID_ARGUMENT', 'UNSUPPORTED_PROTOCOL', 'OPERATION_MISMATCH', 'NOT_FOUND_OR_FORBIDDEN', 'VERSION_CONFLICT', 'CONFIG_NOT_READY', 'QUOTE_CHANGED', 'CONTEXT_INVALID', 'LOCATION_NOT_ALLOWED', 'CURRENCY_NOT_ENOUGH', 'MATERIAL_NOT_ENOUGH', 'CONTAINER_FULL', 'BAG_FULL', 'BINDING_RESTRICTED', 'ITEM_NOT_ELIGIBLE', 'UNLOCK_STAGE_MISMATCH', 'MAIL_EXPIRED', 'UNCLAIMED_ATTACHMENTS', 'ALREADY_DELIVERED', 'ACTIVE_CHALLENGE_EXISTS', 'SCENE_STILL_OPEN', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE');
const resultParsers = {
  'scene.exitInn': object({ characterId: id, anchorId: id, locationRevision: integer() }),
  'service.open': object({ contextId: id, serviceKind, locationRevision: integer() }),
  'service.close': object({ contextId: id, closed: choice(true) }),
  'inventory.transfer': object({ sourceContainerId: id, targetContainerId: id, transferredQuantity: integer(1, 20) }),
  'inventory.expand': object({ containerId: id, targetStage: integer(1, 4), capacity: choice(40, 60, 80, 100) }),
  'inventory.organize': object({ containerId: id, direction: choice('forward', 'reverse'), mergedStacks: integer(0, 100) }),
  'equipment.equip': object({ itemId: id, slot }),
  'equipment.unequip': object({ itemId: id, slot }),
  'quickslot.assign': object({ slotIndex: integer(0, 2), templateId: nullable(id) }),
  'shop.buy': object({ deliveredQuantity: integer(1, 20), sourceRef: id }),
  'shop.sell': object({ soldQuantity: integer(1, 20), sourceRef: id }),
  'wallet.exchange': object({ fromCurrency: currency, exchangeUnits: integer(1) }),
  'equipment.repair': object({ repairedItemIds: list(id, 7), chargedGold: resourceWire }),
  'equipment.enhance': object({ itemId: id, targetLevel: integer(1, 20), result: choice('success', 'failed', 'destroyed'), deliveryRefs: list(id, 8) }),
  'mail.markRead': object({ mailId: id, read: choice(true) }),
  'mail.claimAttachment': object({ mailId: id, attachmentId: id, deliveredQuantity: integer(1, 20) }),
  'mail.claimAvailable': object({ batchIntentId: operationId, state: choice('pending', 'partial', 'completed'), items: list(object({ childOperationId: operationId, mailId: id, attachmentId: id, status: choice('committed', 'rejected', 'unknown'), deliveredQuantity: integer(0, 20) }), 4), nextCursor: nullable(text(512, 1)) }),
  'mail.delete': object({ mailId: id, deleted: choice(true) }),
  'reward.claim': object({ grantId: id, itemId: id, state: choice('delivered') }),
};
type AssetFailure = { status: 'unknown'; code: 'RESULT_UNKNOWN' } | { status: 'rejected'; code: Value<typeof publicError>; availableCapacity?: number };
export type AssetResponse<K extends AssetCommandName = AssetCommandName> = { operationId: string; serverTime: ReturnType<typeof time>; replayed: boolean;
  outcome: AssetFailure | { status: 'committed'; data: Value<typeof resultParsers[K]>; resultVersions: ReturnType<typeof parseExpected> } };
export function parseAssetResponse<K extends AssetCommandName>(command: K, value: unknown): AssetResponse<K> {
  if (!Object.hasOwn(resultParsers, command)) throw new TypeError('UNSUPPORTED_COMMAND');
  const outcome = union(object({ status: choice('unknown'), code: choice('RESULT_UNKNOWN') }), object({ status: choice('rejected'), code: publicError, availableCapacity: optional(integer(0, 2000)) }), object({ status: choice('committed'), data: resultParsers[command], resultVersions: parseExpected }));
  const result = bounded(object({ operationId, serverTime: time, replayed: boolean, outcome }), 16384)(value) as AssetResponse<K>;
  if (result.outcome.status === 'rejected' && result.outcome.availableCapacity !== undefined && (command !== 'inventory.transfer' || !['BAG_FULL', 'CONTAINER_FULL'].includes(result.outcome.code))) throw new TypeError('INVALID_CAPACITY_HINT');
  if (command === 'inventory.expand' && result.outcome.status === 'committed') {
    const data = result.outcome.data as Value<typeof resultParsers['inventory.expand']>;
    if (data.capacity !== 20 + 20 * data.targetStage) throw new TypeError('INVALID_CONTAINER_CAPACITY');
  }
  return result;
}
const wallet = object({ gold: resourceWire, points: resourceWire });
const characterBrief = object({ characterId: id, classId: choice('warrior', 'hunter'), characterName: text(12, 1), level: integer(1, 30) });
const equippedEntry = object({ slotId: slot, itemId: id });
const score = object({ basis: choice('intrinsicEquipmentValue'), value: resourceWire, scoreConfigRef: id, equipmentVersion: integer(), scoreReachedAt: time });
const quote = object({ quoteRef: id, serviceKind, configRef: id, costs: list(object({ currency, amount: resourceWire }), 2), materialCosts: list(object({ templateRef: id, quantity: integer(1, 20) }), 8), targetVersions: parseExpected,
  displayChanges: list(object({ kind: choice('attackPower', 'enhancementLevel', 'capacity', 'durability'), before: resourceWire, after: resourceWire }), 16), failureConsequences: list(choice('preserve', 'downgrade', 'destroy', 'consumeMemento'), 4) });
const mailAttachment = object({ attachmentId: id, kind: choice('equipment', 'stack'), templateRef: id, quantityGranted: integer(1, 20), quantityClaimed: integer(0, 20), binding });
const mailEntry = object({ mailId: id, characterId: id, createdAt: time, expiresAt: time, read: boolean, attachments: list(mailAttachment, 8) });
const pendingEntry = object({ grantId: id, itemId: id, characterId: id, createdAt: time, state: choice('pending', 'delivered') });
const originalResult = (value: unknown) => {
  const r = object({ status: choice('found'), command: id, result: (v: unknown) => v })(value);
  if (r.command === 'character.create' || r.command === 'character.select') {
    const result = parseCharacterResponse(r.result);
    if (result.command !== r.command) throw new TypeError('OPERATION_COMMAND_MISMATCH');
    return { status: r.status, command: r.command, result };
  }
  if (['simulation.submit', 'challenge.prepareRoom', 'challenge.activateRoom', 'challenge.start', 'challenge.revive', 'challenge.leave', 'drop.collect'].includes(r.command)) {
    const result = r.command === 'simulation.submit' ? parseSimulationResponse(r.result) : ['challenge.prepareRoom', 'challenge.activateRoom'].includes(r.command) ? parseRoomResponse(r.result) : parseChallengeResponse(r.result);
    if (result.command !== r.command) throw new TypeError('OPERATION_COMMAND_MISMATCH');
    return { status: r.status, command: r.command, result };
  }
  if (!Object.hasOwn(resultParsers, r.command)) throw new TypeError('UNSUPPORTED_ORIGINAL_COMMAND');
  const command = r.command as AssetCommandName;
  return { status: r.status, command, result: parseAssetResponse(command, r.result) };
};
const queryResults = {
  'bank.get': object({ characterId: id, characterVersion: integer(), backpack: parseContainerView, vault: parseContainerView, wallet: object({ walletId: id, version: integer(), gold: resourceWire, points: resourceWire }) }),
  'bank.itemVersion': object({ itemId: id, version: integer() }),
  'inventory.expansionQuote': object({ containerId: id, targetStage: integer(1, 4), nextCapacity: choice(40, 60, 80, 100), configRef: object({ id, version: integer(1) }), quoteRef: id, costs: list(object({ currency, amount: resourceWire }), 2) }),
  'account.get': object({ characters: list(characterBrief, 2), selectedCharacterId: nullable(id), wallet, activeChallengeId: nullable(id), openSceneChallengeId: nullable(id) }),
  'character.get': object({ character: characterBrief, version: integer(), equipped: list(equippedEntry, 13), skills: list(object({ skillId: id, level: integer(1, 30), unlocked: boolean }), 4), attributes: list(affix, 32), location: object({ kind: choice('inn', 'town', 'dungeon'), anchorId: id }), stamina: integer(), staminaAsOf: time }),
  'inventory.get': parseContainerView,
  'quickslot.get': object({ characterId: id, version: integer(), slots: list(object({ slotIndex: integer(0, 2), templateId: nullable(id), quantity: integer(0, 2000) }), 3) }),
  'equipment.get': parseEquipmentView,
  'dungeon.options': object({ dungeonId: id, options: list(object({ difficultyId: id, unlocked: boolean, canEnter: boolean, reason: nullable(choice('LEVEL_REQUIRED', 'WEAPON_REQUIRED', 'WEAPON_BROKEN', 'STAMINA_NOT_ENOUGH', 'ACTIVE_CHALLENGE_EXISTS', 'SCENE_STILL_OPEN')) }), 4) }),
  'service.get': object({ contextId: id, serviceKind, state: choice('open', 'closed', 'invalid'), locationRevision: integer(), allowedCommands: list(choice(...Object.keys(commandParsers) as AssetCommandName[]), 19) }),
  'service.quote': quote,
  'mail.list': object({ entries: list(mailEntry, 100), nextCursor: nullable(text(512, 1)) }),
  'reward.list': object({ entries: list(pendingEntry, 100), nextCursor: nullable(text(512, 1)) }),
  'delivery.summary': object({ unreadMailCount: integer(), pendingCount: integer(), asOf: time }),
  'ranking.list': object({ entries: list(object({ character: characterBrief, rank: nullable(integer(1)), score }), 50), ownRank: nullable(integer(1)), rankAsOf: time, stale: boolean, nextCursor: nullable(text(512, 1)) }),
  'operation.get': union(object({ status: choice('notFound') }), originalResult),
  'configuration.public': object({ manifestId: id, releaseRef: id, resources: list(object({ id, version: integer(1), hash: text(64, 43) }), 64) }),
};
export type AssetQueryResponse<K extends AssetQueryName = AssetQueryName> =
  | { requestId: string; serverTime: ReturnType<typeof time>; versions: ReturnType<typeof parseExpected>; data: Value<typeof queryResults[K]> }
  | { requestId: string; serverTime: ReturnType<typeof time>; error: { code: Value<typeof publicError> } };
export function parseAssetQueryResponse<K extends AssetQueryName>(query: K, value: unknown): AssetQueryResponse<K> {
  if (!Object.hasOwn(queryResults, query)) throw new TypeError('UNSUPPORTED_QUERY');
  const result = bounded(union(object({ requestId: operationId, serverTime: time, versions: parseExpected, data: queryResults[query] }), object({ requestId: operationId, serverTime: time, error: object({ code: publicError }) })), query === 'bank.get' ? 131072 : 65536)(value) as AssetQueryResponse<K>;
  if ('data' in result && query === 'bank.get') {
    const d = result.data as Value<typeof queryResults['bank.get']>;
    if (d.backpack.kind !== 'backpack' || d.vault.kind === 'backpack' || d.backpack.owner.kind !== 'character' || d.backpack.owner.characterId !== d.characterId || (d.vault.owner.kind === 'character' && d.vault.owner.characterId !== d.characterId)) throw new TypeError('INVALID_BANK_SCOPE');
    const expected = [{ kind: 'character', id: d.characterId, version: d.characterVersion }, { kind: 'container', id: d.backpack.containerId, version: d.backpack.version }, { kind: 'container', id: d.vault.containerId, version: d.vault.version }, { kind: 'wallet', id: d.wallet.walletId, version: d.wallet.version }];
    if (result.versions.length !== 4 || expected.some(e => !result.versions.some(v => v.kind === e.kind && v.id === e.id && v.version === e.version))) throw new TypeError('INVALID_BANK_VERSIONS');
  }
  if ('data' in result && query === 'inventory.expansionQuote') {
    const d = result.data as Value<typeof queryResults['inventory.expansionQuote']>;
    if (d.nextCapacity !== 20 + d.targetStage * 20 || d.costs.length === 0 || new Set(d.costs.map(c => c.currency)).size !== d.costs.length || d.costs.some(c => c.amount === '0')) throw new TypeError('INVALID_EXPANSION_QUOTE');
  }
  if ('data' in result && query === 'quickslot.get') {
    const data = result.data as Value<typeof queryResults['quickslot.get']>;
    if (data.slots.length !== 3 || data.slots.some((s, i) => s.slotIndex !== i || (s.templateId === null && s.quantity !== 0))) throw new TypeError('INVALID_QUICKSLOTS');
  }
  if ('data' in result && query === 'mail.list') {
    const data = result.data as Value<typeof queryResults['mail.list']>;
    for (const mail of data.entries) {
      if (mail.expiresAt <= mail.createdAt || new Set(mail.attachments.map(a => a.attachmentId)).size !== mail.attachments.length || mail.attachments.some(a => a.quantityClaimed > a.quantityGranted || (a.kind === 'equipment' && a.quantityGranted !== 1))) throw new TypeError('INVALID_MAIL_PROGRESS');
    }
  }
  if ('data' in result && query === 'character.get') {
    const data = result.data as Value<typeof queryResults['character.get']>;
    if (new Set(data.equipped.map(e => e.slotId)).size !== data.equipped.length || new Set(data.equipped.map(e => e.itemId)).size !== data.equipped.length) throw new TypeError('DUPLICATE_EQUIPMENT');
  }
  return result;
}
export function encodeAssetRequest(request: AssetCommand | AssetQuery): string {
  const query = request && typeof request === 'object' && Object.hasOwn(request, 'query');
  return JSON.stringify(query ? parseAssetQuery(request) : parseAssetCommand(request));
}
export function decodeAssetResponse(request: AssetCommand | AssetQuery, textValue: string): AssetResponse | AssetQueryResponse {
  if (request && typeof request === 'object' && Object.hasOwn(request, 'query')) {
    const intent = parseAssetQuery(request);
    const response = parseAssetQueryResponse(intent.query, wire(textValue, intent.query === 'bank.get' ? 131072 : 65536));
    if (response.requestId !== intent.requestId) throw new TypeError('REQUEST_MISMATCH');
    if (intent.query === 'operation.get' && 'data' in response) {
      const data = response.data as Value<typeof queryResults['operation.get']>;
      if (data.status === 'found' && data.result.operationId !== intent.payload.operationId) throw new TypeError('OPERATION_MISMATCH');
    }
    return response;
  }
  const intent = parseAssetCommand(request);
  const response = parseAssetResponse(intent.command, wire(textValue, 16384));
  if (response.operationId !== intent.operationId) throw new TypeError('OPERATION_MISMATCH');
  return response;
}
