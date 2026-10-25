import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSimulationSubmit } from '../src/protocol/simulation-v2.ts';

const request = () => ({ protocolVersion: 2, command: 'simulation.submit', operationId: 'op', sessionId: 's', sessionEpoch: 1,
  expected: [{ kind: 'challenge', id: 'h', version: 0 }], payload: { characterId: 'c', rolePlayEpoch: 1, challengeId: 'h', roomNo: 1, sceneEpoch: 1, timelineEpoch: 1,
    baseCheckpointVersion: 0, firstSeq: 1, lastSeq: 1, fromTick: 0, toTick: 100, ruleRef: 'rules-v1', mapRef: 'map-v1', digest: 'a'.repeat(64),
    inputs: [{ seq: 1, tick: 1, kind: 'move', x: 1000, y: -1000 }] } });
test('ordered input wire accepts a bounded one-second segment and rejects self-reported battle facts', () => {
  const value = request();
  assert.deepEqual(decodeSimulationSubmit(JSON.stringify(value)), value);
  for (const patch of [{ command: 'challenge.reportEvents' }, { command: 'challenge.enterRoom' }, { protocolVersion: 1 }, { hp: 100 }]) assert.throws(() => decodeSimulationSubmit(JSON.stringify({ ...value, ...patch })));
  for (const patch of [{ toTick: 101 }, { firstSeq: 2 }, { inputs: [{ seq: 1, tick: 1, kind: 'monsterKilled', spawnId: 'm' }] }, { inputs: [{ seq: 1, tick: 1, kind: 'move', x: 1001, y: 0 }] }, { reward: 100 }, { digest: 'secret' }]) assert.throws(() => decodeSimulationSubmit(JSON.stringify({ ...value, payload: { ...value.payload, ...patch } })));
  assert.throws(() => decodeSimulationSubmit(' '.repeat(16385)));
});

test('input count, continuous sequence and UTF-8 request budget hold at boundaries', () => {
  const value = request();
  value.payload.inputs = Array.from({ length: 32 }, (_, i) => ({ seq: i + 1, tick: i, kind: 'basic', pressed: true }));
  value.payload.lastSeq = 32;
  assert.equal(decodeSimulationSubmit(JSON.stringify(value)).payload.inputs.length, 32);
  value.payload.inputs.push({ seq: 33, tick: 33, kind: 'basic', pressed: false });
  value.payload.lastSeq = 33;
  assert.throws(() => decodeSimulationSubmit(JSON.stringify(value)));
  const empty = request();
  empty.payload.inputs = []; empty.payload.lastSeq = 0;
  assert.equal(decodeSimulationSubmit(JSON.stringify(empty)).payload.lastSeq, 0);
  const oversized = request();
  oversized.expected = Array.from({ length: 32 }, (_, i) => ({ kind: 'equipment', id: '装'.repeat(120) + i, version: 0 }));
  oversized.payload.inputs = Array.from({ length: 32 }, (_, i) => ({ seq: i + 1, tick: i, kind: 'trinket', itemId: '装'.repeat(120) }));
  oversized.payload.lastSeq = 32;
  const text = JSON.stringify(oversized);
  assert.ok(text.length < 16384);
  assert.ok(new TextEncoder().encode(text).length > 16384);
  assert.throws(() => decodeSimulationSubmit(text), /REQUEST_TOO_LARGE/);
});

test('room numbering uses zero-based protocol values and rejects the eighth room', () => {
  const value = request();
  value.payload.roomNo = 0;
  assert.equal(decodeSimulationSubmit(JSON.stringify(value)).payload.roomNo, 0);
  value.payload.roomNo = 6;
  assert.equal(decodeSimulationSubmit(JSON.stringify(value)).payload.roomNo, 6);
  value.payload.roomNo = 7;
  assert.throws(() => decodeSimulationSubmit(JSON.stringify(value)));
});
test('current movement proof request is strict and wire reply binds current context',async()=>{
 const {parseSimulationConfirmed,parseSimulationSubmit}=await import('../src/protocol/simulation-v2.ts'),{encodeSceneMessage,decodeSceneReply}=await import('../src/protocol/scene-wire.ts');
 const q={protocolVersion:2,query:'simulation.confirmed',requestId:'current',sessionId:'s',sessionEpoch:1,payload:{characterId:'c',rolePlayEpoch:1,challengeId:'h',sceneEpoch:1,timelineEpoch:1,checkpointRevision:2,pageIndex:0}};
 assert.deepEqual(JSON.parse(encodeSceneMessage(q)),q);assert.throws(()=>parseSimulationConfirmed({...q,payload:{...q.payload,privateChunk:true}}));
 const r={protocolVersion:2,requestId:'current',serverTime:1,readyTicketId:'confirmed:h',sceneEpoch:1,timelineEpoch:1,checkpointRevision:2,publicStateHash:'a'.repeat(64),manifestHash:'b'.repeat(64),deadline:10,pageIndex:0,totalPages:1,records:[]};
 assert.equal(decodeSceneReply(q,JSON.stringify(r)).checkpointRevision,2);assert.throws(()=>decodeSceneReply(q,JSON.stringify({...r,checkpointRevision:1})));
 const accessor=request();Object.defineProperty(accessor.payload,'digest',{get:()=>{throw Error('unsafe accessor');},enumerable:true});assert.throws(()=>parseSimulationSubmit(accessor),/INVALID_FIELDS/);
});
