import { GameService } from '../src/application/game-service.ts';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { key } from '../src/ports/store.ts';
export { key };
export const principal = { platform: 'wechat', appId: 'test-app', subject: 'test-subject' };
export function system(overrides = {}) {
  const clock = { value: 0, now() { return this.value; } };
  const store = new MemoryStore(); let counter = 0;
  const ids = { next: kind => `${kind}-${++counter}` };
  const calls = [];
  const rewards = { roll(table, source) {
    calls.push({ table, source });
    return table === 'completion'
      ? { gold: 100, drops: [{ kind: 'equipment', templateId: 'test-sword', itemLevel: 10, quality: 'orange' }] }
      : { gold: 2, drops: [{ kind: 'material', templateId: 'ore', quantity: 1 }] };
  } };
  const rules = {
    xpThresholds: [0, 10, 30, 60], supportedClasses: ['warrior', 'hunter'], initialEmblems: 0,
    dungeons: [{ version: 'test-v1', dungeonId: 'test-dungeon', difficultyId: 'normal', special: false,
      minLevel: 1, maxLevel: 30, completionXp: 10, completionTableId: 'completion',
      rooms: [[{ spawnId: 'boss', xp: 10, finalBoss: true, tableId: 'monster' },
        { spawnId: 'mob-a', xp: 10, tableId: 'monster' }, { spawnId: 'mob-b', xp: 10, tableId: 'monster' }]] }],
    ...overrides,
  };
  const service = new GameService(store, clock, ids, rewards, rules);
  return { clock, store, ids, rewards, rules, calls, service };
}
export function data(response) {
  if (response.outcome.status !== 'committed') throw new Error(JSON.stringify(response));
  return response.outcome.data;
}
export function code(response) { return response.outcome.code; }
export async function setup(overrides = {}) {
  const h = system(overrides); let op = 0;
  const session = data(await h.service.openSession(principal, 'launch-1', 'open-1'));
  h.auth = { principal, accountId: session.accountId, sessionId: session.sessionId, epoch: session.epoch };
  h.request = (command, payload, operationId = `op-${++op}`, expected) => {
    if (expected === undefined) {
      const challenge = payload.challengeId && h.store.inspect(key('challenge', payload.challengeId));
      const character = payload.characterId && h.store.inspect(key('character', payload.characterId));
      const grant = payload.sourceId && h.store.inspect(key('grant', payload.sourceId));
      const bagId = challenge?.characterId ?? grant?.characterId;
      const bag = bagId && h.store.inspect(key('bag', bagId));
      expected = { ...(challenge && { challengeVersion: challenge.version }),
        ...(character && { characterVersion: character.version }), ...(bag && { containerVersion: bag.version }) };
    }
    return { protocolVersion: 1, command, operationId, payload, expected };
  };
  h.send = (command, payload, operationId, expected) => h.service.execute(h.auth, h.request(command, payload, operationId, expected));
  h.characterId = data(await h.send('character.create', { classId: 'warrior' })).characterId;
  h.start = async () => {
    h.challengeId = data(await h.send('challenge.start', { characterId: h.characterId, dungeonId: 'test-dungeon', difficultyId: 'normal' })).challengeId;
    return h.challengeId;
  };
  h.enter = async () => {
    h.roomToken = data(await h.send('challenge.enterRoom', { challengeId: h.challengeId, roomNo: 0 })).roomToken;
  };
  h.report = async (events, id) => h.send('challenge.reportEvents', { challengeId: h.challengeId, roomToken: h.roomToken, firstSeq: events[0].seq, events }, id);
  h.kill = (spawnId, seq, kind = 'direct', sourceId = 'sword') => ({ seq, kind: 'monsterKilled', spawnId, simulationTick: seq, source: { kind, sourceId } });
  h.death = (seq = 1, deathIndex = 1) => ({ seq, kind: 'playerDied', deathIndex, simulationTick: seq, lingeringSourceIds: ['bleed'] });
  h.peek = (kind, id) => h.store.inspect(key(kind, id));
  h.view = () => h.service.state(h.auth, h.challengeId);
  h.seed = (kind, id, update) => h.store.run(async tx => { const value = await tx.get(key(kind, id)); update(value); tx.set(key(kind, id), value); });
  h.emblems = quantity => h.seed('bag', h.characterId, bag => { bag.slots = [{ kind: 'stack', templateId: 'resurrection-emblem', quantity }]; });
  await h.start(); await h.enter();
  return h;
}
export function rendezvous(store) {
  let count = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  store.beforeCommit = async attempt => { if (attempt > 0) return; if (++count === 2) release(); await gate; };
}
