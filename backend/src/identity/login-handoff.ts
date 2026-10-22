import type { Transaction } from '../ports/store.ts';
import type { LoginAccount, LoginCharacter } from './login-model.ts';
import type { CharacterSummary, Expected } from '../../../shared/src/protocol/session-v2.ts';
import { canonical } from '../ports/store.ts';
import { loginKey } from './identity-v2.ts';

export interface HandoffChallenge {
  schemaVersion: 2; id: string; accountId: string; characterId: string; sessionId: string; version: number;
  result: 'active' | 'completed' | 'failed'; sceneState: 'combat' | 'looting' | 'closed'; sceneEpoch: number;
  currentRoomNo?: number; roomPhase?: 'preparing' | 'awaitingReady' | 'active' | 'cleared' | 'closed';
  staminaSnapshot: { entryValue: number; remaining: number; entryRefillWindow: number; entryAt: number; revision: number };
  staminaSettlement: { state: 'unsettled' } | { state: 'settled'; settledAt: number; loadedRefillWindow: number; loadedValue: number; sourceChallengeId: string };
  transitionClock?: unknown;
}
export interface HandoffCheckpointHeader {
  schemaVersion: 2; id: string; challengeId: string; accountId: string; characterId: string; revision: number; sceneEpoch: number; acceptingInputs: boolean; closedAt?: number;
  activeChunks: { ordinal: number; chunkRevision: number; hash: string; sceneEpoch: number }[];
}
export interface HandoffCheckpointChunk {
  schemaVersion: 2; id: string; challengeId: string; accountId: string; ordinal: number; chunkRevision: number; sceneEpoch: number; hash: string; data: unknown;
}
export interface InnRoleState {
  kind: 'inn'; rolePlayEpoch: number; resetAt: number; lifeState: 'alive'; hp: 'full'; mp: 'full'; cooldowns: 'cleared'; buffs: 'cleared'; control: 'cleared';
  hpRegenerationRemainder: { numerator: 0; denominator: 1 }; mpRegenerationRemainder: { numerator: 0; denominator: 1 };
}
export interface HandoffCharacter extends LoginCharacter { roleState?: InnRoleState; }

export interface HandoffResult {
  account: LoginAccount;
  characters: CharacterSummary[];
  selectedCharacter: { characterId: string; rolePlayEpoch: number } | null;
  resultVersions: Expected[];
}
function integrity(): never { throw new Error('LOGIN_HANDOFF_INTEGRITY'); }
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0)) integrity();
  return value;
}
function refillWindow(now: number): number { return Math.floor((integer(now) + 8 * 3600000) / (4 * 3600000)); }
export async function checkpointDataHash(data: unknown): Promise<string> {
  const encoded = canonical(data);
  if (typeof encoded !== 'string' || new TextEncoder().encode(encoded).length > 81920) integrity();
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function validateCharacter(character: LoginCharacter | undefined, accountId: string, characterId: string, classId: string): LoginCharacter {
  if (!character || character.schemaVersion !== 2 || character.accountId !== accountId || character.characterId !== characterId || character.classId !== classId) integrity();
  integer(character.version); integer(character.rolePlayEpoch, 1); integer(character.level, 1, 30);
  integer(character.stamina?.value, 0, 308); integer(character.stamina?.refillWindow);
  if (typeof character.characterName !== 'string' || !/^(?:[A-Za-z]{1,12}|\p{Unified_Ideograph}{1,6})$/u.test(character.characterName)) integrity();
  return character;
}
/** Runs within the caller's account/session commit transaction; never commits an independent transaction. */
export async function handoff(tx: Transaction, account: LoginAccount, now: number, operationId: string, receiptId: string): Promise<HandoffResult> {
  integer(now); integer(account.version); integer(account.writeRevision);
  if (account.schemaVersion !== 2 || Object.keys(account.characterIdsByClass).some(c => c !== 'warrior' && c !== 'hunter')) integrity();
  const next = structuredClone(account), currentWindow = refillWindow(now), characters: CharacterSummary[] = [], resultVersions: Expected[] = [];
  let selectedCharacter: HandoffResult['selectedCharacter'] = null;
  if (account.activeChallengeId && account.openSceneChallengeId && account.activeChallengeId !== account.openSceneChallengeId) integrity();
  const challengeId = account.activeChallengeId ?? account.openSceneChallengeId;
  let challenge: HandoffChallenge | undefined, header: HandoffCheckpointHeader | undefined;
  if (challengeId) {
    challenge = await tx.get<HandoffChallenge>(challengeId);
    if (!challenge || challenge.schemaVersion !== 2 || challenge.id !== challengeId || challenge.accountId !== account.id || !['active', 'completed', 'failed'].includes(challenge.result) || !['combat', 'looting', 'closed'].includes(challenge.sceneState)) integrity();
    integer(challenge.version); integer(challenge.sceneEpoch);
    if (challenge.currentRoomNo !== undefined) integer(challenge.currentRoomNo, -1, 6);
    if (challenge.sceneState !== 'closed' && challenge.sessionId !== account.currentSessionId) integrity();
    const headerId = await loginKey('cpHeader', [challengeId]);
    header = await tx.get<HandoffCheckpointHeader>(headerId);
    const unactivated = challenge.sceneEpoch === 0 && challenge.currentRoomNo === -1 && (challenge.roomPhase === 'preparing' && challenge.result === 'active' || challenge.roomPhase === 'closed' && challenge.sceneState === 'closed');
    if (!header && !unactivated) integrity();
    if (header) {
    if (unactivated || header.schemaVersion !== 2 || header.id !== headerId || header.challengeId !== challengeId || header.accountId !== account.id || header.characterId !== challenge.characterId || header.sceneEpoch !== challenge.sceneEpoch || typeof header.acceptingInputs !== 'boolean' || !Array.isArray(header.activeChunks) || header.activeChunks.length > 8 || header.activeChunks.length < 1 || new TextEncoder().encode(JSON.stringify(header)).length > 16384) integrity();
    integer(header.revision);
    const ordinals = new Set<number>();
    for (const ref of header.activeChunks) {
      integer(ref.ordinal, 0, 7); integer(ref.chunkRevision); integer(ref.sceneEpoch, 1);
      if (ordinals.has(ref.ordinal) || ref.sceneEpoch !== header.sceneEpoch || !/^[a-f0-9]{64}$/.test(ref.hash)) integrity();
      ordinals.add(ref.ordinal);
      const chunkId = await loginKey('cpChunk', [challengeId, ref.ordinal]);
      const chunk = await tx.get<HandoffCheckpointChunk>(chunkId);
      if (!chunk || chunk.schemaVersion !== 2 || chunk.id !== chunkId || chunk.challengeId !== challengeId || chunk.accountId !== account.id || chunk.ordinal !== ref.ordinal || chunk.chunkRevision !== ref.chunkRevision || chunk.sceneEpoch !== ref.sceneEpoch || chunk.hash !== ref.hash || await checkpointDataHash(chunk.data) !== ref.hash) integrity();
      if (new TextEncoder().encode(JSON.stringify(chunk)).length > 81920) integrity();
    }
    if (challenge.sceneState === 'closed' && header.acceptingInputs) integrity();
    }
    if (challenge.result === 'failed' && challenge.sceneState !== 'closed') integrity();
  }
  const ids = new Set<string>();
  let challengeCharacterSeen = false;
  const changes: { kind: string; characterId: string; beforeVersion: number; afterVersion: number }[] = [];
  for (const [classId, characterId] of Object.entries(account.characterIdsByClass)) {
    if (typeof characterId !== 'string' || ids.has(characterId)) integrity(); ids.add(characterId);
    const character = validateCharacter(await tx.get<LoginCharacter>(characterId), account.id, characterId, classId);
    if (character.stamina.refillWindow > currentWindow) integrity();
    const ownsChallenge = challenge?.characterId === characterId;
    if (ownsChallenge) challengeCharacterSeen = true;
    if (characterId === account.selectedCharacterId || ownsChallenge) {
      let stamina = character.stamina;
      if (ownsChallenge && challenge) {
        const snapshot = challenge.staminaSnapshot, settlement = challenge.staminaSettlement;
        if (!snapshot || !settlement) integrity();
        integer(snapshot.entryValue, 1, 308); integer(snapshot.remaining, 0, snapshot.entryValue); integer(snapshot.entryRefillWindow, 0, currentWindow); integer(snapshot.entryAt, 0, now); integer(snapshot.revision);
        if (settlement.state === 'unsettled') {
          if (challenge.sceneState === 'closed' || character.staminaReservation !== challengeId || character.location.kind !== 'challenge' || character.location.challengeId !== challengeId) integrity();
          stamina = { value: currentWindow > snapshot.entryRefillWindow ? 308 : snapshot.remaining, refillWindow: currentWindow };
          challenge = { ...challenge, staminaSettlement: { state: 'settled', settledAt: now, loadedRefillWindow: currentWindow, loadedValue: stamina.value, sourceChallengeId: challenge.id } };
        } else if (settlement.state === 'settled') {
          if (settlement.sourceChallengeId !== challenge.id || character.staminaReservation && character.staminaReservation !== challenge.id || character.location.kind === 'challenge' && character.location.challengeId !== challenge.id) integrity();
          integer(settlement.loadedValue, 0, 308); integer(settlement.settledAt, 0, now); integer(settlement.loadedRefillWindow, 0, currentWindow);
          // Never replay loadedValue into a character changed by later events.
          if (challenge.sceneState !== 'closed') integrity();
          if (character.stamina.refillWindow < currentWindow) stamina = { value: 308, refillWindow: currentWindow };
        } else integrity();
      } else {
        if (character.staminaReservation || character.location.kind === 'challenge') integrity();
        if (character.stamina.refillWindow < currentWindow) stamina = { value: 308, refillWindow: currentWindow };
      }
      const epoch = integer(character.rolePlayEpoch + 1);
      const updated: HandoffCharacter = { ...character, version: integer(character.version + 1), rolePlayEpoch: epoch, location: { kind: 'inn', characterId }, stamina,
        roleState: { kind: 'inn', rolePlayEpoch: epoch, resetAt: now, lifeState: 'alive', hp: 'full', mp: 'full', cooldowns: 'cleared', buffs: 'cleared', control: 'cleared', hpRegenerationRemainder: { numerator: 0, denominator: 1 }, mpRegenerationRemainder: { numerator: 0, denominator: 1 } } };
      delete updated.staminaReservation;
      tx.set(characterId, updated);
      if (characterId === account.selectedCharacterId) selectedCharacter = { characterId, rolePlayEpoch: updated.rolePlayEpoch };
      resultVersions.push({ kind: 'character', id: characterId, version: updated.version });
      changes.push({ kind: 'newInnRole', characterId, beforeVersion: character.version, afterVersion: updated.version });
    }
    characters.push({ characterId, classId: character.classId, characterName: character.characterName, level: character.level });
  }
  if (account.selectedCharacterId && !selectedCharacter) integrity();
  if (challenge) {
    if (!challengeCharacterSeen) integrity();
    if (challenge.sceneState !== 'closed') {
      const closed = { ...challenge, result: challenge.result === 'active' ? 'failed' as const : challenge.result, sceneState: 'closed' as const, version: integer(challenge.version + 1), ...(challenge.roomPhase !== undefined ? { roomPhase: 'closed' as const } : {}) };
      delete closed.transitionClock;
      tx.set(challenge.id, closed);
      if (header) tx.set(header.id, { ...header, revision: integer(header.revision + 1), acceptingInputs: false, closedAt: now });
      resultVersions.push({ kind: 'challenge', id: challenge.id, version: closed.version });
    }
    delete next.activeChallengeId; delete next.openSceneChallengeId;
  }
  if (changes.length) {
    const journalId = await loginKey('handoffJournal', [account.id, receiptId]);
    if (await tx.get(journalId) !== undefined) integrity();
    tx.set(journalId, { schemaVersion: 2, id: journalId, tuple: JSON.stringify([account.id, receiptId]), accountId: account.id, operationId, sourceId: receiptId, command: 'session.handoff', occurredAt: now, changes });
  }
  return { account: next, characters, selectedCharacter, resultVersions };
}
