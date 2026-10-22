import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLoginRequest, parseCharacterCommand, parseLoginResponse, parseCharacterResponse } from '../src/protocol/session-v2.ts';

test('two-step login accepts pre-session requests but never body identity or v1', () => {
  const prepare = { protocolVersion: 2, command: 'session.prepare', payload: { launchId: 'launch-1', prepareOperationId: 'prepare-1' } };
  assert.deepEqual(parseLoginRequest(JSON.parse(JSON.stringify(prepare))), prepare);
  const commit = { protocolVersion: 2, command: 'session.commit', payload: { launchId: 'launch-1', ticketId: 'ticket-1', openOperationId: 'open-1' } };
  assert.deepEqual(parseLoginRequest(commit), commit);
  for (const value of [
    { ...prepare, protocolVersion: 1 }, { ...prepare, subject: 'forged' },
    { ...prepare, sessionId: 'not-required' }, { ...prepare, command: 'session.open' },
    { ...prepare, payload: { ...prepare.payload, VerifiedIdentity: {} } },
    { ...prepare, payload: { prepareOperationId: 'x' } },
    { ...prepare, payload: { ...prepare.payload, prepareOperationId: 'x'.repeat(65) } },
    { ...commit, payload: { ...commit.payload, openOperationId: '操作' } },
    { ...commit, payload: { ...commit.payload, ticketId: 'x'.repeat(129) } },
  ]) assert.throws(() => parseLoginRequest(value));
});

test('character creation and selection results retain initialization references and role epochs', () => {
  const base = { protocolVersion: 2, operationId: 'op', serverTime: 1, replayed: false };
  const created = { ...base, command: 'character.create', outcome: { status: 'committed', data: { characterId: 'c', classId: 'warrior', characterName: '战士', initializationRef: 'initial-c' }, resultVersions: [{ kind: 'character', id: 'c', version: 0 }] } };
  assert.deepEqual(parseCharacterResponse(created), created);
  const selected = { ...base, command: 'character.select', outcome: { status: 'committed', data: { characterId: 'c', rolePlayEpoch: 1, innAnchorRef: 'inn' }, resultVersions: [] } };
  assert.deepEqual(parseCharacterResponse(selected), selected);
  assert.throws(() => parseCharacterResponse({ ...selected, outcome: { ...selected.outcome, data: { ...selected.outcome.data, rolePlayEpoch: 0 } } }));
  assert.throws(() => parseCharacterResponse({ ...created, subject: 'secret' }));
});

test('login responses distinguish tickets, unknown outcomes and superseded historical sessions', () => {
  const base = { protocolVersion: 2, operationId: 'op', serverTime: 1000, replayed: false };
  const ticket = { ...base, command: 'session.prepare', outcome: { status: 'committed', data: { ticketId: 'ticket', launchId: 'launch', baseSessionEpoch: 0, issuedAt: 1000, expiresAt: 61000 } } };
  assert.deepEqual(parseLoginResponse(ticket), ticket);
  const commit = { ...base, command: 'session.commit', outcome: { status: 'committed', data: { sessionId: 'session', sessionEpoch: 1, sessionState: 'superseded', characters: [], selectedCharacter: null }, resultVersions: [] } };
  assert.deepEqual(parseLoginResponse(commit), commit);
  assert.deepEqual(parseLoginResponse({ ...commit, outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' } }).outcome, { status: 'unknown', code: 'RESULT_UNKNOWN' });
  assert.deepEqual(parseLoginResponse({ ...commit, outcome: { status: 'rejected', code: 'AUTH_REQUIRED' } }).outcome, { status: 'rejected', code: 'AUTH_REQUIRED' });
  for (const value of [{ ...commit, protocolVersion: 1 }, { ...commit, subject: 'secret' }, { ...commit, outcome: { status: 'rejected', code: 'raw platform secret' } }, { ...commit, outcome: { ...commit.outcome, data: { ...commit.outcome.data, session_key: 'secret' } } }, { ...ticket, outcome: { status: 'committed', data: { ...ticket.outcome.data, expiresAt: 999 } } }]) assert.throws(() => parseLoginResponse(value));
});

test('character commands require current session envelope, bounded unique expected objects and legal names', () => {
  const input = { protocolVersion: 2, command: 'character.create', operationId: 'op', sessionId: 'session', sessionEpoch: 1,
    expected: [{ kind: 'account', id: 'account', version: 0 }], payload: { classId: 'warrior', characterName: '战士' } };
  assert.deepEqual(parseCharacterCommand(input), input);
  assert.equal(parseCharacterCommand({ ...input, payload: { classId: 'hunter', characterName: 'Abcdefghijkl' } }).payload.characterName, 'Abcdefghijkl');
  const select = { ...input, command: 'character.select', payload: { characterId: 'character' }, expected: [] };
  assert.deepEqual(parseCharacterCommand(select), select);
  for (const name of ['', '中文English', 'abc1', 'a b', 'abcdefabcdefg', '一二三四五六七', '😀', '々', '⺀']) {
    assert.throws(() => parseCharacterCommand({ ...input, payload: { ...input.payload, characterName: name } }));
  }
  for (const patch of [{ sessionEpoch: 0 }, { sessionEpoch: NaN }, { rolePlayEpoch: 1 }, { expected: [input.expected[0], input.expected[0]] }, { expected: [{ kind: 'arbitrary', id: 'a', version: 0 }] }, { expected: Array(33).fill(input.expected[0]) }, { expected: { accountVersion: 1 } }, { payload: { classId: 'mage', characterName: 'Abc' } }]) assert.throws(() => parseCharacterCommand({ ...input, ...patch }));
});
