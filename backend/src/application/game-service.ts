import type { BattleEvent, Command, Outcome, Response, Loot } from '../../../shared/src/protocol/types.ts';
import type { Account, Auth, Backpack, Challenge, Character, DungeonConfig, Equipment, Grant,
  Journal, Principal, RewardGenerator, RewardPlan, Room, Rules, Session, Wallet } from '../domain/model.ts';
import { add, gainXp, integer, putStack, refreshStamina, refillWindow, requireRule, RuleError, validatePlan, validateRules } from '../domain/rules.ts';
import type { Clock, IdSource, Store, Transaction } from '../ports/store.ts';
import { canonical, CommitUnknown, key } from '../ports/store.ts';
import { text, validateCommand } from './validation.ts';
interface Operation { hash: string; outcome: Outcome; }
class Buffer implements Transaction {
  writes = new Map<string, unknown>(); parent: Transaction;
  constructor(parent: Transaction) { this.parent = parent; }
  async get<T>(id: string): Promise<T | undefined> { return this.writes.has(id) ? structuredClone(this.writes.get(id)) as T : this.parent.get<T>(id); }
  set<T>(id: string, value: T): void { this.writes.set(id, structuredClone(value)); }
  flush(): void { for (const [id, value] of this.writes) this.parent.set(id, value); }
}
const ok = (data: Record<string, unknown>): Outcome => ({ status: 'committed', data });
const rejected = (code: RuleError['code']): Outcome => ({ status: 'rejected', code });
export class GameService {
  private store: Store; private clock: Clock; private ids: IdSource; private rewards: RewardGenerator; private rules: Rules;
  constructor(store: Store, clock: Clock, ids: IdSource, rewards: RewardGenerator, rules: Rules) {
    validateRules(rules);
    this.store = store; this.clock = clock; this.ids = ids; this.rewards = rewards; this.rules = structuredClone(rules);
  }
  private reply(operationId: string, outcome: Outcome, replayed = false): Response {
    return { operationId, serverTime: this.clock.now(), replayed, outcome };
  }
  /** Principal is already verified by the future platform adapter. No HTTP/auth implementation here. */
  async openSession(principal: Principal, launchId: string, operationId: string): Promise<Response> {
    if (!this.validPrincipal(principal) || !text(launchId) || !text(operationId) || operationId.length > 128) return this.reply(operationId, rejected('INVALID_ARGUMENT'));
    const candidateAccount = this.ids.next('account'), candidateSession = this.ids.next('session');
    try {
      return await this.store.run(async tx => {
        const linkKey = this.identityKey(principal);
        const accountId = (await tx.get<string>(linkKey)) ?? candidateAccount;
        let account = (await tx.get<Account>(key('account', accountId)));
        const openHash = canonical({ command: 'session.open', launchId });
        const operationKey = key('operation', accountId, operationId);
        const previousOp = await tx.get<Operation>(operationKey);
        if (previousOp && previousOp.hash !== openHash) return this.reply(operationId, rejected('OPERATION_MISMATCH'));
        const sessionKey = key('launch', accountId, launchId);
        const previousSessionId = (await tx.get<string>(sessionKey));
        if (previousSessionId) {
          const previous = (await tx.get<Session>(key('session', previousSessionId)));
          requireRule(previous && account, 'AUTH_REQUIRED');
          if (previous.revoked || account.sessionId !== previous.id) return this.reply(operationId, rejected('SESSION_REVOKED'));
          (await this.expire(tx, account, this.clock.now()));
          const outcome = ok({ accountId, sessionId: previous.id, epoch: previous.epoch });
          account.writeRevision++; tx.set(key('account', accountId), account);
          tx.set<Operation>(operationKey, { hash: openHash, outcome });
          return this.reply(operationId, outcome, true);
        }
        if (!account) {
          account = { id: accountId, sessionId: '', epoch: 0, characters: {}, writeRevision: 0 };
          tx.set(linkKey, accountId); tx.set<Wallet>(key('wallet', accountId), { gold: 0, points: 0, version: 0 });
        } else {
          const old = (await tx.get<Session>(key('session', account.sessionId)));
          if (old) { old.revoked = true; tx.set(key('session', old.id), old); }
          if (account.openSceneChallengeId) {
            const challenge = (await tx.get<Challenge>(key('challenge', account.openSceneChallengeId)));
            if (challenge) this.close(tx, account, challenge);
          }
        }
        const session: Session = { id: candidateSession, accountId, launchId, epoch: account.epoch + 1, revoked: false };
        account.sessionId = session.id; account.epoch = session.epoch; account.writeRevision++;
        tx.set(key('account', accountId), account); tx.set(key('session', session.id), session); tx.set(sessionKey, session.id);
        const outcome = ok({ accountId, sessionId: session.id, epoch: session.epoch });
        tx.set<Operation>(operationKey, { hash: openHash, outcome });
        return this.reply(operationId, outcome);
      });
    } catch (error) { return this.errorReply(operationId, error); }
  }
  private validPrincipal(p: Principal): boolean { return !!p && text(p.platform) && text(p.appId) && text(p.subject); }
  private identityKey(p: Principal): string { return key('identity', p.platform, p.appId, p.subject); }
  private async auth(tx: Transaction, auth: Auth): Promise<Account> {
    requireRule(auth && this.validPrincipal(auth.principal), 'AUTH_REQUIRED');
    requireRule((await tx.get<string>(this.identityKey(auth.principal))) === auth.accountId, 'AUTH_REQUIRED');
    const account = (await tx.get<Account>(key('account', auth.accountId)));
    const session = (await tx.get<Session>(key('session', auth.sessionId)));
    requireRule(account && session && session.accountId === account.id && !session.revoked &&
      account.epoch === auth.epoch && session.epoch === auth.epoch && account.sessionId === auth.sessionId, 'SESSION_REVOKED');
    return account;
  }
  private errorReply(id: string, error: unknown): Response {
    if (error instanceof RuleError) return this.reply(id, rejected(error.code));
    if (error instanceof CommitUnknown) return this.reply(id, { status: 'unknown', code: 'RESULT_UNKNOWN' });
    throw error;
  }
  async execute(auth: Auth, input: unknown): Promise<Response> {
    let operationId = '';
    try {
      requireRule(auth && this.validPrincipal(auth.principal) && text(auth.accountId) && text(auth.sessionId) && integer(auth.epoch, 1), 'AUTH_REQUIRED');
      validateCommand(input); const command = structuredClone(input); operationId = command.operationId;
      const hash = canonical({ command, sessionId: auth.sessionId, epoch: auth.epoch });
      const candidates = new Map<string, RewardPlan>();
      const nextChallengeId = command.command === 'challenge.start' ? this.ids.next('challenge') : '';
      const nextCharacterId = command.command === 'character.create' ? this.ids.next('character') : '';
      return await this.store.run(async tx => {
        const account = (await this.auth(tx, auth));
        const operationKey = key('operation', account.id, operationId);
        const previous = (await tx.get<Operation>(operationKey));
        if (previous) return this.reply(operationId, previous.hash === hash ? previous.outcome : rejected('OPERATION_MISMATCH'), previous.hash === hash);
        const expired = (await this.expire(tx, account, this.clock.now()));
        const buffer = new Buffer(tx);
        let outcome: Outcome;
        try {
          if ('challengeId' in command.payload && expired === command.payload.challengeId) throw new RuleError('DEADLINE_EXPIRED');
          const localAccount = structuredClone(account);
          const data = (await this.dispatch(buffer, localAccount, command, candidates, nextChallengeId, nextCharacterId));
          // Recheck after asynchronous reads; failed/expired original state must survive rejection.
          requireRule(!(await this.expire(tx, account, this.clock.now())), 'DEADLINE_EXPIRED');
          localAccount.writeRevision++;
          buffer.set(key('account', account.id), localAccount);
          buffer.set<Journal>(key('journal', account.id, operationId), { operationId, command: command.command,
            accountId: account.id, changes: structuredClone(data) });
          buffer.flush(); outcome = ok(data);
        } catch (error) {
          if (!(error instanceof RuleError)) throw error;
          account.writeRevision++; tx.set(key('account', account.id), account); outcome = rejected(error.code);
        }
        tx.set<Operation>(operationKey, { hash, outcome });
        return this.reply(operationId, outcome);
      });
    } catch (error) { return this.errorReply(operationId, error); }
  }
  private async owned<T extends { accountId: string }>(tx: Transaction, kind: string, id: string, account: Account): Promise<T> {
    const value = (await tx.get<T>(key(kind, id))); requireRule(value && value.accountId === account.id, 'NOT_FOUND_OR_FORBIDDEN'); return value;
  }
  private version(actual: number, expected: number | undefined): void {
    requireRule(integer(expected), 'INVALID_ARGUMENT'); requireRule(actual === expected, 'VERSION_CONFLICT');
  }
  private config(challenge: Pick<Challenge, 'dungeonId' | 'difficultyId' | 'configVersion'>): DungeonConfig {
    const config = this.rules.dungeons.find(c => c.dungeonId === challenge.dungeonId && c.difficultyId === challenge.difficultyId && c.version === challenge.configVersion);
    requireRule(config, 'CONFIG_NOT_READY'); return config;
  }
  private close(tx: Transaction, account: Account, challenge: Challenge): void {
    if (challenge.sceneState === 'closed') return;
    if (challenge.result === 'active') challenge.result = 'failed';
    challenge.sceneState = 'closed'; challenge.sceneEpoch++; challenge.version++;
    if (account.activeChallengeId === challenge.id) delete account.activeChallengeId;
    if (account.openSceneChallengeId === challenge.id) delete account.openSceneChallengeId;
    tx.set(key('challenge', challenge.id), challenge); tx.set(key('account', account.id), account);
  }
  private async expire(tx: Transaction, account: Account, now: number): Promise<string | undefined> {
    if (!account.openSceneChallengeId) return;
    const challenge = (await tx.get<Challenge>(key('challenge', account.openSceneChallengeId)));
    if (!challenge || challenge.sceneState === 'closed') return;
    const deadline = challenge.lease.mode === 'recovery' ? challenge.lease.recoveryUntil! : challenge.lease.until;
    if (now >= deadline || challenge.result === 'active' && challenge.lifeState === 'dead' && now >= challenge.deathDeadline!) {
      this.close(tx, account, challenge); return challenge.id;
    }
  }
  private async dispatch(tx: Transaction, account: Account, cmd: Command, plans: Map<string, RewardPlan>, nextChallengeId: string, nextCharacterId: string): Promise<Record<string, unknown>> {
    const now = this.clock.now();
    if (cmd.command === 'character.create') {
      const { classId } = cmd.payload;
      requireRule(this.rules.supportedClasses.includes(classId), 'CONFIG_NOT_READY');
      requireRule(!account.characters[classId], 'CLASS_EXISTS');
      requireRule(!account.activeChallengeId, 'ACTIVE_CHALLENGE_EXISTS');
      const character: Character = { id: nextCharacterId, accountId: account.id, classId, level: 1, xp: 0, statsVersion: 0,
        equipmentVersion: 0, equipped: [], stamina: { value: 308, refillWindow: refillWindow(now) }, version: 0 };
      account.characters[classId] = character.id;
      tx.set(key('character', character.id), character);
      tx.set<Backpack>(key('bag', character.id), { accountId: account.id, characterId: character.id, capacity: 10, slots: [], version: 0 });
      return { characterId: character.id, characterVersion: 0 };
    }
    if (cmd.command === 'challenge.start') {
      requireRule(!account.activeChallengeId, 'ACTIVE_CHALLENGE_EXISTS'); requireRule(!account.openSceneChallengeId, 'SCENE_STILL_OPEN');
      const character = (await this.owned<Character>(tx, 'character', cmd.payload.characterId, account));
      this.version(character.version, cmd.expected?.characterVersion);
      const config = this.rules.dungeons.find(c => c.dungeonId === cmd.payload.dungeonId && c.difficultyId === cmd.payload.difficultyId);
      requireRule(config, 'CONFIG_NOT_READY');
      if (config.special) requireRule(character.level >= 30, 'CONFIG_NOT_READY');
      const challenge: Challenge = { id: nextChallengeId, accountId: account.id, characterId: character.id, sessionId: account.sessionId,
        configVersion: config.version, dungeonId: config.dungeonId, difficultyId: config.difficultyId,
        lockedMonsterLevel: Math.max(config.minLevel, Math.min(config.maxLevel, character.level)),
        entryEquipment: [...character.equipped], attributeRevision: character.statsVersion, result: 'active', lifeState: 'alive',
        deathIndex: 0, lingeringSources: [], paidRevives: 0, currentRoomNo: -1, sceneState: 'combat', sceneEpoch: 1,
        lastEventSeq: 0, controlSeq: 0, version: 0, lease: { until: now + 10_000, lastSeq: 0, mode: 'connected', revision: 0 } };
      account.activeChallengeId = challenge.id; account.openSceneChallengeId = challenge.id;
      tx.set(key('challenge', challenge.id), challenge); return { challengeId: challenge.id, challengeVersion: 0 };
    }
    if (cmd.command === 'reward.claim') {
      requireRule(!account.openSceneChallengeId, 'SCENE_STILL_OPEN');
      const grant = (await this.owned<Grant>(tx, 'grant', cmd.payload.sourceId, account));
      const bag = (await this.owned<Backpack>(tx, 'bag', grant.characterId, account));
      if (grant.state === 'delivered') return { itemId: grant.itemId, delivered: true };
      this.version(bag.version, cmd.expected?.containerVersion);
      requireRule(bag.slots.length < bag.capacity, 'BAG_FULL');
      const equipment = (await this.owned<Equipment>(tx, 'equipment', grant.itemId, account));
      bag.slots.push({ kind: 'equipment', itemId: equipment.id }); bag.version++;
      equipment.location = 'backpack'; grant.state = 'delivered';
      tx.set(key('bag', grant.characterId), bag); tx.set(key('equipment', equipment.id), equipment); tx.set(key('grant', grant.sourceId), grant);
      return { itemId: equipment.id, containerVersion: bag.version };
    }
    const challenge = (await this.owned<Challenge>(tx, 'challenge', cmd.payload.challengeId, account));
    requireRule(challenge.sessionId === account.sessionId, 'SESSION_REVOKED');
    requireRule(challenge.sceneState !== 'closed', 'SCENE_CLOSED');
    if (cmd.command === 'challenge.reportEvents' && challenge.lastBatch?.firstSeq === cmd.payload.firstSeq && challenge.lastBatch.hash === canonical(cmd.payload.events)) {
      return { acceptedThrough: challenge.lastEventSeq, challengeVersion: challenge.version };
    }
    this.version(challenge.version, cmd.expected?.challengeVersion);
    if (cmd.command === 'challenge.leave') {
      requireRule(cmd.payload.reason === (challenge.result === 'completed' ? 'finishLoot' : 'abandon'), 'INVALID_ARGUMENT');
      this.close(tx, account, challenge); return { result: challenge.result, sceneState: 'closed', restore: 'fullHpMp' };
    }
    requireRule(challenge.lease.mode === 'connected', 'RECOVERY_REQUIRED');
    const character = (await this.owned<Character>(tx, 'character', challenge.characterId, account));
    const config = this.config(challenge);
    if (cmd.command === 'challenge.enterRoom') {
      requireRule(challenge.result === 'active', 'CHALLENGE_TERMINAL'); requireRule(challenge.lifeState === 'alive', 'INVALID_EVENT');
      if (cmd.payload.roomNo === challenge.currentRoomNo) {
        const room = (await tx.get<Room>(key('room', challenge.id, challenge.currentRoomNo)))!;
        return { roomToken: room.token, challengeVersion: challenge.version, paidCost: room.paidCost };
      }
      requireRule(cmd.payload.roomNo === challenge.currentRoomNo + 1 && cmd.payload.roomNo < config.rooms.length, 'ROOM_NOT_AVAILABLE');
      if (challenge.currentRoomNo >= 0) requireRule((await tx.get<Room>(key('room', challenge.id, challenge.currentRoomNo)))?.cleared, 'ROOM_NOT_AVAILABLE');
      refreshStamina(character, now); const cost = config.special ? 3 : 1;
      requireRule(character.stamina.value >= cost, 'STAMINA_NOT_ENOUGH');
      character.stamina.value -= cost; character.version++;
      const roomNo = cmd.payload.roomNo;
      const room: Room = { challengeId: challenge.id, roomNo, token: key('roomToken', challenge.id, roomNo, challenge.sceneEpoch),
        paidCost: cost, paidAt: now, manifest: structuredClone(config.rooms[roomNo]), kills: {}, drops: [], cleared: false, simulationTick: 0, version: 0 };
      challenge.currentRoomNo = roomNo; challenge.version++;
      tx.set(key('character', character.id), character); tx.set(key('room', challenge.id, roomNo), room); tx.set(key('challenge', challenge.id), challenge);
      return { roomToken: room.token, challengeVersion: challenge.version, characterVersion: character.version, paidCost: cost };
    }
    if (cmd.command === 'challenge.revive') {
      requireRule(challenge.result === 'active', 'CHALLENGE_TERMINAL'); requireRule(challenge.lifeState === 'dead' && challenge.deathIndex === cmd.payload.deathIndex, 'NOT_DEAD');
      requireRule(!config.special || challenge.paidRevives < config.reviveLimit!, 'REVIVE_LIMIT_REACHED');
      const bag = (await this.owned<Backpack>(tx, 'bag', character.id, account));
      const index = bag.slots.findIndex(s => s.kind === 'stack' && s.templateId === 'resurrection-emblem' && s.quantity > 0);
      requireRule(index >= 0, 'EMBLEM_NOT_ENOUGH'); const stack = bag.slots[index];
      requireRule(stack.kind === 'stack', 'EMBLEM_NOT_ENOUGH');
      if (--stack.quantity === 0) bag.slots.splice(index, 1); bag.version++;
      challenge.lifeState = 'alive'; delete challenge.deathDeadline; challenge.paidRevives++; challenge.protectionUntil = this.clock.now() + 2000; challenge.version++;
      tx.set(key('bag', character.id), bag); tx.set(key('challenge', challenge.id), challenge);
      return { challengeVersion: challenge.version, containerVersion: bag.version, restore: 'fullHpMp', protectionUntil: challenge.protectionUntil,
        resetCooldowns: false, revivalControl: 'configuredOutwardKnockdown', controlDamage: 0 };
    }
    const room = (await tx.get<Room>(key('room', challenge.id, challenge.currentRoomNo))); requireRule(room, 'ROOM_NOT_AVAILABLE');
    if (cmd.command === 'drop.collect') {
      requireRule(cmd.payload.sceneEpoch === challenge.sceneEpoch && cmd.payload.roomNo === challenge.currentRoomNo, 'SCENE_CLOSED');
      const drop = room.drops.find(d => d.id === cmd.payload.dropId); requireRule(drop, 'NOT_FOUND_OR_FORBIDDEN');
      if (drop.state === 'collected') return { dropId: drop.id, collected: true };
      const bag = (await this.owned<Backpack>(tx, 'bag', character.id, account)); this.version(bag.version, cmd.expected?.containerVersion);
      this.deliver(tx, account, character.id, bag, drop.loot, drop.sourceId, false);
      drop.state = 'collected'; bag.version++; room.version++;
      tx.set(key('bag', character.id), bag); tx.set(key('room', challenge.id, room.roomNo), room);
      return { dropId: drop.id, containerVersion: bag.version, collected: true };
    }
    requireRule(cmd.command === 'challenge.reportEvents', 'INVALID_ARGUMENT');
    requireRule(challenge.result === 'active', 'CHALLENGE_TERMINAL'); requireRule(cmd.payload.roomToken === room.token, 'ROOM_NOT_AVAILABLE');
    requireRule(cmd.payload.firstSeq > challenge.lastEventSeq, 'EVENT_ALREADY_ACCEPTED');
    requireRule(cmd.payload.firstSeq === challenge.lastEventSeq + 1, 'EVENT_GAP');
    const wallet = (await tx.get<Wallet>(key('wallet', account.id)))!;
    const bag = (await this.owned<Backpack>(tx, 'bag', character.id, account));
    const oldLevel = character.level;
    let freeRevived = false;
    cmd.payload.events.forEach((event, index) => {
      requireRule(event.seq === cmd.payload.firstSeq + index && event.simulationTick >= room.simulationTick, 'INVALID_EVENT');
      room.simulationTick = event.simulationTick;
      if (event.kind === 'playerDied') {
        requireRule(challenge.result === 'active' && challenge.lifeState === 'alive' && event.deathIndex === challenge.deathIndex + 1, 'INVALID_EVENT');
        challenge.lifeState = 'dead'; challenge.deathIndex = event.deathIndex;
        challenge.deathDeadline = (event.deathOccurredAt !== undefined ? event.deathOccurredAt : this.clock.now()) + 10_000;
        challenge.lingeringSources = [...new Set(event.lingeringSourceIds)];
      } else freeRevived = this.kill(tx, account, character, challenge, config, room, wallet, bag, event, plans) || freeRevived;
      challenge.lastEventSeq = event.seq;
    });
    challenge.attributeRevision = character.statsVersion; challenge.version++; character.version++; wallet.version++; room.version++;
    challenge.lastBatch = { firstSeq: cmd.payload.firstSeq, lastSeq: challenge.lastEventSeq, hash: canonical(cmd.payload.events) };
    requireRule(room.drops.length <= 256 && new TextEncoder().encode(JSON.stringify(room)).byteLength <= 128 * 1024, 'CONFIG_NOT_READY');
    tx.set(key('challenge', challenge.id), challenge); tx.set(key('character', character.id), character);
    tx.set(key('wallet', account.id), wallet); tx.set(key('bag', character.id), bag); tx.set(key('room', challenge.id, room.roomNo), room);
    return { acceptedThrough: challenge.lastEventSeq, challengeVersion: challenge.version, characterVersion: character.version,
      result: challenge.result, lifeState: challenge.lifeState, level: character.level,
      restore: freeRevived || character.level > oldLevel && challenge.lifeState === 'alive' ? 'fullHpMp' : null,
      deathDeadline: challenge.deathDeadline ?? null };
  }
  private plan(plans: Map<string, RewardPlan>, sourceId: string, tableId: string, completion = false): RewardPlan {
    if (!plans.has(sourceId)) {
      const plan = structuredClone(this.rewards.roll(tableId, sourceId)); validatePlan(plan, completion); plans.set(sourceId, plan);
    }
    return plans.get(sourceId)!;
  }
  private kill(tx: Transaction, account: Account, character: Character, challenge: Challenge, config: DungeonConfig,
    room: Room, wallet: Wallet, bag: Backpack, event: Extract<BattleEvent, { kind: 'monsterKilled' }>, plans: Map<string, RewardPlan>): boolean {
    const monster = room.manifest.find(m => m.spawnId === event.spawnId); requireRule(monster, 'INVALID_EVENT');
    if (Object.hasOwn(room.kills, monster.spawnId)) return false;
    requireRule(challenge.result === 'active', 'CHALLENGE_TERMINAL');
    if (challenge.lifeState === 'dead') requireRule(event.source.kind !== 'direct' && challenge.lingeringSources.includes(event.source.sourceId), 'INVALID_EVENT');
    const reward = (spawnId: string, mode: 'direct' | 'dot' | 'lingering' | 'indirect') => {
      if (Object.hasOwn(room.kills, spawnId)) return;
      const target = room.manifest.find(m => m.spawnId === spawnId)!;
      const sourceId = key('kill', challenge.id, room.roomNo, spawnId);
      const plan = this.plan(plans, sourceId, target.tableId);
      room.kills = { ...room.kills, [spawnId]: { mode, seq: event.seq, xp: target.xp, gold: plan.gold } };
      gainXp(character, target.xp, this.rules); wallet.gold = add(wallet.gold, plan.gold);
      plan.drops.forEach((loot, i) => { const id = key('drop', challenge.id, room.roomNo, spawnId, i);
        room.drops.push({ id, sourceId: id, loot: structuredClone(loot), state: 'ground' }); });
    };
    const freeRevived = !!monster.finalBoss && challenge.lifeState === 'dead';
    reward(monster.spawnId, event.source.kind);
    if (monster.finalBoss) {
      for (const target of room.manifest) reward(target.spawnId, 'indirect');
      const sourceId = key('completion', challenge.id);
      const plan = this.plan(plans, sourceId, config.completionTableId, true);
      gainXp(character, config.completionXp, this.rules); wallet.gold = add(wallet.gold, plan.gold);
      this.deliver(tx, account, character.id, bag, plan.drops[0], sourceId, true); bag.version++;
      challenge.result = 'completed'; challenge.lifeState = 'alive'; challenge.sceneState = 'looting'; delete challenge.deathDeadline;
      if (account.activeChallengeId === challenge.id) delete account.activeChallengeId;
    }
    room.cleared = room.manifest.every(m => Object.hasOwn(room.kills, m.spawnId));
    return freeRevived;
  }
  private deliver(tx: Transaction, account: Account, characterId: string, bag: Backpack, loot: Loot, sourceId: string, completion: boolean): void {
    if (loot.kind === 'material') { requireRule(putStack(bag, loot.templateId, loot.quantity), 'BAG_FULL'); return; }
    const fits = bag.slots.length < bag.capacity;
    requireRule(fits || completion, 'BAG_FULL');
    const itemId = key('item', sourceId);
    const item: Equipment = { id: itemId, accountId: account.id, characterId, sourceId, descriptor: structuredClone(loot),
      binding: loot.quality === 'orange' ? 'character' : 'none', location: fits ? 'backpack' : 'pending' };
    tx.set(key('equipment', itemId), item);
    if (fits) bag.slots.push({ kind: 'equipment', itemId });
    if (completion) tx.set<Grant>(key('grant', sourceId), { sourceId, accountId: account.id, characterId, itemId, state: fits ? 'delivered' : 'pending' });
  }
  async state(auth: Auth, challengeId?: string): Promise<Record<string, unknown>> {
    return this.store.run(async tx => {
      const account = (await this.auth(tx, auth)); (await this.expire(tx, account, this.clock.now()));
      // State queries may materialize expiry, so participate in the same account fence.
      account.writeRevision++; tx.set(key('account', account.id), account);
      const characterId = challengeId ? (await this.owned<Challenge>(tx, 'challenge', challengeId, account)).characterId : undefined;
      return { account, wallet: (await tx.get(key('wallet', account.id))),
        challenge: challengeId ? (await tx.get(key('challenge', challengeId))) : undefined,
        character: characterId ? (await tx.get(key('character', characterId))) : undefined,
        bag: characterId ? (await tx.get(key('bag', characterId))) : undefined };
    });
  }
  async operation(auth: Auth, operationId: string): Promise<Outcome | undefined> {
    return this.store.run(async tx => { const account = (await this.auth(tx, auth)); return (await tx.get<Operation>(key('operation', account.id, operationId)))?.outcome; });
  }
  async control(auth: Auth, challengeId: string, input: { kind: 'heartbeat' | 'suspend' | 'resume'; seq: number }): Promise<Response> {
    try {
      requireRule(text(challengeId) && input && ['heartbeat','suspend','resume'].includes(input.kind) && integer(input.seq, 1), 'INVALID_ARGUMENT');
      return await this.store.run(async tx => {
        const account = (await this.auth(tx, auth)); const expired = (await this.expire(tx, account, this.clock.now()));
        const challenge = (await this.owned<Challenge>(tx, 'challenge', challengeId, account));
        requireRule(challenge.sessionId === account.sessionId, 'SESSION_REVOKED');
        const currentDeadline = challenge.lease.mode === 'recovery' ? challenge.lease.recoveryUntil! : challenge.lease.until;
        const lateExpired = challenge.sceneState !== 'closed' && (this.clock.now() >= currentDeadline ||
          challenge.result === 'active' && challenge.lifeState === 'dead' && this.clock.now() >= challenge.deathDeadline!);
        if (lateExpired) this.close(tx, account, challenge);
        if (expired || lateExpired || challenge.sceneState === 'closed') {
          account.writeRevision++; tx.set(key('account', account.id), account);
          return this.reply('', rejected(expired || lateExpired ? 'DEADLINE_EXPIRED' : 'SCENE_CLOSED'));
        }
        const lease = challenge.lease, now = this.clock.now();
        let replayed = false;
        if (input.kind === 'heartbeat') {
          if (lease.mode === 'recovery') return this.reply('', rejected('RECOVERY_REQUIRED'));
          if (input.seq <= lease.lastSeq) replayed = true;
          else { lease.lastSeq = input.seq; lease.until = now + 10_000; lease.revision++; }
        } else if (input.seq <= challenge.controlSeq) replayed = true;
        else {
          challenge.controlSeq = input.seq;
          if (input.kind === 'suspend') {
            if (lease.mode !== 'recovery') { lease.mode = 'recovery'; lease.recoveryUntil = now + 10_000; }
          } else if (lease.mode === 'recovery') {
            lease.mode = 'connected'; lease.until = now + 10_000; delete lease.recoveryUntil;
          }
          lease.revision++;
        }
        account.writeRevision++; tx.set(key('account', account.id), account); tx.set(key('challenge', challenge.id), challenge);
        return this.reply('', ok({ lease: structuredClone(lease), deathDeadline: challenge.deathDeadline ?? null }), replayed);
      });
    } catch (error) { return this.errorReply('', error); }
  }
}
