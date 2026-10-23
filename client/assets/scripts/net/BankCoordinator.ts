import { decodeAssetResponse, encodeAssetRequest, parseAssetCommand } from '../../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetQuery, AssetQueryResponse, AssetResponse, ContainerView } from '../../../../shared/src/protocol/asset-v2.ts';
import type { InventoryIdentity, InventoryPendingStore, InventoryTransport } from './InventoryCoordinator.ts';
export type BankVaultKind = 'personalVault' | 'accountVault';
type Data<K extends AssetQuery['query']> = Extract<AssetQueryResponse<K>, {
    data: unknown;
}>['data'];
export type BankExpansionQuote = Data<'inventory.expansionQuote'>;
type Mutation = Extract<AssetCommand, {
    command: 'inventory.transfer' | 'inventory.expand';
}>;
export type BankCoordinatorState = {
    status: 'closed' | 'loading' | 'ready' | 'submitting' | 'unknown' | 'failed';
    vaultKind: BankVaultKind;
    contextId: string | null;
    backpack: ContainerView | null;
    vault: ContainerView | null;
    wallet: Data<'bank.get'>['wallet'] | null;
    characterVersion: number | null;
    quote: BankExpansionQuote | null;
    code: string | null;
    availableCapacity: number | null;
    pendingOperationId: string | null;
};
/** One atomic bank snapshot; pending writes survive closing and never acquire a new operation ID. */
export class BankCoordinator {
    private identity: InventoryIdentity | null = null;
    private pending: Mutation | null = null;
    private generation = 0;
    private sequence = 0;
    private minimum = new Map<string, number>();
    private current: BankCoordinatorState = this.initial();
    private transport: InventoryTransport;
    private persistence: InventoryPendingStore;
    constructor(transport: InventoryTransport, persistence: InventoryPendingStore) { this.transport = transport; this.persistence = persistence; }
    get state(): BankCoordinatorState { return structuredClone(this.current); }
    private initial(): BankCoordinatorState { return { status: 'closed', vaultKind: 'personalVault', contextId: null, backpack: null, vault: null, wallet: null, characterVersion: null, quote: null, code: null, availableCapacity: null, pendingOperationId: null }; }
    private key(): string { const i = this.identity!; return JSON.stringify(['bank', i.sessionId, i.sessionEpoch, i.characterId]); }
    init(identity: InventoryIdentity): void {
        ++this.generation;
        this.identity = { ...identity };
        this.current = this.initial();
        this.pending = null;
        this.minimum.clear();
        const saved = this.persistence.load(this.key());
        if (saved !== null) {
            const c = parseAssetCommand(JSON.parse(saved));
            if ((c.command !== 'inventory.transfer' && c.command !== 'inventory.expand') || c.sessionId !== identity.sessionId || c.sessionEpoch !== identity.sessionEpoch || c.payload.characterId !== identity.characterId)
                throw Error('INVALID_PENDING_BANK_COMMAND');
            this.pending = c;
            this.current.pendingOperationId = c.operationId;
        }
    }
    close(): void { ++this.generation; this.current.status = 'closed'; this.current.quote = null; }
    reset(): void { this.close(); this.identity = null; this.pending = null; this.current = this.initial(); this.minimum.clear(); }
    async open(contextId: string, vaultKind: BankVaultKind = 'personalVault'): Promise<void> { if (!this.identity)
        throw Error('NO_ACTIVE_CHARACTER'); this.current.contextId = contextId; this.current.vaultKind = vaultKind; this.current.backpack = null; this.current.vault = null; this.current.wallet = null; this.current.quote = null; await this.refresh(++this.generation); if (this.pending && this.current.status !== 'closed')
        this.unknown(); }
    async switchTab(kind: BankVaultKind): Promise<void> { if (this.pending || this.current.status === 'submitting')
        throw Error('BANK_BUSY'); if (!this.current.contextId)
        throw Error('NO_BANK_CONTEXT'); await this.open(this.current.contextId, kind); }
    private ready(): InventoryIdentity { if (!this.identity || this.current.status !== 'ready' || this.pending || !this.current.backpack || !this.current.vault || !this.current.wallet)
        throw Error('BANK_NOT_READY'); return this.identity; }
    async transfer(operationId: string, source: 'backpack' | 'vault', target: {
        kind: 'stack';
        stackId: string;
    } | {
        kind: 'equipment';
        itemId: string;
    }, quantity: number): Promise<void> {
        const i = this.ready(), from = this.current[source]!, to = this.current[source === 'backpack' ? 'vault' : 'backpack']!;
        const entry = from.slots.find(s => s.entry.kind === target.kind && (s.entry.kind === 'stack' ? s.entry.stackId === (target as {
            stackId: string;
        }).stackId : s.entry.itemId === (target as {
            itemId: string;
        }).itemId))?.entry;
        if (!entry || !Number.isInteger(quantity) || quantity < 1 || quantity > (entry.kind === 'stack' ? entry.quantity : 1))
            throw Error('INVALID_TRANSFER_SELECTION');
        const expected: AssetCommand['expected'] = [{ kind: 'character' as const, id: i.characterId, version: this.current.characterVersion! }, { kind: 'container' as const, id: from.containerId, version: from.version }, { kind: 'container' as const, id: to.containerId, version: to.version }];
        const generation = this.generation;
        if (target.kind === 'equipment') {
            this.current.status = 'loading';
            try {
                const result = await this.query('bank.itemVersion', { characterId: i.characterId, contextId: this.current.contextId!, containerId: from.containerId, itemId: target.itemId });
                if (generation !== this.generation)
                    return;
                if ('error' in result)
                    throw Error(result.error.code);
                if (result.data.itemId !== target.itemId)
                    throw Error('VIEW_ITEM_MISMATCH');
                expected.push({ kind: 'equipment', id: target.itemId, version: result.data.version });
            }
            catch (e) {
                if (generation === this.generation) {
                    this.current.status = 'failed';
                    this.current.code = e instanceof Error ? e.message : 'VIEW_FAILED';
                }
                return;
            }
        }
        if (generation !== this.generation)
            return;
        await this.submit(parseAssetCommand({ protocolVersion: 2, command: 'inventory.transfer', operationId, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch, expected, payload: { characterId: i.characterId, contextId: this.current.contextId!, sourceContainerId: from.containerId, targetContainerId: to.containerId, target, quantity } }) as Mutation);
    }
    async expansionQuote(container: 'backpack' | 'vault'): Promise<BankExpansionQuote | null> {
        const i = this.ready(), c = this.current[container]!;
        if (c.kind === 'accountVault' || c.unlockStage === null || c.unlockStage >= 4)
            throw Error('CONTAINER_NOT_EXPANDABLE');
        const generation = this.generation;
        this.current.status = 'loading';
        this.current.quote = null;
        try {
            const r = await this.query('inventory.expansionQuote', { characterId: i.characterId, containerId: c.containerId, targetStage: c.unlockStage + 1, contextId: this.current.contextId! });
            if (generation !== this.generation)
                return null;
            if ('error' in r)
                throw Error(r.error.code);
            if (r.data.containerId !== c.containerId || r.data.targetStage !== c.unlockStage + 1)
                throw Error('QUOTE_MISMATCH');
            for (const v of [{ kind: 'character', id: i.characterId, version: this.current.characterVersion! }, { kind: 'container', id: c.containerId, version: c.version }, { kind: 'wallet', id: this.current.wallet!.walletId, version: this.current.wallet!.version }])
                if (!r.versions.some(x => x.kind === v.kind && x.id === v.id && x.version === v.version))
                    throw Error('QUOTE_STALE');
            this.current.quote = r.data;
            this.current.status = 'ready';
            return structuredClone(r.data);
        }
        catch (e) {
            if (generation === this.generation) {
                this.current.status = 'failed';
                this.current.code = e instanceof Error ? e.message : 'QUOTE_FAILED';
            }
            return null;
        }
    }
    async expand(operationId: string, currency: 'gold' | 'points'): Promise<void> { const i = this.ready(), q = this.current.quote; if (!q || !q.costs.some(c => c.currency === currency))
        throw Error('NO_EXPANSION_QUOTE'); const c = [this.current.backpack!, this.current.vault!].find(v => v.containerId === q.containerId)!; await this.submit(parseAssetCommand({ protocolVersion: 2, command: 'inventory.expand', operationId, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch, expected: [{ kind: 'character', id: i.characterId, version: this.current.characterVersion! }, { kind: 'container', id: c.containerId, version: c.version }, { kind: 'wallet', id: this.current.wallet!.walletId, version: this.current.wallet!.version }], payload: { characterId: i.characterId, containerId: c.containerId, targetStage: q.targetStage, paymentCurrency: currency, quoteRef: q.quoteRef, contextId: this.current.contextId! } }) as Mutation); }
    private async submit(command: Mutation): Promise<void> { const text = encodeAssetRequest(command); this.persistence.save(this.key(), text); this.pending = structuredClone(command); this.current.pendingOperationId = command.operationId; this.current.quote = null; await this.sendPending(command, text); }
    private unknown(): void { this.current.status = 'unknown'; this.current.code = 'RESULT_UNKNOWN'; }
    private async sendPending(command: Mutation, text: string): Promise<void> { const g = this.generation; this.current.status = 'submitting'; this.current.code = null; this.current.availableCapacity = null; try {
        const r = decodeAssetResponse(command, await this.transport.send(text)) as AssetResponse;
        if (g === this.generation)
            await this.accept(r, g);
    }
    catch {
        if (g === this.generation)
            this.unknown();
    } }
    async retryOriginal(): Promise<void> { if (!this.pending || this.current.status !== 'unknown')
        throw Error('NO_PENDING_BANK_COMMAND'); await this.sendPending(this.pending, encodeAssetRequest(this.pending)); }
    async recover(): Promise<void> { if (!this.pending || this.current.status !== 'unknown')
        throw Error('NO_PENDING_BANK_COMMAND'); const g = this.generation, p = this.pending; this.current.status = 'submitting'; try {
        const r = await this.query('operation.get', { operationId: p.operationId });
        if (g !== this.generation)
            return;
        if ('error' in r || r.data.status === 'notFound') {
            this.unknown();
            return;
        }
        if (r.data.command !== p.command)
            throw Error('COMMAND_MISMATCH');
        await this.accept(r.data.result as AssetResponse, g);
    }
    catch {
        if (g === this.generation)
            this.unknown();
    } }
    private async accept(r: AssetResponse, g: number): Promise<void> { if (r.outcome.status === 'unknown') {
        this.unknown();
        return;
    } this.persistence.save(this.key(), null); this.pending = null; this.current.pendingOperationId = null; if (r.outcome.status === 'rejected') {
        this.current.status = 'failed';
        this.current.code = r.outcome.code;
        this.current.availableCapacity = 'availableCapacity' in r.outcome ? r.outcome.availableCapacity ?? null : null;
        return;
    } for (const v of r.outcome.resultVersions)
        this.minimum.set(`${v.kind}:${v.id}`, Math.max(this.minimum.get(`${v.kind}:${v.id}`) ?? 0, v.version)); await this.refresh(g); }
    private async query<K extends AssetQuery['query']>(query: K, payload: Extract<AssetQuery, {
        query: K;
    }>['payload']): Promise<AssetQueryResponse<K>> { const i = this.identity!; const request = { protocolVersion: 2, query, payload, requestId: `bank-view-${++this.sequence}`, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch } as AssetQuery; return decodeAssetResponse(request, await this.transport.send(encodeAssetRequest(request))) as AssetQueryResponse<K>; }
    private async refresh(g: number): Promise<void> { this.current.status = 'loading'; this.current.quote = null; this.current.code = null; try {
        const r = await this.query('bank.get', { characterId: this.identity!.characterId, contextId: this.current.contextId!, vaultKind: this.current.vaultKind });
        if (g !== this.generation)
            return;
        if ('error' in r)
            throw Error(r.error.code);
        const d = r.data;
        if (d.characterId !== this.identity!.characterId || d.vault.kind !== this.current.vaultKind)
            throw Error('VIEW_OWNER_MISMATCH');
        for (const v of r.versions) {
            if (v.version < (this.minimum.get(`${v.kind}:${v.id}`) ?? 0))
                throw Error('VIEW_STALE');
        }
        this.current.backpack = d.backpack;
        this.current.vault = d.vault;
        this.current.wallet = d.wallet;
        this.current.characterVersion = d.characterVersion;
        this.current.status = 'ready';
    }
    catch (e) {
        if (g === this.generation) {
            this.current.status = 'failed';
            this.current.code = e instanceof Error ? e.message : 'VIEW_FAILED';
        }
    } }
}
