import { parseAssetCommand, parseAssetQuery, parseAssetResponse, parseAssetQueryResponse, parseContainerView } from '../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetResponse, AssetQueryResponse, ContainerView } from '../../../shared/src/protocol/asset-v2.ts';
import { time } from '../../../shared/src/exact-values.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import { identityKey, isVerifiedIdentity, loginKey } from '../identity/identity-v2.ts';
import type { LoginAccount, LoginSession, IdentityLink } from '../identity/login-model.ts';
import type { CharacterEntity, ContainerEntity } from '../character/character-model.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable, canonical } from '../ports/store.ts';
import { organizeBackpack, validateBackpack } from './organize.ts';

export type InventoryCommand = Extract<AssetCommand, { command: 'inventory.organize' | 'quickslot.assign' }>;
import type { InventoryCatalog } from './organize.ts';
export type { InventoryCatalog } from './organize.ts';
interface Receipt { schemaVersion: 2; id: string; accountId: string; command: InventoryCommand['command']; tuple: string; result: AssetResponse; }
class Refusal extends Error {}
function requireValue(value: unknown, code: string): asserts value { if (!value) throw new Refusal(code); }
function increment(value: number): number { requireValue(Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(value + 1), 'CONFIG_NOT_READY'); return value + 1; }
function budget(value: unknown, max: number): void { requireValue(new TextEncoder().encode(JSON.stringify(value)).length <= max, 'CONFIG_NOT_READY'); }

/** Trusted identity comes from the composition root. No caller accountId or principal is accepted. */
export class InventoryService {
  private readonly options: { store: Store; clock: Clock; identity: IdentityPort; catalog: InventoryCatalog };
  constructor(options: { store: Store; clock: Clock; identity: IdentityPort; catalog: InventoryCatalog }) {
    this.options = { ...options, catalog: structuredClone(options.catalog) };
  }
  private async caller(): Promise<{ id: string; tuple: string }> {
    const identity = await this.options.identity.verify();
    requireValue(isVerifiedIdentity(identity), 'AUTH_REQUIRED');
    return { id: await identityKey(identity), tuple: JSON.stringify([identity.provider, identity.appId, identity.subject, identity.environment]) };
  }
  private async authorize(tx: Transaction, caller: { id: string; tuple: string }, sessionId: string, epoch: number): Promise<LoginAccount> {
    const link = await tx.get<IdentityLink>(caller.id);
    requireValue(link?.schemaVersion === 2 && link.id === caller.id && link.tuple === caller.tuple, 'AUTH_REQUIRED');
    const session = await tx.get<LoginSession>(sessionId);
    const account = await tx.get<LoginAccount>(link.accountId);
    requireValue(account && account.schemaVersion === 2 && account.id === link.accountId && session?.schemaVersion === 2 && session.id === sessionId && session.accountId === account.id && session.status === 'active' && session.epoch === epoch && account.currentSessionId === sessionId && account.sessionEpoch === epoch, 'SESSION_REVOKED');
    return account;
  }
  private async character(tx: Transaction, account: LoginAccount, id: string): Promise<CharacterEntity> {
    const character = await tx.get<CharacterEntity>(id);
    requireValue(character?.schemaVersion === 2 && character.id === id && character.accountId === account.id && Object.values(account.characterIdsByClass).includes(id), 'NOT_FOUND_OR_FORBIDDEN');
    requireValue(account.selectedCharacterId === id, 'NOT_FOUND_OR_FORBIDDEN');
    return character;
  }
  private async bag(tx: Transaction, account: LoginAccount, character: CharacterEntity): Promise<ContainerEntity> {
    const bag = await tx.get<ContainerEntity>(character.backpackId);
    requireValue(bag?.schemaVersion === 2 && bag.id === character.backpackId && bag.kind === 'backpack' && bag.accountId === account.id && bag.characterId === character.id, 'NOT_FOUND_OR_FORBIDDEN');
    // Pure validation includes bounds/headers/quantity/bindings; no old ancestor or equipment scans.
    validateBackpack(bag, this.options.catalog);
    budget(bag, 65536);
    return bag;
  }
  private view(bag: ContainerEntity): ContainerView {
    return parseContainerView({ containerId: bag.id, version: bag.version, kind: 'backpack', owner: { kind: 'character', characterId: bag.characterId }, capacity: bag.capacity, unlockStage: bag.stage,
      slots: Object.entries(bag.slots).map(([index, entry]) => ({ index: Number(index), entry: entry.kind === 'equipment' ? entry : { ...entry, templateRef: entry.templateRef.id, binding: entry.binding.kind === 'character' ? { kind: 'character', characterId: entry.binding.characterId } : { kind: entry.binding.kind } } })) });
  }
  async execute(value: unknown): Promise<AssetResponse> {
    // Structural failures reject at the public decoder, before reading any identity or assets.
    const parsed = parseAssetCommand(value);
    if (parsed.command !== 'inventory.organize' && parsed.command !== 'quickslot.assign') throw new TypeError('UNSUPPORTED_COMMAND');
    const command: InventoryCommand = parsed;
    const reply = (outcome: unknown, replayed = false) => parseAssetResponse(command.command, { operationId: command.operationId, serverTime: time(this.options.clock.now()), replayed, outcome });
    let caller: Awaited<ReturnType<InventoryService['caller']>>;
    try { caller = await this.caller(); } catch { return reply({ status: 'rejected', code: 'AUTH_REQUIRED' }); }
    try {
      return await this.options.store.run(async tx => {
        const account = await this.authorize(tx, caller, command.sessionId, command.sessionEpoch);
        const opId = await loginKey('assetOp', [account.id, command.operationId]);
        const journalId = await loginKey('assetJournal', [account.id, command.operationId]);
        const tuple = canonical(command);
        const previous = await tx.get<Receipt>(opId);
        if (previous) {
          requireValue(previous.schemaVersion === 2 && previous.accountId === account.id && previous.id === opId, 'CONFIG_NOT_READY');
          if (previous.tuple !== tuple) return reply({ status: 'rejected', code: 'OPERATION_MISMATCH' });
          return parseAssetResponse(command.command, { ...previous.result, serverTime: time(this.options.clock.now()), replayed: true });
        }
        const priorJournal = await tx.get(journalId);
        // Never overwrite an orphan journal and consume the same intent twice.
        if (priorJournal !== undefined) return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
        let outcome: unknown;
        let writes: Array<[string, unknown]> = [];
        try {
          const character = await this.character(tx, account, command.payload.characterId);
          const bag = await this.bag(tx, account, character);
          const expectedObjects = command.command === 'inventory.organize' ? [{ kind: 'character', id: character.id, version: character.version }, { kind: 'container', id: bag.id, version: bag.version }] : [{ kind: 'character', id: character.id, version: character.version }];
          requireValue(command.expected.length === expectedObjects.length && expectedObjects.every(e => command.expected.some(v => v.kind === e.kind && v.id === e.id)), 'INVALID_ARGUMENT');
          requireValue(expectedObjects.every(e => command.expected.some(v => v.kind === e.kind && v.id === e.id && v.version === e.version)), 'VERSION_CONFLICT');
          const now = time(this.options.clock.now());
          let changes: unknown;
          if (command.command === 'inventory.organize') {
            const organized = organizeBackpack(bag, command.payload.direction, this.options.catalog, journalId);
            const next = { ...bag, slots: organized.slots, version: increment(bag.version), updatedAt: now };
            budget(next, 65536);
            writes.push([bag.id, next]);
            changes = { containerId: bag.id, beforeVersion: bag.version, afterVersion: next.version, beforePositions: Object.entries(bag.slots).map(([index, s]) => [Number(index), s.kind === 'stack' ? s.stackId : s.itemId]), afterPositions: Object.entries(next.slots).map(([index, s]) => [Number(index), s.kind === 'stack' ? s.stackId : s.itemId]), lineage: organized.lineage };
            outcome = { status: 'committed', data: { containerId: bag.id, direction: command.payload.direction, mergedStacks: organized.mergedStacks }, resultVersions: [{ kind: 'container', id: bag.id, version: next.version }, { kind: 'character', id: character.id, version: character.version }] };
          } else {
            requireValue(Array.isArray(character.quickSlots) && character.quickSlots.length === 3 && character.quickSlots.every(s => s === null || typeof s === 'string'), 'CONFIG_NOT_READY');
            const { slotIndex, templateId } = command.payload;
            if (templateId !== null) {
              const template = Object.hasOwn(this.options.catalog, templateId) ? this.options.catalog[templateId] : undefined;
              requireValue(template?.kind === 'consumable' && template.quickAssignable && templateId !== 'resurrection-emblem' && !templateId.includes('resurrection-emblem'), 'ITEM_NOT_ELIGIBLE');
              requireValue(character.quickSlots[slotIndex] === templateId || Object.values(bag.slots).some(s => s.kind === 'stack' && s.templateRef.id === templateId), 'ITEM_NOT_ELIGIBLE');
            }
            const next = { ...character, quickSlots: [...character.quickSlots], version: increment(character.version), updatedAt: now };
            next.quickSlots[slotIndex] = templateId;
            writes.push([character.id, next]);
            changes = { characterId: character.id, before: character.quickSlots, after: next.quickSlots };
            outcome = { status: 'committed', data: { slotIndex, templateId }, resultVersions: [{ kind: 'character', id: character.id, version: next.version }] };
          }
          const journal = { schemaVersion: 2, id: journalId, accountId: account.id, characterId: character.id, operationId: command.operationId, command: command.command, changes, createdAt: now };
          budget(journal, 131072);
          writes.push([account.id, { ...account, writeRevision: increment(account.writeRevision), updatedAt: now }], [journalId, journal]);
        } catch (error) {
          if (error instanceof Refusal || (error instanceof Error && ['CONFIG_NOT_READY', 'ITEM_NOT_ELIGIBLE'].includes(error.message))) {
            outcome = { status: 'rejected', code: (error as Error).message }; writes = [];
          } else throw error;
        }
        const result = reply(outcome);
        const receipt = { schemaVersion: 2 as const, id: opId, accountId: account.id, command: command.command, tuple, result };
        budget(receipt, 16384);
        for (const [id, entity] of writes) tx.set(id, entity);
        tx.set(opId, receipt);
        return result;
      });
    } catch (error) {
      if (error instanceof CommitUnknown) return reply({ status: 'unknown', code: 'RESULT_UNKNOWN' });
      if (error instanceof Refusal) return reply({ status: 'rejected', code: error.message });
      if (error instanceof StoreUnavailable) return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
      throw error;
    }
  }
  async query(value: unknown): Promise<AssetQueryResponse> {
    const query = parseAssetQuery(value);
    if (!['inventory.get', 'quickslot.get', 'operation.get'].includes(query.query)) throw new TypeError('UNSUPPORTED_QUERY');
    const reply = (body: unknown) => parseAssetQueryResponse(query.query, { requestId: query.requestId, serverTime: time(this.options.clock.now()), ...body as object });
    let caller: Awaited<ReturnType<InventoryService['caller']>>;
    try { caller = await this.caller(); } catch { return reply({ error: { code: 'AUTH_REQUIRED' } }); }
    try {
      return await this.options.store.run(async tx => {
        const account = await this.authorize(tx, caller, query.sessionId, query.sessionEpoch);
        if (query.query === 'operation.get') {
          const original = await tx.get<Receipt>(await loginKey('assetOp', [account.id, query.payload.operationId]));
          if (!original) return reply({ versions: [], data: { status: 'notFound' } });
          requireValue(original.accountId === account.id && original.schemaVersion === 2, 'CONFIG_NOT_READY');
          return reply({ versions: [], data: { status: 'found', command: original.command, result: original.result } });
        }
        if (query.query !== 'inventory.get' && query.query !== 'quickslot.get') throw new TypeError('UNSUPPORTED_QUERY');
        const character = await this.character(tx, account, query.payload.characterId);
        const bag = await this.bag(tx, account, character);
        if (query.query === 'inventory.get') {
          requireValue(query.payload.containerKind === 'backpack', 'NOT_FOUND_OR_FORBIDDEN');
          return reply({ versions: [{ kind: 'container', id: bag.id, version: bag.version }], data: this.view(bag) });
        }
        requireValue(Array.isArray(character.quickSlots) && character.quickSlots.length === 3, 'CONFIG_NOT_READY');
        const slots = character.quickSlots.map((templateId, slotIndex) => ({ slotIndex, templateId, quantity: templateId === null ? 0 : Object.values(bag.slots).reduce((n, s) => n + (s.kind === 'stack' && s.templateRef.id === templateId ? s.quantity : 0), 0) }));
        return reply({ versions: [{ kind: 'character', id: character.id, version: character.version }, { kind: 'container', id: bag.id, version: bag.version }], data: { characterId: character.id, version: character.version, slots } });
      });
    } catch (error) {
      if (error instanceof Refusal || (error instanceof Error && ['CONFIG_NOT_READY', 'ITEM_NOT_ELIGIBLE'].includes(error.message))) return reply({ error: { code: (error as Error).message } });
      if (error instanceof StoreUnavailable || error instanceof CommitUnknown) return reply({ error: { code: 'SERVICE_UNAVAILABLE' } });
      throw error;
    }
  }
}
