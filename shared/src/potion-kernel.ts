import type { ActionInput } from './protocol/simulation-v2.ts';
import type { CombatEvent } from './basic-combat-kernel.ts';

export interface PotionTemplate {
  templateId: string;
  kind: 'hp' | 'mp';
  tier: 10 | 15 | 20 | 25 | 30;
  restoreType: 'fixed' | 'percent';
  amount: number; // 150, 300, 550, 900 / 40, 70, 110, 160 or 30 (percent)
}

export const POTION_COOLDOWN_TICKS = 1000; // 10 seconds at 10ms per tick

export const POTION_CATALOG: Record<string, PotionTemplate> = {
  // HP Potions
  'item:hp-potion-small-v1': { templateId: 'item:hp-potion-small-v1', kind: 'hp', tier: 10, restoreType: 'fixed', amount: 150 },
  'potion_hp_minor': { templateId: 'potion_hp_minor', kind: 'hp', tier: 10, restoreType: 'fixed', amount: 150 },
  'item:hp-potion-medium-v1': { templateId: 'item:hp-potion-medium-v1', kind: 'hp', tier: 15, restoreType: 'fixed', amount: 300 },
  'potion_hp_medium': { templateId: 'potion_hp_medium', kind: 'hp', tier: 15, restoreType: 'fixed', amount: 300 },
  'item:hp-potion-large-v1': { templateId: 'item:hp-potion-large-v1', kind: 'hp', tier: 20, restoreType: 'fixed', amount: 550 },
  'potion_hp_large': { templateId: 'potion_hp_large', kind: 'hp', tier: 20, restoreType: 'fixed', amount: 550 },
  'item:hp-potion-greater-v1': { templateId: 'item:hp-potion-greater-v1', kind: 'hp', tier: 25, restoreType: 'fixed', amount: 900 },
  'potion_hp_greater': { templateId: 'potion_hp_greater', kind: 'hp', tier: 25, restoreType: 'fixed', amount: 900 },
  'item:hp-potion-max-v1': { templateId: 'item:hp-potion-max-v1', kind: 'hp', tier: 30, restoreType: 'percent', amount: 30 },
  'potion_hp_max': { templateId: 'potion_hp_max', kind: 'hp', tier: 30, restoreType: 'percent', amount: 30 },

  // MP Potions
  'item:mp-potion-small-v1': { templateId: 'item:mp-potion-small-v1', kind: 'mp', tier: 10, restoreType: 'fixed', amount: 40 },
  'potion_mp_minor': { templateId: 'potion_mp_minor', kind: 'mp', tier: 10, restoreType: 'fixed', amount: 40 },
  'item:mp-potion-medium-v1': { templateId: 'item:mp-potion-medium-v1', kind: 'mp', tier: 15, restoreType: 'fixed', amount: 70 },
  'potion_mp_medium': { templateId: 'potion_mp_medium', kind: 'mp', tier: 15, restoreType: 'fixed', amount: 70 },
  'item:mp-potion-large-v1': { templateId: 'item:mp-potion-large-v1', kind: 'mp', tier: 20, restoreType: 'fixed', amount: 110 },
  'potion_mp_large': { templateId: 'potion_mp_large', kind: 'mp', tier: 20, restoreType: 'fixed', amount: 110 },
  'item:mp-potion-greater-v1': { templateId: 'item:mp-potion-greater-v1', kind: 'mp', tier: 25, restoreType: 'fixed', amount: 160 },
  'potion_mp_greater': { templateId: 'potion_mp_greater', kind: 'mp', tier: 25, restoreType: 'fixed', amount: 160 },
  'item:mp-potion-max-v1': { templateId: 'item:mp-potion-max-v1', kind: 'mp', tier: 30, restoreType: 'percent', amount: 30 },
  'potion_mp_max': { templateId: 'potion_mp_max', kind: 'mp', tier: 30, restoreType: 'percent', amount: 30 },
};

export function resolvePotionTemplate(templateId: string): PotionTemplate | null {
  return POTION_CATALOG[templateId] ?? null;
}

export function resolvePotionRestore(template: PotionTemplate, maxHp: string, maxMp: string): { kind: 'hp' | 'mp'; amount: bigint } {
  if (template.restoreType === 'fixed') {
    return { kind: template.kind, amount: BigInt(template.amount) };
  }
  const maxVal = BigInt(template.kind === 'hp' ? maxHp : maxMp);
  // Integer arithmetic: (maxVal * 30n) / 100n
  const amount = (maxVal * BigInt(template.amount)) / 100n;
  return { kind: template.kind, amount };
}

export interface ContainerSlotStackLike {
  kind: 'stack';
  stackId: string;
  templateRef: { id: string; version: number };
  quantity: number;
  binding: { kind: 'none' | 'account' | 'character'; accountId?: string; characterId?: string };
  traceRef: string;
}

export interface ContainerEntityLike {
  id: string;
  slots: Record<number, any>;
  version: number;
  updatedAt: number;
}

export function consumePotionInventory(
  bag: ContainerEntityLike,
  templateId: string
): { consumed: boolean; slotIndex?: number; stackId?: string } {
  const eligible: Array<{ slotIndex: number; slot: ContainerSlotStackLike; bindingRank: number }> = [];

  for (const [key, slot] of Object.entries(bag.slots)) {
    const slotIndex = Number(key);
    if (!Number.isSafeInteger(slotIndex)) continue;
    if (slot && slot.kind === 'stack' && slot.templateRef?.id === templateId && slot.quantity > 0) {
      const bindingKind = slot.binding?.kind ?? 'none';
      const bindingRank = bindingKind === 'character' ? 0 : bindingKind === 'account' ? 1 : 2;
      eligible.push({ slotIndex, slot, bindingRank });
    }
  }

  if (eligible.length === 0) {
    return { consumed: false };
  }

  // Priority: character (0) -> account (1) -> none (2), then slotIndex ascending
  eligible.sort((a, b) => a.bindingRank - b.bindingRank || a.slotIndex - b.slotIndex);

  const target = eligible[0];
  const newQuantity = target.slot.quantity - 1;
  if (newQuantity <= 0) {
    delete bag.slots[target.slotIndex];
  } else {
    bag.slots[target.slotIndex] = {
      ...target.slot,
      quantity: newQuantity
    };
  }

  return { consumed: true, slotIndex: target.slotIndex, stackId: target.slot.stackId };
}

export interface PotionExecutionState {
  quickSlots: (string | null)[];
  bag: ContainerEntityLike;
  player: {
    hp: string;
    maxHp: string;
    mp: string;
    maxMp: string;
    lifeState: 'alive' | 'dead';
  };
  cooldowns: Array<{
    kind: 'cooldown';
    actorId: string;
    cooldownId: string;
    readyAtTick: number;
  }>;
  hpRegenRemainder?: { numerator: number; denominator: number };
  mpRegenRemainder?: { numerator: number; denominator: number };
}

export interface PotionContext {
  challengeId: string;
  sceneEpoch: number;
  actorId: string;
}

export interface PotionResult {
  outcome: 'accepted' | 'rejected';
  code?: string;
  event: CombatEvent;
  consumed: boolean;
}

export function applyPotionInput(
  input: ActionInput & { kind: 'item' },
  state: PotionExecutionState,
  context: PotionContext
): PotionResult {
  const emit = (kind: 'actionAccepted' | 'actionRejected', code: string | null = null): CombatEvent => ({
    kind,
    eventId: `combat:potion:${context.challengeId}:${context.sceneEpoch}:${input.tick}:${input.seq}`,
    actorId: context.actorId,
    tick: input.tick,
    seq: input.seq,
    targetId: null,
    damage: null,
    critical: null,
    code
  });

  // 1. QuickSlot boundary validation
  if (input.quickSlotIndex < 0 || input.quickSlotIndex > 2) {
    return { outcome: 'rejected', code: 'INVALID_SLOT_INDEX', event: emit('actionRejected', 'INVALID_SLOT_INDEX'), consumed: false };
  }

  const assignedTemplate = state.quickSlots[input.quickSlotIndex];
  if (assignedTemplate === null || assignedTemplate === undefined) {
    return { outcome: 'rejected', code: 'SLOT_EMPTY', event: emit('actionRejected', 'SLOT_EMPTY'), consumed: false };
  }

  if (assignedTemplate !== input.templateId) {
    return { outcome: 'rejected', code: 'TEMPLATE_MISMATCH', event: emit('actionRejected', 'TEMPLATE_MISMATCH'), consumed: false };
  }

  // 2. Template resolution
  const template = resolvePotionTemplate(input.templateId);
  if (!template) {
    return { outcome: 'rejected', code: 'INVALID_TEMPLATE', event: emit('actionRejected', 'INVALID_TEMPLATE'), consumed: false };
  }

  // 3. Player life state
  if (state.player.lifeState === 'dead') {
    return { outcome: 'rejected', code: 'PLAYER_DEAD', event: emit('actionRejected', 'PLAYER_DEAD'), consumed: false };
  }

  // 4. Cooldown check
  const cdId = template.kind === 'hp' ? 'hpPotion' : 'mpPotion';
  const cd = state.cooldowns.find(c => c.cooldownId === cdId);
  if (cd && input.tick < cd.readyAtTick) {
    return { outcome: 'rejected', code: 'COOLDOWN_ACTIVE', event: emit('actionRejected', 'COOLDOWN_ACTIVE'), consumed: false };
  }

  // 5. Full resource check (no consumption, no CD trigger)
  if (template.kind === 'hp' && BigInt(state.player.hp) >= BigInt(state.player.maxHp)) {
    return { outcome: 'rejected', code: 'HP_FULL', event: emit('actionRejected', 'HP_FULL'), consumed: false };
  }
  if (template.kind === 'mp' && BigInt(state.player.mp) >= BigInt(state.player.maxMp)) {
    return { outcome: 'rejected', code: 'MP_FULL', event: emit('actionRejected', 'MP_FULL'), consumed: false };
  }

  // 6. Inventory check & deduction
  const inv = consumePotionInventory(state.bag, input.templateId);
  if (!inv.consumed) {
    return { outcome: 'rejected', code: 'OUT_OF_STOCK', event: emit('actionRejected', 'OUT_OF_STOCK'), consumed: false };
  }

  // 7. Apply restoration
  const restore = resolvePotionRestore(template, state.player.maxHp, state.player.maxMp);
  if (restore.kind === 'hp') {
    const cur = BigInt(state.player.hp);
    const max = BigInt(state.player.maxHp);
    const next = cur + restore.amount >= max ? max : cur + restore.amount;
    state.player.hp = String(next);
    if (next === max && state.hpRegenRemainder) {
      state.hpRegenRemainder.numerator = 0;
      state.hpRegenRemainder.denominator = 1;
    }
  } else {
    const cur = BigInt(state.player.mp);
    const max = BigInt(state.player.maxMp);
    const next = cur + restore.amount >= max ? max : cur + restore.amount;
    state.player.mp = String(next);
    if (next === max && state.mpRegenRemainder) {
      state.mpRegenRemainder.numerator = 0;
      state.mpRegenRemainder.denominator = 1;
    }
  }

  // 8. Update cooldown
  if (cd) {
    cd.readyAtTick = input.tick + POTION_COOLDOWN_TICKS;
  }

  return {
    outcome: 'accepted',
    event: emit('actionAccepted', null),
    consumed: true
  };
}
