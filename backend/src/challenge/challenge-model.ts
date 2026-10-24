import type { TestRelease } from '../../../shared/src/config/release-v1.ts';
import type { HandoffChallenge } from '../identity/login-handoff.ts';
import type { EquipmentEntity } from '../character/character-model.ts';
export interface ChallengeContent {
    schemaVersion: 1;
    releaseRef: string;
    profile: 'local-test' | 'release';
    purpose: 'contract-fixture-only' | 'published';
    release?: TestRelease;
    dungeons: {
        dungeonId: string;
        kind: 'first' | 'second' | 'special';
        purpleTemplateRef?: string;
        mapId: string;
        anchor: {
            x: number;
            y: number;
            radius: number;
        };
        minLevel: number;
        maxMonsterLevel: number;
        difficulties: {
            difficultyId: string;
            roomCost: number;
            levels: Record<number, {
                monsterStatsRef: string;
                equipmentSourceRef: string;
            }>;
        }[];
    }[];
}
export interface DungeonEntryContext {
    schemaVersion: 2;
    id: string;
    accountId: string;
    sessionId: string;
    sessionEpoch: number;
    characterId: string;
    rolePlayEpoch: number;
    dungeonId: string;
    mapId: string;
    sceneEpoch: number;
    locationRevision: number;
    releaseRef: string;
}
export interface EntryChallenge extends HandoffChallenge {
    dungeonId: string;
    difficultyId: string;
    rolePlayEpoch: number;
    releaseRef: string;
    monsterLevel: number;
    monsterStatsRef: string;
    equipmentSourceRef: string;
    playerLevel: number;
    equipmentSnapshot: EquipmentEntity[];
    equipmentAttributes: {
        statId: string;
        value: string;
    }[];
    roomCost: number;
    purpleRoomNo: number | null;
    purpleEncounter: {roomNo:number;spawnId:string;templateRef:string} | null;
    lifeState: 'alive';
    roomCount: 7;
    acceptedSeq: number;
    acceptedTick: number;
    createdAt: number;
    controlSeq?:number;
    heartbeatSeq?:number;
    lease?:{mode:'connected'|'recovery';lastEvidenceAt:number;leaseUntil:number;lastHeartbeatAt:number;lastHeartbeatSeq:number;revision:number;recoveryUntil?:number};
    recoveryUntil?:number;
    deathDeadline?:number;
    readyTicket?:{readyTicketId:string;sceneEpoch:number;timelineEpoch:number;checkpointRevision:number;publicStateHash:string;manifestHash:string;deadline:number};
    lastReadyReceipt?:{tuple:string;controlSeq:number;readyTicketId:string;result:unknown};
    connection?: 'connected' | 'recovery' | 'closed';
    timelineEpoch?: number;
    pendingRoomAttempt?: {roomNo:number;attemptId:string;manifestHash:string;configRef:string;preparedRevision:number;manifestRef:string};
    transitionClock?: {attemptId:string;phase:'prepared'|'awaitingReady';settledAt:number;connectedElapsedMs:number;consumedElapsedMs:number;timeRemainder:{numerator:number;denominator:number};transitionRevision:number};
}
