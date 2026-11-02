import type { BankHoldingsDomain } from '../../../../backend/src/bank/bank-service.ts';
import type { ClearReceipt } from '../../../../shared/src/protocol/scene-v2.ts';

export const SET_SLOT_DEFS = [
  { slotId: 'weapon', name: '武器' },
  { slotId: 'shoulder', name: '肩甲' },
  { slotId: 'chest', name: '上衣' },
  { slotId: 'pants', name: '裤子' },
  { slotId: 'belt', name: '腰带' },
  { slotId: 'boots', name: '鞋子' },
  { slotId: 'bracelet', name: '手镯' },
  { slotId: 'necklace', name: '项链' },
  { slotId: 'ring', name: '戒指' },
  { slotId: 'subEquip', name: '辅助装备' },
  { slotId: 'magicStone', name: '魔法石' },
] as const;

export type SetSlotId = typeof SET_SLOT_DEFS[number]['slotId'];

export interface CollectionSlotView {
  slotId: SetSlotId;
  name: string;
  collected: boolean;
  count: number;
}

export interface CollectionIdentity {
  sessionId: string;
  sessionEpoch: number;
  characterId: string;
  setId?: string;
}

export interface CollectionClientState {
  status: 'closed' | 'loading' | 'ready' | 'failed' | 'unknown';
  setId: string;
  setName: string;
  collectedCount: number;
  totalCount: number; // 11
  progressText: string; // "X/11"
  isFullSet: boolean;
  slots: Record<SetSlotId, CollectionSlotView>;
  latestAwardedSlot: SetSlotId | null;
  isNewCompletion: boolean;
  code: string | null;
}

export interface CollectionTransport {
  send(text: string): Promise<string>;
}

export class CollectionCoordinator {
  private identity: CollectionIdentity | null = null;
  private generation = 0;
  private current: CollectionClientState = this.initial();
  private transport?: CollectionTransport;

  constructor(transport?: CollectionTransport) {
    this.transport = transport;
  }

  private initial(): CollectionClientState {
    const slots = {} as Record<SetSlotId, CollectionSlotView>;
    for (const def of SET_SLOT_DEFS) {
      slots[def.slotId] = {
        slotId: def.slotId,
        name: def.name,
        collected: false,
        count: 0,
      };
    }
    return {
      status: 'closed',
      setId: 'warrior-god-set',
      setName: '战神意志套装',
      collectedCount: 0,
      totalCount: 11,
      progressText: '0/11',
      isFullSet: false,
      slots,
      latestAwardedSlot: null,
      isNewCompletion: false,
      code: null,
    };
  }

  get state(): CollectionClientState {
    return structuredClone(this.current);
  }

  get currentGeneration(): number {
    return this.generation;
  }

  open(identity: CollectionIdentity): number {
    const g = ++this.generation;
    this.identity = { ...identity };
    const initial = this.initial();
    if (identity.setId) {
      initial.setId = identity.setId;
    }
    initial.status = 'ready';
    this.current = initial;
    return g;
  }

  close(): void {
    ++this.generation;
    this.current.status = 'closed';
    this.current.latestAwardedSlot = null;
    this.current.isNewCompletion = false;
  }

  applyHoldings(
    characterSummary: any,
    accountSummary?: any,
    domain?: BankHoldingsDomain,
    generation?: number,
  ): boolean {
    if (generation !== undefined && generation !== this.generation) {
      // Generation isolation: ignore late / stale response
      return false;
    }
    if (this.current.status === 'closed') return false;

    const summaries = [characterSummary, ...(accountSummary ? [accountSummary] : [])];
    const prevCount = this.current.collectedCount;
    let newCollectedCount = 0;

    for (const def of SET_SLOT_DEFS) {
      let count = 0;
      for (const summary of summaries) {
        if (!summary?.entries) continue;
        for (const entry of summary.entries) {
          let match = false;
          if (domain) {
            const keyDef = domain.keys.find(k => k.collectionKey === entry.collectionKey);
            if (keyDef && keyDef.setId === this.current.setId && keyDef.slotId === def.slotId) {
              match = true;
            }
          } else {
            if (entry.collectionKey.toLowerCase().includes(def.slotId.toLowerCase())) {
              match = true;
            }
          }
          if (match) {
            count += entry.permanentCount ?? 0;
          }
        }
      }

      const collected = count > 0;
      if (collected) newCollectedCount++;
      this.current.slots[def.slotId] = {
        slotId: def.slotId,
        name: def.name,
        collected,
        count,
      };
    }

    this.current.collectedCount = newCollectedCount;
    this.current.progressText = `${newCollectedCount}/11`;
    this.current.isFullSet = newCollectedCount === 11;
    this.current.status = 'ready';
    this.current.code = null;

    if (prevCount < 11 && newCollectedCount === 11) {
      this.current.isNewCompletion = true;
    }

    return true;
  }

  applyClearReceipt(receipt: ClearReceipt, generation?: number): boolean {
    if (generation !== undefined && generation !== this.generation) {
      return false;
    }
    if (this.current.status === 'closed') return false;

    if (receipt?.equipment) {
      const eq = receipt.equipment;
      const slot = eq.slotKind as SetSlotId;
      if (SET_SLOT_DEFS.some(d => d.slotId === slot)) {
        this.current.latestAwardedSlot = slot;
        if (!this.current.slots[slot].collected) {
          this.current.slots[slot].collected = true;
          this.current.slots[slot].count = 1;
          this.current.collectedCount = Math.min(11, this.current.collectedCount + 1);
          this.current.progressText = `${this.current.collectedCount}/11`;
          this.current.isFullSet = this.current.collectedCount === 11;
          if (this.current.isFullSet) {
            this.current.isNewCompletion = true;
          }
        }
      }
    }
    return true;
  }

  recover(): void {
    if (this.current.status === 'unknown') {
      this.current.status = 'ready';
      this.current.code = null;
    }
  }
}
