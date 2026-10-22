import type { CharacterSummary, Expected, CharacterResponse } from '../../../shared/src/protocol/session-v2.ts';

export interface CharacterNameOccupancy {
  schemaVersion: 2;
  id: string; // v2:name:{name}
  name: string;
  accountId: string;
  characterId: string;
  createdAt: number;
}

export interface CharacterEntity extends CharacterSummary {
  schemaVersion: 2;
  id: string;
  accountId: string;
  version: number;
  xp: number;
  rolePlayEpoch: number;
  statsVersion: number;
  equipmentVersion: number;
  equipped: Partial<Record<'weapon' | 'shoulder' | 'chest' | 'pants' | 'belt' | 'boots' | 'bracelet' | 'necklace' | 'ring' | 'subEquip' | 'magicStone' | 'earring' | 'trinket', string>>;
  backpackId: string;
  personalVaultId: string;
  stamina: { value: number; refillWindow: number };
  staminaReservation?: string;
  quickSlots: (string | null)[];
  location: { kind: 'inn'; characterId: string } | { kind: 'town'; mapId: string; anchorId: string } | { kind: 'challenge'; challengeId: string };
  progressionConfigRef: { id: string; version: number };
  createdAt: number;
  updatedAt: number;
}

export interface ContainerSlotEquipment {
  kind: 'equipment';
  itemId: string;
  sortHeader: { itemLevel: number; quality: string; slotKind: string };
}

export interface ContainerSlotStack {
  kind: 'stack';
  stackId: string;
  templateRef: { id: string; version: number };
  quantity: number;
  binding: { kind: 'none' | 'account' | 'character'; accountId?: string; characterId?: string };
  traceRef: string;
}

export type ContainerSlot = ContainerSlotEquipment | ContainerSlotStack;

export interface ContainerEntity {
  schemaVersion: 2;
  id: string;
  accountId: string;
  characterId?: string;
  kind: 'backpack' | 'personalVault' | 'accountVault';
  capacity: number;
  stage: number;
  slots: Record<number, ContainerSlot>;
  unlockConfigRef?: { id: string; version: number };
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface EquipmentEntity {
  schemaVersion: 2;
  id: string;
  accountId: string;
  holderCharacterId?: string;
  sourceKey: string;
  sourceOrdinal: number;
  sourceLocator: { kind: string; [key: string]: unknown };
  templateRef: { id: string; version: number };
  itemLevel: number;
  quality: 'white' | 'green' | 'blue' | 'purple' | 'orange';
  rolledAffixes: Array<{ stat: string; value: number }>;
  setRef: { id: string; version: number } | null;
  binding: { kind: 'none' | 'account' | 'character'; accountId?: string; characterId?: string };
  enhancementLevel: number;
  durability: {
    wearEnabled: boolean;
    current: number | null;
    max: number | null;
    policyRef: string;
  };
  location: { kind: 'container'; containerId: string } | { kind: 'equipped'; characterId: string; slotId: string } | { kind: 'pending'; grantId: string };
  lifecycle: 'active' | 'destroyed' | 'sold' | 'expired';
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface MailAttachment {
  attachmentId: string;
  kind: 'equipment' | 'stack';
  templateRef: { id: string; version: number };
  quantityGranted: number;
  quantityClaimed: number;
  binding: { kind: 'none' | 'account' | 'character'; accountId?: string; characterId?: string };
  state: 'available' | 'claimed';
}

export interface MailEntity {
  schemaVersion: 2;
  id: string;
  accountId: string;
  characterId: string;
  sourceKey: string;
  titleKey: string;
  bodyKey: string;
  parameters: Record<string, string | number>;
  expiresAt: number;
  status: 'active' | 'deleted' | 'expired';
  attachments: MailAttachment[];
  createdAt: number;
  updatedAt: number;
}

export interface NoviceGrantStub {
  schemaVersion: 2;
  id: string;
  accountId: string;
  characterId: string;
  sourceType: 'novice-gift';
  sourceTuple: string;
  route: 'mail';
  deliveryState: 'delivered';
  relatedId: string;
  deliveredAt: number;
}

export interface CharacterReceipt {
  schemaVersion: 2;
  id: string;
  accountId: string;
  tuple: string;
  result: CharacterResponse;
  createdAt: number;
}
