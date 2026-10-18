import type { ErrorCode, Loot } from '../../../shared/src/protocol/types.ts';
import type { Backpack, Character, DungeonConfig, Rules, RewardPlan } from './model.ts';
export class RuleError extends Error { code: ErrorCode; constructor(code: ErrorCode) { super(code); this.code = code; } }
export function requireRule(condition: unknown, code: ErrorCode): asserts condition { if (!condition) throw new RuleError(code); }
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}
export function add(a: number, b: number): number { const n = a + b; requireRule(integer(n), 'CONFIG_NOT_READY'); return n; }
export function refillWindow(now: number): number { return Math.floor((now + 8 * 3600_000) / (4 * 3600_000)); }
export function refreshStamina(character: Character, now: number): void {
  const window = refillWindow(now);
  if (window > character.stamina.refillWindow) character.stamina = { value: 308, refillWindow: window };
}
export function gainXp(character: Character, xp: number, rules: Rules): boolean {
  character.xp = add(character.xp, xp);
  const old = character.level;
  while (character.level < rules.xpThresholds.length && character.xp >= rules.xpThresholds[character.level]) character.level++;
  if (old !== character.level) character.statsVersion++;
  return old !== character.level;
}
export function putStack(bag: Backpack, templateId: string, quantity: number): boolean {
  const slots = structuredClone(bag.slots);
  for (const slot of slots) {
    if (slot.kind !== 'stack' || slot.templateId !== templateId) continue;
    const take = Math.min(20 - slot.quantity, quantity); slot.quantity += take; quantity -= take;
  }
  while (quantity > 0 && slots.length < bag.capacity) {
    const take = Math.min(20, quantity); slots.push({ kind: 'stack', templateId, quantity: take }); quantity -= take;
  }
  if (quantity > 0) return false;
  bag.slots = slots; return true;
}
export function validLoot(loot: Loot): boolean {
  return !!loot && typeof loot.templateId === 'string' && loot.templateId.length > 0 && loot.templateId.length <= 128 &&
    (loot.kind === 'material' ? integer(loot.quantity, 1, 20) : loot.kind === 'equipment' &&
      ['white','green','blue','purple','orange'].includes(loot.quality) && integer(loot.itemLevel, 1, 30));
}
export function validatePlan(plan: RewardPlan, completion = false): void {
  requireRule(!!plan && integer(plan.gold) && Array.isArray(plan.drops) && plan.drops.length <= 16 && plan.drops.every(validLoot), 'CONFIG_NOT_READY');
  if (completion) requireRule(plan.drops.length === 1 && plan.drops[0].kind === 'equipment', 'CONFIG_NOT_READY');
}
export function validateRules(rules: Rules): void {
  requireRule(Array.isArray(rules.xpThresholds) && rules.xpThresholds.length > 0 && rules.xpThresholds.length <= 30 &&
    rules.xpThresholds[0] === 0 && rules.xpThresholds.every((x, i, xs) => integer(x) && (i === 0 || x > xs[i-1])), 'CONFIG_NOT_READY');
  requireRule(rules.initialEmblems === 0 && rules.supportedClasses.length > 0 &&
    rules.supportedClasses.every(c => c === 'warrior' || c === 'hunter'), 'CONFIG_NOT_READY');
  const seen = new Set<string>();
  for (const config of rules.dungeons) {
    const id = JSON.stringify([config.dungeonId, config.difficultyId]);
    requireRule(!seen.has(id), 'CONFIG_NOT_READY'); seen.add(id); validateDungeon(config);
  }
}
function validateDungeon(c: DungeonConfig): void {
  requireRule(!!c.version && !!c.dungeonId && !!c.difficultyId && typeof c.special === 'boolean' &&
    integer(c.minLevel, 1, 30) && integer(c.maxLevel, c.minLevel, 30) && integer(c.completionXp) && !!c.completionTableId &&
    Array.isArray(c.rooms) && c.rooms.length > 0 && c.rooms.length <= 16 &&
    (!c.special || integer(c.reviveLimit)) && (c.reviveLimit === undefined || integer(c.reviveLimit)), 'CONFIG_NOT_READY');
  let bosses = 0;
  c.rooms.forEach((room, roomNo) => {
    const seen = new Set<string>();
    requireRule(Array.isArray(room) && room.length > 0 && room.length <= 64, 'CONFIG_NOT_READY');
    for (const monster of room) {
      requireRule(typeof monster.spawnId === 'string' && monster.spawnId.length > 0 && monster.spawnId.length <= 128 &&
        !seen.has(monster.spawnId) && integer(monster.xp) && !!monster.tableId, 'CONFIG_NOT_READY');
      seen.add(monster.spawnId);
      if (monster.finalBoss) { bosses++; requireRule(roomNo === c.rooms.length - 1, 'CONFIG_NOT_READY'); }
    }
  });
  requireRule(bosses === 1, 'CONFIG_NOT_READY');
}
