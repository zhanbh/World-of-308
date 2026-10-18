import type { Store, Transaction } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable } from '../ports/store.ts';
type Cell = { revision: number; value: unknown };
/** Snapshot transactions with read/write conflict detection, staged writes and bounded retry. */
export class MemoryStore implements Store {
  private cells = new Map<string, Cell>();
  private revision = 0;
  private failWriteAt: number | undefined;
  private loseNextResponse = false;
  beforeCommit?: (attempt: number) => Promise<void>;
  conflicts = 0;
  injectWriteFailure(writeNumber: number): void { this.failWriteAt = writeNumber; }
  injectResponseLoss(): void { this.loseNextResponse = true; }
  inspect<T>(id: string): T | undefined { return structuredClone(this.cells.get(id)?.value) as T | undefined; }
  snapshot(): Map<string, unknown> { return new Map([...this.cells].map(([k, v]) => [k, structuredClone(v.value)])); }
  async run<T>(work: (tx: Transaction) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 16; attempt++) {
      const snapshot = new Map(this.cells);
      const reads = new Map<string, number>();
      const writes = new Map<string, unknown>();
      let writeCount = 0;
      const touch = (id: string) => { if (!reads.has(id)) reads.set(id, snapshot.get(id)?.revision ?? 0); };
      const tx: Transaction = {
        get: async <V>(id: string) => {
          touch(id);
          return structuredClone(writes.has(id) ? writes.get(id) : snapshot.get(id)?.value) as V | undefined;
        },
        set: (id, value) => {
          touch(id);
          if (++writeCount === this.failWriteAt) { this.failWriteAt = undefined; throw new StoreUnavailable('injected write failure'); }
          writes.set(id, structuredClone(value));
        },
      };
      const result = await work(tx);
      await this.beforeCommit?.(attempt);
      if ([...reads].some(([id, version]) => (this.cells.get(id)?.revision ?? 0) !== version)) { this.conflicts++; continue; }
      // No awaits between conflict check and publish: commit is one atomic JS turn.
      for (const [id, value] of writes) this.cells.set(id, { revision: ++this.revision, value });
      if (writes.size && this.loseNextResponse) { this.loseNextResponse = false; throw new CommitUnknown('committed, response lost'); }
      return result;
    }
    throw new StoreUnavailable('transaction retry budget exhausted');
  }
}
