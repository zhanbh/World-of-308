import type { EQUIPMENT_SLOTS } from '../../../shared/src/protocol/asset-v2.ts';
import type { EquipmentEntity, CharacterEntity, ContainerEntity } from '../character/character-model.ts';

export type EquipmentSlotName = typeof EQUIPMENT_SLOTS[number];

export interface RankingEntryEntity {
  schemaVersion: 2;
  id: string;
  characterId: string;
  accountId: string;
  classId: 'warrior' | 'hunter';
  characterName: string;
  level: number;
  score: string;
  scoreConfigRef: string;
  equipmentVersion: number;
  scoreReachedAt: number;
  projectionVersion: number;
  updatedAt: number;
}

export interface SetBonusConfig {
  setId: string;
  name: string;
  bonuses: Array<{
    pieceCount: number;
    affixes: Array<{ statId: string; value: number }>;
  }>;
}

export interface EquipmentCatalogItem {
  templateId: string;
  name: string;
  slotKind: EquipmentSlotName;
  itemLevel: number;
  quality: 'white' | 'green' | 'blue' | 'purple' | 'orange';
  allowedClasses?: ('warrior' | 'hunter')[];
  affixMaxValues?: Record<string, number>;
  setRef?: { id: string; version: number };
}

export type EquipmentCatalog = Record<string, EquipmentCatalogItem>;
