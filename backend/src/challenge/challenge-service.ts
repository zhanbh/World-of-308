import {advanceEarthSimulation} from '../../../shared/src/earth-simulation.ts';
import {advanceBadaoSimulation} from '../../../shared/src/badao-simulation.ts';
import {advanceBengshanSimulation} from '../../../shared/src/bengshan-simulation.ts';
import {advanceCrossSimulation} from '../../../shared/src/cross-simulation.ts';
import {advanceBasicSimulation} from '../../../shared/src/basic-simulation.ts';
import {initialCombatState} from '../../../shared/src/basic-combat-kernel.ts';
import {trainingCapability,currentBasicStats,currentSkillMastery,combatRandomTape,crossRandomTape} from './basic-training.ts';
import {advanceMovement} from '../../../shared/src/movement-kernel.ts';
import {parseSimulationSubmit,parseSimulationConfirmed,parseActionResultsQuery} from '../../../shared/src/protocol/simulation-v2.ts';
import type {SimulationSubmit} from '../../../shared/src/protocol/simulation-v2.ts';
import {parseActionResultsPage,parseSimulationResponse} from '../../../shared/src/protocol/scene-v2.ts';
import {advanceRole} from './role-transition.ts';
import {remainder,logicTick} from '../../../shared/src/exact-values.ts';
import {parseSceneRequest,parseSceneResponse,parseRecoveryPage,parseSceneState} from '../../../shared/src/protocol/scene-v2.ts';
import {initialCheckpoint,writeChunk,readCheckpoint,publicRecords,stateHash,encodedBytes,writeCrossChunks} from './room-checkpoint.ts';
import type {RoomCheckpointHeader} from './room-checkpoint.ts';
import { parseRoomRequest, parseRoomResponse, parseRoomManifest, parseSceneQuery, parseChallengeQueryResponse } from '../../../shared/src/protocol/scene-v2.ts';
import type {RoomManifest} from '../../../shared/src/protocol/scene-v2.ts';
import {parseAssetQuery,parseAssetQueryResponse} from '../../../shared/src/protocol/asset-v2.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
import {buildPrepareManifest,contractResources} from './prepare-manifest.ts';
import { parseDungeonEntryQuery, parseDungeonEntryResponse, parseChallengeRequest, parseChallengeResponse } from '../../../shared/src/protocol/scene-v2.ts';
import { identityKey, isVerifiedIdentity, loginKey } from '../identity/identity-v2.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import type { LoginAccount, LoginSession, IdentityLink } from '../identity/login-model.ts';
import type { CharacterEntity, EquipmentEntity } from '../character/character-model.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { handoff, checkpointDataHash } from '../identity/login-handoff.ts';
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
        if(content){try{trainingCapability(content);}catch{throw new Refusal('CONFIG_NOT_READY');}}
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
        const name=raw && typeof raw==='object' ? Object.getOwnPropertyDescriptor(raw,'query')?.value : undefined;
        if(name==='simulation.actionResults')return this.actionResults(raw);
        if(name==='simulation.confirmed')return this.confirmedMovement(raw);
        if(name==='scene.recoveryPage') return this.recoveryPage(raw);
        if(name==='challenge.get') return this.challengeState(raw);
        if(name==='operation.get') return this.queryOriginal(raw);
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
        if(raw&&typeof raw==='object'&&Object.getOwnPropertyDescriptor(raw,'command')?.value==='simulation.submit')return this.submitMovement(raw);
        if(raw&&typeof raw==='object'){const command=Object.getOwnPropertyDescriptor(raw,'command')?.value;if(['heartbeat','scene.suspend','scene.resumePrepare'].includes(command))return this.sceneControl(raw);if(command==='scene.status')return Object.getOwnPropertyDescriptor(raw,'payload')?.value?.readyTicketId!==null?this.queryOriginalReady(raw):this.sceneControl(raw);if(command==='scene.ready'){const q=parseSceneRequest(raw);if(q.command!=='scene.ready')throw new TypeError('UNSUPPORTED_COMMAND');const h=await this.options.store.run(tx=>tx.get<EntryChallenge>(q.payload.challengeId));return h?.connection==='recovery'||h?.controlReceipts?.some(r=>r.command==='scene.ready'&&r.sequence===q.controlSeq)||q.payload.sceneEpoch===0?this.sceneControl(raw):this.ready(raw);}}
        if(raw && typeof raw==='object' && Object.getOwnPropertyDescriptor(raw,'command')?.value==='challenge.activateRoom') return this.activate(raw);
        if(raw && typeof raw==='object' && Object.getOwnPropertyDescriptor(raw,'command')?.value==='challenge.prepareRoom') return this.prepare(raw);
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
                    const h: EntryChallenge = { schemaVersion: 2, id, accountId: a.id, characterId: c.id, sessionId: command.sessionId, version: 0, result: 'active', sceneState: 'combat', sceneEpoch: 0, currentRoomNo: -1, roomPhase: 'preparing', staminaSnapshot: { entryValue: stamina.value, remaining: stamina.value, entryRefillWindow: currentWindow, entryAt: now, revision: 0 }, staminaSettlement: { state: 'unsettled' }, dungeonId: d.dungeonId, difficultyId: diff.difficultyId, rolePlayEpoch: c.rolePlayEpoch, releaseRef: this.options.content!.releaseRef, monsterLevel, monsterStatsRef: row.monsterStatsRef, equipmentSourceRef: row.equipmentSourceRef, playerLevel: c.level, equipmentSnapshot: equipment, equipmentAttributes: aggregateCombatAttributes(Object.fromEntries(equipment.map(i => [i.slotKind, i])), this.options.setConfigs), roomCost: diff.roomCost, purpleRoomNo: d.kind === 'first' ? encounterRoom! : null, purpleEncounter: d.kind === 'first' ? {roomNo:encounterRoom!,spawnId:'purple-extra',templateRef:d.purpleTemplateRef!}:null, lifeState:'alive',connection:'connected',timelineEpoch:0,controlSeq:0,heartbeatSeq:0,lease:{mode:'connected',lastEvidenceAt:now,leaseUntil:now+10000,lastHeartbeatAt:now,lastHeartbeatSeq:0,revision:0},roomCount:7, acceptedSeq: 0, acceptedTick: 0, createdAt: now };
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
    private async hydrate(tx:Transaction,ref:string,attemptId:string,hash:string):Promise<RoomManifest> {
        const record=await tx.get<{schemaVersion:number;id:string;manifest:unknown}>(ref);
        requireValue(record?.schemaVersion===2 && record.id===ref,'SERVICE_UNAVAILABLE');
        let m:RoomManifest; try {m=parseRoomManifest(record.manifest);}catch{throw new Refusal('SERVICE_UNAVAILABLE');}
        const {manifestHash,...body}=m;
        requireValue(m.roomAttemptId===attemptId && manifestHash===hash && await manifestDigest(body)===hash,'SERVICE_UNAVAILABLE');
        return m;
    }
    private async challengeState(raw:unknown) {
        const q=parseSceneQuery(raw);if(q.query!=='challenge.get')throw new TypeError('UNSUPPORTED_QUERY');
        let now=this.options.clock.now();const reply=(value:unknown)=>parseChallengeQueryResponse({requestId:q.requestId,serverTime:now,...value as object});
        try {const caller=await this.caller();return await this.options.store.run(async tx=>{
            now=this.options.clock.now();const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch);let h=await tx.get<EntryChallenge>(q.payload.challengeId);
            requireValue(h?.schemaVersion===2&&h.id===q.payload.challengeId&&h.accountId===a.id,'NOT_FOUND_OR_FORBIDDEN');
            const current=await tx.get<CharacterEntity>(h.characterId);
            await this.character(tx,a,h.characterId,h.sceneState==='closed'?current?.rolePlayEpoch??h.rolePlayEpoch:h.rolePlayEpoch);
            if(await this.expire(tx,a,h,now))h=(await tx.get<EntryChallenge>(h.id))!;
            if(h.roomPhase==='active'&&h.connection==='connected'&&h.sceneEpoch>0){const {header}=await readCheckpoint(tx,h);if(await this.movementGap(tx,h,header,now))h=(await tx.get<EntryChallenge>(h.id))!;}
            const c=(await tx.get<CharacterEntity>(h.characterId))!;
            return reply({data:await this.controlState(tx,h),versions:[{kind:'character',id:c.id,version:c.version},{kind:'challenge',id:h.id,version:h.version}]});
        });}catch(e){if(e instanceof Refusal)return reply({error:{code:e.message}});if(e instanceof StoreUnavailable||e instanceof CommitUnknown||e instanceof TypeError)return reply({error:{code:'SERVICE_UNAVAILABLE'}});throw e;}
    }
    /** Asset receipt hydration resolves its original immutable reference, never H's latest pending. */
    async queryOriginal(raw:unknown) {
        const q=parseAssetQuery(raw);if(q.query!=='operation.get')throw new TypeError('UNSUPPORTED_QUERY');
        const now=this.options.clock.now(),reply=(v:unknown)=>parseAssetQueryResponse('operation.get',{requestId:q.requestId,serverTime:now,...v as object});
        try {const caller=await this.caller();return await this.options.store.run(async tx=>{
            const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch);
            const id=await loginKey('assetOp',[a.id,q.payload.operationId]);
            const receipt=await tx.get<{schemaVersion:number;id:string;accountId:string;command:string;result:unknown;manifestRef?:string;attemptId?:string;manifestHash?:string;characterId?:string;rolePlayEpoch?:number;sessionId?:string;sessionEpoch?:number}>(id);
            if(!receipt)return reply({versions:[],data:{status:'notFound'}});
            requireValue(receipt.schemaVersion===2&&receipt.id===id&&receipt.accountId===a.id,'SERVICE_UNAVAILABLE');
            if(receipt.command==='simulation.submit')requireValue(typeof receipt.sessionId==='string'&&receipt.sessionId.length>0&&Number.isSafeInteger(receipt.sessionEpoch)&&receipt.sessionEpoch!>0&&typeof receipt.characterId==='string'&&receipt.characterId.length>0&&Number.isSafeInteger(receipt.rolePlayEpoch)&&receipt.rolePlayEpoch!>0,'SERVICE_UNAVAILABLE');
            const original=await this.originalPrepare(tx,receipt);requireValue(original.command===receipt.command&&original.operationId===q.payload.operationId,'SERVICE_UNAVAILABLE');
            return reply({versions:[],data:{status:'found',command:receipt.command,result:original}});
        });}catch(e){if(e instanceof Refusal)return reply({error:{code:e.message}});if(e instanceof StoreUnavailable||e instanceof CommitUnknown||e instanceof TypeError)return reply({error:{code:'SERVICE_UNAVAILABLE'}});throw e;}
    }
    private async originalPrepare(tx:Transaction,receipt:{command:string;result:unknown;manifestRef?:string;attemptId?:string;manifestHash?:string}) {
        if(receipt.command==='challenge.prepareRoom'&&receipt.manifestRef){
            requireValue(receipt.attemptId&&receipt.manifestHash,'SERVICE_UNAVAILABLE');
            const result=receipt.result as {outcome:{status:string;data:unknown;resultVersions:unknown}};
            return parseRoomResponse({...result,outcome:{...result.outcome,data:await this.hydrate(tx,receipt.manifestRef,receipt.attemptId,receipt.manifestHash)}});
        }
        if(receipt.command==='simulation.submit')return parseSimulationResponse(receipt.result);
        return ['challenge.prepareRoom','challenge.activateRoom'].includes(receipt.command)?parseRoomResponse(receipt.result):parseChallengeResponse(receipt.result);
    }
    async resolveResource(releaseRef:string,ref:string):Promise<Uint8Array> {
        requireValue(this.options.content,'CONFIG_NOT_READY');
        const {resources}=await contractResources(this.options.content,releaseRef),bytes=resources.get(ref);
        requireValue(bytes,'CONFIG_NOT_READY');return bytes.slice();
    }
    private async prepare(raw:unknown) {
        const command=parseRoomRequest(raw);if(command.command!=='challenge.prepareRoom')throw new TypeError('UNSUPPORTED_COMMAND');
        let now=this.options.clock.now();
        const reply=(outcome:unknown,replayed=false)=>parseRoomResponse({protocolVersion:2,command:command.command,operationId:command.operationId,serverTime:now,replayed,outcome});
        try {const caller=await this.caller();return await this.options.store.run(async tx=>{
            now=this.options.clock.now();const a=await this.authorize(tx,caller,command.sessionId,command.sessionEpoch),c=await this.character(tx,a,command.payload.characterId,command.payload.rolePlayEpoch);
            const id=await loginKey('assetOp',[a.id,command.operationId]),journalId=await loginKey('assetJournal',[a.id,command.operationId]),tuple=await manifestDigest(command);
            const old=await tx.get<{schemaVersion:number;id:string;accountId:string;command:string;tuple:string;result:unknown;manifestRef?:string;attemptId?:string;manifestHash?:string}>(id);
            if(old){requireValue(old.schemaVersion===2&&old.id===id&&old.accountId===a.id&&old.command===command.command,'SERVICE_UNAVAILABLE');requireValue(old.tuple===tuple,'OPERATION_MISMATCH');const original=await this.originalPrepare(tx,old);requireValue(original.command===command.command&&original.operationId===command.operationId,'SERVICE_UNAVAILABLE');return parseRoomResponse({...original,serverTime:now,replayed:true});}
            requireValue(await tx.get(journalId)===undefined,'SERVICE_UNAVAILABLE');
            try {
                const h=await tx.get<EntryChallenge>(command.payload.challengeId);
                requireValue(h?.schemaVersion===2&&h.id===command.payload.challengeId&&h.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');
                requireValue(!await this.expire(tx,a,h,now),'DEADLINE_EXPIRED');
                requireValue(h.result==='active'&&h.sceneState!=='closed','CHALLENGE_TERMINAL');
                requireValue(h.sessionId===command.sessionId&&h.rolePlayEpoch===c.rolePlayEpoch&&a.activeChallengeId===h.id&&a.openSceneChallengeId===h.id&&c.location.kind==='challenge'&&c.location.challengeId===h.id&&c.staminaReservation===h.id,'VERSION_CONFLICT');
                requireValue(h.lifeState==='alive','ROOM_NOT_AVAILABLE');requireValue(h.connection==='connected','RECOVERY_REQUIRED');
                requireValue(command.payload.nextRoomNo===(h.currentRoomNo??-1)+1,'ROOM_NOT_AVAILABLE');
                if(h.currentRoomNo===-1)requireValue(h.sceneEpoch===0&&h.roomPhase==='preparing','ROOM_NOT_AVAILABLE');else await this.nextRoomAllowed(tx,h);
                if(h.pendingRoomAttempt){const p=h.pendingRoomAttempt;requireValue((command.payload.expectedRevision===p.preparedRevision-1||command.payload.expectedRevision===h.version)&&command.expected.some(v=>v.kind==='challenge'&&v.id===h.id&&v.version===command.payload.expectedRevision)&&command.expected.some(v=>v.kind==='character'&&v.id===c.id&&v.version===c.version),'VERSION_CONFLICT');requireValue(p.roomNo===command.payload.nextRoomNo&&p.configRef===h.releaseRef&&h.transitionClock?.attemptId===p.attemptId,'VERSION_CONFLICT');
                    const manifest=await this.hydrate(tx,p.manifestRef,p.attemptId,p.manifestHash);const result=reply({status:'committed',data:manifest,resultVersions:[{kind:'character',id:c.id,version:c.version},{kind:'challenge',id:h.id,version:p.preparedRevision}]});
                    tx.set(id,this.prepareReceipt(id,a.id,tuple,result,p.manifestRef,p.attemptId,p.manifestHash));return result;
                }
                requireValue(command.payload.expectedRevision===h.version&&command.expected.some(v=>v.kind==='challenge'&&v.id===h.id&&v.version===h.version)&&command.expected.some(v=>v.kind==='character'&&v.id===c.id&&v.version===c.version),'VERSION_CONFLICT');
                requireValue(this.options.content&&this.options.content.releaseRef===h.releaseRef,'CONFIG_NOT_READY');
                const attemptId=await loginKey('roomAttempt',[h.id,command.payload.nextRoomNo]);const manifestRef=await loginKey('roomManifest',[h.id,attemptId]);
                requireValue(await tx.get(manifestRef)===undefined&&!h.transitionClock,'SERVICE_UNAVAILABLE');
                const revision=increment(h.version),manifest=await buildPrepareManifest(this.options.content,h,command.payload.nextRoomNo,attemptId,revision);
                const next:EntryChallenge={...h,version:revision,roomPhase:'preparing',pendingRoomAttempt:{roomNo:command.payload.nextRoomNo,attemptId,manifestHash:manifest.manifestHash,configRef:h.releaseRef,preparedRevision:revision,manifestRef,...h.currentRoomNo>=0?{exitRuleHash:await manifestDigest(this.options.content.exitInteraction)}:{}},transitionClock:{attemptId,phase:'prepared',settledAt:now,connectedElapsedMs:0,consumedElapsedMs:0,timeRemainder:{numerator:0,denominator:1},transitionRevision:0}};
                const result=reply({status:'committed',data:manifest,resultVersions:[{kind:'character',id:c.id,version:c.version},{kind:'challenge',id:h.id,version:revision}]});
                const record={schemaVersion:2,id:manifestRef,manifest};budget(record,32768);budget(next,131072);
                const receipt=this.prepareReceipt(id,a.id,tuple,result,manifestRef,attemptId,manifest.manifestHash);
                tx.set(h.id,next);tx.set(manifestRef,record);tx.set(id,receipt);
                return result;
            }catch(e){if(!(e instanceof Refusal)&&!(e instanceof TypeError))throw e;const result=reply({status:'rejected',code:e instanceof Refusal?e.message:'CONFIG_NOT_READY'});tx.set(id,{schemaVersion:2,id,accountId:a.id,command:command.command,tuple,result});return result;}
        });}catch(e){if(e instanceof CommitUnknown)return reply({status:'unknown',code:'RESULT_UNKNOWN'});if(e instanceof StoreUnavailable)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});if(e instanceof Refusal)return reply({status:'rejected',code:e.message});throw e;}
    }
    private async nextRoomAllowed(tx:Transaction,h:EntryChallenge) {
        requireValue((h.roomPhase==='cleared'||h.roomPhase==='preparing'&&h.pendingRoomAttempt)&&h.currentRoomNo>=0&&h.currentRoomNo+1<h.roomCount,'ROOM_NOT_AVAILABLE');
        const {header,role,scene}=await readCheckpoint(tx,h);
        requireValue((header.state.roomPhase==='cleared'||h.pendingRoomAttempt&&header.state.roomPhase==='preparing')&&role.player.lifeState==='alive'&&BigInt(role.player.hp)>0n&&scene.enemies.every(e=>e.actor.lifeState==='dead'&&e.actor.hp==='0'),'ROOM_NOT_AVAILABLE');
        const room=await tx.get<{attemptId:string;manifestRef:string;manifestHash:string;sceneEpoch:number}>(await loginKey('room',[h.id,h.currentRoomNo]));requireValue(room&&room.sceneEpoch===h.sceneEpoch,'CONFIG_NOT_READY');const manifest=await this.hydrate(tx,room.manifestRef,room.attemptId,room.manifestHash);requireValue(manifest.roomNo===h.currentRoomNo&&manifest.mapRef===header.mapRef&&manifest.releaseRef===h.releaseRef&&scene.enemies.length===manifest.spawns.length&&manifest.spawns.every(s=>scene.enemies.some(e=>e.actor.actorId===s.spawnId&&e.templateRef===s.templateRef&&e.role===s.role)),'CONFIG_NOT_READY');
        const content=this.options.content,rule=content?.exitInteraction;
        if(h.pendingRoomAttempt)requireValue(h.pendingRoomAttempt.exitRuleHash===await manifestDigest(rule),'CONFIG_NOT_READY');
        requireValue(content&&rule?.profile==='local-test'&&rule.rulesRef===h.releaseRef&&Number.isSafeInteger(rule.radius)&&rule.radius>=0,'CONFIG_NOT_READY');
        const {release}=await contractResources(content,h.releaseRef),map=release.nodes.find(n=>n.kind==='map'&&`${n.id}@${n.version}`===header.mapRef);
        requireValue(map,'CONFIG_NOT_READY');const b=map.data.bounds as {left:number;right:number;bottom:number;top:number},exit=map.data.exit as {x:number;y:number},p=role.player;
        requireValue(p.x>=b.left&&p.x<=b.right&&p.y>=b.bottom&&p.y<=b.top,'ROOM_NOT_AVAILABLE');
        const dx=BigInt(p.x)-BigInt(exit.x),dy=BigInt(p.y)-BigInt(exit.y);requireValue(dx*dx+dy*dy<=BigInt(rule.radius)**2n,'ROOM_NOT_AVAILABLE');
        return {header,role,scene};
    }
    private prepareReceipt(id:string,accountId:string,tuple:string,result:ReturnType<typeof parseRoomResponse>,manifestRef:string,attemptId:string,manifestHash:string) {
        requireValue(result.outcome.status==='committed','SERVICE_UNAVAILABLE');
        const receipt={schemaVersion:2,id,accountId,command:'challenge.prepareRoom',tuple,manifestRef,attemptId,manifestHash,result:{...result,outcome:{...result.outcome,data:{roomAttemptId:attemptId,manifestRef,manifestHash}}}};
        budget(receipt,16384);return receipt;
    }

    private live(h:EntryChallenge,a:LoginAccount,c:CharacterEntity,sessionId:string,now:number) {
        requireValue(h.result==='active'&&h.sceneState!=='closed','CHALLENGE_TERMINAL');
        requireValue(h.sessionId===sessionId&&h.rolePlayEpoch===c.rolePlayEpoch&&a.activeChallengeId===h.id&&a.openSceneChallengeId===h.id&&c.staminaReservation===h.id&&c.location.kind==='challenge'&&c.location.challengeId===h.id,'VERSION_CONFLICT');
        requireValue(h.lifeState==='alive','ROOM_NOT_AVAILABLE');requireValue(h.connection==='connected','RECOVERY_REQUIRED');
        requireValue(h.lease&&now<h.lease.leaseUntil&&(h.recoveryUntil===undefined||now<h.recoveryUntil)&&(h.deathDeadline===undefined||now<h.deathDeadline),'DEADLINE_EXPIRED');
    }
    private async activate(raw:unknown) {
        const command=parseRoomRequest(raw);if(command.command!=='challenge.activateRoom')throw new TypeError('UNSUPPORTED_COMMAND');
        let now=this.options.clock.now();const reply=(outcome:unknown,replayed=false)=>parseRoomResponse({protocolVersion:2,command:command.command,operationId:command.operationId,serverTime:now,replayed,outcome});
        try{const caller=await this.caller();return await this.options.store.run(async tx=>{
            now=this.options.clock.now();const a=await this.authorize(tx,caller,command.sessionId,command.sessionEpoch),c=await this.character(tx,a,command.payload.characterId,command.payload.rolePlayEpoch);
            const id=await loginKey('assetOp',[a.id,command.operationId]),tuple=await manifestDigest(command),old=await tx.get<{schemaVersion:number;id:string;accountId:string;command:string;tuple:string;result:unknown}>(id);
            if(old){requireValue(old.schemaVersion===2&&old.id===id&&old.accountId===a.id&&old.command===command.command,'SERVICE_UNAVAILABLE');requireValue(old.tuple===tuple,'OPERATION_MISMATCH');const original=parseRoomResponse(old.result);return parseRoomResponse({...original,serverTime:now,replayed:true});}
            try{
                const h=await tx.get<EntryChallenge>(command.payload.challengeId);requireValue(h?.schemaVersion===2&&h.id===command.payload.challengeId&&h.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');requireValue(!await this.expire(tx,a,h,now),'DEADLINE_EXPIRED');this.live(h,a,c,command.sessionId,now);
                requireValue(command.expected.some(v=>v.kind==='character'&&v.id===c.id&&v.version===c.version),'VERSION_CONFLICT');
                if(!h.pendingRoomAttempt&&h.currentRoomNo>=0&&h.readyTicket){
                    const roomId=await loginKey('room',[h.id,h.currentRoomNo]),room=await tx.get<{attemptId:string;activationRevision:number;initialResult:unknown}>(roomId);
                    requireValue(room?.attemptId===command.payload.roomAttemptId&&h.readyTicket.manifestHash===command.payload.manifestHash,'ROOM_NOT_AVAILABLE');
                    requireValue((command.payload.expectedRevision===room.activationRevision-1||command.payload.expectedRevision===h.version)&&command.expected.some(v=>v.kind==='challenge'&&v.id===h.id&&v.version===command.payload.expectedRevision),'VERSION_CONFLICT');
                    const result=reply({status:'committed',data:room.initialResult,resultVersions:[{kind:'character',id:c.id,version:c.version},{kind:'challenge',id:h.id,version:room.activationRevision}]});const receipt={schemaVersion:2,id,accountId:a.id,command:command.command,tuple,result};budget(receipt,16384);tx.set(id,receipt);return result;
                }
                requireValue(h.currentRoomNo===-1?h.sceneEpoch===0&&h.roomPhase==='preparing':h.roomPhase==='preparing','ROOM_NOT_AVAILABLE');
                requireValue(command.payload.expectedRevision===h.version&&command.expected.some(v=>v.kind==='challenge'&&v.id===h.id&&v.version===h.version),'VERSION_CONFLICT');
                const p=h.pendingRoomAttempt,t=h.transitionClock;requireValue(p&&t&&t.attemptId===p.attemptId&&t.phase==='prepared'&&p.roomNo===h.currentRoomNo+1&&p.attemptId===command.payload.roomAttemptId&&p.manifestHash===command.payload.manifestHash&&p.configRef===h.releaseRef,'VERSION_CONFLICT');
                requireValue(this.options.content,'CONFIG_NOT_READY');const manifest=await this.hydrate(tx,p.manifestRef,p.attemptId,p.manifestHash),initial=await initialCheckpoint(this.options.content,h,manifest,c.equipmentVersion,c.statsVersion),previous=h.currentRoomNo>=0?await this.nextRoomAllowed(tx,h):null,role=previous?{...previous.role,player:{...previous.role.player,x:initial.role.player.x,y:initial.role.player.y}}:initial.role,scene=initial.scene;
                requireValue(now>=t.settledAt,'CONFIG_NOT_READY');const elapsed=t.connectedElapsedMs+(now-t.settledAt),logicalTimeMs=(previous?.header.logicalTimeMs??0)+elapsed-t.consumedElapsedMs,acceptedTick=Math.floor(logicalTimeMs/10),revision=increment(h.version),sceneEpoch=increment(h.sceneEpoch),timelineEpoch=increment(h.timelineEpoch??0);
                const next:EntryChallenge={...h,version:revision,sceneEpoch,timelineEpoch,currentRoomNo:p.roomNo,roomPhase:'awaitingReady',acceptedTick,staminaSnapshot:{...h.staminaSnapshot,remaining:Math.max(0,h.staminaSnapshot.remaining-h.roomCost),revision:increment(h.staminaSnapshot.revision)},transitionClock:{...t,phase:'awaitingReady',settledAt:now,connectedElapsedMs:elapsed,consumedElapsedMs:elapsed,timeRemainder:remainder(logicalTimeMs%10,10),transitionRevision:increment(t.transitionRevision)}};delete next.pendingRoomAttempt;
                if(previous){if(scene.earth&&previous.scene.earth)scene.earth.readyAtUs=structuredClone(previous.scene.earth.readyAtUs);if(scene.badao&&previous.scene.badao)scene.badao.readyAtUs=structuredClone(previous.scene.badao.readyAtUs);if(scene.bengshan&&previous.scene.bengshan)scene.bengshan.readyAtUs=structuredClone(previous.scene.bengshan.readyAtUs);if(scene.cross&&previous.scene.cross)scene.cross.readyAtUs=structuredClone(previous.scene.cross.readyAtUs);if(initial.role.movement)role.movement=structuredClone(initial.role.movement);if(initial.role.combat)role.combat=structuredClone(initial.role.combat);for(const [slot,itemId] of Object.entries(c.equipped)){const item=await tx.get<EquipmentEntity>(itemId!);requireValue(item?.schemaVersion===2&&item.accountId===a.id&&item.lifecycle==='active'&&item.location.kind==='equipped'&&item.location.characterId===c.id&&item.location.slotId===slot,'VERSION_CONFLICT');}role.equipmentVersion=c.equipmentVersion;}
                if(role.regenerationRef!==null)requireValue(role.regenerationHash===await manifestDigest(this.options.content!.regeneration),'CONFIG_NOT_READY');
                const advanced=advanceRole(role,previous?.header.logicalTimeMs??0,logicalTimeMs,this.options.content!);Object.assign(role,advanced);
                const cpRevision=previous?increment(previous.header.revision):0,hash=await stateHash(role,scene),ticket={readyTicketId:await loginKey('readyTicket',[h.id,sceneEpoch,timelineEpoch,cpRevision]),sceneEpoch,timelineEpoch,checkpointRevision:cpRevision,publicStateHash:hash,manifestHash:manifest.manifestHash,deadline:Math.min(h.lease!.leaseUntil,h.recoveryUntil??Number.MAX_SAFE_INTEGER,h.deathDeadline??Number.MAX_SAFE_INTEGER)};next.readyTicket=ticket;
                const state={challengeId:h.id,sceneEpoch,timelineEpoch,checkpointRevision:cpRevision,publicStateHash:hash,manifestHash:manifest.manifestHash,acceptedSeq:h.acceptedSeq,acceptedTick,roomPhase:'awaitingReady',connection:'connected',lifeState:'alive',result:'active',anchorWallAt:null,anchorTick:null,inputGapBaseAt:null,lastAcceptedInputAt:null,recoveryUntil:h.recoveryUntil??null,deathDeadline:h.deathDeadline??null,transitionClock:next.transitionClock};
                const data={state,readyTicket:ticket},result=reply({status:'committed',data,resultVersions:[{kind:'character',id:c.id,version:c.version},{kind:'challenge',id:h.id,version:revision}]});
                const chunks=await Promise.all([writeChunk(next,0,previous?increment(previous.header.activeChunks[0].chunkRevision):0,role),writeChunk(next,1,previous?increment(previous.header.activeChunks[1].chunkRevision):0,scene)]),header:RoomCheckpointHeader={schemaVersion:2,id:await loginKey('cpHeader',[h.id]),challengeId:h.id,accountId:a.id,characterId:c.id,revision:cpRevision,sceneEpoch,acceptingInputs:false,activeChunks:chunks.map(ch=>({ordinal:ch.ordinal,chunkRevision:ch.chunkRevision,hash:ch.hash,sceneEpoch})),sessionEpoch:command.sessionEpoch,rolePlayEpoch:c.rolePlayEpoch,rulesRef:h.releaseRef,mapRef:manifest.mapRef,contentRef:h.monsterStatsRef,roomNo:p.roomNo,state:parseSceneState(state),logicalTimeMs,timeRemainderMs:logicalTimeMs%10};
                const roomId=await loginKey('room',[h.id,p.roomNo]);requireValue(await tx.get(roomId)===undefined&&(previous!==null||await tx.get(header.id)===undefined),'SERVICE_UNAVAILABLE');
                const room={schemaVersion:2,id:roomId,challengeId:h.id,accountId:a.id,roomNo:p.roomNo,attemptId:p.attemptId,manifestRef:p.manifestRef,manifestHash:p.manifestHash,activationRevision:revision,sceneEpoch,initialResult:data};
                const receipt={schemaVersion:2,id,accountId:a.id,command:command.command,tuple,result};budget(header,16384);budget(next,131072);budget(room,16384);budget(receipt,16384);budget(result,32768);
                tx.set(a.id,{...a,writeRevision:increment(a.writeRevision)});tx.set(h.id,next);tx.set(roomId,room);tx.set(header.id,header);for(const ch of chunks)tx.set(ch.id,ch);tx.set(id,receipt);return result;
            }catch(e){if(!(e instanceof Refusal)&&!(e instanceof TypeError))throw e;const result=reply({status:'rejected',code:e instanceof Refusal?e.message:'CONFIG_NOT_READY'});tx.set(id,{schemaVersion:2,id,accountId:a.id,command:command.command,tuple,result});return result;}
        });}catch(e){if(e instanceof CommitUnknown)return reply({status:'unknown',code:'RESULT_UNKNOWN'});if(e instanceof StoreUnavailable)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});if(e instanceof Refusal)return reply({status:'rejected',code:e.message});throw e;}
    }
    private async recoveryPage(raw:unknown) {
        const q=parseSceneQuery(raw);if(q.query!=='scene.recoveryPage')throw new TypeError('UNSUPPORTED_QUERY');
        const caller=await this.caller();let gap=false;const page=await this.options.store.run(async tx=>{
            const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),c=await this.character(tx,a,q.payload.characterId,q.payload.rolePlayEpoch),h=await tx.get<EntryChallenge>(q.payload.challengeId),now=this.options.clock.now();
            requireValue(h?.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');if(await this.expire(tx,a,h,now))return null;requireValue(h.sessionId===q.sessionId&&h.rolePlayEpoch===c.rolePlayEpoch&&h.sceneState!=='closed'&&!this.expired(h,now),'DEADLINE_EXPIRED');
            const {header,role,scene}=await readCheckpoint(tx,h);
            if(h.roomPhase==='active'&&h.connection==='connected'&&await this.movementGap(tx,h,header,now)){gap=true;return null;}
            let t=(h.recoveryTicket??h.readyTicket) as EntryChallenge['readyTicket'];
            // Original ready receipts authorize only a bounded read of this same live timeline.
            // They do not renew the lease, consume loading time, or restart an anchor.
            if(!t){
                const receipt=h.lastReadyReceipt;requireValue(receipt&&receipt.readyTicketId===q.payload.readyTicketId&&Number.isSafeInteger(receipt.proofDeadline)&&now<receipt.proofDeadline&&h.roomPhase==='active'&&h.connection==='connected'&&h.lifeState==='alive'&&h.result==='active','VERSION_CONFLICT');
                const original=parseSceneResponse(receipt.result);requireValue(original.outcome.status==='committed'&&!('kind' in original.outcome.data.state),'VERSION_CONFLICT');
                const state=header.state,issued=original.outcome.data.state;requireValue(!('kind' in state)&&state.sceneEpoch===issued.sceneEpoch&&state.timelineEpoch===issued.timelineEpoch&&state.manifestHash===issued.manifestHash&&header.revision>=issued.checkpointRevision&&state.roomPhase==='active'&&state.connection==='connected'&&header.acceptingInputs,'VERSION_CONFLICT');
                t={readyTicketId:receipt.readyTicketId,sceneEpoch:state.sceneEpoch,timelineEpoch:state.timelineEpoch,checkpointRevision:header.revision,publicStateHash:state.publicStateHash,manifestHash:state.manifestHash,deadline:receipt.proofDeadline};
            }
            requireValue(t&&now<t.deadline&&Object.entries(t).filter(([k])=>k!=='deadline').every(([k,v])=>q.payload[k as keyof typeof q.payload]===v),'VERSION_CONFLICT');
            requireValue(header.revision===t.checkpointRevision&&header.state.publicStateHash===t.publicStateHash,'VERSION_CONFLICT');
            const records=publicRecords(role,scene),pages=publicPages(records,scene.earth?32:64),totalPages=pages.length;requireValue(q.payload.pageIndex<totalPages,'INVALID_ARGUMENT');
            return parseRecoveryPage({protocolVersion:2,requestId:q.requestId,serverTime:now,...t,pageIndex:q.payload.pageIndex,totalPages,records:pages[q.payload.pageIndex]});
        });requireValue(page,gap?'RECOVERY_REQUIRED':'DEADLINE_EXPIRED');return page;
    }
    async queryOriginalReady(raw:unknown) {
        const q=parseSceneRequest(raw);if(q.command!=='scene.status')throw new TypeError('UNSUPPORTED_COMMAND');
        let now=this.options.clock.now();const reply=(outcome:unknown,leaseRevision=q.leaseRevision)=>parseSceneResponse({protocolVersion:2,command:q.command,controlSeq:q.controlSeq,leaseRevision,serverTime:now,replayed:false,outcome});
        try{const caller=await this.caller();return await this.options.store.run(async tx=>{
            now=this.options.clock.now();const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),c=await this.character(tx,a,q.payload.characterId,q.payload.rolePlayEpoch),h=await tx.get<EntryChallenge>(q.payload.challengeId);requireValue(h?.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');
            const r=h.controlReceipts?.find(r=>r.command==='scene.ready'&&r.sequence===q.controlSeq);if(r){requireValue(r.readyTicketId===q.payload.readyTicketId,'VERSION_CONFLICT');return this.controlOriginal(tx,r);}
            const old=h.lastReadyReceipt;requireValue(old&&old.controlSeq===q.controlSeq&&old.readyTicketId===q.payload.readyTicketId,'VERSION_CONFLICT');return parseSceneResponse(old.result);
        });}catch(e){if(e instanceof Refusal)return reply({status:'rejected',code:e.message});if(e instanceof StoreUnavailable||e instanceof CommitUnknown)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});throw e;}
    }
    /** Bounded original control receipts are historical evidence, never current permission. */
    async queryOriginalControl(raw:unknown) { return this.sceneControl(raw,true); }
    private async controlOriginal(tx:Transaction,r:NonNullable<EntryChallenge['controlReceipts']>[number]) {
        const result=structuredClone(r.result) as {outcome:{status:string;data:{state:{pendingManifest:unknown}}}};
        if(r.manifestRef){const record=await tx.get<{manifest:RoomManifest}>(r.manifestRef);requireValue(record?.manifest,'SERVICE_UNAVAILABLE');result.outcome.data.state.pendingManifest=parseRoomManifest(record.manifest);}
        return parseSceneResponse(result);
    }
    private async controlState(tx:Transaction,h:EntryChallenge) {
        if(h.sceneEpoch>0){const {header}=await readCheckpoint(tx,h);return {...header.state,checkpointRevision:header.revision,roomPhase:h.roomPhase,connection:h.sceneState==='closed'?'closed':h.connection,lifeState:h.lifeState,result:h.result,transitionClock:h.transitionClock??null,...h.transitionClock?{anchorWallAt:null,anchorTick:null,inputGapBaseAt:null}:{}};}
        const p=h.pendingRoomAttempt;
        return {kind:'unpaidLoading',challengeId:h.id,sceneEpoch:0,timelineEpoch:h.timelineEpoch??0,checkpoint:null,currentRoomNo:-1,roomPhase:h.roomPhase,connection:h.sceneState==='closed'?'closed':h.connection,lifeState:h.lifeState,result:h.result,staminaRemaining:h.staminaSnapshot.remaining,pendingManifest:p?await this.hydrate(tx,p.manifestRef,p.attemptId,p.manifestHash):null,transitionClock:h.transitionClock??null};
    }
    private expired(h:EntryChallenge,now:number) {return h.sceneState!=='closed'&&(!h.lease||now>=(h.recoveryUntil??h.lease.leaseUntil)||h.deathDeadline!==undefined&&now>=h.deathDeadline);}
    private async expire(tx:Transaction,a:LoginAccount,h:EntryChallenge,now:number) {
        if(!this.expired(h,now))return false;
        const closed=await handoff(tx,a,now,'scene.expire',`${h.id}:${h.recoveryUntil??h.lease?.leaseUntil}`,'scene.expire');
        tx.set(a.id,{...closed.account,writeRevision:increment(a.writeRevision),version:increment(a.version)});
        return true;
    }
    private async sceneControl(raw:unknown,originalOnly=false) {
        const q=parseSceneRequest(raw);
        let now=this.options.clock.now();
        const seq=q.command==='heartbeat'?q.heartbeatSeq:q.controlSeq;
        const reply=(outcome:unknown,leaseRevision=q.leaseRevision,replayed=false)=>parseSceneResponse({protocolVersion:2,command:q.command,...q.command==='heartbeat'?{heartbeatSeq:seq}:{controlSeq:seq},leaseRevision,serverTime:now,replayed,outcome});
        try{const caller=await this.caller();return await this.options.store.run(async tx=>{
            now=this.options.clock.now();const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),c=await this.character(tx,a,q.payload.characterId,q.payload.rolePlayEpoch),h=await tx.get<EntryChallenge>(q.payload.challengeId);
            requireValue(h?.schemaVersion===2&&h.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');
            const tuple=await manifestDigest(q),receipt=h.controlReceipts?.find(r=>r.command===q.command&&r.sequence===seq);
            if(receipt){requireValue(receipt.tuple===tuple,'OPERATION_MISMATCH');const old=await this.controlOriginal(tx,receipt);return originalOnly?old:parseSceneResponse({...old,serverTime:now,replayed:true});}
            if(originalOnly)return reply({status:'rejected',code:'VERSION_CONFLICT'});
            requireValue(h.sessionId===q.sessionId&&h.rolePlayEpoch===c.rolePlayEpoch,'VERSION_CONFLICT');
            if(await this.expire(tx,a,h,now))return reply({status:'rejected',code:'DEADLINE_EXPIRED'});
            requireValue(h.sceneState!=='closed','SCENE_CLOSED');
            if(h.roomPhase==='active'&&h.connection==='connected'&&h.sceneEpoch>0){const {header}=await readCheckpoint(tx,h);if(await this.movementGap(tx,h,header,now))return reply({status:'rejected',code:'RECOVERY_REQUIRED'},h.lease!.revision+1);}
            if(q.command==='scene.status')return reply({status:'committed',data:{state:await this.controlState(tx,h),readyTicket:h.recoveryTicket??h.readyTicket??null}},h.lease!.revision);
            requireValue(h.result==='active'||h.result==='completed','CHALLENGE_TERMINAL');
            requireValue(a.openSceneChallengeId===h.id&&c.staminaReservation===h.id&&c.location.kind==='challenge'&&c.location.challengeId===h.id,'VERSION_CONFLICT');
            requireValue(q.leaseRevision===h.lease!.revision,'VERSION_CONFLICT');
            requireValue(q.command==='heartbeat'?seq===(h.heartbeatSeq??0)+1:seq===(h.controlSeq??0)+1,'VERSION_CONFLICT');
            requireValue(q.payload.sceneEpoch===h.sceneEpoch&&q.payload.timelineEpoch===(h.timelineEpoch??0),'VERSION_CONFLICT');
            const next=structuredClone(h);next.version=increment(h.version);
            if(q.command==='heartbeat'){
                requireValue(h.connection==='connected','RECOVERY_REQUIRED');next.version=h.version;next.heartbeatSeq=seq;
                next.lease={...h.lease!,lastEvidenceAt:now,lastHeartbeatAt:now,lastHeartbeatSeq:seq,leaseUntil:now+10000,revision:increment(h.lease!.revision)};
            }else if(q.command==='scene.suspend'){
                requireValue(h.connection==='connected','RECOVERY_REQUIRED');next.controlSeq=seq;next.connection='recovery';next.recoveryUntil=now+10000;
                next.lease={...h.lease!,mode:'recovery',recoveryUntil:next.recoveryUntil,revision:increment(h.lease!.revision)};delete next.readyTicket;delete next.recoveryTicket;
                if(next.transitionClock){requireValue(now>=next.transitionClock.settledAt,'CONFIG_NOT_READY');next.transitionClock={...next.transitionClock,connectedElapsedMs:next.transitionClock.connectedElapsedMs+(now-next.transitionClock.settledAt),settledAt:now,transitionRevision:increment(next.transitionClock.transitionRevision)};}
                if(h.sceneEpoch>0){const {header}=await readCheckpoint(tx,h);const revision=increment(header.revision);tx.set(header.id,{...header,revision,acceptingInputs:false,state:{...header.state,roomPhase:h.roomPhase,checkpointRevision:revision,connection:'recovery',recoveryUntil:next.recoveryUntil,anchorWallAt:null,anchorTick:null,inputGapBaseAt:null,transitionClock:next.transitionClock??null}});}
            }else if(q.command==='scene.resumePrepare'){
                // A silent loss keeps the original lease cutoff, never now+10 seconds.
                requireValue(h.connection==='recovery'||h.connection==='connected','RECOVERY_REQUIRED');
                next.controlSeq=seq;next.connection='recovery';next.recoveryUntil=h.recoveryUntil??h.lease!.leaseUntil;next.timelineEpoch=increment(h.timelineEpoch??0);
                next.lease={...h.lease!,mode:'recovery',recoveryUntil:next.recoveryUntil,revision:increment(h.lease!.revision)};
                if(next.transitionClock){const t=next.transitionClock;next.transitionClock={...t,connectedElapsedMs:t.connectedElapsedMs+(h.connection==='connected'?Math.max(0,Math.min(now,h.lease!.leaseUntil)-t.settledAt):0),settledAt:now,transitionRevision:increment(t.transitionRevision)};}
                const deadline=Math.min(next.recoveryUntil,next.deathDeadline??Number.MAX_SAFE_INTEGER),readyTicketId=await loginKey('readyTicket',[h.id,h.sceneEpoch,next.timelineEpoch,seq]);
                if(h.sceneEpoch===0){requireValue(q.payload.checkpointRevision===null&&next.pendingRoomAttempt,'VERSION_CONFLICT');next.recoveryTicket={kind:'unpaidLoading',readyTicketId,sceneEpoch:0,timelineEpoch:next.timelineEpoch,roomAttemptId:next.pendingRoomAttempt.attemptId,manifestHash:next.pendingRoomAttempt.manifestHash,deadline};}
                else{const {header}=await readCheckpoint(tx,h);requireValue(q.payload.checkpointRevision===header.revision,'VERSION_CONFLICT');const revision=increment(header.revision),state={...header.state,roomPhase:h.roomPhase,timelineEpoch:next.timelineEpoch,checkpointRevision:revision,connection:'recovery' as const,recoveryUntil:next.recoveryUntil,anchorWallAt:null,anchorTick:null,inputGapBaseAt:null,transitionClock:next.transitionClock??null};
                    next.recoveryTicket={readyTicketId,sceneEpoch:h.sceneEpoch,timelineEpoch:next.timelineEpoch,checkpointRevision:revision,publicStateHash:state.publicStateHash,manifestHash:state.manifestHash,deadline};tx.set(header.id,{...header,revision,acceptingInputs:false,state});}
                delete next.readyTicket;
            }else if(q.command==='scene.ready'){
                requireValue(h.connection==='recovery'&&h.recoveryTicket,'VERSION_CONFLICT');const ticket=h.recoveryTicket as Record<string,unknown>;
                requireValue(now<(ticket.deadline as number)&&Object.entries(ticket).filter(([k])=>k!=='deadline').every(([k,v])=>q.payload[k as keyof typeof q.payload]===v),'VERSION_CONFLICT');
                next.controlSeq=seq;next.connection='connected';delete next.recoveryUntil;delete next.recoveryTicket;
                next.lease={...h.lease!,mode:'connected',lastEvidenceAt:now,leaseUntil:now+10000,revision:increment(h.lease!.revision)};delete next.lease.recoveryUntil;
                if(next.transitionClock)next.transitionClock={...next.transitionClock,settledAt:now,transitionRevision:increment(next.transitionClock.transitionRevision)};
                if(h.sceneEpoch>0){const {header}=await readCheckpoint(tx,h);const revision=increment(header.revision),state={...header.state,roomPhase:h.roomPhase,checkpointRevision:revision,connection:'connected' as const,recoveryUntil:null,transitionClock:next.transitionClock??null,...h.roomPhase==='active'?{anchorWallAt:now,anchorTick:header.state.acceptedTick,inputGapBaseAt:now}:{}};
                    tx.set(header.id,{...header,revision,acceptingInputs:h.roomPhase==='active',state});
                    if(h.roomPhase==='awaitingReady')next.readyTicket={readyTicketId:await loginKey('readyTicket',[h.id,h.sceneEpoch,h.timelineEpoch!,revision]),sceneEpoch:h.sceneEpoch,timelineEpoch:h.timelineEpoch!,checkpointRevision:revision,publicStateHash:state.publicStateHash,manifestHash:state.manifestHash,deadline:Math.min(next.lease.leaseUntil,h.deathDeadline??Number.MAX_SAFE_INTEGER)};
                }
            }
            const result=reply({status:'committed',data:{state:await this.controlState(tx,next),readyTicket:next.recoveryTicket??next.readyTicket??null}},next.lease!.revision);
            const stored=structuredClone(result);let manifestRef:string|undefined;if(stored.outcome.status==='committed'&&'kind' in stored.outcome.data.state&&stored.outcome.data.state.pendingManifest){manifestRef=next.pendingRoomAttempt!.manifestRef;(stored.outcome.data.state as {pendingManifest:unknown}).pendingManifest=null;}
            if(q.command==='scene.ready'&&next.roomPhase==='active')next.lastReadyReceipt={tuple,controlSeq:seq,readyTicketId:q.payload.readyTicketId,proofDeadline:Math.min(next.lease!.leaseUntil,next.deathDeadline??Number.MAX_SAFE_INTEGER),result};
            next.controlReceipts=[...(h.controlReceipts??[]),{tuple,command:q.command,sequence:seq,result:stored,manifestRef,...q.command==='scene.ready'?{readyTicketId:q.payload.readyTicketId}:{}}].slice(-8);budget(next,131072);budget(result,32768);
            tx.set(a.id,{...a,writeRevision:increment(a.writeRevision)});tx.set(h.id,next);return result;
        });}catch(e){if(e instanceof CommitUnknown)return reply({status:'unknown',code:'RESULT_UNKNOWN'});if(e instanceof StoreUnavailable)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});if(e instanceof Refusal)return reply({status:'rejected',code:e.message});if(e instanceof TypeError)return reply({status:'rejected',code:'CONFIG_NOT_READY'});throw e;}
    }

    private async ready(raw:unknown) {
        const q=parseSceneRequest(raw);if(q.command!=='scene.ready')throw new TypeError('UNSUPPORTED_COMMAND');
        let now=this.options.clock.now();const reply=(outcome:unknown,leaseRevision=q.leaseRevision,replayed=false)=>parseSceneResponse({protocolVersion:2,command:q.command,controlSeq:q.controlSeq,leaseRevision,serverTime:now,replayed,outcome});
        try{const caller=await this.caller();return await this.options.store.run(async tx=>{
            now=this.options.clock.now();const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),c=await this.character(tx,a,q.payload.characterId,q.payload.rolePlayEpoch),h=await tx.get<EntryChallenge>(q.payload.challengeId);requireValue(h?.schemaVersion===2&&h.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');
            const tuple=await manifestDigest(q),r=h.lastReadyReceipt;if(r&&r.controlSeq===q.controlSeq){requireValue(r.tuple===tuple,'OPERATION_MISMATCH');const original=parseSceneResponse(r.result);return parseSceneResponse({...original,replayed:true,serverTime:now});}
            if(await this.expire(tx,a,h,now))return reply({status:'rejected',code:'DEADLINE_EXPIRED'});
            this.live(h,a,c,q.sessionId,now);requireValue(q.controlSeq===(h.controlSeq??0)+1&&q.leaseRevision===h.lease!.revision,'VERSION_CONFLICT');
            const ticket=h.readyTicket;requireValue(ticket&&now<ticket.deadline,'DEADLINE_EXPIRED');requireValue(Object.entries(ticket).filter(([k])=>k!=='deadline').every(([k,v])=>q.payload[k as keyof typeof q.payload]===v),'VERSION_CONFLICT');
            requireValue(h.roomPhase==='awaitingReady'&&h.transitionClock?.phase==='awaitingReady','ROOM_NOT_AVAILABLE');
            const {header,role,scene}=await readCheckpoint(tx,h);requireValue(header.revision===ticket.checkpointRevision&&header.state.publicStateHash===ticket.publicStateHash,'VERSION_CONFLICT');
            const clock=h.transitionClock;requireValue(now>=clock.settledAt&&Number.isSafeInteger(clock.consumedElapsedMs)&&clock.consumedElapsedMs>=0&&clock.connectedElapsedMs>=clock.consumedElapsedMs,'CONFIG_NOT_READY');const elapsed=clock.connectedElapsedMs+(now-clock.settledAt),delta=elapsed-clock.consumedElapsedMs,logicalTimeMs=header.logicalTimeMs+delta;requireValue(Number.isSafeInteger(elapsed)&&Number.isSafeInteger(logicalTimeMs),'CONFIG_NOT_READY');const revision=increment(header.revision),tick=Math.floor(logicalTimeMs/10);
            if(role.regenerationRef!==null)requireValue(role.regenerationHash===await manifestDigest(this.options.content!.regeneration),'CONFIG_NOT_READY');
            const advanced=advanceRole(role,header.logicalTimeMs,logicalTimeMs,this.options.content!);Object.assign(role,advanced);
            const state={...header.state,checkpointRevision:revision,publicStateHash:await stateHash(role,scene),acceptedTick:tick,roomPhase:'active' as const,anchorWallAt:now,anchorTick:tick,inputGapBaseAt:now,transitionClock:null};
            const lease={...h.lease!,lastEvidenceAt:now,leaseUntil:now+10000,revision:increment(h.lease!.revision)},result=reply({status:'committed',data:{state,readyTicket:null}},lease.revision);
            const next:EntryChallenge={...h,version:increment(h.version),roomPhase:'active',acceptedTick:tick,controlSeq:q.controlSeq,lease,lastReadyReceipt:{tuple,controlSeq:q.controlSeq,readyTicketId:ticket.readyTicketId,proofDeadline:Math.min(lease.leaseUntil,h.deathDeadline??Number.MAX_SAFE_INTEGER),result},controlReceipts:[...(h.controlReceipts??[]),{tuple,command:q.command,sequence:q.controlSeq,readyTicketId:ticket.readyTicketId,result}].slice(-8)};delete next.transitionClock;delete next.readyTicket;
            const activeChunks=[...header.activeChunks];if(await checkpointDataHash(role)!==activeChunks[0].hash){const chunk=await writeChunk(h,0,increment(activeChunks[0].chunkRevision),role);tx.set(chunk.id,chunk);activeChunks[0]={...activeChunks[0],chunkRevision:chunk.chunkRevision,hash:chunk.hash};}
            const nextHeader={...header,activeChunks,revision,acceptingInputs:true,state,logicalTimeMs,timeRemainderMs:logicalTimeMs%10};budget(next,131072);budget(nextHeader,16384);budget(result,32768);
            tx.set(a.id,{...a,writeRevision:increment(a.writeRevision)});tx.set(h.id,next);tx.set(header.id,nextHeader);return result;
        });}catch(e){if(e instanceof CommitUnknown)return reply({status:'unknown',code:'RESULT_UNKNOWN'});if(e instanceof StoreUnavailable)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});if(e instanceof Refusal)return reply({status:'rejected',code:e.message});if(e instanceof TypeError)return reply({status:'rejected',code:'CONFIG_NOT_READY'});throw e;}
    }
    private async movementGap(tx:Transaction,h:EntryChallenge,header:RoomCheckpointHeader,now:number){
        const base=header.state.inputGapBaseAt;
        requireValue(base!==null&&now>=base,'CONFIG_NOT_READY');
        if(now-base<2000)return false;
        const recoveryUntil=h.recoveryUntil??h.lease!.leaseUntil,revision=increment(header.revision);
        tx.set(h.id,{...h,version:increment(h.version),connection:'recovery',recoveryUntil,lease:{...h.lease!,mode:'recovery',recoveryUntil,revision:increment(h.lease!.revision)}});
        tx.set(header.id,{...header,revision,acceptingInputs:false,state:{...header.state,checkpointRevision:revision,connection:'recovery',recoveryUntil,anchorWallAt:null,anchorTick:null,inputGapBaseAt:null}});
        return true;
    }
    private async actionResults(raw:unknown){
        const q=parseActionResultsQuery(raw),caller=await this.caller();
        return this.options.store.run(async tx=>{
            const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),id=await loginKey('assetOp',[a.id,q.payload.operationId]),receipt=await tx.get<{schemaVersion:number;id:string;accountId:string;command:string;result:unknown}>(id);
            requireValue(receipt?.schemaVersion===2&&receipt.id===id&&receipt.accountId===a.id&&receipt.command==='simulation.submit','NOT_FOUND_OR_FORBIDDEN');
            const original=parseSimulationResponse(receipt.result);requireValue(original.operationId===q.payload.operationId&&original.outcome.status==='committed','SERVICE_UNAVAILABLE');
            const pageId=await loginKey('combatResults',[a.id,q.payload.operationId,q.payload.pageIndex]),stored=await tx.get<{schemaVersion:number;accountId:string;operationId:string;actionResultsRef:string;pageIndex:number;totalPages:number;events:unknown[]}>(pageId);
            requireValue(stored?.schemaVersion===1&&stored.accountId===a.id&&stored.operationId===q.payload.operationId&&stored.actionResultsRef===id&&stored.pageIndex===q.payload.pageIndex,'NOT_FOUND_OR_FORBIDDEN');
            return parseActionResultsPage({protocolVersion:2,query:q.query,requestId:q.requestId,operationId:stored.operationId,actionResultsRef:stored.actionResultsRef,pageIndex:stored.pageIndex,totalPages:stored.totalPages,events:stored.events});
        });
    }
    private async confirmedMovement(raw:unknown){
        const q=parseSimulationConfirmed(raw),caller=await this.caller();
        const page=await this.options.store.run(async tx=>{
            const now=this.options.clock.now(),a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),c=await this.character(tx,a,q.payload.characterId,q.payload.rolePlayEpoch),h=await tx.get<EntryChallenge>(q.payload.challengeId);
            requireValue(h?.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');
            if(await this.expire(tx,a,h,now))return null;
            this.live(h,a,c,q.sessionId,now);const {header,role,scene}=await readCheckpoint(tx,h);
            requireValue(h.roomPhase==='active'&&header.acceptingInputs,'ROOM_NOT_AVAILABLE');
            if(await this.movementGap(tx,h,header,now))return null;
            requireValue(q.payload.sceneEpoch===h.sceneEpoch&&q.payload.timelineEpoch===h.timelineEpoch&&q.payload.checkpointRevision===header.revision,'VERSION_CONFLICT');
            const records=publicRecords(role,scene),pages=publicPages(records,scene.earth?32:64),totalPages=pages.length;requireValue(q.payload.pageIndex<totalPages,'INVALID_ARGUMENT');
            return parseRecoveryPage({protocolVersion:2,requestId:q.requestId,serverTime:now,readyTicketId:`confirmed:${h.id}`,sceneEpoch:h.sceneEpoch,timelineEpoch:h.timelineEpoch,checkpointRevision:header.revision,publicStateHash:header.state.publicStateHash,manifestHash:header.state.manifestHash,deadline:Math.min(h.lease!.leaseUntil,h.deathDeadline??Number.MAX_SAFE_INTEGER),pageIndex:q.payload.pageIndex,totalPages,records:pages[q.payload.pageIndex]});
        });requireValue(page,'RECOVERY_REQUIRED');return page;
    }
    private async submitMovement(raw:unknown){
        const q=parseSimulationSubmit(raw);let now=this.options.clock.now();
        const reply=(outcome:unknown,replayed=false)=>parseSimulationResponse({protocolVersion:2,command:q.command,operationId:q.operationId,serverTime:now,replayed,outcome});
        try{
            const caller=await this.caller(),tuple=await manifestDigest(q);
            const original=(old:{schemaVersion:number;id:string;accountId:string;command:string;tuple:string;result:unknown},id:string,accountId:string)=>{requireValue(old.schemaVersion===2&&old.id===id&&old.accountId===accountId,'SERVICE_UNAVAILABLE');requireValue(old.command===q.command&&old.tuple===tuple,'OPERATION_MISMATCH');const result=parseSimulationResponse(old.result);requireValue(result.operationId===q.operationId&&result.command===q.command,'SERVICE_UNAVAILABLE');return result;};
            const baseline=await this.options.store.run(async tx=>{
                now=this.options.clock.now();const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),c=await this.character(tx,a,q.payload.characterId,q.payload.rolePlayEpoch),id=await loginKey('assetOp',[a.id,q.operationId]),old=await tx.get<{schemaVersion:number;id:string;tuple:string;command:string;accountId:string;result:unknown}>(id);
                if(old)return {original:original(old,id,a.id)};
                requireValue(await tx.get(await loginKey('assetJournal',[a.id,q.operationId]))===undefined,'SERVICE_UNAVAILABLE');
                const h=await tx.get<EntryChallenge>(q.payload.challengeId);requireValue(h?.accountId===a.id&&h.characterId===c.id,'NOT_FOUND_OR_FORBIDDEN');
                if(await this.expire(tx,a,h,now))return {rejected:'DEADLINE_EXPIRED'};
                this.live(h,a,c,q.sessionId,now);const cp=await readCheckpoint(tx,h);requireValue(h.roomPhase==='active'&&cp.header.acceptingInputs,'ROOM_NOT_AVAILABLE');
                if(await this.movementGap(tx,h,cp.header,now))return {rejected:'RECOVERY_REQUIRED'};
                this.validateMovement(q,a,c,h,cp.header,now);
                const equipment:EquipmentEntity[]=[];for(const [slot,itemId] of Object.entries(c.equipped)){const item=await tx.get<EquipmentEntity>(itemId!);requireValue(item?.schemaVersion===2&&item.id===itemId&&item.accountId===a.id&&item.lifecycle==='active'&&item.location.kind==='equipped'&&item.location.characterId===c.id&&item.location.slotId===slot,'CONFIG_NOT_READY');equipment.push(item);}
                return {a,c,h,cp,id,equipment};
            });
            if('original' in baseline)return reply(baseline.original!.outcome,true);
            if('rejected' in baseline)return reply({status:'rejected',code:baseline.rejected});
            const {a,c,h,cp,id,equipment}=baseline,config=this.options.content!.movement!,combat=trainingCapability(this.options.content!);
            requireValue(await manifestDigest({payload:Object.fromEntries(Object.entries(q.payload).filter(([k])=>k!=='digest')),config,...combat?{combat}:{} })===q.payload.digest,'DIGEST_MISMATCH');
            const configHash=await manifestDigest(config),old=cp.role.movement;
            requireValue(!old||old.configHash===configHash,'CONFIG_NOT_READY');
            const initial=old?.state??{x:String(cp.role.player.x),y:String(cp.role.player.y),remainderX:'0',remainderY:'0',facing:cp.role.player.facing,intentX:0,intentY:0};
            const computed=advanceMovement(initial,combat?q.payload.inputs.filter(i=>i.kind==='move'):q.payload.inputs,q.payload.fromTick,q.payload.toTick,config),logicalTimeMs=cp.header.logicalTimeMs+(q.payload.toTick-q.payload.fromTick)*10;
            let resourceRole=structuredClone(cp.role),resourceAt=cp.header.logicalTimeMs;const scene=structuredClone(cp.scene);let combatEvents:import('../../../shared/src/basic-combat-kernel.ts').CombatEvent[]|null=null;let combatState=cp.role.combat?.state;
            if(combat){requireValue(scene.schemaVersion>=2&&scene.combat,'CONFIG_NOT_READY');const combatHash=await manifestDigest(combat);requireValue(!cp.role.combat||cp.role.combat.configHash===combatHash,'CONFIG_NOT_READY');
                const state=combatState??initialCombatState(),extraSamples=(combat.earth?512+(q.payload.inputs.filter(i=>i.kind==='skill'&&i.skillId==='earth').length+(scene.earth?.cast?1:0))*64*(4+combat.earth.bleed.jumps)+(scene.earth?.effects.reduce((n,e)=>n+(e.kind==='bleed'?combat.earth!.bleed.jumps-e.nextJump:8*4*(2+combat.earth!.bleed.jumps)),0)??0):0)+(combat.badao?256+(q.payload.inputs.filter(i=>i.kind==='skill'&&i.skillId==='badao').length+(scene.badao?.cast?1:0))*16*(1+combat.badao.bleed.jumps)+(scene.badao?.effects.reduce((n,e)=>n+combat.badao!.bleed.jumps-e.nextJump,0)??0):0)+(combat.bengshan?256+(q.payload.inputs.filter(i=>i.kind==='skill'&&i.skillId==='bengshan').length+(scene.bengshan?.cast?1:0))*16*(3+combat.bengshan.bleed.jumps)+(scene.bengshan?.effects.reduce((n,e)=>n+combat.bengshan!.bleed.jumps-e.nextJump,0)??0):0),sampleBudget=extraSamples+(combat.cross?256+(q.payload.inputs.filter(i=>i.kind==='skill'&&i.skillId==='cross').length+(scene.cross?.cast?1:0))*16*(2+combat.cross.bleed.jumps)+(scene.cross?.effects.reduce((n,e)=>n+(e.kind==='bleed'?combat.cross!.bleed.jumps-e.nextJump:8*(2+combat.cross!.bleed.jumps)),0)??0):256),tape=await (combat.cross?crossRandomTape(scene.combat.seed,state.randomCursor,sampleBudget):combatRandomTape(scene.combat.seed,state.randomCursor,256)),stats=currentBasicStats(c,equipment,combat,{x:Number(initial.x),y:Number(initial.y),facing:initial.facing},this.options.setConfigs);
                const targets=scene.combat.targets.map(t=>({...t,controlImmune:scene.enemies.find(e=>e.actor.actorId===t.actorId)!.immuneToControl}));
                const result=combat.earth?advanceEarthSimulation(initial,state,scene.cross!,scene.bengshan!,scene.badao!,scene.earth!,targets,q.payload.inputs,q.payload.fromTick,q.payload.toTick,config,combat.config,combat.cross!,combat.bengshan!,combat.badao!,combat.earth!,{challengeId:h.id,sceneEpoch:h.sceneEpoch,actorId:c.id,immuneToBleed:scene.enemies.filter(e=>e.immuneToBleed).map(e=>e.actor.actorIndex)},{...stats,level:c.level,mp:cp.role.player.mp,controlled:cp.role.player.lifeState!=='alive'||cp.role.player.actionId==='knockdown',mastery:currentSkillMastery(equipment,combat,this.options.setConfigs)},cursor=>{requireValue(cursor-state.randomCursor<tape.length,'CONFIG_NOT_READY');return tape[cursor-state.randomCursor];},(tick,mp)=>{resourceRole.player.mp=mp;const elapsed=(tick-q.payload.fromTick)*10,next=advanceRole(resourceRole,resourceAt,cp.header.logicalTimeMs+elapsed,this.options.content!);resourceRole=next;resourceAt=cp.header.logicalTimeMs+elapsed;return next.player.mp;}):combat.badao?advanceBadaoSimulation(initial,state,scene.cross!,scene.bengshan!,scene.badao!,targets,q.payload.inputs,q.payload.fromTick,q.payload.toTick,config,combat.config,combat.cross!,combat.bengshan!,combat.badao!,{challengeId:h.id,sceneEpoch:h.sceneEpoch,actorId:c.id,immuneToBleed:scene.enemies.filter(e=>e.immuneToBleed).map(e=>e.actor.actorIndex)},{...stats,level:c.level,mp:cp.role.player.mp,controlled:cp.role.player.lifeState!=='alive'||cp.role.player.actionId==='knockdown',mastery:currentSkillMastery(equipment,combat,this.options.setConfigs)},cursor=>{requireValue(cursor-state.randomCursor<tape.length,'CONFIG_NOT_READY');return tape[cursor-state.randomCursor];},(tick,mp)=>{resourceRole.player.mp=mp;const elapsed=(tick-q.payload.fromTick)*10,next=advanceRole(resourceRole,resourceAt,cp.header.logicalTimeMs+elapsed,this.options.content!);resourceRole=next;resourceAt=cp.header.logicalTimeMs+elapsed;return next.player.mp;}):combat.bengshan?advanceBengshanSimulation(initial,state,scene.cross!,scene.bengshan!,targets,q.payload.inputs,q.payload.fromTick,q.payload.toTick,config,combat.config,combat.cross!,combat.bengshan!,{challengeId:h.id,sceneEpoch:h.sceneEpoch,actorId:c.id,immuneToBleed:scene.enemies.filter(e=>e.immuneToBleed).map(e=>e.actor.actorIndex)},{...stats,level:c.level,mp:cp.role.player.mp,controlled:cp.role.player.lifeState!=='alive'||cp.role.player.actionId==='knockdown',mastery:currentSkillMastery(equipment,combat,this.options.setConfigs)},cursor=>{requireValue(cursor-state.randomCursor<tape.length,'CONFIG_NOT_READY');return tape[cursor-state.randomCursor];},(tick,mp)=>{resourceRole.player.mp=mp;const elapsed=(tick-q.payload.fromTick)*10,next=advanceRole(resourceRole,resourceAt,cp.header.logicalTimeMs+elapsed,this.options.content!);resourceRole=next;resourceAt=cp.header.logicalTimeMs+elapsed;return next.player.mp;}):combat.cross?advanceCrossSimulation(initial,state,scene.cross!,targets,q.payload.inputs,q.payload.fromTick,q.payload.toTick,config,combat.config,combat.cross,{challengeId:h.id,sceneEpoch:h.sceneEpoch,actorId:c.id,immuneToBleed:scene.enemies.filter(e=>e.immuneToBleed).map(e=>e.actor.actorIndex)},{...stats,level:c.level,mp:cp.role.player.mp,controlled:cp.role.player.lifeState!=='alive'||cp.role.player.actionId==='knockdown',mastery:currentSkillMastery(equipment,combat,this.options.setConfigs)},cursor=>{requireValue(cursor-state.randomCursor<tape.length,'CONFIG_NOT_READY');return tape[cursor-state.randomCursor];},(tick,mp)=>{resourceRole.player.mp=mp;const elapsed=(tick-q.payload.fromTick)*10,next=advanceRole(resourceRole,resourceAt,cp.header.logicalTimeMs+elapsed,this.options.content!);resourceRole=next;resourceAt=cp.header.logicalTimeMs+elapsed;return next.player.mp;}):advanceBasicSimulation(initial,state,targets,q.payload.inputs,q.payload.fromTick,q.payload.toTick,config,combat.config,{challengeId:h.id,sceneEpoch:h.sceneEpoch,actorId:c.id},stats,cursor=>{requireValue(cursor-state.randomCursor<tape.length,'CONFIG_NOT_READY');return tape[cursor-state.randomCursor];});
                if(combat.cross){const skillResult=result as ReturnType<typeof advanceCrossSimulation>;scene.cross=skillResult.cross;if(combat.earth)scene.earth=(result as ReturnType<typeof advanceEarthSimulation>).earth;if(combat.badao)scene.badao=(result as ReturnType<typeof advanceBadaoSimulation>).badao;if(combat.bengshan)scene.bengshan=(result as ReturnType<typeof advanceBengshanSimulation>).bengshan;resourceRole.player.mp=skillResult.mp;}computed.state=result.movement;combatState=result.state;combatEvents=result.events;scene.combat.targets=result.targets;scene.randomCursor=result.state.randomCursor;scene.eventCursor+=result.events.length;
                for(const enemy of scene.enemies){const target=result.targets.find(t=>t.actorId===enemy.actor.actorId)!;enemy.actor={...enemy.actor,hp:target.hp,lifeState:target.lifeState,actionId:target.lifeState==='dead'?'dead':target.downUntilTick!==null?'knockdown':'idle',phase:0};}
            }
            if(cp.role.regenerationRef!==null)requireValue(cp.role.regenerationHash===await manifestDigest(this.options.content!.regeneration),'CONFIG_NOT_READY');
            const role=combat?.cross?resourceRole:advanceRole(cp.role,cp.header.logicalTimeMs,logicalTimeMs,this.options.content!);
            role.schemaVersion=3;role.regenerationHash=role.regenerationHash??null;role.movement={configHash,state:computed.state};role.player={...role.player,x:Number(computed.state.x),y:Number(computed.state.y),facing:computed.state.facing};
            if(combat){role.schemaVersion=4;role.attackPower=currentBasicStats(c,equipment,combat,{x:role.player.x,y:role.player.y,facing:role.player.facing},this.options.setConfigs).attackPower;role.equipmentVersion=c.equipmentVersion;role.combat={configHash:await manifestDigest(combat),attributesRevision:c.statsVersion,state:combatState!};role.player.actionId=cp.role.player.actionId==='knockdown'?'knockdown':combatState!.cast?`basic${combatState!.cast.stage+1}`:'idle';role.player.phase=combatState!.cast?.stage??0;if(scene.cross){role.unlockedSkills=role.unlockedSkills.map(skill=>skill.skillId==='cross'?{...skill,level:1+Math.floor((c.level-1)/2)}:skill);const ready=scene.cross.readyAtUs;role.cooldowns.find(cd=>cd.cooldownId==='cross')!.readyAtTick=logicTick(Number((BigInt(ready.n)+BigInt(ready.d)*10000n-1n)/(BigInt(ready.d)*10000n)));if(scene.cross.cast){role.player.actionId='cross';role.player.phase=scene.cross.cast.node;}}}
            if(scene.bengshan){const ready=scene.bengshan.readyAtUs;role.cooldowns.find(cd=>cd.cooldownId==='bengshan')!.readyAtTick=logicTick(Number((BigInt(ready.n)+BigInt(ready.d)*10000n-1n)/(BigInt(ready.d)*10000n)));if(c.level>=5){const skill={skillId:'bengshan' as const,level:1+Math.floor((c.level-5)/2),configRef:cp.role.unlockedSkills.find(x=>x.skillId==='bengshan')?.configRef??'bengshan@1'};role.unlockedSkills=[...role.unlockedSkills.filter(x=>x.skillId!=='bengshan'),skill];}if(scene.bengshan.cast){role.player.actionId='bengshan';role.player.phase=scene.bengshan.cast.node;}}
            if(scene.earth){const ready=scene.earth.readyAtUs;role.cooldowns.find(cd=>cd.cooldownId==='earth')!.readyAtTick=logicTick(Number((BigInt(ready.n)+BigInt(ready.d)*10000n-1n)/(BigInt(ready.d)*10000n)));if(c.level>=20){const skill={skillId:'earth' as const,level:1+Math.floor((c.level-20)/2),configRef:cp.role.unlockedSkills.find(x=>x.skillId==='earth')?.configRef??'earth@1'};role.unlockedSkills=[...role.unlockedSkills.filter(x=>x.skillId!=='earth'),skill];}if(scene.earth.cast){role.player.actionId='earth';role.player.phase=scene.earth.cast.node;}}
            if(scene.badao){const ready=scene.badao.readyAtUs;role.cooldowns.find(cd=>cd.cooldownId==='badao')!.readyAtTick=logicTick(Number((BigInt(ready.n)+BigInt(ready.d)*10000n-1n)/(BigInt(ready.d)*10000n)));if(c.level>=10){const skill={skillId:'badao' as const,level:1+Math.floor((c.level-10)/2),configRef:cp.role.unlockedSkills.find(x=>x.skillId==='badao')?.configRef??'badao@1'};role.unlockedSkills=[...role.unlockedSkills.filter(x=>x.skillId!=='badao'),skill];}if(scene.badao.cast){role.player.actionId='badao';role.player.phase=scene.badao.cast.node;}}
            const hash=await stateHash(role,scene),chunk=await writeChunk(h,0,increment(cp.header.activeChunks[0].chunkRevision),role),sceneChunk=await writeChunk(h,1,increment(cp.header.activeChunks[1].chunkRevision),scene),effectChunks=await writeCrossChunks(h,scene.cross,cp.header.activeChunks,scene.bengshan,scene.badao,scene.earth,cp.effectChunks);
            const resultPages=await Promise.all(Array.from({length:combatEvents?Math.max(1,Math.ceil(combatEvents.length/32)):0},async(_,pageIndex)=>({id:await loginKey('combatResults',[a.id,q.operationId,pageIndex]),schemaVersion:1,accountId:a.id,operationId:q.operationId,actionResultsRef:id,pageIndex,totalPages:Math.max(1,Math.ceil(combatEvents!.length/32)),events:combatEvents!.slice(pageIndex*32,(pageIndex+1)*32)})));requireValue(resultPages.length<=1024,'CONFIG_NOT_READY');for(const page of resultPages)budget(page,32768);
            return await this.options.store.run(async tx=>{
                now=this.options.clock.now();const currentA=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),currentC=await this.character(tx,currentA,q.payload.characterId,q.payload.rolePlayEpoch),currentH=await tx.get<EntryChallenge>(h.id),old=await tx.get<{schemaVersion:number;id:string;tuple:string;command:string;accountId:string;result:unknown}>(id);
                if(old)return reply(original(old,id,a.id).outcome,true);
                requireValue(await tx.get(await loginKey('assetJournal',[a.id,q.operationId]))===undefined,'SERVICE_UNAVAILABLE');
                requireValue(currentH&&currentH.accountId===a.id,'NOT_FOUND_OR_FORBIDDEN');
                if(await this.expire(tx,currentA,currentH,now))return reply({status:'rejected',code:'DEADLINE_EXPIRED'});
                this.live(currentH,currentA,currentC,q.sessionId,now);const latest=await readCheckpoint(tx,currentH);
                requireValue(currentH.roomPhase==='active'&&latest.header.acceptingInputs,'ROOM_NOT_AVAILABLE');
                if(await this.movementGap(tx,currentH,latest.header,now))return reply({status:'rejected',code:'RECOVERY_REQUIRED'});
                this.validateMovement(q,currentA,currentC,currentH,latest.header,now);
                requireValue(canonical(latest)===canonical(cp)&&canonical(currentC)===canonical(c),'VERSION_CONFLICT');for(const item of equipment)requireValue(canonical(await tx.get(item.id))===canonical(item),'VERSION_CONFLICT');
                const revision=increment(latest.header.revision),state={...latest.header.state,checkpointRevision:revision,publicStateHash:hash,acceptedSeq:q.payload.lastSeq,acceptedTick:q.payload.toTick,inputGapBaseAt:now,lastAcceptedInputAt:now};
                const activeChunks=[...latest.header.activeChunks.slice(0,2)];if(chunk.hash!==activeChunks[0].hash){tx.set(chunk.id,chunk);activeChunks[0]={...activeChunks[0],chunkRevision:chunk.chunkRevision,hash:chunk.hash};}
                if(sceneChunk.hash!==activeChunks[1].hash){tx.set(sceneChunk.id,sceneChunk);activeChunks[1]={...activeChunks[1],chunkRevision:sceneChunk.chunkRevision,hash:sceneChunk.hash};}
                for(const effect of effectChunks){const oldRef=latest.header.activeChunks.find(r=>r.ordinal===effect.ordinal);if(oldRef?.hash===effect.hash)activeChunks.push(oldRef);else{tx.set(effect.id,effect);activeChunks.push({ordinal:effect.ordinal,chunkRevision:effect.chunkRevision,hash:effect.hash,sceneEpoch:h.sceneEpoch});}}const nextHeader={...latest.header,revision,activeChunks,state,logicalTimeMs,timeRemainderMs:logicalTimeMs%10};
                const nextH={...currentH,version:increment(currentH.version),acceptedSeq:q.payload.lastSeq,acceptedTick:q.payload.toTick,lease:{...currentH.lease!,lastEvidenceAt:now,leaseUntil:now+10000,revision:increment(currentH.lease!.revision)}};
                const result=reply({status:'committed',data:{acceptedSeq:q.payload.lastSeq,acceptedTick:q.payload.toTick,checkpointRevision:revision,actionResultsRef:id,events:combatEvents?[]:computed.events},resultVersions:[{kind:'character',id:c.id,version:c.version},{kind:'challenge',id:h.id,version:nextH.version}]});
                const receipt={schemaVersion:2,id,accountId:a.id,command:q.command,tuple,result,characterId:c.id,rolePlayEpoch:c.rolePlayEpoch,sessionId:q.sessionId,sessionEpoch:q.sessionEpoch};budget(receipt,16384);budget(nextHeader,16384);budget(nextH,131072);
                for(const page of resultPages)tx.set(page.id,page);
                tx.set(a.id,{...currentA,writeRevision:increment(currentA.writeRevision)});tx.set(h.id,nextH);tx.set(nextHeader.id,nextHeader);tx.set(id,receipt);return result;
            });
        }catch(e){if(e instanceof CommitUnknown)return reply({status:'unknown',code:'RESULT_UNKNOWN'});if(e instanceof StoreUnavailable)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});if(e instanceof Refusal)return reply({status:'rejected',code:e.message});if(e instanceof TypeError)return reply({status:'rejected',code:'CONFIG_NOT_READY'});throw e;}
    }
    private validateMovement(q:SimulationSubmit,a:LoginAccount,c:CharacterEntity,h:EntryChallenge,header:RoomCheckpointHeader,now:number){
        const p=q.payload,config=this.options.content?.movement;
        requireValue(config&&this.options.content?.profile==='local-test'&&this.options.content.purpose==='contract-fixture-only'&&config.profile==='local-test-movement'&&config.mapRef===header.mapRef&&p.mapRef===config.mapRef&&p.ruleRef===config.ruleRef,'CONFIG_NOT_READY');
        requireValue(p.roomNo===h.currentRoomNo&&p.sceneEpoch===h.sceneEpoch&&p.timelineEpoch===h.timelineEpoch&&p.baseCheckpointVersion===header.revision,'VERSION_CONFLICT');
        requireValue(p.fromTick===header.state.acceptedTick&&p.firstSeq===header.state.acceptedSeq+1&&h.acceptedSeq===header.state.acceptedSeq&&h.acceptedTick===header.state.acceptedTick,'INPUT_GAP');
        requireValue(q.expected.some(v=>v.kind==='challenge'&&v.id===h.id&&v.version===h.version)&&q.expected.some(v=>v.kind==='character'&&v.id===c.id&&v.version===c.version),'VERSION_CONFLICT');
        const s=header.state;requireValue(s.anchorWallAt!==null&&s.anchorTick!==null&&now>=s.anchorWallAt&&p.toTick-s.anchorTick<=Math.floor((now-s.anchorWallAt)/10),'TIME_FRONTIER');
    }

}

/** Leave wrapper room below32KiB, preserving every legal record and stable order. */
function publicPages(records:ReturnType<typeof publicRecords>,maxRecords=32){const pages:typeof records[]=[];let page:typeof records=[];let bytes=2;for(const record of records){const size=new TextEncoder().encode(JSON.stringify(record)).length+1;requireValue(size<=24000,'CONFIG_NOT_READY');if(page.length&&(bytes+size>24000||page.length===maxRecords)){pages.push(page);page=[];bytes=2;}page.push(record);bytes+=size;}if(page.length)pages.push(page);requireValue(pages.length<=256,'CONFIG_NOT_READY');return pages;}
