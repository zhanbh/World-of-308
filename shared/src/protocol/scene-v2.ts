import { time, logicTick, resource, encodeResource, decodeRemainder } from '../exact-values.ts';
import { parseExpected } from './session-v2.ts';
type Parser<T> = (value: unknown) => T;
const integer = (min = 0, max = Number.MAX_SAFE_INTEGER): Parser<number> => value => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) throw new TypeError('INVALID_INTEGER');
  return value;
};
const text = (max = 128): Parser<string> => value => {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\s\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(value)) throw new TypeError('INVALID_TEXT');
  return value;
};
const hash: Parser<string> = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new TypeError('INVALID_HASH'); return value;
};
const enumOf = <T extends string | number>(...values: readonly T[]): Parser<T> => value => {
  if (!values.includes(value as T)) throw new TypeError('INVALID_ENUM'); return value as T;
};
const nullable = <T>(parse: Parser<T>): Parser<T | null> => value => value === null ? null : parse(value);
const list = <T>(parse: Parser<T>, max: number): Parser<T[]> => value => {
  if (!Array.isArray(value) || value.length > max) throw new TypeError('INVALID_LIST'); return Array.from(value, parse);
};
function object<S extends Record<string, Parser<unknown>>>(schema: S): Parser<{ [K in keyof S]: ReturnType<S[K]> }> {
  return value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('INVALID_OBJECT');
    const keys = Reflect.ownKeys(value), names = Object.keys(schema);
    if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !Object.hasOwn(schema, key))) throw new TypeError('INVALID_FIELDS');
    const output: Record<string, unknown> = {};
    for (const key of names) {
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !('value' in d)) throw new TypeError('INVALID_FIELDS');
      output[key] = schema[key](d.value);
    }
    return output as { [K in keyof S]: ReturnType<S[K]> };
  };
}
const common = { characterId: text(), rolePlayEpoch: integer(1), challengeId: text() };
const epochs = { sceneEpoch: integer(1), timelineEpoch: integer(1) };
const binding = { ...epochs, checkpointRevision: integer(), publicStateHash: hash, manifestHash: hash };
const session = { protocolVersion: enumOf(2), sessionId: text(), sessionEpoch: integer(1) };
const ready = object({ ...common, ...binding, readyTicketId: text() });
const controlEpochs={sceneEpoch:integer(),timelineEpoch:integer()};
const resume = object({ ...common, ...controlEpochs, checkpointRevision: nullable(integer()) });
const simpleControl = object({ ...common, ...controlEpochs });
const loadingReady=object({...common,kind:enumOf('unpaidLoading'),sceneEpoch:enumOf(0),timelineEpoch:integer(1),roomAttemptId:text(),readyTicketId:text(),manifestHash:hash});
function anyReady(v:unknown){return v&&typeof v==='object'&&Object.getOwnPropertyDescriptor(v,'kind')?.value==='unpaidLoading'?loadingReady(v):ready(v);}
const controlFields = { ...session, controlSeq: integer(1), leaseRevision: integer() };
const readyRequest = object({ ...controlFields, command: enumOf('scene.ready'), payload: anyReady });
const resumeRequest = object({ ...controlFields, command: enumOf('scene.resumePrepare'), payload: resume });
const suspendRequest = object({ ...controlFields, command: enumOf('scene.suspend'), payload: simpleControl });
const statusRequest = object({ ...controlFields, command: enumOf('scene.status'), payload: object({ ...common, readyTicketId: nullable(text()) }) });
const heartbeatRequest = object({ ...session, command: enumOf('heartbeat'), heartbeatSeq: integer(1), leaseRevision: integer(), payload: simpleControl });
export function parseSceneRequest(value: unknown) {
  const command = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'command')?.value : undefined;
  switch (command) {
    case 'scene.ready': return readyRequest(value);
    case 'scene.resumePrepare': return resumeRequest(value);
    case 'scene.suspend': return suspendRequest(value);
    case 'scene.status': return statusRequest(value);
    case 'heartbeat': return heartbeatRequest(value);
    default: throw new TypeError('UNSUPPORTED_PROTOCOL');
  }
}
export type SceneRequest = ReturnType<typeof parseSceneRequest>;

const operationId: Parser<string> = value => {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(value)) throw new TypeError('INVALID_OPERATION_ID'); return value;
};
const write = { ...session, operationId, expected: parseExpected };
const prepareRoom = object({ ...write, command: enumOf('challenge.prepareRoom'), payload: object({ ...common, nextRoomNo: integer(0, 6), expectedRevision: integer() }) });
const activateRoom = object({ ...write, command: enumOf('challenge.activateRoom'), payload: object({ ...common, roomAttemptId: text(), manifestHash: hash, expectedRevision: integer() }) });
export function parseRoomRequest(value: unknown) {
  const command = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'command')?.value : undefined;
  const result = command === 'challenge.prepareRoom' ? prepareRoom(value) : command === 'challenge.activateRoom' ? activateRoom(value) : null;
  if (!result) throw new TypeError('UNSUPPORTED_PROTOCOL');
  for (const [kind, id] of [['challenge', result.payload.challengeId], ['character', result.payload.characterId]]) {
    if (!result.expected.some(e => e.kind === kind && e.id === id)) throw new TypeError('MISSING_EXPECTED');
  }
  return result;
}
export type RoomRequest = ReturnType<typeof parseRoomRequest>;
const transitionClock = object({ attemptId: text(), phase: enumOf('prepared', 'awaitingReady'), settledAt: time, connectedElapsedMs: integer(), consumedElapsedMs: integer(), timeRemainder: decodeRemainder, transitionRevision: integer() });
const sceneState = object({ ...binding, challengeId: text(), acceptedSeq: integer(), acceptedTick: logicTick,
  roomPhase: enumOf('preparing', 'awaitingReady', 'active', 'cleared', 'closed'), connection: enumOf('connected', 'recovery', 'closed'), lifeState: enumOf('alive', 'dead'), result: enumOf('active', 'completed', 'failed'),
  anchorWallAt: nullable(time), anchorTick: nullable(logicTick), inputGapBaseAt: nullable(time), lastAcceptedInputAt: nullable(time), recoveryUntil: nullable(time), deathDeadline: nullable(time), transitionClock: nullable(transitionClock),
});
export function parseSceneState(value: unknown) {
  const state = sceneState(value);
  if ((state.anchorWallAt === null) !== (state.anchorTick === null)) throw new TypeError('INVALID_ANCHOR');
  if (state.roomPhase === 'active' && state.connection === 'connected' && (state.anchorWallAt === null || state.inputGapBaseAt === null || state.transitionClock !== null)) throw new TypeError('INVALID_ACTIVE_CLOCK');
  if (state.connection === 'recovery' && state.recoveryUntil === null) throw new TypeError('MISSING_RECOVERY_DEADLINE');
  if (state.transitionClock && !['preparing', 'awaitingReady'].includes(state.roomPhase)) throw new TypeError('INVALID_TRANSITION_CLOCK');
  return state;
}
export type SceneState = ReturnType<typeof parseSceneState>;

const bool: Parser<boolean> = value => { if (typeof value !== 'boolean') throw new TypeError('INVALID_BOOLEAN'); return value; };
const cpReadyTicket = object({ readyTicketId: text(), ...binding, deadline: time });
const unpaidReadyTicket=object({kind:enumOf('unpaidLoading'),readyTicketId:text(),sceneEpoch:enumOf(0),timelineEpoch:integer(1),roomAttemptId:text(),manifestHash:hash,deadline:time});
function readyTicket(v:unknown){return v&&typeof v==='object'&&Object.getOwnPropertyDescriptor(v,'kind')?.value==='unpaidLoading'?unpaidReadyTicket(v):cpReadyTicket(v);}
const sceneErrors = enumOf('LEVEL_REQUIRED', 'DIFFICULTY_LOCKED', 'INVALID_ARGUMENT', 'UNSUPPORTED_PROTOCOL', 'AUTH_REQUIRED', 'SESSION_REVOKED', 'VERSION_CONFLICT', 'RECOVERY_REQUIRED', 'DEADLINE_EXPIRED', 'SCENE_CLOSED', 'ROOM_NOT_AVAILABLE', 'CONFIG_NOT_READY', 'SERVICE_UNAVAILABLE', 'OPERATION_MISMATCH', 'NOT_FOUND_OR_FORBIDDEN', 'RATE_LIMITED', 'CHALLENGE_TERMINAL', 'EVENT_GAP', 'INVALID_EVENT', 'EVENT_ALREADY_ACCEPTED', 'ACTIVE_CHALLENGE_EXISTS', 'SCENE_STILL_OPEN', 'STAMINA_NOT_ENOUGH', 'WEAPON_REQUIRED', 'WEAPON_BROKEN', 'NOT_DEAD', 'EMBLEM_NOT_ENOUGH', 'REVIVE_LIMIT_REACHED', 'BAG_FULL', 'CONTAINER_FULL');
function failure(value: unknown) {
  const o = object({ status: enumOf('rejected', 'unknown'), code: text(64) })(value);
  return o.status === 'unknown' ? { status: o.status, code: enumOf('RESULT_UNKNOWN')(o.code) } : { status: o.status, code: sceneErrors(o.code) };
}
const rawResponseData = object({ state: parseChallengeState, readyTicket: nullable(readyTicket) });
function responseData(value: unknown) {
  const data = rawResponseData(value), t = data.readyTicket, s = data.state;
  if (t && (t.sceneEpoch !== s.sceneEpoch || t.timelineEpoch !== s.timelineEpoch || ('kind' in t ? !('kind' in s) || s.pendingManifest?.roomAttemptId!==t.roomAttemptId : !('checkpointRevision' in s) || t.checkpointRevision!==s.checkpointRevision || t.publicStateHash!==s.publicStateHash || t.manifestHash!==s.manifestHash))) throw new TypeError('TICKET_STATE_MISMATCH');
  return data;
}
function controlOutcome(value: unknown) {
  const status = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'status')?.value : undefined;
  return status === 'committed' ? object({ status: enumOf('committed'), data: responseData })(value) : failure(value);
}
const sceneResponse = object({ protocolVersion: enumOf(2), command: enumOf('scene.ready', 'scene.resumePrepare', 'scene.suspend', 'scene.status'), controlSeq: integer(1), leaseRevision: integer(), serverTime: time, replayed: bool, outcome: controlOutcome });
const heartbeatResponse = object({ protocolVersion: enumOf(2), command: enumOf('heartbeat'), heartbeatSeq: integer(1), leaseRevision: integer(), serverTime: time, replayed: bool, outcome: controlOutcome });
export function parseSceneResponse(value: unknown) {
  return value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, 'command')?.value === 'heartbeat' ? heartbeatResponse(value) : sceneResponse(value);
}
export type SceneResponse = ReturnType<typeof parseSceneResponse>;

const resourceWire: Parser<string> = value => {
  if (typeof value !== 'string') throw new TypeError('INVALID_RESOURCE_WIRE'); return encodeResource(resource(value));
};
const position = integer(-2147483648, 2147483647);
const actorRecord = object({ kind: enumOf('actor'), actorId: text(), actorIndex: integer(0, 8), x: position, y: position, facing: enumOf(-1, 1), hp: resourceWire, maxHp: resourceWire, mp: resourceWire, maxMp: resourceWire, lifeState: enumOf('alive', 'dead'), actionId: text(64), phase: integer(0, 255) });
const cooldownRecord = object({ kind: enumOf('cooldown'), actorId: text(), cooldownId: enumOf('cross', 'bengshan', 'badao', 'earth', 'hpPotion', 'mpPotion', 'trinket'), readyAtTick: logicTick });
const effectRecord = object({ kind: enumOf('effect'), effectId: text(), castId: text(), ownerId: text(), targetId: nullable(text()), templateRef: text(64), nodeIndex: integer(0, 5), x: position, y: position, startsAtTick: logicTick, endsAtTick: logicTick, nextAtTick: nullable(logicTick) });
const buffRecord = object({ kind: enumOf('buff'), buffId: text(), actorId: text(), templateRef: text(64), endsAtTick: logicTick });
function publicRecord(value: unknown) {
  const kind = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'kind')?.value : undefined;
  switch (kind) {
    case 'actor': {
      const r = actorRecord(value);
      if (resource(r.hp) > resource(r.maxHp) || resource(r.mp) > resource(r.maxMp)) throw new TypeError('INVALID_RESOURCE_RANGE');
      return r;
    }
    case 'cooldown': return cooldownRecord(value);
    case 'effect': {
      const r = effectRecord(value);
      if (r.endsAtTick < r.startsAtTick || (r.nextAtTick !== null && (r.nextAtTick < r.startsAtTick || r.nextAtTick > r.endsAtTick))) throw new TypeError('INVALID_EFFECT_TIME');
      return r;
    }
    case 'buff': return buffRecord(value);
    default: throw new TypeError('INVALID_PUBLIC_RECORD');
  }
}
const recoveryPage = object({ protocolVersion: enumOf(2), requestId: operationId, serverTime: time, readyTicketId: text(), ...binding, deadline: time,
  pageIndex: integer(0, 63), totalPages: integer(1, 64), records: list(publicRecord, 64) });
export function parseRecoveryPage(value: unknown) {
  const page = recoveryPage(value);
  if (page.pageIndex >= page.totalPages || new TextEncoder().encode(JSON.stringify(page)).length > 32768) throw new TypeError('INVALID_PAGE');
  return page;
}
export type RecoveryPage = ReturnType<typeof parseRecoveryPage>;
export function assembleRecoveryPages(values: unknown[]) {
  if (!Array.isArray(values) || !values.length || values.length > 64) throw new TypeError('INCOMPLETE_RECOVERY');
  const pages = values.map(parseRecoveryPage).sort((a, b) => a.pageIndex - b.pageIndex), first = pages[0];
  const identity = (p: RecoveryPage) => JSON.stringify([p.readyTicketId, p.sceneEpoch, p.timelineEpoch, p.checkpointRevision, p.publicStateHash, p.manifestHash, p.deadline, p.totalPages]);
  if (pages.length !== first.totalPages || pages.some((p, index) => p.pageIndex !== index || identity(p) !== identity(first))) throw new TypeError('INCOMPLETE_RECOVERY');
  const records = pages.flatMap(p => p.records), seen = new Set<string>();
  for (const r of records) {
    const key = r.kind === 'actor' ? ['actor', r.actorId] : r.kind === 'cooldown' ? ['cooldown', r.actorId, r.cooldownId] : r.kind === 'effect' ? ['effect', r.effectId] : ['buff', r.buffId];
    const encoded = JSON.stringify(key);
    if (seen.has(encoded)) throw new TypeError('DUPLICATE_PUBLIC_RECORD'); seen.add(encoded);
  }
  const actors = records.filter(r => r.kind === 'actor');
  if (!actors.length || actors.length > 9 || new Set(actors.map(r => r.actorIndex)).size !== actors.length) throw new TypeError('INVALID_PUBLIC_ACTORS');
  const actorIds = new Set(actors.map(r => r.actorId));
  for (const r of records) {
    if ((r.kind === 'cooldown' || r.kind === 'buff') && !actorIds.has(r.actorId)) throw new TypeError('UNKNOWN_PUBLIC_ACTOR');
    if (r.kind === 'effect' && (!actorIds.has(r.ownerId) || (r.targetId !== null && !actorIds.has(r.targetId)))) throw new TypeError('UNKNOWN_PUBLIC_ACTOR');
  }
  return { ...cpReadyTicket({ readyTicketId: first.readyTicketId, sceneEpoch: first.sceneEpoch, timelineEpoch: first.timelineEpoch, checkpointRevision: first.checkpointRevision, publicStateHash: first.publicStateHash, manifestHash: first.manifestHash, deadline: first.deadline }), records };
}

const query = { ...session, requestId: operationId };
const recoveryQuery = object({ ...query, query: enumOf('scene.recoveryPage'), payload: object({ ...common, readyTicketId: text(), ...binding, pageIndex: integer(0, 63) }) });
const challengeQuery = object({ ...query, query: enumOf('challenge.get'), payload: object({ challengeId: text() }) });
export function parseSceneQuery(value: unknown) {
  const name = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'query')?.value : undefined;
  if (name === 'scene.recoveryPage') return recoveryQuery(value);
  if (name === 'challenge.get') return challengeQuery(value);
  throw new TypeError('UNSUPPORTED_QUERY');
}
export function parseChallengeQueryResponse(value: unknown) {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'error')) return object({ requestId: operationId, serverTime: time, error: object({ code: sceneErrors }) })(value);
  return object({ requestId: operationId, serverTime: time, data: parseChallengeState, versions: parseExpected })(value);
}
const resourceDescriptor = object({ ref: text(), sha256: hash, byteLength: integer(1, 81920), mediaType: enumOf('application/json'), purpose: enumOf('contract-fixture-only') });
const spawnDescriptor = object({ spawnId: text(64), templateRef: text(64), role: enumOf('ordinary', 'elite', 'boss', 'purple'), x: integer(-2147483648,2147483647), y: integer(-2147483648,2147483647) });
const manifestView = object({ roomAttemptId: text(), challengeId: text(), roomNo: integer(0,6), manifestHash: hash, releaseRef: text(64), releaseHash: hash, mapRef: text(64), resources: list(resourceDescriptor,128), spawns: list(spawnDescriptor,8), preparedRevision: integer() });
export function parseRoomManifest(value: unknown) {
 const m=manifestView(value);
 const refs=new Set(m.resources.map(r=>r.ref));
 if(!refs.has(m.mapRef)||m.spawns.some(s=>!refs.has(s.templateRef))) throw new TypeError('MISSING_MANIFEST_RESOURCE');
 if(!m.resources.length || !m.spawns.length || new Set(m.resources.map(r=>r.ref)).size!==m.resources.length || new Set(m.spawns.map(s=>s.spawnId)).size!==m.spawns.length || new TextEncoder().encode(JSON.stringify(m)).length>24576) throw new TypeError('INVALID_MANIFEST');
 return m;
}
export type RoomManifest = ReturnType<typeof parseRoomManifest>;
const unpaidState=object({kind:enumOf('unpaidLoading'),challengeId:text(),sceneEpoch:enumOf(0),timelineEpoch:integer(),checkpoint:enumNull, currentRoomNo:enumOf(-1),roomPhase:enumOf('preparing','closed'),connection:enumOf('connected','recovery','closed'),lifeState:enumOf('alive'),result:enumOf('active','failed'),staminaRemaining:integer(0,308),pendingManifest:nullable(parseRoomManifest),transitionClock:nullable(transitionClock)});
function enumNull(value:unknown):null { if(value!==null) throw new TypeError('INVALID_CHECKPOINT');return null; }
export function parseChallengeState(value:unknown) {
 if(value && typeof value==='object' && Object.getOwnPropertyDescriptor(value,'kind')?.value==='unpaidLoading') {
  const s=unpaidState(value);
  if((s.roomPhase==='closed') !== (s.connection==='closed') || (s.roomPhase==='closed') !== (s.result==='failed') || (s.roomPhase==='closed' && s.transitionClock!==null) || (s.transitionClock!==null && (s.pendingManifest?.roomAttemptId!==s.transitionClock.attemptId || s.transitionClock.phase!=='prepared'))) throw new TypeError('INVALID_UNPAID_STATE');
  return s;
 }
 return parseSceneState(value);
}
const resultHeader = { protocolVersion: enumOf(2), operationId, serverTime: time, replayed: bool };
function result<T>(parseData: Parser<T>): Parser<{ status: 'committed'; data: T; resultVersions: ReturnType<typeof parseExpected> } | ReturnType<typeof failure>> {
  return value => value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, 'status')?.value === 'committed'
    ? object({ status: enumOf('committed'), data: parseData, resultVersions: parseExpected })(value) : failure(value);
}
const prepareResponse = object({ ...resultHeader, command: enumOf('challenge.prepareRoom'), outcome: result(parseRoomManifest) });
function activationData(v:unknown){const d=responseData(v);if('kind' in d.state || d.readyTicket&&'kind' in d.readyTicket)throw new TypeError('INVALID_ACTIVATION_STATE');return {state:d.state,readyTicket:d.readyTicket};}
const activateResponse = object({ ...resultHeader, command: enumOf('challenge.activateRoom'), outcome: result(activationData) });
export function parseRoomResponse(value: unknown) {
  return value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, 'command')?.value === 'challenge.prepareRoom' ? prepareResponse(value) : activateResponse(value);
}
const eventSummary = object({ kind: enumOf('actionAccepted', 'actionRejected', 'damage', 'death', 'roomCleared', 'levelUp', 'completed'), eventId: text(), actorId: text(), tick: logicTick });
const submitResponse = object({ ...resultHeader, command: enumOf('simulation.submit'), outcome: result(object({ acceptedSeq: integer(), acceptedTick: logicTick, checkpointRevision: integer(), actionResultsRef: text(), events: list(eventSummary, 64) })) });
export function parseSimulationResponse(value: unknown) {
  const response = submitResponse(value);
  if (new TextEncoder().encode(JSON.stringify(response)).length > 32768) throw new TypeError('RESPONSE_TOO_LARGE');
  return response;
}

const startRequest = object({ ...write, command: enumOf('challenge.start'), payload: object({ characterId: text(), rolePlayEpoch: integer(1), dungeonId: text(64), difficultyId: text(64), entryContext: text() }) });
const reviveRequest = object({ ...write, command: enumOf('challenge.revive'), payload: object({ challengeId: text(), deathIndex: integer(1) }) });
const leaveRequest = object({ ...write, command: enumOf('challenge.leave'), payload: object({ challengeId: text(), reason: enumOf('abandon', 'finishLoot') }) });
const collectRequest = object({ ...write, command: enumOf('drop.collect'), payload: object({ challengeId: text(), roomNo: integer(0, 6), dropId: text(), roomToken: text(), sceneEpoch: integer(1), positionHint: object({ x: position, y: position }) }) });
export function parseChallengeRequest(value: unknown) {
  const command = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'command')?.value : undefined;
  switch (command) {
    case 'challenge.start': return startRequest(value);
    case 'challenge.revive': return reviveRequest(value);
    case 'challenge.leave': return leaveRequest(value);
    case 'drop.collect': return collectRequest(value);
    default: throw new TypeError('UNSUPPORTED_PROTOCOL');
  }
}
const startResult = object({ ...resultHeader, command: enumOf('challenge.start'), outcome: result(object({ challengeId: text(), configRef: text(64), playerLevel: integer(1, 30), staminaSnapshot: integer(), monsterLevel: integer(1, 30), monsterStatsRef: text(64), equipmentSourceRef: text(64), equipmentVersion: integer(), equipmentAttributes: list(object({ statId: text(), value: resourceWire }), 64), acceptedSeq: integer(), acceptedTick: logicTick })) });
const reviveResult = object({ ...resultHeader, command: enumOf('challenge.revive'), outcome: result(object({ challengeId: text(), deathIndex: integer(1), checkpointRevision: integer(), stateRef: text() })) });
const leaveResult = object({ ...resultHeader, command: enumOf('challenge.leave'), outcome: result(object({ challengeId: text(), result: enumOf('completed', 'failed'), sceneState: enumOf('closed'), returnAnchorRef: text(64), staminaSettlementRef: text() })) });
const collectResult = object({ ...resultHeader, command: enumOf('drop.collect'), outcome: result(object({ dropId: text(), deliveryRef: text(), itemIds: list(text(), 1), quantity: integer(1, 20) })) });
export function parseChallengeResponse(value: unknown) {
  const command = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'command')?.value : undefined;
  switch (command) {
    case 'challenge.start': return startResult(value);
    case 'challenge.revive': return reviveResult(value);
    case 'challenge.leave': return leaveResult(value);
    case 'drop.collect': return collectResult(value);
    default: throw new TypeError('UNSUPPORTED_PROTOCOL');
  }
}

const entryQuery = object({ ...query, query: enumOf('dungeon.entry'), payload: object({ characterId: text(), rolePlayEpoch: integer(1), dungeonId: text(64) }) });
export function parseDungeonEntryQuery(value: unknown) { return entryQuery(value); }
const entryOption = object({ difficultyId: text(64), unlocked: bool, canEnter: bool, reason: nullable(enumOf('LEVEL_REQUIRED', 'DIFFICULTY_LOCKED', 'WEAPON_REQUIRED', 'WEAPON_BROKEN', 'STAMINA_NOT_ENOUGH', 'ACTIVE_CHALLENGE_EXISTS', 'SCENE_STILL_OPEN', 'CONFIG_NOT_READY')) });
export function parseDungeonEntryResponse(value: unknown) {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'error')) return object({ requestId: operationId, serverTime: time, error: object({ code: sceneErrors }) })(value);
  return object({ requestId: operationId, serverTime: time, data: object({ dungeonId: text(64), entryContext: text(), locationRevision: integer(), options: list(entryOption, 4) }), versions: parseExpected })(value);
}
