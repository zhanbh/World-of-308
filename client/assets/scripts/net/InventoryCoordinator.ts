import { decodeAssetResponse, encodeAssetRequest, parseAssetCommand } from '../../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetQuery, AssetQueryResponse, AssetResponse, ContainerView } from '../../../../shared/src/protocol/asset-v2.ts';

export interface InventoryTransport { send(jsonText: string): Promise<string> }
/** Adapter must persist pending commands before transmitting them. */
export interface InventoryPendingStore { load(key: string): string | null; save(key: string, value: string | null): void }
export type InventoryIdentity = { sessionId: string; sessionEpoch: number; characterId: string };
type Mutation = Extract<AssetCommand, { command: 'inventory.organize' | 'quickslot.assign' }>;
type QuickSlots = { characterId: string; version: number; slots: { slotIndex: number; templateId: string | null; quantity: number }[] };
export type InventoryCoordinatorState = {
  status: 'closed' | 'loading' | 'ready' | 'empty' | 'submitting' | 'unknown' | 'failed';
  backpack: ContainerView | null; quickSlots: QuickSlots | null; code: string | null;
  lastMergeCount: number | null; pendingOperationId: string | null;
};

/** Presentation-independent ST04 controller; never invents an outcome after a lost reply. */
export class InventoryCoordinator {
  private identity: InventoryIdentity | null = null;
  private pending: Mutation | null = null;
  private generation = 0;
  private sequence = 0;
  private minimumBagVersion = 0;
  private minimumCharacterVersion = 0;
  private current: InventoryCoordinatorState = this.initial();
  private readonly transport: InventoryTransport;
  private readonly persistence: InventoryPendingStore;
  constructor(transport: InventoryTransport, persistence: InventoryPendingStore) { this.transport = transport; this.persistence = persistence; }
  get state(): InventoryCoordinatorState { return structuredClone(this.current); }
  private initial(): InventoryCoordinatorState { return { status: 'closed', backpack: null, quickSlots: null, code: null, lastMergeCount: null, pendingOperationId: null }; }
  private key(): string { const i = this.identity!; return JSON.stringify([i.sessionId, i.sessionEpoch, i.characterId]); }
  init(identity: InventoryIdentity): void {
    ++this.generation;
    this.minimumBagVersion = 0; this.minimumCharacterVersion = 0;
    this.identity = { ...identity }; this.current = this.initial(); this.pending = null;
    const saved = this.persistence.load(this.key());
    if (saved !== null) {
      const command = parseAssetCommand(JSON.parse(saved));
      if (!['inventory.organize', 'quickslot.assign'].includes(command.command) || command.sessionId !== identity.sessionId || command.sessionEpoch !== identity.sessionEpoch || !('characterId' in command.payload) || command.payload.characterId !== identity.characterId) throw new Error('INVALID_PENDING_INVENTORY_COMMAND');
      this.pending = command as Mutation;
      this.current.pendingOperationId = command.operationId;
    }
  }
  close(): void { ++this.generation; this.current.status = 'closed'; }
  reset(): void { this.close(); this.identity = null; this.pending = null; this.current = this.initial(); }
  async open(): Promise<void> {
    if (!this.identity) throw new Error('NO_ACTIVE_CHARACTER');
    const generation = ++this.generation;
    this.current.status = 'loading'; this.current.code = null;
    await this.refresh(generation);
    if (generation === this.generation && this.pending) { this.current.status = 'unknown'; this.current.pendingOperationId = this.pending.operationId; }
  }
  async organize(operationId: string, direction: 'forward' | 'reverse'): Promise<void> {
    const i = this.requireReady(); const bag = this.current.backpack!; const quick = this.current.quickSlots!;
    await this.submit({ protocolVersion: 2, command: 'inventory.organize', operationId, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch,
      expected: [{ kind: 'character', id: i.characterId, version: quick.version }, { kind: 'container', id: bag.containerId, version: bag.version }], payload: { characterId: i.characterId, direction } });
  }
  async assign(operationId: string, slotIndex: number, templateId: string | null): Promise<void> {
    const i = this.requireReady();
    await this.submit(parseAssetCommand({ protocolVersion: 2, command: 'quickslot.assign', operationId, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch,
      expected: [{ kind: 'character', id: i.characterId, version: this.current.quickSlots!.version }], payload: { characterId: i.characterId, slotIndex, templateId } }) as Mutation);
  }
  private requireReady(): InventoryIdentity {
    if (!this.identity || !this.current.backpack || !this.current.quickSlots || !['ready', 'empty'].includes(this.current.status) || this.pending) throw new Error('INVENTORY_NOT_READY');
    return this.identity;
  }
  private async submit(command: Mutation): Promise<void> {
    const text = encodeAssetRequest(command);
    this.persistence.save(this.key(), text); // Failure here prevents mutation transmission.
    this.pending = structuredClone(command); this.current.pendingOperationId = command.operationId;
    await this.sendPending(command, text);
  }
  /** Explicit safe resend after an unknown result, preserving the original operation and preconditions. */
  async retryOriginal(): Promise<void> {
    if (!this.identity || !this.pending || this.current.status !== 'unknown') throw new Error('NO_PENDING_INVENTORY_COMMAND');
    await this.sendPending(this.pending, encodeAssetRequest(this.pending));
  }
  private async sendPending(command: Mutation, text: string): Promise<void> {
    const generation = this.generation; this.current.status = 'submitting'; this.current.code = null;
    try {
      const response = decodeAssetResponse(command, await this.transport.send(text)) as AssetResponse;
      if (generation === this.generation) await this.accept(response, generation);
    } catch { if (generation === this.generation) this.unknown(); }
  }
  /** Query the original operation. notFound remains unknown; it never creates another mutation. */
  async recover(): Promise<void> {
    if (!this.identity || !this.pending || this.current.status !== 'unknown') throw new Error('NO_PENDING_INVENTORY_COMMAND');
    const generation = this.generation; const pending = this.pending;
    this.current.status = 'submitting'; this.current.code = null;
    try {
      const result = await this.query('operation.get', { operationId: pending.operationId });
      if (generation !== this.generation || this.pending !== pending) return;
      if ('error' in result || result.data.status === 'notFound') { this.unknown(); return; }
      if (result.data.command !== pending.command) throw new Error('COMMAND_MISMATCH');
      await this.accept(result.data.result as AssetResponse, generation);
    } catch { if (generation === this.generation && this.pending === pending) this.unknown(); }
  }
  private unknown(): void { this.current.status = 'unknown'; this.current.code = 'RESULT_UNKNOWN'; }
  private async accept(response: AssetResponse, generation: number): Promise<void> {
    if (response.outcome.status === 'unknown') { this.unknown(); return; }
    this.persistence.save(this.key(), null); this.pending = null; this.current.pendingOperationId = null;
    if (response.outcome.status === 'rejected') { this.current.status = 'failed'; this.current.code = response.outcome.code; return; }
    for (const v of response.outcome.resultVersions) {
      if (v.kind === 'character' && v.id === this.identity!.characterId) this.minimumCharacterVersion = Math.max(this.minimumCharacterVersion, v.version);
      if (v.kind === 'container' && v.id === this.current.backpack?.containerId) this.minimumBagVersion = Math.max(this.minimumBagVersion, v.version);
    }
    if ('mergedStacks' in response.outcome.data) this.current.lastMergeCount = response.outcome.data.mergedStacks;
    // A receipt is deliberately not treated as a full backpack snapshot.
    await this.refresh(generation);
  }
  private async query<K extends AssetQuery['query']>(query: K, payload: Extract<AssetQuery, { query: K }>['payload']): Promise<AssetQueryResponse<K>> {
    const i = this.identity!;
    const request = { protocolVersion: 2, query, requestId: `inventory-view-${++this.sequence}`, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch, payload } as AssetQuery;
    return decodeAssetResponse(request, await this.transport.send(encodeAssetRequest(request))) as AssetQueryResponse<K>;
  }
  private async refresh(generation: number): Promise<void> {
    const characterId = this.identity!.characterId;
    try {
      const [bagResult, quickResult] = await Promise.all([this.query('inventory.get', { characterId, containerKind: 'backpack', contextId: undefined }), this.query('quickslot.get', { characterId })]);
      if (generation !== this.generation) return;
      if ('error' in bagResult) throw new Error(bagResult.error.code);
      if ('error' in quickResult) throw new Error(quickResult.error.code);
      const bag = bagResult.data; const quick = quickResult.data;
      if (bag.kind !== 'backpack' || bag.owner.kind !== 'character' || bag.owner.characterId !== characterId || quick.characterId !== characterId) throw new Error('VIEW_OWNER_MISMATCH');
      const bagVersion = bagResult.versions.find(v => v.kind === 'container' && v.id === bag.containerId)?.version;
      const quickBagVersion = quickResult.versions.find(v => v.kind === 'container' && v.id === bag.containerId)?.version;
      const characterVersion = quickResult.versions.find(v => v.kind === 'character' && v.id === characterId)?.version;
      if (bagVersion !== bag.version || characterVersion !== quick.version || quickBagVersion !== bag.version) throw new Error('INCONSISTENT_VIEW_VERSIONS');
      // Quantity is a view over both character bindings and container contents. Apply the pair together.
      if ((!this.current.backpack || bag.version >= this.current.backpack.version) && (!this.current.quickSlots || quick.version >= this.current.quickSlots.version)) { this.current.backpack = bag; this.current.quickSlots = quick; }
      if (this.current.backpack!.version < this.minimumBagVersion || this.current.quickSlots!.version < this.minimumCharacterVersion) throw new Error('VIEW_STALE');
      this.current.status = this.current.backpack!.slots.length ? 'ready' : 'empty'; this.current.code = null;
    } catch (error) { if (generation === this.generation) { this.current.status = 'failed'; this.current.code = error instanceof Error ? error.message : 'VIEW_FAILED'; } }
  }
}
