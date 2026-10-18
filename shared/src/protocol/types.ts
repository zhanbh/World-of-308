/** Public values only. Authentication and private reward generation stay in backend. */
export type CharacterClass = 'warrior' | 'hunter';
export type Quality = 'white' | 'green' | 'blue' | 'purple' | 'orange';
export type Loot =
  | { kind: 'material'; templateId: string; quantity: number }
  | { kind: 'equipment'; templateId: string; quality: Quality; itemLevel: number };
export type BattleEvent =
  | { seq: number; kind: 'playerDied'; deathIndex: number; simulationTick: number; lingeringSourceIds: string[] }
  | { seq: number; kind: 'monsterKilled'; spawnId: string; simulationTick: number;
      source: { kind: 'direct' | 'dot' | 'lingering'; sourceId: string } };
export type Payloads = {
  'character.create': { classId: CharacterClass };
  'challenge.start': { characterId: string; dungeonId: string; difficultyId: string };
  'challenge.enterRoom': { challengeId: string; roomNo: number };
  'challenge.reportEvents': { challengeId: string; roomToken: string; firstSeq: number; events: BattleEvent[] };
  'challenge.revive': { challengeId: string; deathIndex: number };
  'challenge.leave': { challengeId: string; reason: 'abandon' | 'finishLoot' };
  'drop.collect': { challengeId: string; roomNo: number; dropId: string; sceneEpoch: number };
  'reward.claim': { sourceId: string };
};
export type Command = { [K in keyof Payloads]: {
  protocolVersion: 1; command: K; operationId: string;
  expected?: { challengeVersion?: number; characterVersion?: number; containerVersion?: number };
  payload: Payloads[K];
} }[keyof Payloads];
export type ErrorCode =
  | 'INVALID_ARGUMENT' | 'AUTH_REQUIRED' | 'SESSION_REVOKED' | 'NOT_FOUND_OR_FORBIDDEN'
  | 'OPERATION_MISMATCH' | 'VERSION_CONFLICT' | 'CLASS_EXISTS' | 'CONFIG_NOT_READY'
  | 'ACTIVE_CHALLENGE_EXISTS' | 'SCENE_STILL_OPEN' | 'STAMINA_NOT_ENOUGH'
  | 'ROOM_NOT_AVAILABLE' | 'CHALLENGE_TERMINAL' | 'SCENE_CLOSED' | 'DEADLINE_EXPIRED'
  | 'NOT_DEAD' | 'EMBLEM_NOT_ENOUGH' | 'REVIVE_LIMIT_REACHED' | 'BAG_FULL'
  | 'EVENT_GAP' | 'EVENT_ALREADY_ACCEPTED' | 'INVALID_EVENT' | 'RECOVERY_REQUIRED';
export type Outcome = { status: 'committed'; data: Record<string, unknown> }
  | { status: 'rejected'; code: ErrorCode }
  | { status: 'unknown'; code: 'RESULT_UNKNOWN' };
export interface Response { operationId: string; serverTime: number; replayed: boolean; outcome: Outcome; }
