import type { RankingEntryEntity } from '../equipment/equipment-model.ts';
import type { Time } from '../../../shared/src/exact-values.ts';

export type RankingScope = 'all' | 'warrior' | 'hunter';

export interface RankingCursorPayload {
  v: 1;
  scope: RankingScope;
  configRef: string;
  rank: number;
  score: string;
  reachedAt: number;
  charId: string;
  iat: number;
}

export interface RankingEntryView {
  character: {
    characterId: string;
    classId: 'warrior' | 'hunter';
    characterName: string;
    level: number;
  };
  rank: number | null;
  score: {
    basis: 'intrinsicEquipmentValue';
    value: string;
    scoreConfigRef: string;
    equipmentVersion: number;
    scoreReachedAt: Time;
  };
}

export interface RankingListResult {
  entries: RankingEntryView[];
  ownRank: number | null;
  rankAsOf: Time;
  stale: boolean;
  nextCursor: string | null;
}

export function isRankingEntryEntity(val: unknown): val is RankingEntryEntity {
  if (!val || typeof val !== 'object') return false;
  const r = val as Partial<RankingEntryEntity>;
  return (
    r.schemaVersion === 2 &&
    typeof r.id === 'string' &&
    typeof r.characterId === 'string' &&
    (r.classId === 'warrior' || r.classId === 'hunter') &&
    typeof r.characterName === 'string' &&
    typeof r.level === 'number' &&
    typeof r.score === 'string' &&
    typeof r.scoreConfigRef === 'string' &&
    typeof r.scoreReachedAt === 'number'
  );
}
