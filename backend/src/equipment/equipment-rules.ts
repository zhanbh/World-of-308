import { EQUIPMENT_SLOTS } from '../../../shared/src/protocol/asset-v2.ts';
import type { EquipmentEntity, CharacterEntity } from '../character/character-model.ts';
import type { EquipmentSlotName, EquipmentCatalog, SetBonusConfig } from './equipment-model.ts';
import { resource, encodeResource } from '../../../shared/src/exact-values.ts';

export const WEARABLE_SLOTS: readonly EquipmentSlotName[] = [
  'weapon',
  'shoulder',
  'chest',
  'belt',
  'pants',
  'boots',
  'earring',
] as const;

export const NON_WEARABLE_SLOTS: readonly EquipmentSlotName[] = [
  'trinket',
  'bracelet',
  'necklace',
  'ring',
  'subEquip',
  'magicStone',
] as const;

export const SLOT_WEIGHTS: Record<EquipmentSlotName, number> = {
  weapon: 2,
  shoulder: 1,
  chest: 1,
  belt: 1,
  pants: 1,
  boots: 1,
  trinket: 0.75,
  bracelet: 0.75,
  necklace: 0.75,
  ring: 0.75,
  subEquip: 0.75,
  magicStone: 0.75,
  earring: 0.75,
};

export const QUALITY_MULTIPLIERS: Record<'white' | 'green' | 'blue' | 'purple' | 'orange', number> = {
  white: 1,
  green: 1.2,
  blue: 1.5,
  purple: 2,
  orange: 2.5,
};

export class Refusal extends Error {}
function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new Refusal(code);
}

export function isWearableSlot(slot: EquipmentSlotName): boolean {
  return WEARABLE_SLOTS.includes(slot);
}

export function validateEquipEligibility(
  character: CharacterEntity,
  item: EquipmentEntity,
  targetSlot: string,
  catalog?: EquipmentCatalog,
): void {
  requireValue((EQUIPMENT_SLOTS as readonly string[]).includes(targetSlot), 'ITEM_NOT_ELIGIBLE');
  requireValue(item.slotKind === targetSlot, 'ITEM_NOT_ELIGIBLE');
  requireValue(character.level >= item.itemLevel, 'ITEM_NOT_ELIGIBLE');

  if (catalog && Object.hasOwn(catalog, item.templateRef.id)) {
    const template = catalog[item.templateRef.id];
    if (template.allowedClasses && template.allowedClasses.length > 0) {
      requireValue(template.allowedClasses.includes(character.classId), 'ITEM_NOT_ELIGIBLE');
    }
  }

  if (item.binding.kind === 'character') {
    requireValue(item.binding.characterId === character.id, 'BINDING_RESTRICTED');
  }
}

export function applyEquipBinding(
  item: EquipmentEntity,
  accountId: string,
  characterId: string,
): EquipmentEntity['binding'] {
  if (item.quality === 'purple' || item.quality === 'orange') {
    if (item.binding.kind === 'none') {
      return { kind: 'character', accountId, characterId };
    }
  }
  return item.binding;
}

export function calculateSingleItemScore(
  item: EquipmentEntity,
  catalog?: EquipmentCatalog,
): number {
  const slotWeight = SLOT_WEIGHTS[item.slotKind as EquipmentSlotName] ?? 0.75;
  const qualityMult = QUALITY_MULTIPLIERS[item.quality] ?? 1;
  const enhancement = item.enhancementLevel ?? 0;

  let affixNormalizedSum = 0;
  if (Array.isArray(item.rolledAffixes) && item.rolledAffixes.length > 0) {
    const maxValues = catalog?.[item.templateRef.id]?.affixMaxValues;
    for (const affix of item.rolledAffixes) {
      const maxVal = maxValues?.[affix.stat] ?? 100;
      if (maxVal > 0) {
        affixNormalizedSum += affix.value / maxVal;
      }
    }
  }

  // Formula: floor(100 * itemLevel * slotWeight * [qualityMult + 0.05 * enhancementLevel + 0.1 * affixNormalizedSum])
  // P01: Score is purely intrinsic, unaffected by durability.current === 0
  const total = 100 * item.itemLevel * slotWeight * (qualityMult + 0.05 * enhancement + 0.1 * affixNormalizedSum);
  return Math.floor(total);
}

export function calculateTotalScore(
  equippedItems: Partial<Record<EquipmentSlotName, EquipmentEntity>>,
  catalog?: EquipmentCatalog,
): number {
  let score = 0;
  for (const slot of EQUIPMENT_SLOTS) {
    const item = equippedItems[slot];
    if (item) {
      score += calculateSingleItemScore(item, catalog);
    }
  }
  return score;
}

export function aggregateCombatAttributes(
  equippedItems: Partial<Record<EquipmentSlotName, EquipmentEntity>>,
  setConfigs?: Record<string, SetBonusConfig>,
): Array<{ statId: string; value: string }> {
  const totals: Record<string, number> = {};
  const setPieceCounts: Record<string, number> = {};

  for (const slot of EQUIPMENT_SLOTS) {
    const item = equippedItems[slot];
    if (!item) continue;

    // 0 durability check: if wearable slot has 0 durability, it does NOT contribute stats or set count!
    if (item.durability.wearEnabled && (item.durability.current === 0 || item.durability.current === null)) {
      continue;
    }

    if (Array.isArray(item.rolledAffixes)) {
      for (const affix of item.rolledAffixes) {
        totals[affix.stat] = (totals[affix.stat] ?? 0) + affix.value;
      }
    }

    if (item.setRef?.id) {
      setPieceCounts[item.setRef.id] = (setPieceCounts[item.setRef.id] ?? 0) + 1;
    }
  }

  // Evaluate set bonuses
  if (setConfigs) {
    for (const [setId, count] of Object.entries(setPieceCounts)) {
      const config = setConfigs[setId];
      if (!config) continue;
      for (const bonus of config.bonuses) {
        if (count >= bonus.pieceCount) {
          for (const affix of bonus.affixes) {
            totals[affix.statId] = (totals[affix.statId] ?? 0) + affix.value;
          }
        }
      }
    }
  }

  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([statId, val]) => ({
      statId,
      value: encodeResource(resource(String(val))),
    }));
}
