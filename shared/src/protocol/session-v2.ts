import { time } from '../exact-values.ts';
import type { Time } from '../exact-values.ts';
/** Structural public contracts only: parsing never authenticates a caller. */
export type LoginRequest =
  | { protocolVersion: 2; command: 'session.prepare'; payload: { launchId: string; prepareOperationId: string } }
  | { protocolVersion: 2; command: 'session.commit'; payload: { launchId: string; ticketId: string; openOperationId: string } };

function shape(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('INVALID_ARGUMENT');
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key))) throw new TypeError('INVALID_ARGUMENT');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw new TypeError('INVALID_ARGUMENT');
  }
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 128 || /[\s\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(value)) throw new TypeError('INVALID_ID');
  return value;
}
function operationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(value)) throw new TypeError('INVALID_OPERATION_ID');
  return value;
}
export function parseLoginRequest(value: unknown): LoginRequest {
  const input = shape(value, ['protocolVersion', 'command', 'payload']);
  if (input.protocolVersion !== 2) throw new TypeError('UNSUPPORTED_PROTOCOL');
  if (input.command === 'session.prepare') {
    const p = shape(input.payload, ['launchId', 'prepareOperationId']);
    return { protocolVersion: 2, command: input.command, payload: { launchId: id(p.launchId), prepareOperationId: operationId(p.prepareOperationId) } };
  }
  if (input.command === 'session.commit') {
    const p = shape(input.payload, ['launchId', 'ticketId', 'openOperationId']);
    return { protocolVersion: 2, command: input.command, payload: { launchId: id(p.launchId), ticketId: id(p.ticketId), openOperationId: operationId(p.openOperationId) } };
  }
  throw new TypeError('UNSUPPORTED_COMMAND');
}

export type Expected = Readonly<{ kind: 'account' | 'character' | 'container' | 'wallet' | 'equipment' | 'challenge' | 'mail' | 'grant'; id: string; version: number }>;
export type SessionEnvelope = { protocolVersion: 2; operationId: string; sessionId: string; sessionEpoch: number; expected: Expected[] };
export type CharacterCommand = SessionEnvelope & (
  | { command: 'character.create'; payload: { classId: 'warrior' | 'hunter'; characterName: string } }
  | { command: 'character.select'; payload: { characterId: string } });
function version(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) throw new TypeError('INVALID_VERSION');
  return value;
}
export function parseExpected(value: unknown): Expected[] {
  if (!Array.isArray(value) || value.length > 32) throw new TypeError('INVALID_EXPECTED');
  const seen = new Set<string>();
  return Array.from(value, entry => {
    const e = shape(entry, ['kind', 'id', 'version']);
    if (!['account', 'character', 'container', 'wallet', 'equipment', 'challenge', 'mail', 'grant'].includes(e.kind as string)) throw new TypeError('INVALID_EXPECTED');
    const objectId = id(e.id), key = JSON.stringify([e.kind, objectId]);
    if (seen.has(key)) throw new TypeError('DUPLICATE_EXPECTED');
    seen.add(key);
    return { kind: e.kind as Expected['kind'], id: objectId, version: version(e.version) };
  });
}
export function parseCharacterCommand(value: unknown): CharacterCommand {
  const input = shape(value, ['protocolVersion', 'command', 'operationId', 'sessionId', 'sessionEpoch', 'expected', 'payload']);
  if (input.protocolVersion !== 2) throw new TypeError('UNSUPPORTED_PROTOCOL');
  const envelope: SessionEnvelope = { protocolVersion: 2, operationId: operationId(input.operationId), sessionId: id(input.sessionId), sessionEpoch: version(input.sessionEpoch, 1), expected: parseExpected(input.expected) };
  if (input.command === 'character.select') {
    const p = shape(input.payload, ['characterId']);
    return { ...envelope, command: input.command, payload: { characterId: id(p.characterId) } };
  }
  if (input.command === 'character.create') {
    const p = shape(input.payload, ['classId', 'characterName']);
    if (p.classId !== 'warrior' && p.classId !== 'hunter') throw new TypeError('INVALID_CLASS');
    return { ...envelope, command: input.command, payload: { classId: p.classId, characterName: characterName(p.characterName) } };
  }
  throw new TypeError('UNSUPPORTED_COMMAND');
}

export type CharacterSummary = { characterId: string; classId: 'warrior' | 'hunter'; characterName: string; level: number };
export type TicketView = { ticketId: string; launchId: string; baseSessionEpoch: number; issuedAt: Time; expiresAt: Time };
export type SessionView = { sessionId: string; sessionEpoch: number; sessionState: 'current' | 'superseded'; characters: CharacterSummary[];
  selectedCharacter: { characterId: string; rolePlayEpoch: number } | null };
const loginErrors = ['AUTH_REQUIRED', 'SESSION_REVOKED', 'INVALID_ARGUMENT', 'UNSUPPORTED_PROTOCOL', 'OPERATION_MISMATCH', 'NOT_FOUND_OR_FORBIDDEN', 'VERSION_CONFLICT', 'CONFIG_NOT_READY', 'DEADLINE_EXPIRED', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'] as const;
type LoginError = typeof loginErrors[number];
type Failure = { status: 'unknown'; code: 'RESULT_UNKNOWN' } | { status: 'rejected'; code: LoginError };
type ResponseBase = { protocolVersion: 2; operationId: string; serverTime: Time; replayed: boolean };
export type LoginResponse = ResponseBase & (
  | { command: 'session.prepare'; outcome: Failure | { status: 'committed'; data: TicketView } }
  | { command: 'session.commit'; outcome: Failure | { status: 'committed'; data: SessionView; resultVersions: Expected[] } });

function parseSessionView(value: unknown): SessionView {
  const p = shape(value, ['sessionId', 'sessionEpoch', 'sessionState', 'characters', 'selectedCharacter']);
  if (p.sessionState !== 'current' && p.sessionState !== 'superseded') throw new TypeError('INVALID_SESSION_STATE');
  if (!Array.isArray(p.characters) || p.characters.length > 2) throw new TypeError('INVALID_CHARACTERS');
  const ids = new Set<string>(), classes = new Set<string>();
  const characters = Array.from(p.characters, (entry): CharacterSummary => {
    const c = shape(entry, ['characterId', 'classId', 'characterName', 'level']);
    const characterId = id(c.characterId);
    if (c.classId !== 'warrior' && c.classId !== 'hunter') throw new TypeError('INVALID_CLASS');
    if (ids.has(characterId) || classes.has(c.classId)) throw new TypeError('DUPLICATE_CHARACTER');
    ids.add(characterId); classes.add(c.classId);
    const level = version(c.level, 1);
    if (level > 30) throw new TypeError('INVALID_LEVEL');
    return { characterId, classId: c.classId, characterName: characterName(c.characterName), level };
  });
  let selectedCharacter: SessionView['selectedCharacter'] = null;
  if (p.selectedCharacter !== null) {
    const selected = shape(p.selectedCharacter, ['characterId', 'rolePlayEpoch']);
    const characterId = id(selected.characterId);
    if (!ids.has(characterId)) throw new TypeError('INVALID_SELECTED_CHARACTER');
    selectedCharacter = { characterId, rolePlayEpoch: version(selected.rolePlayEpoch, 1) };
  }
  return { sessionId: id(p.sessionId), sessionEpoch: version(p.sessionEpoch, 1), sessionState: p.sessionState, characters, selectedCharacter };
}
function characterName(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[A-Za-z]{1,12}|\p{Unified_Ideograph}{1,6})$/u.test(value)) throw new TypeError('INVALID_CHARACTER_NAME');
  return value;
}
export function parseLoginResponse(value: unknown): LoginResponse {
  const r = shape(value, ['protocolVersion', 'command', 'operationId', 'serverTime', 'replayed', 'outcome']);
  if (r.protocolVersion !== 2) throw new TypeError('UNSUPPORTED_PROTOCOL');
  if (r.command !== 'session.prepare' && r.command !== 'session.commit') throw new TypeError('UNSUPPORTED_COMMAND');
  if (typeof r.replayed !== 'boolean') throw new TypeError('INVALID_ARGUMENT');
  const base: ResponseBase = { protocolVersion: 2, operationId: operationId(r.operationId), serverTime: time(r.serverTime), replayed: r.replayed };
  // Inspect only a data property; shape below validates the complete outcome.
  const status = r.outcome && typeof r.outcome === 'object' ? Object.getOwnPropertyDescriptor(r.outcome, 'status')?.value : undefined;
  if (status === 'unknown' || status === 'rejected') {
    const o = shape(r.outcome, ['status', 'code']);
    let outcome: Failure;
    if (status === 'unknown' && o.code === 'RESULT_UNKNOWN') outcome = { status, code: 'RESULT_UNKNOWN' };
    else if (status === 'rejected' && loginErrors.includes(o.code as LoginError)) outcome = { status, code: o.code as LoginError };
    else throw new TypeError('INVALID_LOGIN_ERROR');
    return { ...base, command: r.command, outcome };
  }
  if (status !== 'committed') throw new TypeError('INVALID_OUTCOME');
  if (r.command === 'session.prepare') {
    const o = shape(r.outcome, ['status', 'data']);
    const p = shape(o.data, ['ticketId', 'launchId', 'baseSessionEpoch', 'issuedAt', 'expiresAt']);
    const issuedAt = time(p.issuedAt), expiresAt = time(p.expiresAt);
    if (expiresAt <= issuedAt) throw new TypeError('INVALID_TICKET_WINDOW');
    return { ...base, command: r.command, outcome: { status: 'committed', data: { ticketId: id(p.ticketId), launchId: id(p.launchId), baseSessionEpoch: version(p.baseSessionEpoch), issuedAt, expiresAt } } };
  }
  const o = shape(r.outcome, ['status', 'data', 'resultVersions']);
  return { ...base, command: r.command, outcome: { status: 'committed', data: parseSessionView(o.data), resultVersions: parseExpected(o.resultVersions) } };
}

type CharacterData = { characterId: string; classId: 'warrior' | 'hunter'; characterName: string; initializationRef: string }
  | { characterId: string; rolePlayEpoch: number; innAnchorRef: string };
export type CharacterResponse = ResponseBase & { command: 'character.create' | 'character.select'; outcome:
  | { status: 'committed'; data: CharacterData; resultVersions: Expected[] }
  | { status: 'unknown'; code: 'RESULT_UNKNOWN' }
  | { status: 'rejected'; code: LoginError | 'CLASS_EXISTS' | 'ACTIVE_CHALLENGE_EXISTS' | 'SCENE_STILL_OPEN' } };
export function parseCharacterResponse(value: unknown): CharacterResponse {
  const r = shape(value, ['protocolVersion', 'command', 'operationId', 'serverTime', 'replayed', 'outcome']);
  if (r.protocolVersion !== 2 || (r.command !== 'character.create' && r.command !== 'character.select')) throw new TypeError('UNSUPPORTED_PROTOCOL');
  if (typeof r.replayed !== 'boolean') throw new TypeError('INVALID_ARGUMENT');
  const base: ResponseBase & Pick<CharacterResponse, 'command'> = { protocolVersion: 2, command: r.command, operationId: operationId(r.operationId), serverTime: time(r.serverTime), replayed: r.replayed };
  const status = r.outcome && typeof r.outcome === 'object' ? Object.getOwnPropertyDescriptor(r.outcome, 'status')?.value : undefined;
  if (status === 'committed') {
    const o = shape(r.outcome, ['status', 'data', 'resultVersions']);
    let data: CharacterData;
    if (r.command === 'character.create') {
      const p = shape(o.data, ['characterId', 'classId', 'characterName', 'initializationRef']);
      if (p.classId !== 'warrior' && p.classId !== 'hunter') throw new TypeError('INVALID_CLASS');
      data = { characterId: id(p.characterId), classId: p.classId, characterName: characterName(p.characterName), initializationRef: id(p.initializationRef) };
    } else {
      const p = shape(o.data, ['characterId', 'rolePlayEpoch', 'innAnchorRef']);
      data = { characterId: id(p.characterId), rolePlayEpoch: version(p.rolePlayEpoch, 1), innAnchorRef: id(p.innAnchorRef) };
    }
    return { ...base, outcome: { status, data, resultVersions: parseExpected(o.resultVersions) } };
  }
  const o = shape(r.outcome, ['status', 'code']);
  if (status === 'unknown' && o.code === 'RESULT_UNKNOWN') return { ...base, outcome: { status, code: 'RESULT_UNKNOWN' } };
  const errors = [...loginErrors, 'CLASS_EXISTS', 'ACTIVE_CHALLENGE_EXISTS', 'SCENE_STILL_OPEN'] as const;
  if (status !== 'rejected' || !errors.includes(o.code as typeof errors[number])) throw new TypeError('INVALID_CHARACTER_RESULT');
  return { ...base, outcome: { status, code: o.code as typeof errors[number] } };
}
