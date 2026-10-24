import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSceneRequest, parseRoomRequest, parseSceneState, parseSceneResponse, parseRecoveryPage, assembleRecoveryPages, parseRoomResponse, parseSceneQuery, parseSimulationResponse, parseChallengeRequest, parseChallengeResponse } from '../src/protocol/scene-v2.ts';

const binding = () => ({ sceneEpoch: 1, timelineEpoch: 2, checkpointRevision: 3, publicStateHash: 'a'.repeat(64), manifestHash: 'b'.repeat(64) });
const control = () => ({ protocolVersion: 2, command: 'scene.ready', sessionId: 's', sessionEpoch: 1, controlSeq: 1, leaseRevision: 0,
  payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', ...binding(), readyTicketId: 'ticket' } });
test('scene controls are distinct from business writes and bound to the full ready view', () => {
  const value = control();
  assert.deepEqual(parseSceneRequest(value), value);
  for (const patch of [{ operationId: 'op' }, { expected: [] }, { protocolVersion: 1 }, { controlSeq: 0 }]) assert.throws(() => parseSceneRequest({ ...value, ...patch }));
  for (const patch of [{ publicStateHash: 'bad' }, { hp: '100' }, { timelineEpoch: 0 }, { readyTicketId: '' }]) assert.throws(() => parseSceneRequest({ ...value, payload: { ...value.payload, ...patch } }));
  const resume = { ...value, command: 'scene.resumePrepare', payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', sceneEpoch: 1, timelineEpoch: 2, checkpointRevision: 3 } };
  assert.deepEqual(parseSceneRequest(resume), resume);
});

test('challenge and ground commands express intent and cannot supply drops or revive outcomes', () => {
  const base = { protocolVersion: 2, operationId: 'op', sessionId: 's', sessionEpoch: 1, expected: [] };
  const examples = [
    { ...base, command: 'challenge.start', payload: { characterId: 'c', rolePlayEpoch: 1, dungeonId: 'd', difficultyId: 'normal', entryContext: 'entry' } },
    { ...base, command: 'challenge.revive', payload: { challengeId: 'h', deathIndex: 1 } },
    { ...base, command: 'challenge.leave', payload: { challengeId: 'h', reason: 'finishLoot' } },
    { ...base, command: 'drop.collect', payload: { challengeId: 'h', roomNo: 1, dropId: 'drop', roomToken: 'room', sceneEpoch: 1, positionHint: { x: 0, y: 0 } } },
  ];
  for (const value of examples) {
    assert.deepEqual(parseChallengeRequest(value), value);
    assert.throws(() => parseChallengeRequest({ ...value, payload: { ...value.payload, hp: '999' } }));
    const response = { protocolVersion: 2, command: value.command, operationId: 'op', serverTime: 0, replayed: false, outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' } };
    assert.deepEqual(parseChallengeResponse(response), response);
  }
});

test('room responses and recovery queries carry references and cannot be confused with control or input results', () => {
  const query = { protocolVersion: 2, query: 'scene.recoveryPage', requestId: 'q', sessionId: 's', sessionEpoch: 1,
    payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', readyTicketId: 't', ...binding(), pageIndex: 0 } };
  assert.deepEqual(parseSceneQuery(query), query);
  assert.throws(() => parseSceneQuery({ ...query, operationId: 'op' }));
  const response = { protocolVersion: 2, command: 'challenge.prepareRoom', operationId: 'op', serverTime: 1000, replayed: false,
    outcome: { status: 'committed', data: { roomAttemptId: 'attempt', challengeId:'h', roomNo:0, manifestHash: 'b'.repeat(64), releaseRef: 'release', releaseHash:'c'.repeat(64), mapRef: 'map', resources: [{ref:'map',sha256:'d'.repeat(64),byteLength:12,mediaType:'application/json',purpose:'contract-fixture-only'}], spawns:[{spawnId:'spawn-0',templateRef:'map',role:'ordinary',x:2000,y:1000}], preparedRevision: 0 }, resultVersions: [] } };
  assert.deepEqual(parseRoomResponse(response), response);
  assert.throws(() => parseRoomResponse({ ...response, outcome: { ...response.outcome, data: { ...response.outcome.data, seed: 123 } } }));
  const result = { ...response, command: 'simulation.submit', outcome: { status: 'committed', data: { acceptedSeq: 1, acceptedTick: 100, checkpointRevision: 1, actionResultsRef: 'actions', events: [] }, resultVersions: [] } };
  assert.deepEqual(parseSimulationResponse(result), result);
  const heartbeat = { protocolVersion: 2, command: 'heartbeat', heartbeatSeq: 1, leaseRevision: 1, serverTime: 1, replayed: false, outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' } };
  assert.deepEqual(parseSceneResponse(heartbeat), heartbeat);
  assert.throws(() => parseSceneResponse({ ...heartbeat, controlSeq: 1 }));
});

test('recovery pages are bounded public projections tied to one ticket and revision', () => {
  const page = { protocolVersion: 2, requestId: 'q', serverTime: 3000, readyTicketId: 'ticket', ...binding(), deadline: 10000, pageIndex: 0, totalPages: 1,
    records: [{ kind: 'actor', actorId: 'player', actorIndex: 0, x: 1000, y: 1000, facing: 1, hp: '100000', maxHp: '100000', mp: '50000', maxMp: '50000', lifeState: 'alive', actionId: 'idle', phase: 0 }] };
  assert.deepEqual(parseRecoveryPage(page), page);
  assert.equal(assembleRecoveryPages([page]).records[0].actorId, 'player');
  for (const patch of [{ pageIndex: 1 }, { totalPages: 65 }, { randomSeed: 'secret' }, { records: [{ ...page.records[0], privateBudget: '100' }] }]) assert.throws(() => parseRecoveryPage({ ...page, ...patch }));
  assert.throws(() => assembleRecoveryPages([{ ...page, totalPages: 2 }]));
  assert.throws(() => assembleRecoveryPages([{ ...page, totalPages: 2 }, { ...page, totalPages: 2, pageIndex: 1, timelineEpoch: 3 }]));
  assert.throws(() => assembleRecoveryPages([{ ...page, records: [page.records[0], { ...page.records[0], actorId: 'other' }] }]));
  const readyResponse = { protocolVersion: 2, command: 'scene.ready', controlSeq: 1, leaseRevision: 1, serverTime: 3000, replayed: false, outcome: { status: 'rejected', code: 'RECOVERY_REQUIRED' } };
  assert.deepEqual(parseSceneResponse(readyResponse), readyResponse);
  assert.throws(() => parseSceneResponse({ ...readyResponse, outcome: { status: 'rejected', code: 'platform secret', details: 'session_key' } }));
});

test('room writes require challenge and character expected objects while a loading clock remains independent', () => {
  const value = { protocolVersion: 2, command: 'challenge.prepareRoom', operationId: 'op', sessionId: 's', sessionEpoch: 1,
    expected: [{ kind: 'challenge', id: 'h', version: 0 }, { kind: 'character', id: 'c', version: 0 }],
    payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', nextRoomNo: 1, expectedRevision: 0 } };
  assert.deepEqual(parseRoomRequest(value), value);
  assert.throws(() => parseRoomRequest({ ...value, expected: [] }));
  const state = { ...binding(), challengeId: 'h', acceptedSeq: 0, acceptedTick: 0, roomPhase: 'awaitingReady', connection: 'connected', lifeState: 'alive', result: 'active',
    anchorWallAt: null, anchorTick: null, inputGapBaseAt: null, lastAcceptedInputAt: null, recoveryUntil: null, deathDeadline: null,
    transitionClock: { attemptId: 'attempt', phase: 'awaitingReady', settledAt: 2000, connectedElapsedMs: 2000, timeRemainder: { numerator: 0, denominator: 1 }, transitionRevision: 1 } };
  assert.deepEqual(parseSceneState(state), state);
  assert.throws(() => parseSceneState({ ...state, pendingRoomAttempt: { transitionClock: state.transitionClock } }));
  assert.throws(() => parseSceneState({ ...state, roomPhase: 'active' }));
  const mismatch = { protocolVersion: 2, command: 'scene.resumePrepare', controlSeq: 1, leaseRevision: 0, serverTime: 3000, replayed: false,
    outcome: { status: 'committed', data: { state: { ...state, connection: 'recovery', recoveryUntil: 10000 }, readyTicket: { readyTicketId: 't', ...binding(), timelineEpoch: 3, deadline: 10000 } } } };
  assert.throws(() => parseSceneResponse(mismatch));
  const active = { ...state, roomPhase: 'active', transitionClock: null, anchorWallAt: 3000, anchorTick: 0, inputGapBaseAt: 3000 };
  assert.deepEqual(parseSceneState(active), active);
  assert.equal(parseSceneState(active).lastAcceptedInputAt, null);
});

test('unpaid loading query is explicit no-checkpoint state; combat epochs and pages remain positive', async()=>{
 const {parseChallengeQueryResponse}=await import('../src/protocol/scene-v2.ts');
 const unpaid={requestId:'q',serverTime:1,versions:[],data:{kind:'unpaidLoading',challengeId:'h',sceneEpoch:0,timelineEpoch:0,checkpoint:null,currentRoomNo:-1,roomPhase:'preparing',connection:'connected',lifeState:'alive',result:'active',staminaRemaining:308,pendingManifest:null,transitionClock:null}};
 assert.deepEqual(parseChallengeQueryResponse(unpaid),unpaid);
 for(const patch of [{checkpoint:0},{sceneEpoch:1},{currentRoomNo:0},{roomPhase:'active'},{result:'completed'}])assert.throws(()=>parseChallengeQueryResponse({...unpaid,data:{...unpaid.data,...patch}}));
 assert.throws(()=>parseSceneRequest({...control(),payload:{...control().payload,sceneEpoch:0}}));
});
