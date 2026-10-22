import type { CharacterSummary, LoginResponse } from '../../../shared/src/protocol/session-v2.ts';
export interface LoginAccount {
  schemaVersion: 2; id: string; version: number; writeRevision: number; createdAt: number; updatedAt: number;
  currentSessionId: string; sessionEpoch: number; characterIdsByClass: Partial<Record<'warrior' | 'hunter', string>>;
  selectedCharacterId?: string; activeChallengeId?: string; openSceneChallengeId?: string;
  walletId: string; accountVaultId: string; dungeonUnlocks: Record<string, string[]>;
}
export interface IdentityLink { schemaVersion: 2; id: string; tuple: string; accountId: string; }
export interface LoginAttempt {
  schemaVersion: 2; id: string; identityKey: string; tuple: string; launchIdHash: string; baseAccountId: string | null; baseSessionEpoch: number;
  issuedAt: number; expiresAt: number; status: 'prepared' | 'committed' | 'invalidated'; committedOpenRef?: string;
}
export interface LoginSession { schemaVersion: 2; id: string; accountId: string; launchIdHash: string; epoch: number; status: 'active' | 'revoked'; openedAt: number; revokedAt?: number; }
export interface LoginReceipt { schemaVersion: 2; id: string; identityKey: string; tuple: string; result: LoginResponse; }
export interface LoginCharacter extends CharacterSummary {
  schemaVersion: 2; accountId: string; version: number; rolePlayEpoch: number;
  location: { kind: 'inn'; characterId: string } | { kind: 'town'; mapId: string; anchorId: string } | { kind: 'challenge'; challengeId: string };
  stamina: { value: number; refillWindow: number }; staminaReservation?: string;
}
