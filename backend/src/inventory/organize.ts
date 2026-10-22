import type { ContainerEntity, ContainerSlot, ContainerSlotStack } from '../character/character-model.ts';
import { EQUIPMENT_SLOTS } from '../../../shared/src/protocol/asset-v2.ts';

export type InventoryCatalog = Readonly<Record<string, { version: number; kind: 'consumable' | 'material'; quickAssignable: boolean }>>;
export type StackInput = Pick<ContainerSlotStack, 'stackId' | 'templateRef' | 'binding' | 'quantity' | 'traceRef'>;
export type StackOutput = StackInput & { ordinal: number };
const qualities = ['white', 'green', 'blue', 'purple', 'orange'];
const ref = (value: unknown): value is string => typeof value === 'string' && /^[\x21-\x7e]{1,128}$/.test(value);
const config = (): never => { throw new Error('CONFIG_NOT_READY'); };
const ineligible = (): never => { throw new Error('ITEM_NOT_ELIGIBLE'); };
const ownKeys = (value: object, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));

/** Validate bounded trusted headers without fetching equipment or traversing trace history. */
export function validateBackpack(container: ContainerEntity, catalog: InventoryCatalog): void {
  if (container.kind !== 'backpack' || !ref(container.characterId) || !ref(container.accountId)) ineligible();
  if (container.schemaVersion !== 2 || !ref(container.id) || !Number.isInteger(container.stage) || container.stage < 0 || container.stage > 4 || container.capacity !== 20 * (container.stage + 1)) config();
  if (!Number.isSafeInteger(container.version) || container.version < 0) config();
  if (!container.slots || typeof container.slots !== 'object' || Array.isArray(container.slots)) config();
  const ids = new Set<string>();
  for (const [key, slot] of Object.entries(container.slots)) {
    const index = Number(key);
    if (!Number.isInteger(index) || String(index) !== key || index < 0 || index >= container.capacity || !slot || typeof slot !== 'object') config();
    if (slot.kind === 'equipment') {
      if (!ownKeys(slot, ['kind', 'itemId', 'sortHeader']) || !ref(slot.itemId) || ids.has(slot.itemId)) config();
      ids.add(slot.itemId);
      const h = slot.sortHeader;
      if (!h || !ownKeys(h, ['itemLevel', 'quality', 'slotKind']) || ![10, 15, 20, 25, 30].includes(h.itemLevel) || !qualities.includes(h.quality) || !(EQUIPMENT_SLOTS as readonly string[]).includes(h.slotKind)) config();
    } else if (slot.kind === 'stack') {
      if (!ownKeys(slot, ['kind', 'stackId', 'templateRef', 'quantity', 'binding', 'traceRef']) || !ref(slot.stackId) || ids.has(slot.stackId) || !ref(slot.traceRef) || !slot.templateRef || !ownKeys(slot.templateRef, ['id', 'version']) || !ref(slot.templateRef.id) || !Number.isSafeInteger(slot.templateRef.version) || slot.templateRef.version < 1 || !Number.isInteger(slot.quantity) || slot.quantity < 1 || slot.quantity > 20) config();
      ids.add(slot.stackId);
      const c = Object.hasOwn(catalog, slot.templateRef.id) ? catalog[slot.templateRef.id] : undefined;
      if (!c || c.version !== slot.templateRef.version || !['consumable', 'material'].includes(c.kind) || typeof c.quickAssignable !== 'boolean') config();
      const b = slot.binding;
      if (!b || !ownKeys(b, ['kind', 'accountId', 'characterId'])) config();
      if (b.kind === 'none') { if (b.accountId !== undefined || b.characterId !== undefined) config(); }
      else if (b.kind === 'account') { if (b.accountId !== container.accountId || b.characterId !== undefined) ineligible(); }
      else if (b.kind === 'character') { if (b.accountId !== container.accountId || b.characterId !== container.characterId) ineligible(); }
      else config();
    } else config();
  }
}
const bindingKey = (s: ContainerSlotStack) => JSON.stringify([s.templateRef.id, s.templateRef.version, s.binding.kind, s.binding.accountId ?? null, s.binding.characterId ?? null]);
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function organizeBackpack(container: ContainerEntity, direction: 'forward' | 'reverse', catalog: InventoryCatalog, journalId: string): { slots: Record<number, ContainerSlot>; mergedStacks: number; lineage: { inputs: StackInput[]; outputs: StackOutput[] } } {
  validateBackpack(container, catalog);
  if (!ref(journalId) || journalId.length > 124 || !['forward', 'reverse'].includes(direction)) config();
  const occupied: ContainerSlot[] = Object.entries(container.slots).sort(([a], [b]) => Number(a) - Number(b)).map(([, s]) => structuredClone(s));
  const pools = new Map<string, ContainerSlotStack[]>();
  for (const slot of occupied) if (slot.kind === 'stack') { const key = bindingKey(slot); const pool = pools.get(key) ?? []; pool.push(slot); pools.set(key, pool); }
  const lineage: { inputs: StackInput[]; outputs: StackOutput[] } = { inputs: [], outputs: [] };
  const removed = new Set<string>();
  let mergedStacks = 0;
  for (const pool of pools.values()) {
    if (pool.length < 2) continue;
    const total = pool.reduce((sum, s) => sum + s.quantity, 0);
    const quantities = Array.from({ length: Math.ceil(total / 20) }, (_, i) => Math.min(20, total - i * 20));
    // A compact pool stays compact under reverse sorting; do not rewrite its ancestry.
    if (quantities.length === pool.length && pool.filter(s => s.quantity < 20).length <= 1) continue;
    lineage.inputs.push(...pool.map(s => structuredClone(s)));
    mergedStacks += pool.length - quantities.length;
    for (let i = 0; i < pool.length; i++) {
      const stack = pool[i]!;
      if (i >= quantities.length) { removed.add(stack.stackId); continue; }
      stack.quantity = quantities[i]!;
      const ordinal = lineage.outputs.length;
      stack.traceRef = `${journalId}:${ordinal}`;
      lineage.outputs.push({ ...structuredClone(stack), ordinal });
    }
  }
  const sorted = occupied.filter(s => s.kind !== 'stack' || !removed.has(s.stackId));
  sorted.sort((a, b) => {
    const category = (s: ContainerSlot) => s.kind === 'equipment' ? 0 : catalog[s.templateRef.id]!.kind === 'consumable' ? 1 : 2;
    const categoryDifference = category(a) - category(b);
    if (categoryDifference) return categoryDifference;
    if (a.kind === 'equipment' && b.kind === 'equipment') {
      return (EQUIPMENT_SLOTS as readonly string[]).indexOf(a.sortHeader.slotKind) - (EQUIPMENT_SLOTS as readonly string[]).indexOf(b.sortHeader.slotKind) || qualities.indexOf(b.sortHeader.quality) - qualities.indexOf(a.sortHeader.quality) || b.sortHeader.itemLevel - a.sortHeader.itemLevel;
    }
    if (a.kind === 'stack' && b.kind === 'stack') return compareText(a.templateRef.id, b.templateRef.id) || a.templateRef.version - b.templateRef.version;
    return 0;
  });
  if (direction === 'reverse') sorted.reverse();
  const offset = direction === 'reverse' ? container.capacity - sorted.length : 0;
  const slots: Record<number, ContainerSlot> = {};
  sorted.forEach((slot, index) => { slots[index + offset] = slot; });
  return { slots, mergedStacks, lineage };
}
