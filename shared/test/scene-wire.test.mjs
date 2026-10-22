import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSceneMessage, decodeSceneReply } from '../src/protocol/scene-wire.ts';

test('caller encodes each channel and correlates results without treating parsing as a server operation', () => {
  const request = { protocolVersion: 2, command: 'scene.ready', sessionId: 's', sessionEpoch: 1, controlSeq: 2, leaseRevision: 3,
    payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', sceneEpoch: 1, timelineEpoch: 2, checkpointRevision: 3, publicStateHash: 'a'.repeat(64), manifestHash: 'b'.repeat(64), readyTicketId: 't' } };
  assert.deepEqual(JSON.parse(encodeSceneMessage(request)), request);
  const response = { protocolVersion: 2, command: 'scene.ready', controlSeq: 2, leaseRevision: 3, serverTime: 3000, replayed: false, outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' } };
  assert.deepEqual(decodeSceneReply(request, JSON.stringify(response)), response);
  assert.throws(() => decodeSceneReply(request, JSON.stringify({ ...response, controlSeq: 3 })));
  assert.throws(() => decodeSceneReply(request, JSON.stringify({ ...response, command: 'heartbeat' })));
  assert.throws(() => encodeSceneMessage({ ...request, command: 'challenge.reportEvents' }));
});

test('challenge reads distinguish an authorized read failure from an empty successful view', () => {
  const request = { protocolVersion: 2, query: 'challenge.get', requestId: 'q', sessionId: 's', sessionEpoch: 1, payload: { challengeId: 'h' } };
  const failed = { requestId: 'q', serverTime: 3000, error: { code: 'NOT_FOUND_OR_FORBIDDEN' } };
  assert.deepEqual(decodeSceneReply(request, JSON.stringify(failed)), failed);
  assert.throws(() => decodeSceneReply(request, JSON.stringify({ requestId: 'q', serverTime: 3000, data: {}, versions: [] })));
});

test('ready responses cannot substitute another challenge or a different ticket view', () => {
  const binding = { sceneEpoch: 1, timelineEpoch: 2, checkpointRevision: 3, publicStateHash: 'a'.repeat(64), manifestHash: 'b'.repeat(64) };
  const request = { protocolVersion: 2, command: 'scene.ready', sessionId: 's', sessionEpoch: 1, controlSeq: 2, leaseRevision: 3,
    payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', ...binding, readyTicketId: 't' } };
  const state = { ...binding, challengeId: 'other-challenge', acceptedSeq: 0, acceptedTick: 0, roomPhase: 'active', connection: 'connected', lifeState: 'alive', result: 'active', anchorWallAt: 3000, anchorTick: 0, inputGapBaseAt: 3000, lastAcceptedInputAt: null, recoveryUntil: null, deathDeadline: null, transitionClock: null };
  const response = { protocolVersion: 2, command: 'scene.ready', controlSeq: 2, leaseRevision: 4, serverTime: 3000, replayed: false, outcome: { status: 'committed', data: { state, readyTicket: null } } };
  assert.throws(() => decodeSceneReply(request, JSON.stringify(response)));
  response.outcome.data.state.challengeId = 'h';
  assert.equal(decodeSceneReply(request, JSON.stringify(response)).outcome.data.state.challengeId, 'h');
  response.outcome.data.state.timelineEpoch = 4;
  assert.throws(() => decodeSceneReply(request, JSON.stringify(response)));
});
