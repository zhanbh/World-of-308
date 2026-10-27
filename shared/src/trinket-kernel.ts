import type { ActionInput } from './protocol/simulation-v2.ts';
import type { CombatEvent, Rational } from './basic-combat-kernel.ts';

const q = (n: bigint, d = 1n): Rational => {
  let a = n < 0n ? -n : n, b = d;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return { n: String(n / (a || 1n)), d: String(d / (a || 1n)) };
};

export const addRational = (a: Rational, b: Rational): Rational =>
  q(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d));


export interface TrinketTemplate {
  templateId: string;
  name: string;
  tier: 10 | 15 | 20 | 25 | 30;
  cooldownTicks: number; // 12000 ticks = 120s
  durationTicks: number; // 1500 ticks = 15s
  equipWaitTicks: number; // 6000 ticks = 60s
  effects: {
    attackPower?: string;
    haste?: Rational;
    damageBonus?: Rational;
    crit?: Rational;
    critMultiplier?: Rational;
  };
}

export const TRINKET_COOLDOWN_TICKS = 12000; // 120s at 10ms per tick
export const TRINKET_BUFF_DURATION_TICKS = 1500; // 15s at 10ms per tick
export const TRINKET_EQUIP_WAIT_TICKS = 6000; // 60s at 10ms per tick

const WARRIOR_GLORY: TrinketTemplate = {
  templateId: 'item:trinket-warrior-glory-v1',
  name: '战神荣耀徽记',
  tier: 30,
  cooldownTicks: TRINKET_COOLDOWN_TICKS,
  durationTicks: TRINKET_BUFF_DURATION_TICKS,
  equipWaitTicks: TRINKET_EQUIP_WAIT_TICKS,
  effects: {
    attackPower: '150',
    crit: { n: '1', d: '20' },
    critMultiplier: { n: '1', d: '5' }
  }
};

const POWER_AMULET: TrinketTemplate = {
  templateId: 'item:trinket-power-v1',
  name: '蛮力护符',
  tier: 20,
  cooldownTicks: TRINKET_COOLDOWN_TICKS,
  durationTicks: TRINKET_BUFF_DURATION_TICKS,
  equipWaitTicks: TRINKET_EQUIP_WAIT_TICKS,
  effects: {
    attackPower: '100'
  }
};

const HASTE_CRYSTAL: TrinketTemplate = {
  templateId: 'item:trinket-haste-v1',
  name: '疾风结晶',
  tier: 25,
  cooldownTicks: TRINKET_COOLDOWN_TICKS,
  durationTicks: TRINKET_BUFF_DURATION_TICKS,
  equipWaitTicks: TRINKET_EQUIP_WAIT_TICKS,
  effects: {
    haste: { n: '1', d: '10' }
  }
};

const MINOR_AMULET: TrinketTemplate = {
  templateId: 'item:trinket-minor-v1',
  name: '学徒护符',
  tier: 10,
  cooldownTicks: TRINKET_COOLDOWN_TICKS,
  durationTicks: TRINKET_BUFF_DURATION_TICKS,
  equipWaitTicks: TRINKET_EQUIP_WAIT_TICKS,
  effects: {
    attackPower: '50'
  }
};

const MEDIUM_BADGE: TrinketTemplate = {
  templateId: 'item:trinket-medium-v1',
  name: '精兵徽章',
  tier: 15,
  cooldownTicks: TRINKET_COOLDOWN_TICKS,
  durationTicks: TRINKET_BUFF_DURATION_TICKS,
  equipWaitTicks: TRINKET_EQUIP_WAIT_TICKS,
  effects: {
    attackPower: '75'
  }
};

export const TRINKET_CATALOG: Record<string, TrinketTemplate> = {
  'item:trinket-warrior-glory-v1': WARRIOR_GLORY,
  'trinket_glory': WARRIOR_GLORY,
  'item:trinket-power-v1': POWER_AMULET,
  'trinket_power': POWER_AMULET,
  'item:trinket-haste-v1': HASTE_CRYSTAL,
  'trinket_haste': HASTE_CRYSTAL,
  'item:trinket-minor-v1': MINOR_AMULET,
  'trinket_minor': MINOR_AMULET,
  'item:trinket-medium-v1': MEDIUM_BADGE,
  'trinket_medium': MEDIUM_BADGE
};

export function resolveTrinketTemplate(templateId: string): TrinketTemplate | null {
  return TRINKET_CATALOG[templateId] ?? null;
}

export interface TrinketBuffRecord {
  kind: 'buff';
  buffId: string;
  actorId: string;
  templateRef: string;
  endsAtTick: number;
}

export interface TrinketExecutionState {
  player: {
    hp: string;
    maxHp: string;
    mp: string;
    maxMp: string;
    lifeState: 'alive' | 'dead';
  };
  equippedTrinket?: {
    itemId: string;
    templateRef: string;
    equippedAtTick?: number;
  } | null;
  cooldowns: Array<{
    kind: 'cooldown';
    actorId: string;
    cooldownId: string;
    readyAtTick: number;
  }>;
  buffs: TrinketBuffRecord[];
  equipWaitUntilTick?: number;
}

export interface TrinketContext {
  challengeId: string;
  sceneEpoch: number;
  actorId: string;
}

export interface TrinketResult {
  outcome: 'accepted' | 'rejected';
  code?: string;
  event: CombatEvent;
  activated: boolean;
  buff?: TrinketBuffRecord;
}

export function applyTrinketInput(
  input: ActionInput & { kind: 'trinket' },
  state: TrinketExecutionState,
  context: TrinketContext
): TrinketResult {
  const emit = (kind: 'actionAccepted' | 'actionRejected', code: string | null = null): CombatEvent => ({
    kind,
    eventId: `combat:trinket:${context.challengeId}:${context.sceneEpoch}:${input.tick}:${input.seq}`,
    actorId: context.actorId,
    tick: input.tick,
    seq: input.seq,
    targetId: null,
    damage: null,
    critical: null,
    code
  });

  // 1. Player life state
  if (state.player.lifeState === 'dead') {
    return { outcome: 'rejected', code: 'PLAYER_DEAD', event: emit('actionRejected', 'PLAYER_DEAD'), activated: false };
  }

  // 2. Equipped check
  if (!state.equippedTrinket || state.equippedTrinket.itemId !== input.itemId) {
    return { outcome: 'rejected', code: 'ITEM_NOT_EQUIPPED', event: emit('actionRejected', 'ITEM_NOT_EQUIPPED'), activated: false };
  }

  // 3. Resolve template
  const template = resolveTrinketTemplate(state.equippedTrinket.templateRef);
  if (!template) {
    return { outcome: 'rejected', code: 'INVALID_TEMPLATE', event: emit('actionRejected', 'INVALID_TEMPLATE'), activated: false };
  }

  // 4. Equip wait check (60s wait period)
  if (state.equipWaitUntilTick !== undefined && input.tick < state.equipWaitUntilTick) {
    return { outcome: 'rejected', code: 'EQUIP_WAITING', event: emit('actionRejected', 'EQUIP_WAITING'), activated: false };
  }

  // 5. Cooldown check (120s CD)
  const cd = state.cooldowns.find(c => c.cooldownId === 'trinket');
  if (cd && input.tick < cd.readyAtTick) {
    return { outcome: 'rejected', code: 'COOLDOWN_ACTIVE', event: emit('actionRejected', 'COOLDOWN_ACTIVE'), activated: false };
  }

  // 6. Set cooldown
  const cdTicks = template.cooldownTicks ?? TRINKET_COOLDOWN_TICKS;
  if (cd) {
    cd.readyAtTick = input.tick + cdTicks;
  } else {
    state.cooldowns.push({
      kind: 'cooldown',
      actorId: context.actorId,
      cooldownId: 'trinket',
      readyAtTick: input.tick + cdTicks
    });
  }

  // 7. Add buff
  const durTicks = template.durationTicks ?? TRINKET_BUFF_DURATION_TICKS;
  const buff: TrinketBuffRecord = {
    kind: 'buff',
    buffId: `buff:trinket:${context.challengeId}:${context.sceneEpoch}:${input.tick}:${input.seq}`,
    actorId: context.actorId,
    templateRef: template.templateId,
    endsAtTick: input.tick + durTicks
  };
  state.buffs.push(buff);

  return {
    outcome: 'accepted',
    event: emit('actionAccepted', null),
    activated: true,
    buff
  };
}

export interface TrinketAttributeModifiers {
  attackPower: bigint;
  haste: Rational;
  damageBonus: Rational;
  crit: Rational;
  critMultiplier: Rational;
}

export function aggregateTrinketModifiers(
  buffs: Array<{ templateRef: string; endsAtTick: number }>,
  currentTick: number
): TrinketAttributeModifiers {
  let attackPower = 0n;
  let haste: Rational = { n: '0', d: '1' };
  let damageBonus: Rational = { n: '0', d: '1' };
  let crit: Rational = { n: '0', d: '1' };
  let critMultiplier: Rational = { n: '0', d: '1' };

  for (const buff of buffs) {
    if (currentTick < buff.endsAtTick) {
      const template = resolveTrinketTemplate(buff.templateRef);
      if (template) {
        if (template.effects.attackPower) {
          attackPower += BigInt(template.effects.attackPower);
        }
        if (template.effects.haste) {
          haste = addRational(haste, template.effects.haste);
        }
        if (template.effects.damageBonus) {
          damageBonus = addRational(damageBonus, template.effects.damageBonus);
        }
        if (template.effects.crit) {
          crit = addRational(crit, template.effects.crit);
        }
        if (template.effects.critMultiplier) {
          critMultiplier = addRational(critMultiplier, template.effects.critMultiplier);
        }
      }
    }
  }

  return { attackPower, haste, damageBonus, crit, critMultiplier };
}

export function pruneExpiredBuffs<B extends { endsAtTick: number }>(buffs: B[], currentTick: number): B[] {
  return buffs.filter(b => currentTick < b.endsAtTick);
}

export function applyTrinketStats<T extends import('./basic-combat-kernel.ts').CombatStats>(
  base: T,
  buffs: Array<{ templateRef: string; endsAtTick: number }>,
  tick: number
): T {
  const mod = aggregateTrinketModifiers(buffs, tick);
  if (
    mod.attackPower === 0n &&
    mod.haste.n === '0' &&
    mod.damageBonus.n === '0' &&
    mod.crit.n === '0' &&
    mod.critMultiplier.n === '0'
  ) {
    return base;
  }
  const ap = BigInt(base.attackPower) + mod.attackPower;
  const haste = addRational(base.haste, mod.haste);
  const cappedHaste = BigInt(haste.n) > 2n * BigInt(haste.d) ? { n: '2', d: '1' } : haste;
  const damageBonus = addRational(base.damageBonus, mod.damageBonus);
  const crit = addRational(base.crit, mod.crit);
  const cappedCrit = BigInt(crit.n) > BigInt(crit.d) ? { n: '1', d: '1' } : crit;
  const critMultiplier = addRational(base.critMultiplier, mod.critMultiplier);

  return {
    ...base,
    attackPower: String(ap),
    haste: cappedHaste,
    damageBonus,
    crit: cappedCrit,
    critMultiplier
  };
}

