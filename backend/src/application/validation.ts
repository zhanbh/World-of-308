import type { Command } from '../../../shared/src/protocol/types.ts';
import { integer, requireRule } from '../domain/rules.ts';
function object(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}
function shape(v: unknown, required: string[], optional: string[] = []): asserts v is Record<string, unknown> {
  requireRule(object(v) && required.every(k => Object.hasOwn(v, k)) &&
    Object.keys(v).every(k => [...required, ...optional].includes(k)), 'INVALID_ARGUMENT');
}
export function text(v: unknown): v is string { return typeof v === 'string' && v.length > 0 && v.length <= 512; }
export function validateCommand(input: unknown): asserts input is Command {
  shape(input, ['protocolVersion','command','operationId','payload'], ['expected']);
  requireRule(input.protocolVersion === 1 && text(input.operationId) && input.operationId.length <= 128, 'INVALID_ARGUMENT');
  if (input.expected !== undefined) {
    shape(input.expected, [], ['challengeVersion','characterVersion','containerVersion']);
    requireRule(Object.values(input.expected).every(v => integer(v)), 'INVALID_ARGUMENT');
  }
  const fields: Record<string, string[]> = {
    'character.create': ['classId'], 'challenge.start': ['characterId','dungeonId','difficultyId'],
    'challenge.enterRoom': ['challengeId','roomNo'], 'challenge.reportEvents': ['challengeId','roomToken','firstSeq','events'],
    'challenge.revive': ['challengeId','deathIndex'], 'challenge.leave': ['challengeId','reason'],
    'drop.collect': ['challengeId','roomNo','dropId','sceneEpoch'], 'reward.claim': ['sourceId'],
  };
  requireRule(typeof input.command === 'string' && Object.hasOwn(fields, input.command), 'INVALID_ARGUMENT');
  const names = fields[input.command]; shape(input.payload, names);
  for (const field of names) {
    const v = input.payload[field];
    if (['roomNo','sceneEpoch','deathIndex','firstSeq'].includes(field)) requireRule(integer(v, field === 'roomNo' ? 0 : 1), 'INVALID_ARGUMENT');
    else if (field !== 'events') requireRule(text(v), 'INVALID_ARGUMENT');
  }
  if (input.command === 'character.create') requireRule(['warrior','hunter'].includes(input.payload.classId as string), 'INVALID_ARGUMENT');
  if (input.command === 'challenge.leave') requireRule(['abandon','finishLoot'].includes(input.payload.reason as string), 'INVALID_ARGUMENT');
  if (input.command !== 'challenge.reportEvents') return;
  const events = input.payload.events;
  requireRule(Array.isArray(events) && events.length > 0 && events.length <= 32, 'INVALID_ARGUMENT');
  for (const e of events) {
    requireRule(object(e), 'INVALID_ARGUMENT');
    if (e.kind === 'playerDied') {
      shape(e, ['seq','kind','deathIndex','simulationTick','lingeringSourceIds'], ['deathOccurredAt']);
      requireRule(integer(e.deathIndex, 1) && Array.isArray(e.lingeringSourceIds) && e.lingeringSourceIds.length <= 64 &&
        e.lingeringSourceIds.every(text) && (e.deathOccurredAt === undefined || integer(e.deathOccurredAt, 0)), 'INVALID_ARGUMENT');
    } else {
      shape(e, ['seq','kind','spawnId','simulationTick','source']);
      requireRule(e.kind === 'monsterKilled' && text(e.spawnId), 'INVALID_ARGUMENT');
      shape(e.source, ['kind','sourceId']);
      requireRule(['direct','dot','lingering'].includes(e.source.kind as string) && text(e.source.sourceId), 'INVALID_ARGUMENT');
    }
    requireRule(integer(e.seq, 1) && integer(e.simulationTick), 'INVALID_ARGUMENT');
  }
}
