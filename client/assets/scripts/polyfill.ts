export function deepClone<T>(val: T): T {
  if (val === null || typeof val !== 'object') return val;
  if (val instanceof Date) return new Date(val.getTime()) as unknown as T;
  if (val instanceof Set) return new Set(Array.from(val, deepClone)) as unknown as T;
  if (val instanceof Map) return new Map(Array.from(val.entries(), ([k, v]) => [deepClone(k), deepClone(v)])) as unknown as T;
  if (Array.isArray(val)) return val.map(deepClone) as unknown as T;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(val)) {
    copy[key] = deepClone((val as Record<string, unknown>)[key]);
  }
  return copy as T;
}

declare const GameGlobal: any;
declare const global: any;

const g: any = typeof globalThis !== 'undefined' ? globalThis :
               typeof window !== 'undefined' ? window :
               typeof GameGlobal !== 'undefined' ? GameGlobal :
               typeof global !== 'undefined' ? global : {};

if (typeof g.structuredClone !== 'function') {
  g.structuredClone = deepClone;
}
if (typeof (globalThis as any) !== 'undefined' && typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = deepClone;
}
if (typeof (window as any) !== 'undefined' && typeof (window as any).structuredClone !== 'function') {
  (window as any).structuredClone = deepClone;
}
if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.structuredClone !== 'function') {
  GameGlobal.structuredClone = deepClone;
}


