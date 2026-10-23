import { parseAssetCommand, parseAssetQuery, parseAssetResponse, parseAssetQueryResponse, parseContainerView, parseHoldingsView } from '../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetResponse, AssetQueryResponse, ContainerView } from '../../../shared/src/protocol/asset-v2.ts';
import { resource, time } from '../../../shared/src/exact-values.ts';
import { identityKey, isVerifiedIdentity, loginKey } from '../identity/identity-v2.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import type { LoginAccount, LoginSession, IdentityLink } from '../identity/login-model.ts';
import type { CharacterEntity, ContainerEntity, EquipmentEntity } from '../character/character-model.ts';
import type { WalletEntity } from '../shop/shop-model.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { canonical, CommitUnknown, StoreUnavailable } from '../ports/store.ts';
import { DEFAULT_TOWN_MAP } from '../town/town-model.ts';
import type { ServiceContextEntity, TownMapManifest } from '../town/town-model.ts';
import type { InventoryCatalog } from '../inventory/organize.ts';
import { BankRefusal, validateBankContainer, planStackTransfer, planEquipmentTransfer, expansionOffer, planExpansionPayment } from './bank-rules.ts';
import type { BankExpansionConfig } from './bank-model.ts';
type BankCommand = Extract<AssetCommand, {
    command: 'inventory.transfer' | 'inventory.expand';
}>;
interface Receipt {
    schemaVersion: 2;
    id: string;
    accountId: string;
    command: BankCommand['command'];
    tuple: string;
    result: AssetResponse;
}
export interface BankHoldingsDomain {
    ref: string;
    keys: readonly {
        collectionKey: string;
        setId: string;
        setVersion: number;
        itemLevel: number;
        slotId: string;
        classId: 'warrior' | 'hunter';
    }[];
}
interface Holdings {
    schemaVersion: 2;
    id: string;
    accountId: string;
    scope: 'account' | 'character';
    characterId?: string;
    revision: number;
    domainRef: string;
    entries: {
        collectionKey: string;
        permanentCount: number;
        mailLatestExpiryAt: number | null;
    }[];
}
export interface BankServiceOptions {
    store: Store;
    clock: Clock;
    identity: IdentityPort;
    catalog: InventoryCatalog;
    manifest?: TownMapManifest;
    expansionConfig?: BankExpansionConfig;
    holdingsDomain?: BankHoldingsDomain;
}
function requireValue(value: unknown, code: string): asserts value { if (!value)
    throw new BankRefusal(code); }
function inc(v: number) { requireValue(Number.isSafeInteger(v) && v >= 0 && Number.isSafeInteger(v + 1), 'CONFIG_NOT_READY'); return v + 1; }
function budget(v: unknown, max: number) { requireValue(new TextEncoder().encode(JSON.stringify(v)).length <= max, 'CONFIG_NOT_READY'); }
export function bankContainerView(c: ContainerEntity): ContainerView {
    return parseContainerView({ containerId: c.id, version: c.version, kind: c.kind, owner: c.kind === 'accountVault' ? { kind: 'account' } : { kind: 'character', characterId: c.characterId }, capacity: c.capacity, unlockStage: c.kind === 'accountVault' ? null : c.stage, slots: Object.entries(c.slots).map(([i, s]) => ({ index: Number(i), entry: s.kind === 'equipment' ? s : { ...s, templateRef: s.templateRef.id, binding: s.binding.kind === 'character' ? { kind: 'character', characterId: s.binding.characterId } : { kind: s.binding.kind } } })) });
}
/** Identity is supplied by the trusted adapter; payloads never choose an account. */
export class BankService {
    private readonly options: BankServiceOptions;
    constructor(options: BankServiceOptions) { this.options = { ...options, catalog: structuredClone(options.catalog), manifest: structuredClone(options.manifest ?? DEFAULT_TOWN_MAP), expansionConfig: options.expansionConfig && structuredClone(options.expansionConfig), holdingsDomain: options.holdingsDomain && structuredClone(options.holdingsDomain) }; }
    private async caller() { const i = await this.options.identity.verify(); requireValue(isVerifiedIdentity(i), 'AUTH_REQUIRED'); return { id: await identityKey(i), tuple: JSON.stringify([i.provider, i.appId, i.subject, i.environment]) }; }
    private async authorize(tx: Transaction, caller: {
        id: string;
        tuple: string;
    }, sessionId: string, epoch: number) {
        const l = await tx.get<IdentityLink>(caller.id);
        requireValue(l?.schemaVersion === 2 && l.id === caller.id && l.tuple === caller.tuple, 'AUTH_REQUIRED');
        const a = await tx.get<LoginAccount>(l.accountId), s = await tx.get<LoginSession>(sessionId);
        requireValue(a?.schemaVersion === 2 && a.id === l.accountId && s?.schemaVersion === 2 && s.id === sessionId && s.accountId === a.id && s.status === 'active' && s.epoch === epoch && a.currentSessionId === sessionId && a.sessionEpoch === epoch, 'SESSION_REVOKED');
        return a;
    }
    private async character(tx: Transaction, a: LoginAccount, id: string) { const c = await tx.get<CharacterEntity>(id); requireValue(c?.schemaVersion === 2 && c.id === id && c.accountId === a.id && a.selectedCharacterId === id && Object.values(a.characterIdsByClass).includes(id), 'NOT_FOUND_OR_FORBIDDEN'); return c; }
    private async bank(tx: Transaction, a: LoginAccount, c: CharacterEntity, id: string | undefined) {
        requireValue(id, 'CONTEXT_INVALID');
        const x = await tx.get<ServiceContextEntity>(id), t = c.townState, m = this.options.manifest!;
        requireValue(x?.schemaVersion === 2 && x.id === id && x.accountId === a.id && x.characterId === c.id && x.status === 'open' && x.serviceKind === 'bank' && x.rolePlayEpoch === c.rolePlayEpoch && t && x.sceneEpoch === t.sceneEpoch && x.locationRevision === t.locationRevision, 'CONTEXT_INVALID');
        requireValue(c.location.kind === 'town' && c.location.mapId === m.mapId && t.mapRef === m.mapId, 'LOCATION_NOT_ALLOWED');
        const anchor = m.serviceAnchors[x.anchorId];
        requireValue(anchor?.serviceKind === 'bank' && Number.isFinite(t.position.x) && Number.isFinite(t.position.y) && (t.position.x - anchor.x) ** 2 + (t.position.y - anchor.y) ** 2 <= 576, 'LOCATION_NOT_ALLOWED');
    }
    private async container(tx: Transaction, a: LoginAccount, c: CharacterEntity, id: string) {
        const kind = id === c.backpackId ? 'backpack' : id === c.personalVaultId ? 'personalVault' : id === a.accountVaultId ? 'accountVault' : null;
        requireValue(kind, 'NOT_FOUND_OR_FORBIDDEN');
        const v = await tx.get<ContainerEntity>(id);
        requireValue(v?.schemaVersion === 2 && v.id === id && v.accountId === a.id && v.kind === kind && (kind === 'accountVault' ? v.characterId === undefined : v.characterId === c.id), 'NOT_FOUND_OR_FORBIDDEN');
        validateBankContainer(v, this.options.catalog);
        budget(v, 65536);
        return v;
    }
    private async wallet(tx: Transaction, a: LoginAccount) { const w = await tx.get<WalletEntity>(a.walletId); requireValue(w?.schemaVersion === 2 && w.id === a.walletId && w.accountId === a.id && Number.isSafeInteger(w.version) && w.version >= 0, 'CONFIG_NOT_READY'); try {
        resource(w.gold);
        resource(w.points);
    }
    catch {
        throw new BankRefusal('CONFIG_NOT_READY');
    } return w; }
    private expected(command: BankCommand, objects: {
        kind: string;
        id: string;
        version: number;
    }[]) { requireValue(command.expected.length === objects.length && objects.every(e => command.expected.some(v => v.kind === e.kind && v.id === e.id)), 'INVALID_ARGUMENT'); requireValue(objects.every(e => command.expected.some(v => v.kind === e.kind && v.id === e.id && v.version === e.version)), 'VERSION_CONFLICT'); }
    private async quote(c: CharacterEntity, v: ContainerEntity, w: WalletEntity, stage: number) {
        const offer = expansionOffer(v, stage, this.options.expansionConfig!);
        const quoteRef = await loginKey('expandQuote', [offer.configRef.id, offer.configRef.version, v.id, v.version, stage, w.version, canonical(offer.costs), c.version]);
        return { ...offer, quoteRef };
    }
    private async holdings(tx: Transaction, a: LoginAccount, c: CharacterEntity, item: EquipmentEntity, source: ContainerEntity, target: ContainerEntity): Promise<Array<[
        string,
        unknown
    ]>> {
        if (!item.setRef || source.kind !== 'accountVault' && target.kind !== 'accountVault')
            return [];
        const d = this.options.holdingsDomain;
        requireValue(d && d.keys.length <= 64 && new Set(d.keys.map(k => k.collectionKey)).size === d.keys.length, 'CONFIG_NOT_READY');
        const matches = d.keys.filter(k => k.setId === item.setRef!.id && k.setVersion === item.setRef!.version && k.itemLevel === item.itemLevel && k.slotId === item.slotKind);
        requireValue(matches.length > 0, 'CONFIG_NOT_READY');
        const writes: Array<[
            string,
            unknown
        ]> = [];
        for (const scope of ['character', 'account'] as const) {
            const applicable = matches.filter(k => scope === 'account' || k.classId === c.classId);
            if (applicable.length === 0)
                continue;
            const id = await loginKey('holdings', scope === 'account' ? [a.id, 'account'] : [a.id, 'character', c.id]);
            const h = await tx.get<Holdings>(id);
            requireValue(h?.schemaVersion === 2 && h.id === id && h.accountId === a.id && h.scope === scope && h.domainRef === d.ref && (scope === 'account' ? h.characterId === undefined : h.characterId === c.id), 'CONFIG_NOT_READY');
            try {
                parseHoldingsView({ scope, ...(scope === 'character' ? { characterId: c.id } : {}), revision: h.revision, domainRef: h.domainRef, entries: h.entries });
            }
            catch {
                throw new BankRefusal('CONFIG_NOT_READY');
            }
            requireValue(h.entries.every(e => d.keys.some(k => k.collectionKey === e.collectionKey)), 'CONFIG_NOT_READY');
            const fromScope = source.kind === 'accountVault' ? 'account' : 'character', delta = scope === fromScope ? -1 : 1;
            const entries = structuredClone(h.entries);
            for (const match of applicable) {
                const key = match.collectionKey;
                let entry = entries.find(e => e.collectionKey === key);
                if (!entry) {
                    requireValue(delta > 0, 'CONFIG_NOT_READY');
                    entry = { collectionKey: key, permanentCount: 0, mailLatestExpiryAt: null };
                    entries.push(entry);
                }
                requireValue(entry.permanentCount + delta >= 0 && Number.isSafeInteger(entry.permanentCount + delta), 'CONFIG_NOT_READY');
                entry.permanentCount += delta;
            }
            const next = { ...h, entries, revision: inc(h.revision) };
            budget(next, 16384);
            writes.push([id, next]);
        }
        return writes;
    }
    async execute(value: unknown): Promise<AssetResponse> {
        const p = parseAssetCommand(value);
        if (p.command !== 'inventory.transfer' && p.command !== 'inventory.expand')
            throw new TypeError('UNSUPPORTED_COMMAND');
        const cmd: BankCommand = p;
        const reply = (outcome: unknown, replayed = false) => parseAssetResponse(cmd.command, { operationId: cmd.operationId, serverTime: time(this.options.clock.now()), replayed, outcome });
        let caller;
        try {
            caller = await this.caller();
        }
        catch {
            return reply({ status: 'rejected', code: 'AUTH_REQUIRED' });
        }
        try {
            return await this.options.store.run(async (tx) => {
                const a = await this.authorize(tx, caller, cmd.sessionId, cmd.sessionEpoch), o = await loginKey('assetOp', [a.id, cmd.operationId]), j = await loginKey('assetJournal', [a.id, cmd.operationId]), tuple = canonical(cmd);
                const old = await tx.get<Receipt>(o);
                if (old) {
                    requireValue(old.schemaVersion === 2 && old.id === o && old.accountId === a.id, 'CONFIG_NOT_READY');
                    if (old.tuple !== tuple)
                        return reply({ status: 'rejected', code: 'OPERATION_MISMATCH' });
                    return parseAssetResponse(cmd.command, { ...old.result, serverTime: time(this.options.clock.now()), replayed: true });
                }
                if (await tx.get(j) !== undefined)
                    return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
                let writes: Array<[
                    string,
                    unknown
                ]> = [], outcome: unknown;
                try {
                    const c = await this.character(tx, a, cmd.payload.characterId), now = time(this.options.clock.now());
                    let changes: unknown;
                    if (cmd.command === 'inventory.transfer') {
                        await this.bank(tx, a, c, cmd.payload.contextId);
                        const s = await this.container(tx, a, c, cmd.payload.sourceContainerId), t = await this.container(tx, a, c, cmd.payload.targetContainerId);
                        requireValue((s.kind === 'backpack') !== (t.kind === 'backpack'), 'INVALID_ARGUMENT');
                        const expected = [{ kind: 'character', id: c.id, version: c.version }, { kind: 'container', id: s.id, version: s.version }, { kind: 'container', id: t.id, version: t.version }];
                        let sourceSlots, targetSlots;
                        if (cmd.payload.target.kind === 'stack') {
                            this.expected(cmd, expected);
                            const plan = planStackTransfer(s, t, cmd.payload.target.stackId, cmd.payload.quantity, j, this.options.catalog);
                            sourceSlots = plan.sourceSlots;
                            targetSlots = plan.targetSlots;
                            changes = { sourceContainerId: s.id, targetContainerId: t.id, lineage: plan.lineage };
                        }
                        else {
                            const item = await tx.get<EquipmentEntity>(cmd.payload.target.itemId);
                            requireValue(item?.schemaVersion === 2 && item.id === cmd.payload.target.itemId && item.accountId === a.id, 'NOT_FOUND_OR_FORBIDDEN');
                            this.expected(cmd, [...expected, { kind: 'equipment', id: item.id, version: item.version }]);
                            const plan = planEquipmentTransfer(s, t, item, c.id, this.options.catalog);
                            sourceSlots = plan.sourceSlots;
                            targetSlots = plan.targetSlots;
                            const next = { ...plan.nextItem, version: inc(item.version), updatedAt: now };
                            writes.push([item.id, next], ...await this.holdings(tx, a, c, item, s, t));
                            changes = { itemId: item.id, beforeLocation: item.location, afterLocation: next.location, beforeVersion: item.version, afterVersion: next.version };
                        }
                        const ns = { ...s, slots: sourceSlots, version: inc(s.version), updatedAt: now }, nt = { ...t, slots: targetSlots, version: inc(t.version), updatedAt: now };
                        budget(ns, 65536);
                        budget(nt, 65536);
                        writes.push([s.id, ns], [t.id, nt]);
                        outcome = { status: 'committed', data: { sourceContainerId: s.id, targetContainerId: t.id, transferredQuantity: cmd.payload.quantity }, resultVersions: [{ kind: 'character', id: c.id, version: c.version }, { kind: 'container', id: s.id, version: ns.version }, { kind: 'container', id: t.id, version: nt.version }, ...writes.filter(([id]) => cmd.payload.target.kind === 'equipment' && id === cmd.payload.target.itemId).map(([id, e]) => ({ kind: 'equipment', id, version: (e as EquipmentEntity).version }))] };
                    }
                    else {
                        const v = await this.container(tx, a, c, cmd.payload.containerId);
                        requireValue(v.kind !== 'accountVault', 'ITEM_NOT_ELIGIBLE');
                        if (v.kind === 'personalVault')
                            await this.bank(tx, a, c, cmd.payload.contextId);
                        else
                            requireValue(c.location.kind === 'town' && c.townState && c.location.mapId === this.options.manifest!.mapId, 'LOCATION_NOT_ALLOWED');
                        const w = await this.wallet(tx, a);
                        this.expected(cmd, [{ kind: 'character', id: c.id, version: c.version }, { kind: 'container', id: v.id, version: v.version }, { kind: 'wallet', id: w.id, version: w.version }]);
                        const q = await this.quote(c, v, w, cmd.payload.targetStage);
                        requireValue(q.quoteRef === cmd.payload.quoteRef, 'QUOTE_CHANGED');
                        const payment = planExpansionPayment(w, cmd.payload.paymentCurrency, q);
                        const nv = { ...v, capacity: q.capacity, stage: cmd.payload.targetStage, unlockConfigRef: q.configRef, version: inc(v.version), updatedAt: now }, nw = { ...w, gold: payment.gold, points: payment.points, version: inc(w.version), updatedAt: now };
                        writes.push([v.id, nv], [w.id, nw]);
                        changes = { containerId: v.id, beforeStage: v.stage, afterStage: nv.stage, paymentCurrency: cmd.payload.paymentCurrency, charged: payment.cost, configRef: q.configRef, quoteRef: q.quoteRef };
                        outcome = { status: 'committed', data: { containerId: v.id, targetStage: nv.stage, capacity: nv.capacity }, resultVersions: [{ kind: 'character', id: c.id, version: c.version }, { kind: 'container', id: v.id, version: nv.version }, { kind: 'wallet', id: w.id, version: nw.version }] };
                    }
                    const journal = { schemaVersion: 2, id: j, accountId: a.id, characterId: c.id, operationId: cmd.operationId, command: cmd.command, changes, createdAt: now };
                    budget(journal, 131072);
                    writes.push([a.id, { ...a, writeRevision: inc(a.writeRevision), updatedAt: now }], [j, journal]);
                }
                catch (e) {
                    if (e instanceof BankRefusal || e instanceof Error && ['CONFIG_NOT_READY', 'ITEM_NOT_ELIGIBLE'].includes(e.message)) {
                        outcome = { status: 'rejected', code: e.message, ...(e instanceof BankRefusal && e.availableCapacity !== undefined ? { availableCapacity: e.availableCapacity } : {}) };
                        writes = [];
                    }
                    else
                        throw e;
                }
                const result = reply(outcome), receipt = { schemaVersion: 2, id: o, accountId: a.id, command: cmd.command, tuple, result };
                budget(receipt, 16384);
                for (const [id, v] of writes)
                    tx.set(id, v);
                tx.set(o, receipt);
                return result;
            });
        }
        catch (e) {
            if (e instanceof CommitUnknown)
                return reply({ status: 'unknown', code: 'RESULT_UNKNOWN' });
            if (e instanceof BankRefusal)
                return reply({ status: 'rejected', code: e.message });
            if (e instanceof StoreUnavailable)
                return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
            throw e;
        }
    }
    async query(value: unknown): Promise<AssetQueryResponse> {
        const q = parseAssetQuery(value);
        if (!['bank.get', 'bank.itemVersion', 'inventory.expansionQuote', 'inventory.get', 'operation.get'].includes(q.query))
            throw new TypeError('UNSUPPORTED_QUERY');
        const reply = (body: object) => parseAssetQueryResponse(q.query, { requestId: q.requestId, serverTime: time(this.options.clock.now()), ...body });
        let caller;
        try {
            caller = await this.caller();
        }
        catch {
            return reply({ error: { code: 'AUTH_REQUIRED' } });
        }
        try {
            return await this.options.store.run(async (tx) => {
                const a = await this.authorize(tx, caller, q.sessionId, q.sessionEpoch);
                if (q.query === 'operation.get') {
                    const r = await tx.get<Receipt>(await loginKey('assetOp', [a.id, q.payload.operationId]));
                    if (!r)
                        return reply({ versions: [], data: { status: 'notFound' } });
                    requireValue(r.schemaVersion === 2 && r.accountId === a.id, 'CONFIG_NOT_READY');
                    return reply({ versions: [], data: { status: 'found', command: r.command, result: r.result } });
                }
                if (q.query !== 'bank.get' && q.query !== 'inventory.get' && q.query !== 'bank.itemVersion' && q.query !== 'inventory.expansionQuote')
                    throw new TypeError('UNSUPPORTED_QUERY');
                const c = await this.character(tx, a, q.payload.characterId);
                if (q.query === 'bank.get') {
                    await this.bank(tx, a, c, q.payload.contextId);
                    const b = await this.container(tx, a, c, c.backpackId), v = await this.container(tx, a, c, q.payload.vaultKind === 'personalVault' ? c.personalVaultId : a.accountVaultId), w = await this.wallet(tx, a);
                    return reply({ versions: [{ kind: 'character', id: c.id, version: c.version }, { kind: 'container', id: b.id, version: b.version }, { kind: 'container', id: v.id, version: v.version }, { kind: 'wallet', id: w.id, version: w.version }], data: { characterId: c.id, characterVersion: c.version, backpack: bankContainerView(b), vault: bankContainerView(v), wallet: { walletId: w.id, version: w.version, gold: w.gold, points: w.points } } });
                }
                if (q.query === 'inventory.get') {
                    if (q.payload.containerKind !== 'backpack')
                        await this.bank(tx, a, c, q.payload.contextId);
                    const id = q.payload.containerKind === 'backpack' ? c.backpackId : q.payload.containerKind === 'personalVault' ? c.personalVaultId : a.accountVaultId, v = await this.container(tx, a, c, id);
                    return reply({ versions: [{ kind: 'container', id: v.id, version: v.version }], data: bankContainerView(v) });
                }
                if (q.query === 'bank.itemVersion') {
                    await this.bank(tx, a, c, q.payload.contextId);
                    const v = await this.container(tx, a, c, q.payload.containerId);
                    requireValue(Object.values(v.slots).some(s => s.kind === 'equipment' && s.itemId === q.payload.itemId), 'NOT_FOUND_OR_FORBIDDEN');
                    const i = await tx.get<EquipmentEntity>(q.payload.itemId);
                    requireValue(i?.schemaVersion === 2 && i.id === q.payload.itemId && i.accountId === a.id && i.location.kind === 'container' && i.location.containerId === v.id && i.lifecycle === 'active', 'NOT_FOUND_OR_FORBIDDEN');
                    return reply({ versions: [{ kind: 'equipment', id: i.id, version: i.version }], data: { itemId: i.id, version: i.version } });
                }
                const v = await this.container(tx, a, c, q.payload.containerId);
                requireValue(v.kind !== 'accountVault', 'ITEM_NOT_ELIGIBLE');
                if (v.kind === 'personalVault')
                    await this.bank(tx, a, c, q.payload.contextId);
                else
                    requireValue(c.location.kind === 'town' && c.townState && c.location.mapId === this.options.manifest!.mapId, 'LOCATION_NOT_ALLOWED');
                const w = await this.wallet(tx, a), offer = await this.quote(c, v, w, q.payload.targetStage);
                return reply({ versions: [{ kind: 'character', id: c.id, version: c.version }, { kind: 'container', id: v.id, version: v.version }, { kind: 'wallet', id: w.id, version: w.version }], data: { containerId: v.id, targetStage: q.payload.targetStage, nextCapacity: offer.capacity, configRef: offer.configRef, quoteRef: offer.quoteRef, costs: offer.costs } });
            });
        }
        catch (e) {
            if (e instanceof BankRefusal)
                return reply({ error: { code: e.message } });
            if (e instanceof StoreUnavailable || e instanceof CommitUnknown)
                return reply({ error: { code: 'SERVICE_UNAVAILABLE' } });
            throw e;
        }
    }
}
