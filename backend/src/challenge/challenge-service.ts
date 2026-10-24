import { parseDungeonEntryQuery, parseDungeonEntryResponse, parseChallengeRequest, parseChallengeResponse } from '../../../shared/src/protocol/scene-v2.ts';
import { identityKey, isVerifiedIdentity, loginKey } from '../identity/identity-v2.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import type { LoginAccount, LoginSession, IdentityLink } from '../identity/login-model.ts';
import type { CharacterEntity, EquipmentEntity } from '../character/character-model.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { checkpointDataHash } from '../identity/login-handoff.ts';
import { toEquipmentView } from '../equipment/equipment-service.ts';
import { aggregateCombatAttributes, validateEquipEligibility } from '../equipment/equipment-rules.ts';
import { CommitUnknown, StoreUnavailable, canonical } from '../ports/store.ts';
import type { EquipmentCatalog, SetBonusConfig } from '../equipment/equipment-model.ts';
import type { ChallengeContent, DungeonEntryContext, EntryChallenge } from './challenge-model.ts';
class Refusal extends Error {
}
function requireValue(v: unknown, code: string): asserts v {
    if (!v) throw new Refusal(code);
}
function increment(value: number): number { requireValue(Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(value + 1), 'CONFIG_NOT_READY'); return value + 1; }
function budget(value: unknown, max: number): void { requireValue(new TextEncoder().encode(JSON.stringify(value)).length <= max, 'CONFIG_NOT_READY'); }
export class ChallengeService {
    private readonly options: {
        store: Store;
        clock: Clock;
        identity: IdentityPort;
        content?: ChallengeContent;
        catalog?: EquipmentCatalog;
        setConfigs?: Record<string, SetBonusConfig>;
        encounterRandom?: {
            nextRoom(): number;
        };
    };
    constructor(options: {
        store: Store;
        clock: Clock;
        identity: IdentityPort;
        content?: ChallengeContent;
        catalog?: EquipmentCatalog;
        setConfigs?: Record<string, SetBonusConfig>;
        encounterRandom?: {
            nextRoom(): number;
        };
    }) { this.options = { ...options, content: options.content ? structuredClone(options.content) : undefined, catalog: options.catalog ? structuredClone(options.catalog) : undefined, setConfigs: options.setConfigs ? structuredClone(options.setConfigs) : undefined }; }
    private async caller() { let i; try {
        i = await this.options.identity.verify();
    }
    catch {
        throw new Refusal('AUTH_REQUIRED');
    } requireValue(isVerifiedIdentity(i), 'AUTH_REQUIRED'); return { id: await identityKey(i), tuple: JSON.stringify([i.provider, i.appId, i.subject, i.environment]) }; }
    private async authorize(tx: Transaction, caller: {
        id: string;
        tuple: string;
    }, sessionId: string, epoch: number) {
        const link = await tx.get<IdentityLink>(caller.id);
        requireValue(link?.schemaVersion === 2 && link.id === caller.id && link.tuple === caller.tuple, 'AUTH_REQUIRED');
        const a = await tx.get<LoginAccount>(link.accountId), s = await tx.get<LoginSession>(sessionId);
        requireValue(a?.schemaVersion === 2 && a.id === link.accountId && s?.schemaVersion === 2 && s.id === sessionId && s.accountId === a.id && s.status === 'active' && s.epoch === epoch && a.currentSessionId === sessionId && a.sessionEpoch === epoch, 'SESSION_REVOKED');
        return a;
    }
    private async character(tx: Transaction, a: LoginAccount, id: string, epoch: number) {
        const c = await tx.get<CharacterEntity>(id);
        requireValue(c?.schemaVersion === 2 && c.id === id && c.characterId === id && c.accountId === a.id && Object.values(a.characterIdsByClass).includes(id) && a.selectedCharacterId === id, 'NOT_FOUND_OR_FORBIDDEN');
        requireValue(c.rolePlayEpoch === epoch, 'VERSION_CONFLICT');
        return c;
    }
    private dungeon(id: string) {
        const content = this.options.content;
        requireValue(content?.schemaVersion === 1 && typeof content.releaseRef === 'string' && /^[^\s]{1,64}$/.test(content.releaseRef) && ((content.profile === 'local-test' && content.purpose === 'contract-fixture-only') || (content.profile === 'release' && content.purpose === 'published')), 'CONFIG_NOT_READY');
        requireValue(Array.isArray(content.dungeons) && content.dungeons.length > 0 && content.dungeons.length <= 3, 'CONFIG_NOT_READY');
        const d = content.dungeons.find(d => d.dungeonId === id);
        requireValue(d, 'CONFIG_NOT_READY');
        const limits = { first: [1, 15, 1], second: [15, 30, 1], special: [30, 30, 3] } as const;
        const limit = limits[d.kind];
        requireValue(limit && d.minLevel === limit[0] && d.maxMonsterLevel === limit[1] && d.mapId && (d.kind !== 'first' || typeof d.purpleTemplateRef === 'string' && d.purpleTemplateRef.length > 0) && Number.isFinite(d.anchor?.x) && Number.isFinite(d.anchor?.y) && Number.isFinite(d.anchor?.radius) && d.anchor.radius > 0 && d.anchor.radius <= 24 && Array.isArray(d.difficulties) && d.difficulties.length > 0 && d.difficulties.length <= (d.kind === 'special' ? 2 : 4), 'CONFIG_NOT_READY');
        const names = ['normal', 'adventure', 'warrior', 'king'];
        requireValue(d.difficulties.every((v, i) => v.difficultyId === names[i] && v.roomCost === limit[2] && v.levels && Object.entries(v.levels).every(([level, row]) => Number.isSafeInteger(Number(level)) && Number(level) >= d.minLevel && Number(level) <= d.maxMonsterLevel && typeof row.monsterStatsRef === 'string' && row.monsterStatsRef.length > 0 && typeof row.equipmentSourceRef === 'string' && row.equipmentSourceRef.length > 0)), 'CONFIG_NOT_READY');
        return d;
    }
    private atEntry(c: CharacterEntity, d: ChallengeContent['dungeons'][number]) {
        const t = c.townState;
        requireValue(c.location.kind === 'town' && c.location.mapId === d.mapId && t?.mapRef === d.mapId && Number.isSafeInteger(t.locationRevision) && Math.hypot(t.position.x - d.anchor.x, t.position.y - d.anchor.y) <= d.anchor.radius, 'NOT_FOUND_OR_FORBIDDEN');
        return t;
    }
    private async reason(tx: Transaction, a: LoginAccount, c: CharacterEntity, d: ChallengeContent['dungeons'][number], diff: ChallengeContent['dungeons'][number]['difficulties'][number], now: number): Promise<string | null> {
        if (c.level < d.minLevel)
            return 'LEVEL_REQUIRED';
        if (diff.difficultyId !== d.difficulties[0]?.difficultyId && !a.dungeonUnlocks[d.dungeonId]?.includes(diff.difficultyId))
            return 'DIFFICULTY_LOCKED';
        if (a.activeChallengeId)
            return 'ACTIVE_CHALLENGE_EXISTS';
        if (a.openSceneChallengeId)
            return 'SCENE_STILL_OPEN';
        const value = c.stamina.refillWindow < Math.floor((now + 8 * 3600000) / (4 * 3600000)) ? 308 : c.stamina.value;
        if (value < 1)
            return 'STAMINA_NOT_ENOUGH';
        const id = c.equipped.weapon, w = id ? await tx.get<EquipmentEntity>(id) : undefined;
        if (!w || w.schemaVersion !== 2 || w.id !== id || w.accountId !== a.id || w.lifecycle !== 'active' || w.slotKind !== 'weapon' || w.location.kind !== 'equipped' || w.location.characterId !== c.id || w.location.slotId !== 'weapon' || w.itemLevel > c.level + 10)
            return 'WEAPON_REQUIRED';
        if (!this.options.catalog?.[w.templateRef.id]?.allowedClasses?.length) return 'CONFIG_NOT_READY';
        try {
            validateEquipEligibility(c, w, 'weapon', this.options.catalog);
        }
        catch {
            return 'WEAPON_REQUIRED';
        }
        if (!Number.isSafeInteger(w.itemLevel) || !Number.isSafeInteger(c.level) || c.level < 1 || c.level > 30) return 'WEAPON_REQUIRED';
        if (w.binding.kind === 'account' && w.binding.accountId !== a.id)
            return 'WEAPON_REQUIRED';
        if (w.durability.wearEnabled && (w.durability.current === null || !Number.isSafeInteger(w.durability.current) || w.durability.current <= 0))
            return 'WEAPON_BROKEN';
        if (!diff.levels[Math.min(c.level, d.maxMonsterLevel)])
            return 'CONFIG_NOT_READY';
        return null;
    }
    async query(raw: unknown) {
        const q = parseDungeonEntryQuery(raw);
        let now = this.options.clock.now();
        try {
            const caller = await this.caller();
            return await this.options.store.run(async (tx) => {
                now = this.options.clock.now();
                const a = await this.authorize(tx, caller, q.sessionId, q.sessionEpoch), c = await this.character(tx, a, q.payload.characterId, q.payload.rolePlayEpoch), d = this.dungeon(q.payload.dungeonId), t = this.atEntry(c, d);
                const body = { schemaVersion: 2 as const, accountId: a.id, sessionId: q.sessionId, sessionEpoch: q.sessionEpoch, characterId: c.id, rolePlayEpoch: c.rolePlayEpoch, dungeonId: d.dungeonId, mapId: d.mapId, sceneEpoch: t.sceneEpoch, locationRevision: t.locationRevision, releaseRef: this.options.content!.releaseRef };
                const id = await loginKey('dungeonEntry', [await checkpointDataHash(body)]);
                const context: DungeonEntryContext = { ...body, id };
                tx.set(id, context);
                const options = await Promise.all(d.difficulties.map(async (diff) => { const reason = await this.reason(tx, a, c, d, diff, now); return { difficultyId: diff.difficultyId, unlocked: diff.difficultyId === d.difficulties[0].difficultyId || !!a.dungeonUnlocks[d.dungeonId]?.includes(diff.difficultyId), canEnter: reason === null, reason }; }));
                return parseDungeonEntryResponse({ requestId: q.requestId, serverTime: now, data: { dungeonId: d.dungeonId, entryContext: id, locationRevision: t.locationRevision, options }, versions: [{ kind: 'account', id: a.id, version: a.version }, { kind: 'character', id: c.id, version: c.version }] });
            });
        }
        catch (e) {
            if (e instanceof StoreUnavailable || e instanceof CommitUnknown)
                return parseDungeonEntryResponse({ requestId: q.requestId, serverTime: now, error: { code: 'SERVICE_UNAVAILABLE' } });
            if (!(e instanceof Refusal))
                throw e;
            return parseDungeonEntryResponse({ requestId: q.requestId, serverTime: now, error: { code: e.message } });
        }
    }
    async execute(raw: unknown) {
        const command = parseChallengeRequest(raw);
        if (command.command !== 'challenge.start')
            throw new TypeError('UNSUPPORTED_COMMAND');
        let now = this.options.clock.now();
        let encounterRoom: number | undefined; // Retained across Store retry; never derived from a client operation ID.
        const reply = (outcome: unknown, replayed = false) => parseChallengeResponse({ protocolVersion: 2, command: command.command, operationId: command.operationId, serverTime: now, replayed, outcome });
        try {
            const caller = await this.caller();
            return await this.options.store.run(async (tx) => {
                now = this.options.clock.now();
                const a = await this.authorize(tx, caller, command.sessionId, command.sessionEpoch);
                const c = await this.character(tx, a, command.payload.characterId, command.payload.rolePlayEpoch);
                const opId = await loginKey('assetOp', [a.id, command.operationId]), journalId = await loginKey('assetJournal', [a.id, command.operationId]), tuple = canonical(command);
                const previous = await tx.get<{
                    schemaVersion: number;
                    id: string;
                    accountId: string;
                    command: string;
                    tuple: string;
                    result: unknown;
                }>(opId);
                if (previous) {
                    requireValue(previous.schemaVersion === 2 && previous.id === opId && previous.accountId === a.id && previous.command === command.command, 'SERVICE_UNAVAILABLE');
                    requireValue(previous.tuple === tuple, 'OPERATION_MISMATCH');
                    let original;
                    try { original = parseChallengeResponse(previous.result); } catch { throw new Refusal('SERVICE_UNAVAILABLE'); }
                    requireValue(original.command === command.command && original.operationId === command.operationId, 'SERVICE_UNAVAILABLE');
                    return parseChallengeResponse({ ...original, serverTime: now, replayed: true });
                }
                requireValue(await tx.get(journalId) === undefined, 'SERVICE_UNAVAILABLE');
                try {
                    const d = this.dungeon(command.payload.dungeonId), t = this.atEntry(c, d), context = await tx.get<DungeonEntryContext>(command.payload.entryContext);
                    requireValue(context?.schemaVersion === 2 && context.id === command.payload.entryContext && context.accountId === a.id && context.characterId === c.id && context.rolePlayEpoch === c.rolePlayEpoch && context.sessionId === command.sessionId && context.sessionEpoch === command.sessionEpoch && context.dungeonId === d.dungeonId && context.mapId === d.mapId && context.sceneEpoch === t.sceneEpoch && context.locationRevision === t.locationRevision && context.releaseRef === this.options.content!.releaseRef, 'VERSION_CONFLICT');
                    for (const e of [{ kind: 'account', id: a.id, version: a.version }, { kind: 'character', id: c.id, version: c.version }])
                        requireValue(command.expected.some(v => v.kind === e.kind && v.id === e.id && v.version === e.version), 'VERSION_CONFLICT');
                    const diff = d.difficulties.find(v => v.difficultyId === command.payload.difficultyId);
                    requireValue(diff, 'CONFIG_NOT_READY');
                    const reason = await this.reason(tx, a, c, d, diff, now);
                    requireValue(reason === null, reason ?? 'CONFIG_NOT_READY');
                    requireValue(!c.staminaReservation, 'ACTIVE_CHALLENGE_EXISTS');
                    const equipment: EquipmentEntity[] = [];
                    for (const [slot, id] of Object.entries(c.equipped)) {
                        const item = await tx.get<EquipmentEntity>(id);
                        requireValue(item?.schemaVersion === 2 && item.id === id && item.accountId === a.id && item.lifecycle === 'active' && item.location.kind === 'equipped' && item.location.characterId === c.id && item.location.slotId === slot && item.slotKind === slot, 'CONFIG_NOT_READY');
                        try { toEquipmentView(item); } catch { throw new Refusal('CONFIG_NOT_READY'); }
                        requireValue(Number.isSafeInteger(item.templateRef.version) && item.templateRef.version >= 1 && typeof item.sourceKey === 'string' && item.sourceKey.length <= 128 && Number.isSafeInteger(item.sourceOrdinal) && item.sourceOrdinal >= 0, 'CONFIG_NOT_READY');
                        budget(item,16384);
                        equipment.push(item);
                    }
                    const currentWindow = Math.floor((now + 8 * 3600000) / (4 * 3600000));
                    requireValue(c.stamina.refillWindow <= currentWindow, 'CONFIG_NOT_READY');
                    const stamina = { value: c.stamina.refillWindow < currentWindow ? 308 : c.stamina.value, refillWindow: currentWindow };
                    const id = await loginKey('challenge', [a.id, command.operationId]);
                    requireValue(await tx.get(id) === undefined, 'SERVICE_UNAVAILABLE');
                    const monsterLevel = Math.min(c.level, d.maxMonsterLevel), row = diff.levels[monsterLevel];
                    if (d.kind === 'first' && encounterRoom === undefined) {
                        if (this.options.encounterRandom)
                            encounterRoom = this.options.encounterRandom.nextRoom();
                        else {
                            const bytes = new Uint32Array(1);
                            do {
                                globalThis.crypto.getRandomValues(bytes);
                            } while (bytes[0] >= 4294967292);
                            encounterRoom = bytes[0] % 6;
                        }
                        requireValue(Number.isSafeInteger(encounterRoom) && encounterRoom >= 0 && encounterRoom <= 5, 'CONFIG_NOT_READY');
                    }
                    const h: EntryChallenge = { schemaVersion: 2, id, accountId: a.id, characterId: c.id, sessionId: command.sessionId, version: 0, result: 'active', sceneState: 'combat', sceneEpoch: 0, currentRoomNo: -1, roomPhase: 'preparing', staminaSnapshot: { entryValue: stamina.value, remaining: stamina.value, entryRefillWindow: currentWindow, entryAt: now, revision: 0 }, staminaSettlement: { state: 'unsettled' }, dungeonId: d.dungeonId, difficultyId: diff.difficultyId, rolePlayEpoch: c.rolePlayEpoch, releaseRef: this.options.content!.releaseRef, monsterLevel, monsterStatsRef: row.monsterStatsRef, equipmentSourceRef: row.equipmentSourceRef, playerLevel: c.level, equipmentSnapshot: equipment, equipmentAttributes: aggregateCombatAttributes(Object.fromEntries(equipment.map(i => [i.slotKind, i])), this.options.setConfigs), roomCost: diff.roomCost, purpleRoomNo: d.kind === 'first' ? encounterRoom! : null, purpleEncounter: d.kind === 'first' ? {roomNo:encounterRoom!,spawnId:'purple-extra',templateRef:d.purpleTemplateRef!}:null, lifeState:'alive',roomCount:7, acceptedSeq: 0, acceptedTick: 0, createdAt: now };
                    const nextC = { ...c, version: increment(c.version), stamina, staminaReservation: id, location: { kind: 'challenge' as const, challengeId: id }, updatedAt: now };
                    const nextA = { ...a, version: increment(a.version), writeRevision: increment(a.writeRevision), activeChallengeId: id, openSceneChallengeId: id, updatedAt: now };
                    const result = reply({ status: 'committed', data: { challengeId: id, configRef: h.releaseRef, playerLevel: c.level, staminaSnapshot: stamina.value, monsterLevel: h.monsterLevel, monsterStatsRef: h.monsterStatsRef, equipmentSourceRef: h.equipmentSourceRef, equipmentVersion: c.equipmentVersion, equipmentAttributes: h.equipmentAttributes, acceptedSeq: 0, acceptedTick: 0 }, resultVersions: [{ kind: 'account', id: a.id, version: nextA.version }, { kind: 'character', id: c.id, version: nextC.version }, { kind: 'challenge', id, version: 0 }] });
                    const receipt = { schemaVersion: 2, id: opId, accountId: a.id, command: command.command, tuple, result };
                    const journal = { schemaVersion: 2, id: journalId, accountId: a.id, operationId: command.operationId, command: command.command, occurredAt: now, tuple, changes: [{ kind: 'challengeReservation', characterId: c.id, challengeId: id, stamina: stamina.value }] };
                    budget(h,131072);budget(receipt,16384);budget(journal,131072);
                    tx.set(a.id, nextA);
                    tx.set(c.id, nextC);
                    tx.set(id, h);
                    tx.set(opId, receipt);
                    tx.set(journalId, journal);
                    return result;
                }
                catch (e) {
                    if (!(e instanceof Refusal) && !(e instanceof TypeError)) throw e;
                    const result = reply({ status: 'rejected', code: e instanceof Refusal ? e.message : 'CONFIG_NOT_READY' });
                    tx.set(opId, { schemaVersion: 2, id: opId, accountId: a.id, command: command.command, tuple, result });
                    return result;
                }
            });
        }
        catch (e) {
            if (e instanceof CommitUnknown)
                return reply({ status: 'unknown', code: 'RESULT_UNKNOWN' });
            if (e instanceof StoreUnavailable)
                return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
            if (e instanceof Refusal)
                return reply({ status: 'rejected', code: e.message });
            throw e;
        }
    }
}
