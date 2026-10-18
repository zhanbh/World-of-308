import type { CharacterClass, Loot } from '../../../shared/src/protocol/types.ts';
export interface Principal { platform: string; appId: string; subject: string; }
/** Must be supplied by a trusted transport adapter, never copied from request JSON. */
export interface Auth { principal: Principal; accountId: string; sessionId: string; epoch: number; }
export interface Account {
  id: string; sessionId: string; epoch: number; writeRevision: number;
  characters: Partial<Record<CharacterClass, string>>; activeChallengeId?: string; openSceneChallengeId?: string;
}
export interface Session { id: string; accountId: string; launchId: string; epoch: number; revoked: boolean; }
export interface Character {
  id: string; accountId: string; classId: CharacterClass; level: number; xp: number;
  statsVersion: number; equipmentVersion: number; equipped: string[];
  stamina: { value: number; refillWindow: number }; version: number;
}
export interface Wallet { gold: number; points: number; version: number; }
export type Slot = { kind: 'stack'; templateId: string; quantity: number }
  | { kind: 'equipment'; itemId: string };
export interface Backpack { accountId: string; characterId: string; capacity: number; slots: Slot[]; version: number; }
export interface Equipment {
  id: string; accountId: string; characterId: string; sourceId: string;
  descriptor: Extract<Loot, { kind: 'equipment' }>; binding: 'none' | 'character'; location: 'backpack' | 'pending';
}
export interface Monster { spawnId: string; xp: number; finalBoss?: boolean; tableId: string; }
export interface DungeonConfig {
  version: string; dungeonId: string; difficultyId: string; special: boolean;
  minLevel: number; maxLevel: number; reviveLimit?: number; rooms: Monster[][];
  completionXp: number; completionTableId: string;
}
export interface Rules {
  xpThresholds: number[]; supportedClasses: CharacterClass[]; initialEmblems: number;
  dungeons: DungeonConfig[];
}
export interface RewardPlan { gold: number; drops: Loot[]; }
export interface RewardGenerator { roll(tableId: string, sourceId: string): RewardPlan; }
export interface Drop { id: string; sourceId: string; loot: Loot; state: 'ground' | 'collected'; }
export interface Kill { mode: 'direct' | 'dot' | 'lingering' | 'indirect'; seq: number; xp: number; gold: number; }
export interface Room {
  challengeId: string; roomNo: number; token: string; paidCost: number; paidAt: number;
  manifest: Monster[]; kills: Record<string, Kill>; drops: Drop[]; cleared: boolean;
  simulationTick: number; version: number;
}
export interface Challenge {
  id: string; accountId: string; characterId: string; sessionId: string; configVersion: string;
  dungeonId: string; difficultyId: string; lockedMonsterLevel: number;
  entryEquipment: string[]; attributeRevision: number; result: 'active' | 'completed' | 'failed';
  lifeState: 'alive' | 'dead'; deathIndex: number; deathDeadline?: number; lingeringSources: string[];
  paidRevives: number; currentRoomNo: number; sceneState: 'combat' | 'looting' | 'closed'; sceneEpoch: number;
  lastEventSeq: number; lastBatch?: { firstSeq: number; lastSeq: number; hash: string };
  controlSeq: number; protectionUntil?: number; version: number;
  lease: { until: number; lastSeq: number; mode: 'connected' | 'recovery'; recoveryUntil?: number; revision: number };
}
export interface Grant { sourceId: string; accountId: string; characterId: string; itemId: string; state: 'pending' | 'delivered'; }
export interface Journal { operationId: string; command: string; accountId: string; changes: Record<string, unknown>; }
