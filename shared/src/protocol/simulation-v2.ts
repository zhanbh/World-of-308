import { logicTick } from '../exact-values.ts';
import type { LogicTick } from '../exact-values.ts';
import { parseExpected } from './session-v2.ts';
import type { SessionEnvelope } from './session-v2.ts';

type InputBase = { seq: number; tick: LogicTick };
export type ActionInput = InputBase & (
  | { kind: 'move'; x: number; y: number }
  | { kind: 'basic'; pressed: boolean }
  | { kind: 'skill'; skillId: 'cross' | 'bengshan' | 'badao' | 'earth' }
  | { kind: 'item'; templateId: string; quickSlotIndex: number }
  | { kind: 'trinket'; itemId: string });
export type SimulationSubmit = SessionEnvelope & { command: 'simulation.submit'; payload: {
  characterId: string; rolePlayEpoch: number; challengeId: string; roomNo: number; sceneEpoch: number; timelineEpoch: number;
  baseCheckpointVersion: number; firstSeq: number; lastSeq: number; fromTick: LogicTick; toTick: LogicTick;
  ruleRef: string; mapRef: string; digest: string; inputs: ActionInput[];
} };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('INVALID_ARGUMENT');
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('INVALID_FIELDS');
  for (const key of keys) if (!('value' in Object.getOwnPropertyDescriptor(value, key)!)) throw new TypeError('INVALID_FIELDS');
  return value as Record<string, unknown>;
}
function int(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0)) throw new TypeError('INVALID_INTEGER');
  return value;
}
function identifier(value: unknown, max = 128): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\s\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(value)) throw new TypeError('INVALID_ID');
  return value;
}
function opId(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(value)) throw new TypeError('INVALID_OPERATION_ID');
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new TypeError('INVALID_HASH');
  return value;
}
function readWire(text: string, max: number): unknown {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > max) throw new TypeError('REQUEST_TOO_LARGE');
  return JSON.parse(text);
}
function action(value: unknown): ActionInput {
  if (!value || typeof value !== 'object') throw new TypeError('INVALID_INPUT');
  const kind = Object.getOwnPropertyDescriptor(value, 'kind')?.value;
  const extras: Record<string, string[]> = { move: ['x', 'y'], basic: ['pressed'], skill: ['skillId'], item: ['templateId', 'quickSlotIndex'], trinket: ['itemId'] };
  if (typeof kind !== 'string' || !Object.hasOwn(extras, kind)) throw new TypeError('INVALID_INPUT');
  const p = object(value, ['seq', 'tick', 'kind', ...extras[kind]]);
  const base = { seq: int(p.seq, 1), tick: logicTick(p.tick) };
  switch (kind) {
    case 'move': return { ...base, kind, x: int(p.x, -1000, 1000), y: int(p.y, -1000, 1000) };
    case 'basic':
      if (typeof p.pressed !== 'boolean') throw new TypeError('INVALID_INPUT');
      return { ...base, kind, pressed: p.pressed };
    case 'skill':
      if (!['cross', 'bengshan', 'badao', 'earth'].includes(p.skillId as string)) throw new TypeError('INVALID_INPUT');
      return { ...base, kind, skillId: p.skillId as 'cross' | 'bengshan' | 'badao' | 'earth' };
    case 'item': return { ...base, kind, templateId: identifier(p.templateId, 64), quickSlotIndex: int(p.quickSlotIndex, 0, 2) };
    case 'trinket': return { ...base, kind, itemId: identifier(p.itemId) };
  }
  throw new TypeError('INVALID_INPUT');
}
export function decodeSimulationSubmit(text:string):SimulationSubmit{return parseSimulationSubmit(readWire(text,16384));}
export function parseSimulationSubmit(value:unknown):SimulationSubmit {
  const r = object(value, ['protocolVersion', 'command', 'operationId', 'sessionId', 'sessionEpoch', 'expected', 'payload']);
  if (r.protocolVersion !== 2 || r.command !== 'simulation.submit') throw new TypeError('UNSUPPORTED_PROTOCOL');
  const p = object(r.payload, ['characterId', 'rolePlayEpoch', 'challengeId', 'roomNo', 'sceneEpoch', 'timelineEpoch', 'baseCheckpointVersion', 'firstSeq', 'lastSeq', 'fromTick', 'toTick', 'ruleRef', 'mapRef', 'digest', 'inputs']);
  const fromTick = logicTick(p.fromTick), toTick = logicTick(p.toTick);
  if (toTick <= fromTick || toTick - fromTick > 100) throw new TypeError('INVALID_TICK_SPAN');
  if (!Array.isArray(p.inputs) || p.inputs.length > 32) throw new TypeError('INVALID_INPUT_COUNT');
  const inputs = Array.from(p.inputs, action);
  const firstSeq = int(p.firstSeq, 1), lastSeq = int(p.lastSeq);
  if (lastSeq !== firstSeq - 1 + inputs.length) throw new TypeError('INPUT_GAP');
  let previousTick = fromTick;
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].seq !== firstSeq + i || inputs[i].tick < previousTick || inputs[i].tick < fromTick || inputs[i].tick >= toTick) throw new TypeError('INPUT_GAP');
    previousTick = inputs[i].tick;
  }
  const parsed:SimulationSubmit = { protocolVersion: 2, command: 'simulation.submit', operationId: opId(r.operationId), sessionId: identifier(r.sessionId), sessionEpoch: int(r.sessionEpoch, 1), expected: parseExpected(r.expected), payload: {
    characterId: identifier(p.characterId), rolePlayEpoch: int(p.rolePlayEpoch, 1), challengeId: identifier(p.challengeId), roomNo: int(p.roomNo, 0, 6), sceneEpoch: int(p.sceneEpoch, 1), timelineEpoch: int(p.timelineEpoch, 1),
    baseCheckpointVersion: int(p.baseCheckpointVersion), firstSeq, lastSeq, fromTick, toTick, ruleRef: identifier(p.ruleRef, 64), mapRef: identifier(p.mapRef, 64), digest: hash(p.digest), inputs,
  } };
  if(new TextEncoder().encode(JSON.stringify(parsed)).length>16384)throw new TypeError('REQUEST_TOO_LARGE');
  return parsed;
}

/** Current public CP only. No private chunks or historical ready ticket authority. */
export function parseSimulationConfirmed(value:unknown){
 const q=object(value,['protocolVersion','query','requestId','sessionId','sessionEpoch','payload']);
 if(q.protocolVersion!==2||q.query!=='simulation.confirmed')throw new TypeError('UNSUPPORTED_PROTOCOL');
 const p=object(q.payload,['characterId','rolePlayEpoch','challengeId','sceneEpoch','timelineEpoch','checkpointRevision','pageIndex']);
 return {protocolVersion:2 as const,query:'simulation.confirmed' as const,requestId:identifier(q.requestId,64),sessionId:identifier(q.sessionId),sessionEpoch:int(q.sessionEpoch,1),payload:{characterId:identifier(p.characterId),rolePlayEpoch:int(p.rolePlayEpoch,1),challengeId:identifier(p.challengeId),sceneEpoch:int(p.sceneEpoch,1),timelineEpoch:int(p.timelineEpoch,1),checkpointRevision:int(p.checkpointRevision),pageIndex:int(p.pageIndex,0,63)}};
}
