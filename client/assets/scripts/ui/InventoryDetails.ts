import type { EquipmentView } from '../../../../shared/src/protocol/asset-v2.ts';

export type InventoryDetail = { status: 'loading' | 'ready' | 'failed'; item: EquipmentView | null; code: string | null };
/** Bounded read cache, invalidated by character/page/backpack scope. It never sends a mutation. */
export class InventoryDetails {
    private scope: string | null = null;
    private epoch = 0;
    private active = 0;
    private queue: Array<{ id: string; epoch: number }> = [];
    private entries = new Map<string, InventoryDetail>();
    private readonly read: (id: string) => Promise<EquipmentView | null>;
    private readonly concurrency: number;
    revision = 0;
    constructor(read: (id: string) => Promise<EquipmentView | null>, concurrency = 4) {
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('INVALID_CONCURRENCY');
        this.read = read; this.concurrency = concurrency;
    }
    setScope(scope: string | null): void {
        if (scope === this.scope) return;
        this.scope = scope; ++this.epoch; ++this.revision; this.entries.clear(); this.queue = [];
    }
    get(id: string): InventoryDetail | null {
        const value = this.entries.get(id); return value ? structuredClone(value) : null;
    }
    ensure(ids: readonly string[], retry = false): void {
        if (!this.scope) return;
        for (const id of new Set(ids)) {
            const current = this.entries.get(id);
            if (current && !(retry && current.status === 'failed')) continue;
            if (this.entries.size >= 100 && !current) continue;
            this.entries.set(id, { status: 'loading', item: null, code: null });
            this.queue.push({ id, epoch: this.epoch }); ++this.revision;
        }
        this.drain();
    }
    private drain(): void {
        while (this.active < this.concurrency && this.queue.length) {
            const next = this.queue.shift()!;
            if (next.epoch !== this.epoch) continue;
            ++this.active;
            void Promise.resolve().then(() => this.read(next.id)).then(item => {
                if (next.epoch !== this.epoch) return;
                this.entries.set(next.id, item ? { status: 'ready', item: structuredClone(item), code: null }
                    : { status: 'failed', item: null, code: 'VIEW_CHANGED' }); ++this.revision;
            }, error => {
                if (next.epoch !== this.epoch) return;
                this.entries.set(next.id, { status: 'failed', item: null, code: error instanceof Error ? error.message : 'DETAIL_FAILED' }); ++this.revision;
            }).finally(() => { --this.active; this.drain(); });
        }
    }
}
