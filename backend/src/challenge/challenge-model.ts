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
}
