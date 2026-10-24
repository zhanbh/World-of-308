import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { verifyTestRelease, publicRelease } from '../src/config/release-v1.ts';
import { encodeLoginRequest, decodeLoginResponse } from '../src/protocol/login-wire.ts';
import { encodeSceneMessage, decodeSceneReply } from '../src/protocol/scene-wire.ts';
import { encodeAssetRequest, decodeAssetResponse } from '../src/protocol/asset-v2.ts';

const root = new URL('../../', import.meta.url);
const fixture = new URL('../fixtures/warrior-first-normal.test.json', import.meta.url);
const auth = { profileId: 'warrior-e01-test', environmentScope: 'local-test', allowTestStrategies: true };

test('approved local plan retains its source hash, seven tickets and dependency edges', () => {
  const spec = fs.readFileSync(new URL('docs/stories/warrior-loop/e01/spec.md', root), 'utf8');
  const body = spec.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  assert.equal(crypto.createHash('sha256').update(body).digest('hex'), '60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57');
  const directory = new URL('docs/stories/warrior-loop/e01/issues/', root);
  const files = fs.readdirSync(directory).filter(n => /^\d\d-.*\.md$/.test(n)).sort();
  assert.equal(files.length, 7);
  const expectedEdges = [[], [1], [2], [2], [2], [2], [3, 4, 5, 6]];
  const ids = new Set();
  for (let i = 0; i < files.length; i++) {
    const text = fs.readFileSync(new URL(files[i], directory), 'utf8');
    const id = text.match(/^artifact_id: (.+)$/m)?.[1];
    assert.ok(id && !ids.has(id)); ids.add(id);
    assert.deepEqual(JSON.parse(text.match(/^blocked_by: (.+)$/m)[1]), expectedEdges[i]);
    assert.match(text, /plan_approval: user-confirmed/);
    assert.match(text, /60c59008592904d0f81d4c8796bfe4f93e98bd9b65418d8e7e3db70cdfbccc57/);
  }
});

test('release, login, room intent and input share usable public references without running business services', async () => {
  const release = await verifyTestRelease(fs.readFileSync(fixture, 'utf8'), auth);
  const publicConfig = publicRelease(release);
  assert.equal(publicConfig.nodes.find(n => n.id === 'hunter-disabled').data.enabled, false);
  assert.ok(!publicConfig.nodes.some(n => n.visibility === 'private'));
  const login = { protocolVersion: 2, command: 'session.commit', payload: { launchId: 'l', ticketId: 't', openOperationId: 'open' } };
  assert.equal(JSON.parse(encodeLoginRequest(login)).payload.ticketId, 't');
  const loginView = decodeLoginResponse(login, JSON.stringify({ protocolVersion: 2, command: 'session.commit', operationId: 'open', serverTime: 1000, replayed: false,
    outcome: { status: 'committed', resultVersions: [], data: { sessionId: 's', sessionEpoch: 1, sessionState: 'current', characters: [{ characterId: 'c', classId: 'warrior', characterName: '战士', level: 1 }], selectedCharacter: { characterId: 'c', rolePlayEpoch: 1 } } } }));
  const view = loginView.outcome.data;
  const base = { protocolVersion: 2, operationId: 'room', sessionId: view.sessionId, sessionEpoch: view.sessionEpoch, expected: [{ kind: 'challenge', id: 'h', version: 0 }, { kind: 'character', id: 'c', version: 0 }] };
  const room = { ...base, command: 'challenge.prepareRoom', payload: { challengeId: 'h', characterId: 'c', rolePlayEpoch: view.selectedCharacter.rolePlayEpoch, nextRoomNo: 0, expectedRevision: 0 } };
  assert.deepEqual(JSON.parse(encodeSceneMessage(room)), room);
  const reply = decodeSceneReply(room, JSON.stringify({ protocolVersion: 2, operationId: 'room', command: 'challenge.prepareRoom', serverTime: 2000, replayed: false,
    outcome: { status: 'committed', resultVersions: [], data: { roomAttemptId: 'attempt', challengeId:'h', roomNo:0, manifestHash: release.manifestHash, releaseRef: release.releaseId, releaseHash:release.manifestHash, mapRef: 'room-map', resources: [{ref:'room-map',sha256:'a'.repeat(64),byteLength:1,mediaType:'application/json',purpose:'contract-fixture-only'}], spawns:[{spawnId:'spawn-0',templateRef:'room-map',role:'ordinary',x:2000,y:1000}], preparedRevision: 0 } } }));
  assert.equal(reply.outcome.data.manifestHash, release.manifestHash);
  const input = { ...base, operationId: 'input', command: 'simulation.submit', payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', roomNo: 1, sceneEpoch: 1, timelineEpoch: 1,
    baseCheckpointVersion: 0, firstSeq: 1, lastSeq: 1, fromTick: 0, toTick: 100, ruleRef: release.releaseId, mapRef: reply.outcome.data.mapRef, digest: 'a'.repeat(64), inputs: [{ seq: 1, tick: 0, kind: 'skill', skillId: 'cross' }] } };
  assert.equal(JSON.parse(encodeSceneMessage(input)).payload.toTick * release.units.logicStepMs, 1000);
  assert.ok(publicConfig.nodes.some(n => n.id === 'cross' && n.kind === 'skill'));
  assert.throws(() => encodeSceneMessage({ ...input, command: 'challenge.reportEvents' }));
});

test('asset consumer preserves versioned original results and distinguishes notFound from unknown', () => {
  const intent = { protocolVersion: 2, command: 'inventory.organize', operationId: 'organize', sessionId: 's', sessionEpoch: 1, expected: [{ kind: 'container', id: 'bag', version: 5 }], payload: { characterId: 'c', direction: 'reverse' } };
  assert.deepEqual(JSON.parse(encodeAssetRequest(intent)), intent);
  const receipt = { operationId: 'organize', serverTime: 3000, replayed: true, outcome: { status: 'committed', data: { containerId: 'bag', direction: 'reverse', mergedStacks: 0 }, resultVersions: [{ kind: 'container', id: 'bag', version: 6 }] } };
  assert.equal(decodeAssetResponse(intent, JSON.stringify(receipt)).outcome.resultVersions[0].version, 6);
  const query = { protocolVersion: 2, query: 'operation.get', requestId: 'query', sessionId: 's', sessionEpoch: 1, payload: { operationId: 'organize' } };
  const original = { requestId: 'query', serverTime: 4000, versions: [], data: { status: 'found', command: 'inventory.organize', result: receipt } };
  assert.equal(decodeAssetResponse(query, JSON.stringify(original)).data.result.serverTime, 3000);
  const absent = { requestId: 'query', serverTime: 4000, versions: [], data: { status: 'notFound' } };
  assert.equal(decodeAssetResponse(query, JSON.stringify(absent)).data.status, 'notFound');
  assert.equal(decodeAssetResponse(intent, JSON.stringify({ ...receipt, outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' } })).outcome.status, 'unknown');
});
