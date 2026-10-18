export interface Transaction {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): void;
}
export interface Store { run<T>(work: (tx: Transaction) => T | Promise<T>): Promise<T>; }
export interface Clock { now(): number; }
export interface IdSource { next(kind: string): string; }
export class CommitUnknown extends Error {}
export class StoreUnavailable extends Error {}
/** Tuple encoding for the memory adapter; cloud adapter must encode/hash physical IDs. */
export function key(...parts: (string | number)[]): string { return JSON.stringify(parts); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
