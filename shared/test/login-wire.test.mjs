import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLoginRequest, decodeLoginResponse } from '../src/protocol/login-wire.ts';

test('caller contract binds a parsed response to the original login intent without a fake server', () => {
  const request = { protocolVersion: 2, command: 'session.commit', payload: { ticketId: 't', launchId: 'l', openOperationId: 'o' } };
  assert.deepEqual(JSON.parse(encodeLoginRequest(request)), request);
  const response = { protocolVersion: 2, command: 'session.commit', operationId: 'o', serverTime: 1000, replayed: true,
    outcome: { status: 'committed', data: { sessionId: 's', sessionEpoch: 3, sessionState: 'current', characters: [{ characterId: 'c', classId: 'warrior', characterName: '战士', level: 1 }], selectedCharacter: { characterId: 'c', rolePlayEpoch: 2 } }, resultVersions: [] } };
  const result = decodeLoginResponse(request, JSON.stringify(response));
  assert.equal(result.outcome.data.selectedCharacter.rolePlayEpoch, 2);
  assert.equal(result.replayed, true);
  for (const patch of [{ operationId: 'other' }, { protocolVersion: 1 }, { command: 'session.open' }]) assert.throws(() => decodeLoginResponse(request, JSON.stringify({ ...response, ...patch })));
  assert.throws(() => decodeLoginResponse(request, ' '.repeat(65537)));
  assert.throws(() => encodeLoginRequest({ ...request, subject: 'forged' }));
});

test('prepare replies must match the launch and errors never serialize platform secrets', () => {
  const request = { protocolVersion: 2, command: 'session.prepare', payload: { launchId: 'launch', prepareOperationId: 'prepare' } };
  const response = { protocolVersion: 2, command: 'session.prepare', operationId: 'prepare', serverTime: 10, replayed: false,
    outcome: { status: 'committed', data: { ticketId: 'ticket', launchId: 'other', baseSessionEpoch: 0, issuedAt: 10, expiresAt: 20 } } };
  assert.throws(() => decodeLoginResponse(request, JSON.stringify(response)));
  const rejected = { ...response, outcome: { status: 'rejected', code: 'AUTH_REQUIRED', details: { session_key: 'secret' } } };
  assert.throws(() => decodeLoginResponse(request, JSON.stringify(rejected)));
});
