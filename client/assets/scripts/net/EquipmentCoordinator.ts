import { decodeAssetResponse, encodeAssetRequest, parseAssetCommand } from '../../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetQuery, AssetQueryResponse, AssetResponse, EQUIPMENT_SLOTS } from '../../../../shared/src/protocol/asset-v2.ts';

export type EquipmentSlotName = typeof EQUIPMENT_SLOTS[number];

export interface EquipmentTransport {
  send(jsonText: string): Promise<string>;
}

export interface EquipmentPendingStore {
  load(key: string): string | null;
  save(key: string, value: string | null): void;
}

export type EquipmentIdentity = {
  sessionId: string;
  sessionEpoch: number;
  characterId: string;
};

type EquipmentMutation = Extract<AssetCommand, { command: 'equipment.equip' | 'equipment.unequip' }>;

export type EquipmentCoordinatorState = {
  status: 'closed' | 'loading' | 'ready' | 'submitting' | 'unknown' | 'failed';
  equipped: Array<{ slotId: EquipmentSlotName; itemId: string }>;
  attributes: Array<{ statId: string; value: string }>;
  characterVersion: number;
  backpackVersion: number;
  code: string | null;
  pendingOperationId: string | null;
};

export class EquipmentCoordinator {
  private identity: EquipmentIdentity | null = null;
  private pending: EquipmentMutation | null = null;
  private generation = 0;
  private sequence = 0;
  private minimumCharacterVersion = 0;
  private minimumBagVersion = 0;
  private current: EquipmentCoordinatorState = this.initial();
  private readonly transport: EquipmentTransport;
  private readonly persistence: EquipmentPendingStore;

  constructor(transport: EquipmentTransport, persistence: EquipmentPendingStore) {
    this.transport = transport;
    this.persistence = persistence;
  }

  get state(): EquipmentCoordinatorState {
    return structuredClone(this.current);
  }

  private initial(): EquipmentCoordinatorState {
    return {
      status: 'closed',
      equipped: [],
      attributes: [],
      characterVersion: 0,
      backpackVersion: 0,
      code: null,
      pendingOperationId: null,
    };
  }

  private key(): string {
    const i = this.identity!;
    return JSON.stringify(['equipment', i.sessionId, i.sessionEpoch, i.characterId]);
  }

  init(identity: EquipmentIdentity): void {
    ++this.generation;
    this.minimumCharacterVersion = 0;
    this.minimumBagVersion = 0;
    this.identity = { ...identity };
    this.current = this.initial();
    this.pending = null;

    const saved = this.persistence.load(this.key());
    if (saved !== null) {
      const command = parseAssetCommand(JSON.parse(saved));
      if (
        !['equipment.equip', 'equipment.unequip'].includes(command.command) ||
        command.sessionId !== identity.sessionId ||
        command.sessionEpoch !== identity.sessionEpoch ||
        !('characterId' in command.payload) ||
        command.payload.characterId !== identity.characterId
      ) {
        throw new Error('INVALID_PENDING_EQUIPMENT_COMMAND');
      }
      this.pending = command as EquipmentMutation;
      this.current.pendingOperationId = command.operationId;
    }
  }

  close(): void {
    ++this.generation;
    this.current.status = 'closed';
  }

  reset(): void {
    this.close();
    this.identity = null;
    this.pending = null;
    this.current = this.initial();
  }

  async open(): Promise<void> {
    if (!this.identity) throw new Error('NO_ACTIVE_CHARACTER');
    const generation = ++this.generation;
    this.current.status = 'loading';
    this.current.code = null;
    await this.refresh(generation);
    if (generation === this.generation && this.pending) {
      this.current.status = 'unknown';
      this.current.pendingOperationId = this.pending.operationId;
    }
  }

  async equip(operationId: string, itemId: string, targetSlot: EquipmentSlotName): Promise<void> {
    const i = this.requireReady();
    await this.submit({
      protocolVersion: 2,
      command: 'equipment.equip',
      operationId,
      sessionId: i.sessionId,
      sessionEpoch: i.sessionEpoch,
      expected: [
        { kind: 'character', id: i.characterId, version: this.current.characterVersion },
        { kind: 'container', id: `bag:${i.characterId}`, version: this.current.backpackVersion },
      ],
      payload: { characterId: i.characterId, itemId, targetSlot },
    });
  }

  async unequip(operationId: string, itemId: string, slot: EquipmentSlotName): Promise<void> {
    const i = this.requireReady();
    await this.submit({
      protocolVersion: 2,
      command: 'equipment.unequip',
      operationId,
      sessionId: i.sessionId,
      sessionEpoch: i.sessionEpoch,
      expected: [
        { kind: 'character', id: i.characterId, version: this.current.characterVersion },
        { kind: 'container', id: `bag:${i.characterId}`, version: this.current.backpackVersion },
      ],
      payload: { characterId: i.characterId, itemId, slot },
    });
  }

  private requireReady(): EquipmentIdentity {
    if (!this.identity || !['ready'].includes(this.current.status) || this.pending) {
      throw new Error('EQUIPMENT_NOT_READY');
    }
    return this.identity;
  }

  private async submit(command: EquipmentMutation): Promise<void> {
    const text = encodeAssetRequest(command);
    this.persistence.save(this.key(), text);
    this.pending = structuredClone(command);
    this.current.pendingOperationId = command.operationId;
    await this.sendPending(command, text);
  }

  async retryOriginal(): Promise<void> {
    if (!this.identity || !this.pending || this.current.status !== 'unknown') {
      throw new Error('NO_PENDING_EQUIPMENT_COMMAND');
    }
    await this.sendPending(this.pending, encodeAssetRequest(this.pending));
  }

  private async sendPending(command: EquipmentMutation, text: string): Promise<void> {
    const generation = this.generation;
    this.current.status = 'submitting';
    this.current.code = null;
    try {
      const response = decodeAssetResponse(command, await this.transport.send(text)) as AssetResponse;
      if (generation === this.generation) await this.accept(response, generation);
    } catch {
      if (generation === this.generation) this.unknown();
    }
  }

  async recover(): Promise<void> {
    if (!this.identity || !this.pending || this.current.status !== 'unknown') {
      throw new Error('NO_PENDING_EQUIPMENT_COMMAND');
    }
    const generation = this.generation;
    const pending = this.pending;
    this.current.status = 'submitting';
    this.current.code = null;
    try {
      const result = await this.query('operation.get', { operationId: pending.operationId });
      if (generation !== this.generation || this.pending !== pending) return;
      if ('error' in result || result.data.status === 'notFound') {
        this.unknown();
        return;
      }
      if (result.data.command !== pending.command) throw new Error('COMMAND_MISMATCH');
      await this.accept(result.data.result as AssetResponse, generation);
    } catch {
      if (generation === this.generation && this.pending === pending) this.unknown();
    }
  }

  private unknown(): void {
    this.current.status = 'unknown';
    this.current.code = 'RESULT_UNKNOWN';
  }

  private async accept(response: AssetResponse, generation: number): Promise<void> {
    if (response.outcome.status === 'unknown') {
      this.unknown();
      return;
    }
    this.persistence.save(this.key(), null);
    this.pending = null;
    this.current.pendingOperationId = null;

    if (response.outcome.status === 'rejected') {
      this.current.status = 'failed';
      this.current.code = response.outcome.code;
      return;
    }

    for (const v of response.outcome.resultVersions) {
      if (v.kind === 'character' && v.id === this.identity!.characterId) {
        this.minimumCharacterVersion = Math.max(this.minimumCharacterVersion, v.version);
      }
      if (v.kind === 'container') {
        this.minimumBagVersion = Math.max(this.minimumBagVersion, v.version);
      }
    }

    await this.refresh(generation);
  }

  private async query<K extends AssetQuery['query']>(
    query: K,
    payload: Extract<AssetQuery, { query: K }>['payload'],
  ): Promise<AssetQueryResponse<K>> {
    const i = this.identity!;
    const request = {
      protocolVersion: 2,
      query,
      requestId: `equipment-view-${++this.sequence}`,
      sessionId: i.sessionId,
      sessionEpoch: i.sessionEpoch,
      payload,
    } as AssetQuery;
    return decodeAssetResponse(
      request,
      await this.transport.send(encodeAssetRequest(request)),
    ) as AssetQueryResponse<K>;
  }

  private async refresh(generation: number): Promise<void> {
    const characterId = this.identity!.characterId;
    try {
      const [charResult, bagResult] = await Promise.all([
        this.query('character.get', { characterId }),
        this.query('inventory.get', { characterId, containerKind: 'backpack', contextId: undefined }),
      ]);
      if (generation !== this.generation) return;
      if ('error' in charResult) throw new Error(charResult.error.code);
      if ('error' in bagResult) throw new Error(bagResult.error.code);

      const charData = charResult.data;
      const bagData = bagResult.data;

      const charVer = charResult.versions.find(v => v.kind === 'character' && v.id === characterId)?.version ?? charData.version;
      const bagVer = bagResult.versions.find(v => v.kind === 'container' && v.id === bagData.containerId)?.version ?? bagData.version;

      if (charVer < this.minimumCharacterVersion || bagVer < this.minimumBagVersion) {
        throw new Error('VIEW_STALE');
      }

      this.current.equipped = charData.equipped as Array<{ slotId: EquipmentSlotName; itemId: string }>;
      this.current.attributes = charData.attributes;
      this.current.characterVersion = charVer;
      this.current.backpackVersion = bagVer;
      this.current.status = 'ready';
      this.current.code = null;
    } catch (error) {
      if (generation === this.generation) {
        this.current.status = 'failed';
        this.current.code = error instanceof Error ? error.message : 'VIEW_FAILED';
      }
    }
  }
}
