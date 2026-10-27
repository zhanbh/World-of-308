/**
 * First dungeon seven-room encounter layout, spawn geometries, purple monster rules and clear verification.
 * Source: docs/design/analysis/spatial_growth_encounter_trial.py
 * Contract: docs/backend/encounter-clear-contract-v1.md
 */

export type EncounterTacticsKind = 'melee' | 'ranged' | 'charge' | 'elite' | 'boss';

export interface EncounterSpawnCandidate {
    spawnId: string;
    role: 'ordinary' | 'elite' | 'boss' | 'purple';
    tacticsKind: EncounterTacticsKind;
    x: number;
    y: number;
    experienceMultiplier?: number;
}

export interface ConfirmedKillFact {
    spawnId: string;
    role: 'ordinary' | 'elite' | 'boss' | 'purple';
    templateRef: string;
    roomNo: number;
    xpMultiplier: number;
}

/**
 * 27 base monsters distributed across 7 rooms (R1～R7, protocol room0～room6).
 * Scales: design coordinates scaled by 1000.
 * Room 0 (R1): 3 base monsters (melee)
 * Room 1 (R2): 5 base monsters (melee)
 * Room 2 (R3): 5 base monsters (3 melee, 2 ranged)
 * Room 3 (R4): 4 base monsters (2 charge, 2 melee)
 * Room 4 (R5): 3 base monsters (1 elite, 2 ranged)
 * Room 5 (R6): 6 base monsters (3 melee, 1 charge, 2 ranged)
 * Room 6 (R7): 1 base monster (boss)
 * Total: 3 + 5 + 5 + 4 + 3 + 6 + 1 = 27 base monsters.
 */
export const FIRST_DUNGEON_SEVEN_ROOM_SPAWNS: readonly (readonly EncounterSpawnCandidate[])[] = [
    // Room 0 (R1) - 3 base monsters
    [
        { spawnId: 'spawn-0', role: 'ordinary', tacticsKind: 'melee', x: -10000, y: -15000 },
        { spawnId: 'spawn-1', role: 'ordinary', tacticsKind: 'melee', x: 30000, y: 20000 },
        { spawnId: 'spawn-2', role: 'ordinary', tacticsKind: 'melee', x: 65000, y: 55000 },
    ],
    // Room 1 (R2) - 5 base monsters
    [
        { spawnId: 'spawn-0', role: 'ordinary', tacticsKind: 'melee', x: -10000, y: -15000 },
        { spawnId: 'spawn-1', role: 'ordinary', tacticsKind: 'melee', x: 25000, y: 20000 },
        { spawnId: 'spawn-2', role: 'ordinary', tacticsKind: 'melee', x: 65000, y: 55000 },
        { spawnId: 'spawn-3', role: 'ordinary', tacticsKind: 'melee', x: 110000, y: -15000 },
        { spawnId: 'spawn-4', role: 'ordinary', tacticsKind: 'melee', x: 145000, y: 55000 },
    ],
    // Room 2 (R3) - 5 base monsters
    [
        { spawnId: 'spawn-0', role: 'ordinary', tacticsKind: 'melee', x: -10000, y: -15000 },
        { spawnId: 'spawn-1', role: 'ordinary', tacticsKind: 'melee', x: 25000, y: 20000 },
        { spawnId: 'spawn-2', role: 'ordinary', tacticsKind: 'melee', x: 65000, y: 55000 },
        { spawnId: 'spawn-3', role: 'ordinary', tacticsKind: 'ranged', x: 135000, y: -15000 },
        { spawnId: 'spawn-4', role: 'ordinary', tacticsKind: 'ranged', x: 170000, y: 55000 },
    ],
    // Room 3 (R4) - 4 base monsters
    [
        { spawnId: 'spawn-0', role: 'ordinary', tacticsKind: 'charge', x: 30000, y: -15000 },
        { spawnId: 'spawn-1', role: 'ordinary', tacticsKind: 'charge', x: 90000, y: 55000 },
        { spawnId: 'spawn-2', role: 'ordinary', tacticsKind: 'melee', x: 0, y: 45000 },
        { spawnId: 'spawn-3', role: 'ordinary', tacticsKind: 'melee', x: 145000, y: 20000 },
    ],
    // Room 4 (R5) - 3 base monsters
    [
        { spawnId: 'spawn-0', role: 'elite', tacticsKind: 'elite', x: 40000, y: 20000 },
        { spawnId: 'spawn-1', role: 'ordinary', tacticsKind: 'ranged', x: 135000, y: -15000 },
        { spawnId: 'spawn-2', role: 'ordinary', tacticsKind: 'ranged', x: 170000, y: 55000 },
    ],
    // Room 5 (R6) - 6 base monsters
    [
        { spawnId: 'spawn-0', role: 'ordinary', tacticsKind: 'melee', x: -10000, y: -15000 },
        { spawnId: 'spawn-1', role: 'ordinary', tacticsKind: 'melee', x: 25000, y: 20000 },
        { spawnId: 'spawn-2', role: 'ordinary', tacticsKind: 'melee', x: 65000, y: 55000 },
        { spawnId: 'spawn-3', role: 'ordinary', tacticsKind: 'charge', x: 90000, y: -15000 },
        { spawnId: 'spawn-4', role: 'ordinary', tacticsKind: 'ranged', x: 135000, y: -15000 },
        { spawnId: 'spawn-5', role: 'ordinary', tacticsKind: 'ranged', x: 170000, y: 55000 },
    ],
    // Room 6 (R7) - 1 base monster (boss room, never has purple)
    [
        { spawnId: 'spawn-0', role: 'boss', tacticsKind: 'boss', x: 100000, y: 20000 },
    ],
] as const;

/** Fixed candidate position for purple monster: (105, 20) -> (105000, 20000) */
export const PURPLE_SPAWN_CANDIDATE: EncounterSpawnCandidate = {
    spawnId: 'purple-extra',
    role: 'purple',
    tacticsKind: 'melee',
    x: 105000,
    y: 20000,
    experienceMultiplier: 2,
};

/** Eligible rooms for extra purple monster: Room 0..5 (R1～R6). Boss room 6 is strictly excluded. */
export const PURPLE_ELIGIBLE_ROOMS = [0, 1, 2, 3, 4, 5] as const;

/**
 * Validate that spawn points are within map bounds, reachable, and do not overlap entrance or exit.
 */
export function validateSpawnGeometry(
    spawns: readonly { x: number; y: number; role?: string }[],
    mapBounds: { left: number; right: number; bottom: number; top: number },
    entrance: { x: number; y: number },
    exit: { x: number; y: number },
    entranceClearance = 24000,
    exitClearance = 24000
): void {
    if (spawns.length < 1 || spawns.length > 8) {
        throw new TypeError('INVALID_SPAWN_COUNT');
    }
    for (const s of spawns) {
        if (s.x < mapBounds.left || s.x > mapBounds.right || s.y < mapBounds.bottom || s.y > mapBounds.top) {
            throw new TypeError('SPAWN_OUT_OF_BOUNDS');
        }
        const distEntrance = Math.hypot(s.x - entrance.x, s.y - entrance.y);
        if (distEntrance < entranceClearance) {
            throw new TypeError('SPAWN_OVERLAPS_ENTRANCE');
        }
        const distExit = Math.hypot(s.x - exit.x, s.y - exit.y);
        if (distExit < exitClearance) {
            throw new TypeError('SPAWN_OVERLAPS_EXIT');
        }
    }
}

/**
 * Build room spawns from the versioned seven-room encounter layout, appending purple monster if assigned to this room.
 */
export function buildEncounterRoomSpawns(
    roomNo: number,
    purpleRoomNo: number | null,
    templateRef: string,
    purpleTemplateRef = templateRef
): { spawnId: string; templateRef: string; role: 'ordinary' | 'elite' | 'boss' | 'purple'; x: number; y: number }[] {
    if (roomNo < 0 || roomNo >= FIRST_DUNGEON_SEVEN_ROOM_SPAWNS.length) {
        throw new TypeError('INVALID_ROOM_NO');
    }
    const base = FIRST_DUNGEON_SEVEN_ROOM_SPAWNS[roomNo];
    const spawns: { spawnId: string; templateRef: string; role: 'ordinary' | 'elite' | 'boss' | 'purple'; x: number; y: number }[] = base.map(s => ({
        spawnId: s.spawnId,
        templateRef,
        role: s.role,
        x: s.x,
        y: s.y,
    }));
    // Purple monster can only spawn in eligible rooms 0..5, never in boss room 6
    if (purpleRoomNo !== null && purpleRoomNo === roomNo && roomNo <= 5) {
        spawns.push({
            spawnId: PURPLE_SPAWN_CANDIDATE.spawnId,
            templateRef: purpleTemplateRef,
            role: 'purple',
            x: PURPLE_SPAWN_CANDIDATE.x,
            y: PURPLE_SPAWN_CANDIDATE.y,
        });
    }
    if (spawns.length > 8) {
        throw new TypeError('EXCEEDS_MAX_ROOM_SPAWNS');
    }
    return spawns;
}
