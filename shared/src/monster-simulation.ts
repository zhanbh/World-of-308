import { advanceEarthSimulation } from './earth-simulation.ts';
import type { EarthSimulationInput } from './earth-simulation.ts';
import type { CombatEvent, CombatTarget, Rational } from './basic-combat-kernel.ts';
import { advanceMovement } from './movement-kernel.ts';
import type { TacticalRole, RangedSkill, ChargeSkill, DifficultyTacticsConfig, RoarSkill, ComboSkill } from './monster-tactics.ts';
import { tacticalDestination } from './monster-tactics.ts';

export type MonsterTemplate = {
    type: 'humanoid' | 'beast' | 'undead' | 'mechanical';
    skillRef: string;
    skillRefs?: string[];
    behavior: 'chase';
    rewardTag: string;
    resist: {
        bleed: boolean;
        stagger: boolean;
        knockback: boolean;
        knockdown: boolean;
    };
};
export type MeleeSkillKind = 'melee' | 'cleave' | 'sweep' | 'smash' | 'stomp';
export function isMeleeFamily(kind: string): kind is MeleeSkillKind {
    return ['melee', 'cleave', 'sweep', 'smash', 'stomp'].includes(kind);
}
export function isMeleeSkill(s: unknown): s is MeleeSkill {
    return s !== null && typeof s === 'object' && Object.hasOwn(s, 'kind') && isMeleeFamily((s as any).kind);
}
export type MeleeSkill = {
    kind: MeleeSkillKind;
    windupTicks: number;
    recoveryTicks: number;
    cooldownTicks: number;
    rangeX: number;
    rangeY: number;
    speed: number;
    coefficient: Rational;
    staggerTicks: number;
    superArmorTicks?: number;
};
export type MonsterConfig = {
    version: 'local-melee-v1' | 'local-tactics-v1';
    decisionTicks: number;
    control: {
        staggerTicks: number;
        knockback: number;
    };
    templates: Record<string, MonsterTemplate>;
    skills: Record<string, MeleeSkill | RangedSkill | ChargeSkill | RoarSkill | ComboSkill>;
    tactics?: DifficultyTacticsConfig;
};

export type ProjectileEffect = {
    id: string;
    kind: 'projectile';
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    speed: number;
    radiusX: number;
    radiusY: number;
    damage: Rational;
    facing: 1 | -1;
    staggerTicks: number;
    sourceActorId: string;
    sourceActorIndex: number;
    sourceSequence: number;
};

export type MonsterTacticsRuntime = {
    role: TacticalRole;
    effects: Array<ProjectileEffect>;
};

export type MonsterRuntime = {
    actorId: string;
    actorIndex: number;
    templateRef: string;
    identity: 'ordinary' | 'elite' | 'boss';
    attackPower: string;
    nextDecisionTick: number;
    readyAtTick: number;
    sequence: number;
    action: null | {
        startTick: number;
        hitTick: number;
        endTick: number;
        facing: 1 | -1;
        damage: Rational;
        released: boolean;
        activeEndTick?: number;
        superArmorEndTick?: number;
        skillRef?: string;
        kind?: string;
        contactTicks?: number[];
        contactsDone?: number[];
        maxHpSnapshot?: string;
        accumulatedRoarDamage?: string;
        roarKnocked?: boolean;
        chargeLocked?: boolean;
        chargeHit?: boolean;
        chargeEndTick?: number;
        travelled?: number;
        wallHit?: boolean;
        trampleDone?: number[];
    };
    staggerUntilTick: number;
    intentX: number;
    intentY: number;
    remainderX: string;
    remainderY: string;
    tactics: MonsterTacticsRuntime;
    phase?: number;
    pendingPhase?: number | null;
    cooldowns?: Record<string, number>;
    weakUntilTick?: number;
};
export type MonsterPlayer = {
    hp: string;
    maxHp: string;
    lifeState: 'alive' | 'dead';
    controlledUntilTick: number;
    deathIndex?: number;
    deathDeadline?: number;
    deathAtTick?: number;
};
function check(v: unknown): asserts v {
    if (!v)
        throw new TypeError('INVALID_MONSTER_CONFIG');
}
function fields(v: any, keys: string[]) { check(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',')); }
const integer = (v: any, min = 0, max = 2147483647) => check(Number.isSafeInteger(v) && v >= min && v <= max);
const token = (v: any) => check(typeof v === 'string' && /^[^\s]{1,128}$/.test(v));
export function validateMonsterConfig(v: unknown): MonsterConfig {
    const c = v as MonsterConfig;
    const configKeys = ['version', 'decisionTicks', 'control', 'templates', 'skills'];
    if (c && typeof c === 'object' && Object.hasOwn(c, 'tactics'))
        configKeys.push('tactics');
    fields(c, configKeys);
    check(c.version === 'local-melee-v1' || c.version === 'local-tactics-v1');
    integer(c.decisionTicks, 1, 100);
    fields(c.control, ['staggerTicks', 'knockback']);
    integer(c.control.staggerTicks, 0, 100);
    integer(c.control.knockback, 0, 100000);
    check(Object.keys(c.templates).length > 0 && Object.keys(c.templates).length <= 32 && Object.keys(c.skills).length > 0 && Object.keys(c.skills).length <= 32);
    for (const [id, t] of Object.entries(c.templates)) {
        token(id);
        const templateKeys = ['type', 'skillRef', 'behavior', 'rewardTag', 'resist'];
        if (Object.hasOwn(t, 'skillRefs'))
            templateKeys.push('skillRefs');
        fields(t, templateKeys);
        check(['humanoid', 'beast', 'undead', 'mechanical'].includes(t.type) && t.behavior === 'chase');
        token(t.rewardTag);
        token(t.skillRef);
        check(Object.hasOwn(c.skills, t.skillRef));
        if (t.skillRefs !== undefined) {
            check(Array.isArray(t.skillRefs) && t.skillRefs.length > 0 && t.skillRefs.length <= 16);
            for (const ref of t.skillRefs) {
                token(ref);
                check(Object.hasOwn(c.skills, ref));
            }
        }
        fields(t.resist, ['bleed', 'stagger', 'knockback', 'knockdown']);
        for (const r of Object.values(t.resist))
            check(typeof r === 'boolean');
    }
    for (const [id, s] of Object.entries(c.skills)) {
        token(id);
        check(s && typeof s === 'object' && !Array.isArray(s));
        if (isMeleeSkill(s)) {
            const meleeKeys = ['kind', 'windupTicks', 'recoveryTicks', 'cooldownTicks', 'rangeX', 'rangeY', 'speed', 'coefficient', 'staggerTicks'];
            if (Object.hasOwn(s, 'superArmorTicks'))
                meleeKeys.push('superArmorTicks');
            fields(s, meleeKeys);
            for (const k of ['windupTicks', 'recoveryTicks', 'cooldownTicks'] as const)
                integer(s[k], 1, 10000);
            check(s.cooldownTicks >= Math.max(50, s.windupTicks + s.recoveryTicks));
            for (const k of ['rangeX', 'rangeY', 'speed', 'staggerTicks'] as const)
                integer(s[k], 0, 1000000);
            if (s.superArmorTicks !== undefined)
                integer(s.superArmorTicks, 0, s.windupTicks + s.recoveryTicks);
            fields(s.coefficient, ['n', 'd']);
            check(/^(0|[1-9][0-9]{0,5})$/.test(s.coefficient.n) && /^[1-9][0-9]{0,5}$/.test(s.coefficient.d) && BigInt(s.coefficient.n) <= 100n * BigInt(s.coefficient.d));
        } else if (s.kind === 'ranged') {
            fields(s, ['kind', 'windupTicks', 'recoveryTicks', 'cooldownTicks', 'reach', 'speed', 'projectileSpeed', 'projectileRadiusX', 'projectileRadiusY', 'coefficient', 'staggerTicks']);
            for (const k of ['windupTicks', 'recoveryTicks', 'cooldownTicks'] as const)
                integer(s[k], 1, 10000);
            check(s.cooldownTicks >= Math.max(50, s.windupTicks + s.recoveryTicks));
            for (const k of ['reach', 'speed', 'projectileSpeed', 'projectileRadiusX', 'projectileRadiusY', 'staggerTicks'] as const)
                integer(s[k], 0, 1000000);
            fields(s.coefficient, ['n', 'd']);
            check(/^(0|[1-9][0-9]{0,5})$/.test(s.coefficient.n) && /^[1-9][0-9]{0,5}$/.test(s.coefficient.d) && BigInt(s.coefficient.n) <= 100n * BigInt(s.coefficient.d));
        } else if (s.kind === 'charge') {
            fields(s, ['kind', 'windupTicks', 'activeTicks', 'recoveryTicks', 'cooldownTicks', 'reach', 'sweepDistance', 'sweepSpeed', 'contactRadius', 'coefficient', 'staggerTicks', 'speed']);
            for (const k of ['windupTicks', 'activeTicks', 'recoveryTicks', 'cooldownTicks'] as const)
                integer(s[k], 1, 10000);
            check(s.cooldownTicks >= Math.max(50, s.windupTicks + s.activeTicks + s.recoveryTicks));
            for (const k of ['reach', 'sweepDistance', 'sweepSpeed', 'contactRadius', 'staggerTicks', 'speed'] as const)
                integer(s[k], 0, 1000000);
            fields(s.coefficient, ['n', 'd']);
            check(/^(0|[1-9][0-9]{0,5})$/.test(s.coefficient.n) && /^[1-9][0-9]{0,5}$/.test(s.coefficient.d) && BigInt(s.coefficient.n) <= 100n * BigInt(s.coefficient.d));
        } else if (s.kind === 'roar') {
            fields(s, ['kind', 'windupTicks', 'recoveryTicks', 'superArmorTicks', 'cooldownTicks', 'reach', 'contactTicks', 'coefficient', 'staggerTicks', 'speed']);
            for (const k of ['windupTicks', 'recoveryTicks', 'superArmorTicks', 'cooldownTicks'] as const)
                integer(s[k], 1, 10000);
            check(s.cooldownTicks >= Math.max(50, s.windupTicks + s.recoveryTicks));
            for (const k of ['reach', 'staggerTicks', 'speed'] as const)
                integer(s[k], 0, 1000000);
            check(Array.isArray(s.contactTicks) && s.contactTicks.length === 6);
            for (const t of s.contactTicks)
                integer(t, 1, 10000);
            fields(s.coefficient, ['n', 'd']);
            check(/^(0|[1-9][0-9]{0,5})$/.test(s.coefficient.n) && /^[1-9][0-9]{0,5}$/.test(s.coefficient.d) && BigInt(s.coefficient.n) <= 100n * BigInt(s.coefficient.d));
        } else if (s.kind === 'combo') {
            fields(s, ['kind', 'reach', 'windupTicks', 'trampleTicks', 'lockTick', 'chargeStartTick', 'maxTravelDistance', 'chargeSpeed', 'contactRadius', 'bodyRadius', 'cooldownTicks', 'recoveryTicks', 'wallWeaknessTicks', 'trampleCoefficient', 'chargeCoefficient', 'staggerTicks', 'speed']);
            for (const k of ['windupTicks', 'lockTick', 'chargeStartTick', 'cooldownTicks', 'recoveryTicks', 'wallWeaknessTicks'] as const)
                integer(s[k], 1, 10000);
            for (const k of ['reach', 'maxTravelDistance', 'chargeSpeed', 'contactRadius', 'bodyRadius', 'staggerTicks', 'speed'] as const)
                integer(s[k], 0, 1000000);
            check(Array.isArray(s.trampleTicks) && s.trampleTicks.length === 3);
            for (const t of s.trampleTicks)
                integer(t, 1, 10000);
            fields(s.trampleCoefficient, ['n', 'd']);
            check(/^(0|[1-9][0-9]{0,5})$/.test(s.trampleCoefficient.n) && /^[1-9][0-9]{0,5}$/.test(s.trampleCoefficient.d) && BigInt(s.trampleCoefficient.n) <= 100n * BigInt(s.trampleCoefficient.d));
            fields(s.chargeCoefficient, ['n', 'd']);
            check(/^(0|[1-9][0-9]{0,5})$/.test(s.chargeCoefficient.n) && /^[1-9][0-9]{0,5}$/.test(s.chargeCoefficient.d) && BigInt(s.chargeCoefficient.n) <= 100n * BigInt(s.chargeCoefficient.d));
        } else {
            throw new TypeError('INVALID_SKILL_KIND');
        }
    }
    if (c.tactics !== undefined) {
        fields(c.tactics, ['difficulty', 'maxFlankers', 'maxConcurrentRetreaters', 'specialCap', 'retreatDistance', 'retreatTriggerDistance', 'flankOffsetX', 'flankOffsetY']);
        check(['normal', 'adventure', 'warrior', 'king'].includes(c.tactics.difficulty));
        for (const k of ['maxFlankers', 'maxConcurrentRetreaters', 'specialCap', 'retreatDistance', 'retreatTriggerDistance', 'flankOffsetX', 'flankOffsetY'] as const)
            integer(c.tactics[k], 0, 10000000);
    }
    return structuredClone(c);
}
export function validateMonsterRuntime(v: unknown): MonsterRuntime {
    const m = v as MonsterRuntime;
    const runtimeKeys = ['actorId', 'actorIndex', 'templateRef', 'identity', 'attackPower', 'nextDecisionTick', 'readyAtTick', 'sequence', 'action', 'staggerUntilTick', 'intentX', 'intentY', 'remainderX', 'remainderY'];
    if (m && typeof m === 'object' && Object.hasOwn(m, 'tactics'))
        runtimeKeys.push('tactics');
    if (m && typeof m === 'object' && Object.hasOwn(m, 'phase'))
        runtimeKeys.push('phase');
    if (m && typeof m === 'object' && Object.hasOwn(m, 'pendingPhase'))
        runtimeKeys.push('pendingPhase');
    if (m && typeof m === 'object' && Object.hasOwn(m, 'cooldowns'))
        runtimeKeys.push('cooldowns');
    if (m && typeof m === 'object' && Object.hasOwn(m, 'weakUntilTick'))
        runtimeKeys.push('weakUntilTick');
    fields(m, runtimeKeys);
    token(m.actorId);
    token(m.templateRef);
    check(['ordinary', 'elite', 'boss'].includes(m.identity));
    check(typeof m.attackPower === 'string' && /^(0|[1-9][0-9]{0,11})$/.test(m.attackPower));
    integer(m.actorIndex, 1, 8);
    for (const k of ['nextDecisionTick', 'readyAtTick', 'sequence'] as const)
        integer(m[k], 0, Number.MAX_SAFE_INTEGER);
    integer(m.staggerUntilTick, 0, Number.MAX_SAFE_INTEGER);
    integer(m.intentX, -1000, 1000);
    integer(m.intentY, -1000, 1000);
    for (const r of [m.remainderX, m.remainderY])
        check(typeof r === 'string' && /^(0|-?[1-9][0-9]{0,4})$/.test(r) && BigInt(r) > -100000n && BigInt(r) < 100000n);
    if (m.phase !== undefined)
        integer(m.phase, 1, 10);
    if (m.pendingPhase !== undefined && m.pendingPhase !== null)
        integer(m.pendingPhase, 1, 10);
    if (m.cooldowns !== undefined) {
        check(m.cooldowns && typeof m.cooldowns === 'object' && !Array.isArray(m.cooldowns));
        for (const [k, v] of Object.entries(m.cooldowns)) {
            token(k);
            integer(v, 0, Number.MAX_SAFE_INTEGER);
        }
    }
    if (m.weakUntilTick !== undefined)
        integer(m.weakUntilTick, 0, Number.MAX_SAFE_INTEGER);
    if (m.action !== null) {
        check(m.action && typeof m.action === 'object' && !Array.isArray(m.action));
        const a = m.action;
        const actionKeys = ['startTick', 'hitTick', 'endTick', 'facing', 'damage', 'released'];
        for (const opt of [
            'activeEndTick',
            'superArmorEndTick',
            'skillRef',
            'kind',
            'contactTicks',
            'contactsDone',
            'maxHpSnapshot',
            'accumulatedRoarDamage',
            'roarKnocked',
            'chargeLocked',
            'chargeHit',
            'chargeEndTick',
            'travelled',
            'wallHit',
            'trampleDone',
        ]) {
            if (Object.hasOwn(a, opt))
                actionKeys.push(opt);
        }
        fields(a, actionKeys);
        integer(a.startTick);
        integer(a.hitTick, a.startTick + 1);
        if (a.activeEndTick !== undefined) {
            integer(a.activeEndTick, a.hitTick);
            integer(a.endTick, a.activeEndTick + 1);
        } else {
            integer(a.endTick, a.startTick + 1);
        }
        if (a.superArmorEndTick !== undefined)
            integer(a.superArmorEndTick, 0, a.endTick + 1000);
        if (a.skillRef !== undefined)
            token(a.skillRef);
        if (a.kind !== undefined)
            token(a.kind);
        if (a.contactTicks !== undefined) {
            check(Array.isArray(a.contactTicks));
            for (const t of a.contactTicks) integer(t, 0, a.endTick + 1000);
        }
        if (a.contactsDone !== undefined) {
            check(Array.isArray(a.contactsDone));
            for (const t of a.contactsDone) integer(t, 0, a.endTick + 1000);
        }
        if (a.maxHpSnapshot !== undefined)
            check(typeof a.maxHpSnapshot === 'string' && /^(0|[1-9][0-9]*)$/.test(a.maxHpSnapshot));
        if (a.accumulatedRoarDamage !== undefined)
            check(typeof a.accumulatedRoarDamage === 'string' && /^(0|[1-9][0-9]*)$/.test(a.accumulatedRoarDamage));
        if (a.roarKnocked !== undefined)
            check(typeof a.roarKnocked === 'boolean');
        if (a.chargeLocked !== undefined)
            check(typeof a.chargeLocked === 'boolean');
        if (a.chargeHit !== undefined)
            check(typeof a.chargeHit === 'boolean');
        if (a.chargeEndTick !== undefined)
            integer(a.chargeEndTick, 0, a.endTick + 1000);
        if (a.travelled !== undefined)
            integer(a.travelled, 0, 10000000);
        if (a.wallHit !== undefined)
            check(typeof a.wallHit === 'boolean');
        if (a.trampleDone !== undefined) {
            check(Array.isArray(a.trampleDone));
            for (const t of a.trampleDone) integer(t, 0, a.endTick + 1000);
        }
        fields(a.damage, ['n', 'd']);
        check(/^(0|[1-9][0-9]{0,18})$/.test(a.damage.n) && /^[1-9][0-9]{0,5}$/.test(a.damage.d));
        check((a.facing === 1 || a.facing === -1) && typeof a.released === 'boolean');
    }
    if (m.tactics !== undefined) {
        check(m.tactics && typeof m.tactics === 'object' && !Array.isArray(m.tactics));
        fields(m.tactics, ['role', 'effects']);
        check(['frontline', 'flanker', 'artillery', 'charger', 'heavy_guard', 'area_controller'].includes(m.tactics.role));
        check(Array.isArray(m.tactics.effects) && m.tactics.effects.length <= 64);
        for (const eff of m.tactics.effects) {
            check(eff && typeof eff === 'object' && !Array.isArray(eff));
            if (eff.kind === 'projectile') {
                fields(eff, ['id', 'kind', 'x', 'y', 'targetX', 'targetY', 'speed', 'radiusX', 'radiusY', 'damage', 'facing', 'staggerTicks', 'sourceActorId', 'sourceActorIndex', 'sourceSequence']);
                token(eff.id);
                token(eff.sourceActorId);
                integer(eff.sourceActorIndex, 1, 8);
                integer(eff.sourceSequence, 0, Number.MAX_SAFE_INTEGER);
                for (const k of ['x', 'y', 'targetX', 'targetY'] as const)
                    integer(eff[k], -2147483648, 2147483647);
                for (const k of ['speed', 'radiusX', 'radiusY', 'staggerTicks'] as const)
                    integer(eff[k], 0, 1000000);
                check(eff.facing === 1 || eff.facing === -1);
                fields(eff.damage, ['n', 'd']);
                check(/^(0|[1-9][0-9]{0,18})$/.test(eff.damage.n) && /^[1-9][0-9]{0,5}$/.test(eff.damage.d));
            } else {
                throw new TypeError('INVALID_MONSTER_EFFECT');
            }
        }
    }
    const cloned = structuredClone(m);
    if (!cloned.tactics)
        cloned.tactics = { role: 'frontline', effects: [] };
    if (cloned.phase === undefined)
        cloned.phase = 1;
    if (cloned.pendingPhase === undefined)
        cloned.pendingPhase = null;
    if (!cloned.cooldowns)
        cloned.cooldowns = {};
    return cloned;
}
export const initialMonsterState = (
    spawns: {
        actorId: string;
        actorIndex: number;
        templateRef: string;
        identity: 'ordinary' | 'elite' | 'boss';
        attackPower: string;
    }[],
    config?: MonsterConfig
): MonsterRuntime[] => {
    const sorted = [...spawns].sort((a, b) => a.actorIndex - b.actorIndex);
    let flankerCount = 0;
    const maxFlankers = config?.tactics?.maxFlankers ?? 0;
    return sorted.map(s => {
        let role: TacticalRole = 'frontline';
        const template = config?.templates?.[s.templateRef];
        const primarySkillRef = template?.skillRefs?.[0] ?? template?.skillRef;
        const skill = primarySkillRef ? config?.skills?.[primarySkillRef] : undefined;
        if (s.identity === 'boss') {
            role = 'area_controller';
        } else if (s.identity === 'elite') {
            role = 'heavy_guard';
        } else if (skill?.kind === 'ranged') {
            role = 'artillery';
        } else if (skill?.kind === 'charge') {
            role = 'charger';
        } else {
            if (flankerCount < maxFlankers) {
                role = 'flanker';
                flankerCount++;
            } else {
                role = 'frontline';
            }
        }
        return {
            ...s,
            nextDecisionTick: 0,
            readyAtTick: 0,
            sequence: 0,
            action: null,
            staggerUntilTick: 0,
            intentX: 0,
            intentY: 0,
            remainderX: '0',
            remainderY: '0',
            phase: 1,
            pendingPhase: null,
            cooldowns: {},
            tactics: {
                role,
                effects: [],
            },
        };
    });
};
function attackSnapshot(power: string, coefficient: Rational): Rational { let n = BigInt(power) * BigInt(coefficient.n), d = BigInt(coefficient.d), a = n, b = d; while (b) {
    const t = a % b;
    a = b;
    b = t;
} return { n: String(n / (a || 1n)), d: String(d / (a || 1n)) }; }
export type MonsterDefense = {
    armor: string;
    armorConstant: string;
    reduction: Rational;
};
export const defaultMonsterResist = (type: MonsterTemplate['type'], override: Partial<MonsterTemplate['resist']> = {}) => ({ bleed: type === 'undead' || type === 'mechanical', stagger: false, knockback: false, knockdown: false, ...override });
export type MonsterSimulationInput = EarthSimulationInput & {
    defense?: (tick: number) => MonsterDefense;
    playerResources?: (player: MonsterPlayer) => MonsterPlayer;
    onPlayerChange?: (player: MonsterPlayer) => void;
    /** Explicit final-room boss; absent keeps training/ordinary encounters unchanged. */
    terminalBossId?: string;
    monsterConfig: MonsterConfig;
    monsters: MonsterRuntime[];
    player: MonsterPlayer;
};
function segmentDistancePoint(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    const sq = dx * dx + dy * dy;
    if (sq < 1e-12) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / sq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
/** Integer-tick enemy nodes join the existing rational player scheduler before new input. */
export function advanceMonsterSimulation(input: MonsterSimulationInput) {
    const cfg = validateMonsterConfig(input.monsterConfig), monsters = input.monsters.map(validateMonsterRuntime).sort((a, b) => a.actorIndex - b.actorIndex), player = structuredClone(input.player);
    check(monsters.length === input.targets.length && monsters.length <= 8 && new Set(monsters.map(m => m.actorId)).size === monsters.length);
    for (const m of monsters)
        check(cfg.templates[m.templateRef] && input.targets.some(t => t.actorId === m.actorId && t.actorIndex === m.actorIndex));
    check(/^(0|[1-9][0-9]*)$/.test(player.hp) && BigInt(player.hp) <= BigInt(player.maxHp) && (player.lifeState === 'dead') === (player.hp === '0'));
    integer(player.controlledUntilTick, 0, Number.MAX_SAFE_INTEGER);
    if (player.deathIndex !== undefined) integer(player.deathIndex, 0, Number.MAX_SAFE_INTEGER);
    if (player.deathDeadline !== undefined) integer(player.deathDeadline, 0, Number.MAX_SAFE_INTEGER);
    if (player.deathAtTick !== undefined) integer(player.deathAtTick, 0, Number.MAX_SAFE_INTEGER);
    const emit = (events: CombatEvent[], m: MonsterRuntime, kind: CombatEvent['kind'], tick: number, damage: string | null = null, code: string | null = null) => events.push({ kind, eventId: `monster:${input.context.challengeId}:${input.context.sceneEpoch}:${m.actorIndex}:${m.sequence}:${kind}`, actorId: m.actorId, tick, seq: null, targetId: input.context.actorId, damage, critical: damage === null ? null : false, code });
    const markPlayerDead = (events: CombatEvent[], tick: number, m: MonsterRuntime) => {
        player.hp = '0';
        player.lifeState = 'dead';
        player.deathIndex = (player.deathIndex ?? 0) + 1;
        player.deathAtTick = tick;
        const baseTime = (input.context as any)?.serverTime ?? 0;
        const deathTime = baseTime + tick * 10;
        player.deathDeadline = (player.deathDeadline !== undefined && player.deathDeadline > deathTime)
            ? player.deathDeadline
            : (deathTime + 10_000);
        emit(events, m, 'death', tick, null, `DEATH_INDEX_${player.deathIndex}`);
    };
    let terminal: {bossActorId:string; at:Rational; derivedKills:string[]; playerDied:boolean; playerDeathAtTick:number|null} | null = null;
    let terminalFinalized=false;
    const finishTerminal=()=>{if(!terminal||terminalFinalized)return;terminal.playerDied=player.deathAtTick!==undefined;terminal.playerDeathAtTick=player.deathAtTick??null;if(player.lifeState==='dead'){player.lifeState='alive';player.hp=player.maxHp;player.controlledUntilTick=0;delete player.deathDeadline;}for(const m of monsters){m.action=null;m.pendingPhase=null;m.intentX=0;m.intentY=0;m.tactics.effects=[];}terminalFinalized=true;input.onPlayerChange?.(player);};
    const detectTerminal=(at:Rational,targets:CombatTarget[])=>{if(terminal||!input.terminalBossId||input.targets.find(t=>t.actorId===input.terminalBossId)?.lifeState!=='alive')return;const boss=targets.find(t=>t.actorId===input.terminalBossId);if(!boss||boss.hp!=='0')return;terminal={bossActorId:boss.actorId,at:structuredClone(at),derivedKills:[],playerDied:false,playerDeathAtTick:null};for(const t of targets){if(t.actorId!==boss.actorId&&t.lifeState!=='dead'){terminal.derivedKills.push(t.actorId);t.hp='0';t.lifeState='dead';t.downUntilTick=null;}}if(BigInt(at.n)%(10000n*BigInt(at.d))!==0n)finishTerminal();};
    let due = new Set<string>(), eventOffset = 0, playerAliveAtBoundary = false;
    let duePositions = new Map<string, {
        x: number;
        y: number;
    }>();
    const applyControls = (tick: number, movement: EarthSimulationInput['movement'], targets: CombatTarget[], events: CombatEvent[]) => {
        const newEvents = events.slice(eventOffset);
        eventOffset = events.length;
        for (const event of newEvents) {
            if (event.kind !== 'damage' || !event.code?.startsWith('DIRECT_') || BigInt(event.damage ?? '0') === 0n)
                continue;
            const m = monsters.find(m => m.actorId === event.targetId), t = targets.find(t => t.actorId === event.targetId);
            if (!m || !t || t.lifeState === 'dead')
                continue;
            const resist = cfg.templates[m.templateRef].resist;
            const isArmored = m.action !== null && m.action.superArmorEndTick !== undefined && tick < m.action.superArmorEndTick;
            if (!resist.stagger)
                m.staggerUntilTick = Math.max(m.staggerUntilTick, tick + cfg.control.staggerTicks);
            if (!resist.knockback && !isArmored) {
                const moved = advanceMovement({ x: String(t.x), y: String(t.y), remainderX: '0', remainderY: '0', intentX: 0, intentY: 0, facing: movement.facing }, [{ seq: 1, tick, kind: 'move', x: movement.facing * 1000, y: 0 }], tick, tick + 1, { ...input.movementConfig, walkSpeed: cfg.control.knockback * 100, runSpeed: cfg.control.knockback * 100, ySpeed: 0 }).state;
                t.x = Number(moved.x);
                t.y = Number(moved.y);
            }
        }
    };
    const result = advanceEarthSimulation({ ...input, context: { ...input.context, tagDamage: true, immuneToBleed: monsters.filter(m => cfg.templates[m.templateRef].resist.bleed).map(m => m.actorIndex) }, jointAfterNode: (at, movement, targets, events) => {applyControls(Number((BigInt(at.n) + 10000n * BigInt(at.d) - 1n) / (10000n * BigInt(at.d))), movement, targets, events);detectTerminal(at,targets);}, jointDead: tick => terminalFinalized || player.lifeState === 'dead', jointControlled: tick => terminalFinalized || player.lifeState === 'dead' || tick < player.controlledUntilTick, jointPrepare: (tick, targets) => {
            if (input.playerResources && player.lifeState === 'alive')
                Object.assign(player, input.playerResources(player));
            playerAliveAtBoundary = player.lifeState === 'alive';
            due = new Set(monsters.filter(m => {
                if (!m.action || m.action.released || m.action.hitTick !== tick) return false;
                const currentSkillRef = m.action.skillRef ?? cfg.templates[m.templateRef].skillRef;
                const skill = cfg.skills[currentSkillRef];
                if (!isMeleeSkill(skill)) return false;
                const isArmored = m.action.superArmorEndTick !== undefined && tick < m.action.superArmorEndTick;
                return targets.some(t => t.actorId === m.actorId && t.lifeState === 'alive' && (isArmored || (m.staggerUntilTick <= tick && (t.downUntilTick === null || t.downUntilTick <= tick))));
            }).map(m => m.actorId));
            duePositions = new Map(targets.filter(t => due.has(t.actorId)).map(t => [t.actorId, { x: t.x, y: t.y }]));
        }, joint: (tick, movement, targets, events) => {
            if(terminalFinalized)return true;
            // 1. Process in-flight tactical effects (projectiles)
            for (const m of monsters) {
                const surviving: ProjectileEffect[] = [];
                for (const eff of terminal ? [] : m.tactics.effects) {
                    const dx = eff.targetX - eff.x, dy = eff.targetY - eff.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist <= eff.speed) {
                        eff.x = eff.targetX;
                        eff.y = eff.targetY;
                    } else {
                        eff.x += Math.round((dx / dist) * eff.speed);
                        eff.y += Math.round((dy / dist) * eff.speed);
                    }
                    const px = Number(movement.x), py = Number(movement.y);
                    if (player.lifeState === 'alive' && Math.abs(px - eff.x) <= eff.radiusX && Math.abs(py - eff.y) <= eff.radiusY) {
                        const defense = input.defense?.(tick) ?? { armor: '0', armorConstant: '1', reduction: { n: '0', d: '1' } };
                        check(/^(0|[1-9][0-9]{0,11})$/.test(defense.armor) && /^[1-9][0-9]{0,11}$/.test(defense.armorConstant) && /^(0|[1-9][0-9]{0,9})$/.test(defense.reduction.n) && /^[1-9][0-9]{0,9}$/.test(defense.reduction.d) && BigInt(defense.reduction.n) <= BigInt(defense.reduction.d));
                        const n = BigInt(eff.damage.n) * BigInt(defense.armorConstant) * (BigInt(defense.reduction.d) - BigInt(defense.reduction.n)) / ((BigInt(defense.armorConstant) + BigInt(defense.armor)) * BigInt(defense.reduction.d) * BigInt(eff.damage.d)), hp = BigInt(player.hp);
                        player.hp = String(n >= hp ? 0n : hp - n);
                        emit(events, m, 'damage', tick, String(n));
                        if (player.hp === '0' && hp > 0n) {
                            markPlayerDead(events, tick, m);
                        } else if (n > 0n) {
                            player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + eff.staggerTicks);
                        }
                        input.onPlayerChange?.(player);
                    } else if (eff.x !== eff.targetX || eff.y !== eff.targetY) {
                        surviving.push(eff);
                    }
                }
                m.tactics.effects = surviving;
            }

            // 2. Count active special skills for difficulty concurrency limit
            const specialCap = cfg.tactics?.specialCap ?? 2;
            let activeSpecialCount = monsters.filter(o => {
                const s = cfg.skills[o.action?.skillRef ?? cfg.templates[o.templateRef].skillRef];
                return (o.action && (s?.kind === 'ranged' || s?.kind === 'charge' || s?.kind === 'roar' || s?.kind === 'combo')) || o.tactics.effects.length > 0;
            }).length;

            let currentRetreaters = 0;

            // 3. Process each monster runtime
            for (const m of monsters) {
                if(terminal&&!due.has(m.actorId))continue;
                const t = targets.find(t => t.actorId === m.actorId)!, template = cfg.templates[m.templateRef];
                t.controlImmune = template.resist.knockdown;

                const isDead = t.lifeState === 'dead' || BigInt(t.hp) === 0n;
                if (isDead) {
                    t.lifeState = 'dead';
                    m.pendingPhase = null;
                }

                // 50% HP threshold check: triggers pendingPhase = 2
                if (!isDead && BigInt(t.hp) * 2n <= BigInt(t.maxHp) && (m.phase ?? 1) === 1) {
                    if (m.pendingPhase === null || m.pendingPhase === undefined) {
                        m.pendingPhase = 2;
                    }
                    if (m.action === null) {
                        m.phase = 2;
                        m.pendingPhase = null;
                    }
                }

                const isArmored = m.action !== null && m.action.superArmorEndTick !== undefined && tick < m.action.superArmorEndTick;
                const isControlled = m.staggerUntilTick > tick || (t.downUntilTick !== null && t.downUntilTick > tick);
                const unavailable = isDead || (isControlled && !isArmored);
                const isWeak = m.weakUntilTick !== undefined && tick < m.weakUntilTick;

                if (unavailable && !due.has(m.actorId)) {
                    if (m.action !== null) {
                        m.action = null;
                        if (!isDead && m.pendingPhase !== null && m.pendingPhase !== undefined) {
                            m.phase = m.pendingPhase;
                            m.pendingPhase = null;
                        }
                    }
                    m.intentX = 0;
                    m.intentY = 0;
                    continue;
                }

                if (m.action !== null) {
                    const a = m.action;
                    const currentSkillRef = a.skillRef ?? template.skillRef;
                    const skill = cfg.skills[currentSkillRef];

                    if (isMeleeSkill(skill)) {
                        if (!a.released && tick >= a.hitTick) {
                            a.released = true;
                            const at = duePositions.get(m.actorId) ?? t, dx = (Number(movement.x) - at.x) * a.facing;
                            if ((player.lifeState === 'alive' || due.has(m.actorId) && playerAliveAtBoundary) && dx >= 0 && dx <= skill.rangeX && Math.abs(Number(movement.y) - at.y) <= skill.rangeY) {
                                const defense = input.defense?.(tick) ?? { armor: '0', armorConstant: '1', reduction: { n: '0', d: '1' } };
                                check(/^(0|[1-9][0-9]{0,11})$/.test(defense.armor) && /^[1-9][0-9]{0,11}$/.test(defense.armorConstant) && /^(0|[1-9][0-9]{0,9})$/.test(defense.reduction.n) && /^[1-9][0-9]{0,9}$/.test(defense.reduction.d) && BigInt(defense.reduction.n) <= BigInt(defense.reduction.d));
                                const n = BigInt(a.damage.n) * BigInt(defense.armorConstant) * (BigInt(defense.reduction.d) - BigInt(defense.reduction.n)) / ((BigInt(defense.armorConstant) + BigInt(defense.armor)) * BigInt(defense.reduction.d) * BigInt(a.damage.d)), hp = BigInt(player.hp);
                                player.hp = String(n >= hp ? 0n : hp - n);
                                emit(events, m, 'damage', tick, String(n));
                                if (player.hp === '0' && hp > 0n) {
                                    markPlayerDead(events, tick, m);
                                }
                                else if (n > 0n)
                                    player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + skill.staggerTicks);
                                input.onPlayerChange?.(player);
                            }
                        }
                        if (tick >= a.endTick || unavailable) {
                            m.action = null;
                            if (!isDead && m.pendingPhase !== null && m.pendingPhase !== undefined) {
                                m.phase = m.pendingPhase;
                                m.pendingPhase = null;
                            }
                        }
                    } else if (skill.kind === 'ranged') {
                        if (!a.released && tick >= a.hitTick) {
                            a.released = true;
                            m.tactics.effects.push({
                                id: `projectile:${input.context.challengeId}:${input.context.sceneEpoch}:${m.actorIndex}:${m.sequence}`,
                                kind: 'projectile',
                                x: t.x,
                                y: t.y,
                                targetX: Number(movement.x),
                                targetY: Number(movement.y),
                                speed: skill.projectileSpeed,
                                radiusX: skill.projectileRadiusX,
                                radiusY: skill.projectileRadiusY,
                                damage: a.damage,
                                facing: a.facing,
                                staggerTicks: skill.staggerTicks,
                                sourceActorId: m.actorId,
                                sourceActorIndex: m.actorIndex,
                                sourceSequence: m.sequence,
                            });
                        }
                        if (tick >= a.endTick || unavailable) {
                            m.action = null;
                            if (!isDead && m.pendingPhase !== null && m.pendingPhase !== undefined) {
                                m.phase = m.pendingPhase;
                                m.pendingPhase = null;
                            }
                        }
                    } else if (skill.kind === 'charge') {
                        const activeEnd = a.activeEndTick ?? (a.hitTick + skill.activeTicks);
                        if (tick >= a.hitTick && tick < activeEnd) {
                            if (tick === a.hitTick) {
                                a.facing = Number(movement.x) >= t.x ? 1 : -1;
                            }
                            const step = advanceMovement(
                                { x: String(t.x), y: String(t.y), facing: a.facing, intentX: 0, intentY: 0, remainderX: m.remainderX, remainderY: m.remainderY },
                                [{ seq: 1, tick, kind: 'move', x: a.facing * 1000, y: 0 }],
                                tick,
                                tick + 1,
                                { ...input.movementConfig, walkSpeed: skill.sweepSpeed * 100, runSpeed: skill.sweepSpeed * 100, ySpeed: 0 }
                            ).state;
                            t.x = Number(step.x);
                            t.y = Number(step.y);
                            m.remainderX = step.remainderX;
                            m.remainderY = step.remainderY;

                            if (!a.released && player.lifeState === 'alive') {
                                const cdx = Math.abs(Number(movement.x) - t.x);
                                const cdy = Math.abs(Number(movement.y) - t.y);
                                if (cdx <= skill.contactRadius && cdy <= skill.contactRadius) {
                                    a.released = true;
                                    const defense = input.defense?.(tick) ?? { armor: '0', armorConstant: '1', reduction: { n: '0', d: '1' } };
                                    check(/^(0|[1-9][0-9]{0,11})$/.test(defense.armor) && /^[1-9][0-9]{0,11}$/.test(defense.armorConstant) && /^(0|[1-9][0-9]{0,9})$/.test(defense.reduction.n) && /^[1-9][0-9]{0,9}$/.test(defense.reduction.d) && BigInt(defense.reduction.n) <= BigInt(defense.reduction.d));
                                    const n = BigInt(a.damage.n) * BigInt(defense.armorConstant) * (BigInt(defense.reduction.d) - BigInt(defense.reduction.n)) / ((BigInt(defense.armorConstant) + BigInt(defense.armor)) * BigInt(defense.reduction.d) * BigInt(a.damage.d)), hp = BigInt(player.hp);
                                    player.hp = String(n >= hp ? 0n : hp - n);
                                    emit(events, m, 'damage', tick, String(n));
                                    if (player.hp === '0' && hp > 0n) {
                                        markPlayerDead(events, tick, m);
                                    } else if (n > 0n)
                                        player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + skill.staggerTicks);
                                    input.onPlayerChange?.(player);
                                }
                            }
                        }
                        if (tick >= a.endTick || unavailable) {
                            m.action = null;
                            if (!isDead && m.pendingPhase !== null && m.pendingPhase !== undefined) {
                                m.phase = m.pendingPhase;
                                m.pendingPhase = null;
                            }
                        }
                    } else if (skill.kind === 'roar') {
                        if (!a.contactsDone) a.contactsDone = [];
                        const contactTicks = a.contactTicks ?? skill.contactTicks.map(tOffset => a.startTick + tOffset);
                        for (const cTick of contactTicks) {
                            if (!a.contactsDone.includes(cTick) && tick >= cTick) {
                                a.contactsDone.push(cTick);
                                const pdx = (Number(movement.x) - t.x) * a.facing;
                                const pdy = Number(movement.y) - t.y;
                                const pdist = Math.hypot(pdx, pdy);
                                const inSector = pdx > 0 && pdist <= skill.reach && Math.atan2(Math.abs(pdy), pdx) <= Math.PI / 6;
                                if (inSector && (player.lifeState === 'alive' || (due.has(m.actorId) && playerAliveAtBoundary))) {
                                    const defense = input.defense?.(tick) ?? { armor: '0', armorConstant: '1', reduction: { n: '0', d: '1' } };
                                    check(/^(0|[1-9][0-9]{0,11})$/.test(defense.armor) && /^[1-9][0-9]{0,11}$/.test(defense.armorConstant) && /^(0|[1-9][0-9]{0,9})$/.test(defense.reduction.n) && /^[1-9][0-9]{0,9}$/.test(defense.reduction.d) && BigInt(defense.reduction.n) <= BigInt(defense.reduction.d));
                                    const n = BigInt(a.damage.n) * BigInt(defense.armorConstant) * (BigInt(defense.reduction.d) - BigInt(defense.reduction.n)) / ((BigInt(defense.armorConstant) + BigInt(defense.armor)) * BigInt(defense.reduction.d) * BigInt(a.damage.d));
                                    const hp = BigInt(player.hp);
                                    const actual = n >= hp ? hp : n;
                                    player.hp = String(hp - actual);
                                    emit(events, m, 'damage', tick, String(actual));
                                    if (player.hp === '0' && hp > 0n) {
                                        markPlayerDead(events, tick, m);
                                    } else {
                                        const acc = BigInt(a.accumulatedRoarDamage ?? '0') + actual;
                                        a.accumulatedRoarDamage = String(acc);
                                        const maxHp = BigInt(a.maxHpSnapshot ?? player.maxHp);
                                        if (!a.roarKnocked && maxHp > 0n && acc * 100n >= maxHp * 15n) {
                                            a.roarKnocked = true;
                                            player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + 80);
                                            emit(events, m, 'knockdown', tick);
                                        } else if (actual > 0n) {
                                            player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + skill.staggerTicks);
                                        }
                                        const kdx = Number(movement.x) - t.x;
                                        const kdy = Number(movement.y) - t.y;
                                        const kdist = Math.hypot(kdx, kdy);
                                        const dirX = kdist < 1e-9 ? a.facing : kdx / kdist;
                                        const dirY = kdist < 1e-9 ? 0 : kdy / kdist;
                                        const bounds = input.movementConfig.bounds;
                                        const footprint = input.movementConfig.footprint;
                                        const minX = bounds.minX + footprint;
                                        const maxX = bounds.maxX - footprint;
                                        const minY = bounds.minY + footprint;
                                        const maxY = bounds.maxY - footprint;
                                        const newPx = Math.round(Number(movement.x) + 12000 * dirX);
                                        const newPy = Math.round(Number(movement.y) + 12000 * dirY);
                                        movement.x = String(Math.max(minX, Math.min(maxX, newPx)));
                                        movement.y = String(Math.max(minY, Math.min(maxY, newPy)));
                                    }
                                    input.onPlayerChange?.(player);
                                }
                            }
                        }
                        if (a.contactsDone.length >= contactTicks.length) {
                            a.released = true;
                        }
                        if (tick >= a.endTick || unavailable) {
                            m.action = null;
                            if (!isDead && m.pendingPhase !== null && m.pendingPhase !== undefined) {
                                m.phase = m.pendingPhase;
                                m.pendingPhase = null;
                            }
                        }
                    } else if (skill.kind === 'combo') {
                        const age = tick - a.startTick;
                        if (!a.trampleDone) a.trampleDone = [];
                        const trampleTicks = skill.trampleTicks.map(tOffset => a.startTick + tOffset);
                        for (const tTick of trampleTicks) {
                            if (!a.trampleDone.includes(tTick) && tick >= tTick) {
                                a.trampleDone.push(tTick);
                                const pdist = Math.hypot(Number(movement.x) - t.x, Number(movement.y) - t.y);
                                if ((player.lifeState === 'alive' || (due.has(m.actorId) && playerAliveAtBoundary)) && pdist <= 72000) {
                                    const trampleDmg = attackSnapshot(m.attackPower, skill.trampleCoefficient);
                                    const defense = input.defense?.(tick) ?? { armor: '0', armorConstant: '1', reduction: { n: '0', d: '1' } };
                                    check(/^(0|[1-9][0-9]{0,11})$/.test(defense.armor) && /^[1-9][0-9]{0,11}$/.test(defense.armorConstant) && /^(0|[1-9][0-9]{0,9})$/.test(defense.reduction.n) && /^[1-9][0-9]{0,9}$/.test(defense.reduction.d) && BigInt(defense.reduction.n) <= BigInt(defense.reduction.d));
                                    const n = BigInt(trampleDmg.n) * BigInt(defense.armorConstant) * (BigInt(defense.reduction.d) - BigInt(defense.reduction.n)) / ((BigInt(defense.armorConstant) + BigInt(defense.armor)) * BigInt(defense.reduction.d) * BigInt(trampleDmg.d));
                                    const hp = BigInt(player.hp);
                                    const actual = n >= hp ? hp : n;
                                    player.hp = String(hp - actual);
                                    emit(events, m, 'damage', tick, String(actual));
                                    if (player.hp === '0' && hp > 0n) {
                                        markPlayerDead(events, tick, m);
                                    } else if (actual > 0n) {
                                        player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + skill.staggerTicks);
                                    }
                                    input.onPlayerChange?.(player);
                                }
                            }
                        }

                        if (age >= skill.lockTick && !a.chargeLocked) {
                            a.chargeLocked = true;
                            a.facing = Number(movement.x) >= t.x ? 1 : -1;
                        }

                        if (age >= skill.chargeStartTick && a.chargeEndTick === undefined) {
                            const remaining = Math.max(0, skill.maxTravelDistance - (a.travelled ?? 0));
                            const step = Math.min(skill.chargeSpeed, remaining);
                            let targetX = t.x + step * a.facing;
                            let wallHit = false;

                            const bounds = input.movementConfig.bounds;
                            const minX = bounds.minX + skill.bodyRadius;
                            const maxX = bounds.maxX - skill.bodyRadius;

                            if (a.facing === 1 && targetX >= maxX) {
                                targetX = maxX;
                                wallHit = true;
                            } else if (a.facing === -1 && targetX <= minX) {
                                targetX = minX;
                                wallHit = true;
                            }

                            if (input.movementConfig.walls) {
                                for (const w of input.movementConfig.walls) {
                                    if (t.y > w.minY - skill.bodyRadius && t.y < w.maxY + skill.bodyRadius) {
                                        if (a.facing === 1 && t.x <= w.minX - skill.bodyRadius && targetX >= w.minX - skill.bodyRadius) {
                                            targetX = w.minX - skill.bodyRadius;
                                            wallHit = true;
                                        } else if (a.facing === -1 && t.x >= w.maxX + skill.bodyRadius && targetX <= w.maxX + skill.bodyRadius) {
                                            targetX = w.maxX + skill.bodyRadius;
                                            wallHit = true;
                                        }
                                    }
                                }
                            }

                            const beforeX = t.x;
                            t.x = targetX;
                            const moved = Math.abs(t.x - beforeX);
                            a.travelled = (a.travelled ?? 0) + moved;

                            if (!a.chargeHit && player.lifeState === 'alive') {
                                const px = Number(movement.x);
                                const py = Number(movement.y);
                                const segDist = segmentDistancePoint(px, py, beforeX, t.y, t.x, t.y);
                                if (segDist <= skill.contactRadius) {
                                    a.chargeHit = true;
                                    const chargeDamage = attackSnapshot(m.attackPower, skill.chargeCoefficient);
                                    const defense = input.defense?.(tick) ?? { armor: '0', armorConstant: '1', reduction: { n: '0', d: '1' } };
                                    check(/^(0|[1-9][0-9]{0,11})$/.test(defense.armor) && /^[1-9][0-9]{0,11}$/.test(defense.armorConstant) && /^(0|[1-9][0-9]{0,9})$/.test(defense.reduction.n) && /^[1-9][0-9]{0,9}$/.test(defense.reduction.d) && BigInt(defense.reduction.n) <= BigInt(defense.reduction.d));
                                    const n = BigInt(chargeDamage.n) * BigInt(defense.armorConstant) * (BigInt(defense.reduction.d) - BigInt(defense.reduction.n)) / ((BigInt(defense.armorConstant) + BigInt(defense.armor)) * BigInt(defense.reduction.d) * BigInt(chargeDamage.d));
                                    const hp = BigInt(player.hp);
                                    const actual = n >= hp ? hp : n;
                                    player.hp = String(hp - actual);
                                    emit(events, m, 'damage', tick, String(actual));
                                    if (player.hp === '0' && hp > 0n) {
                                        markPlayerDead(events, tick, m);
                                    } else if (actual > 0n) {
                                        player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + skill.staggerTicks);
                                    }
                                    input.onPlayerChange?.(player);
                                }
                            }

                            if (wallHit || a.travelled >= skill.maxTravelDistance) {
                                a.chargeEndTick = tick;
                                a.superArmorEndTick = tick;
                                if (wallHit) {
                                    a.wallHit = true;
                                    a.endTick = tick + skill.wallWeaknessTicks;
                                    m.weakUntilTick = tick + skill.wallWeaknessTicks;
                                } else {
                                    a.wallHit = false;
                                    a.endTick = tick + skill.recoveryTicks;
                                }
                            }
                        }

                        if (tick >= a.endTick || unavailable) {
                            m.action = null;
                            if (!isDead && m.pendingPhase !== null && m.pendingPhase !== undefined) {
                                m.phase = m.pendingPhase;
                                m.pendingPhase = null;
                            }
                        }
                    }
                }

                if (unavailable || isWeak)
                    continue;
                if (player.lifeState === 'dead' || m.action) {
                    m.intentX = 0;
                    m.intentY = 0;
                    continue;
                }

                const dx = Number(movement.x) - t.x, dy = Number(movement.y) - t.y;
                const distToPlayer = Math.hypot(dx, dy);

                // Skill candidate selection
                let candidateRefs = template.skillRefs && template.skillRefs.length > 0 ? template.skillRefs : [template.skillRef];
                if (m.identity === 'boss') {
                    if ((m.phase ?? 1) === 1) {
                        candidateRefs = candidateRefs.filter(ref => !ref.endsWith('_combo') && !ref.endsWith('_roar_p2'));
                    } else {
                        candidateRefs = candidateRefs.filter(ref => !ref.endsWith('_roar_p1'));
                    }
                }
                let skillTriggered = false;

                if (!m.cooldowns) m.cooldowns = {};

                for (const ref of candidateRefs) {
                    const skill = cfg.skills[ref];
                    if (!skill) continue;
                    const readyAt = m.cooldowns[ref] ?? (template.skillRefs ? 0 : m.readyAtTick);
                    if (tick < readyAt) continue;

                    if (skill.kind === 'ranged') {
                        // Check retreat condition
                        if (cfg.tactics && cfg.tactics.maxConcurrentRetreaters > 0 && distToPlayer < cfg.tactics.retreatTriggerDistance) {
                            if (currentRetreaters < cfg.tactics.maxConcurrentRetreaters) {
                                currentRetreaters++;
                                const retreatDest = tacticalDestination('artillery', m.actorIndex, t, { x: Number(movement.x), y: Number(movement.y) }, cfg.tactics, true);
                                if (retreatDest) {
                                    if (tick >= m.nextDecisionTick) {
                                        m.intentX = Math.sign(retreatDest.x - t.x) * 1000;
                                        m.intentY = Math.sign(retreatDest.y - t.y) * 1000;
                                        m.nextDecisionTick = tick + cfg.decisionTicks;
                                    }
                                    const step = advanceMovement(
                                        { x: String(t.x), y: String(t.y), facing: dx >= 0 ? 1 : -1, intentX: 0, intentY: 0, remainderX: m.remainderX, remainderY: m.remainderY },
                                        [{ seq: 1, tick, kind: 'move', x: m.intentX, y: m.intentY }],
                                        tick,
                                        tick + 1,
                                        { ...input.movementConfig, walkSpeed: skill.speed, runSpeed: skill.speed, ySpeed: skill.speed }
                                    ).state;
                                    t.x = Number(step.x);
                                    t.y = Number(step.y);
                                    m.remainderX = step.remainderX;
                                    m.remainderY = step.remainderY;
                                    skillTriggered = true;
                                    break;
                                }
                            }
                        }

                        if (distToPlayer <= skill.reach) {
                            m.intentX = 0;
                            m.intentY = 0;
                            if (tick >= m.nextDecisionTick && tick >= readyAt) {
                                if (activeSpecialCount < specialCap) {
                                    activeSpecialCount++;
                                    m.action = {
                                        startTick: tick,
                                        hitTick: tick + skill.windupTicks,
                                        endTick: tick + skill.windupTicks + skill.recoveryTicks,
                                        facing: dx >= 0 ? 1 : -1,
                                        damage: attackSnapshot(m.attackPower, skill.coefficient),
                                        released: false,
                                        skillRef: ref,
                                    };
                                    m.readyAtTick = tick + skill.cooldownTicks;
                                    m.cooldowns[ref] = tick + skill.cooldownTicks;
                                    m.sequence++;
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                    emit(events, m, 'actionAccepted', tick);
                                } else {
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                }
                            }
                            skillTriggered = true;
                            break;
                        }
                    } else if (skill.kind === 'charge') {
                        if (distToPlayer <= skill.reach) {
                            m.intentX = 0;
                            m.intentY = 0;
                            if (tick >= m.nextDecisionTick && tick >= readyAt) {
                                if (activeSpecialCount < specialCap) {
                                    activeSpecialCount++;
                                    m.action = {
                                        startTick: tick,
                                        hitTick: tick + skill.windupTicks,
                                        activeEndTick: tick + skill.windupTicks + skill.activeTicks,
                                        endTick: tick + skill.windupTicks + skill.activeTicks + skill.recoveryTicks,
                                        facing: dx >= 0 ? 1 : -1,
                                        damage: attackSnapshot(m.attackPower, skill.coefficient),
                                        released: false,
                                        skillRef: ref,
                                    };
                                    m.readyAtTick = tick + skill.cooldownTicks;
                                    m.cooldowns[ref] = tick + skill.cooldownTicks;
                                    m.sequence++;
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                    emit(events, m, 'actionAccepted', tick);
                                } else {
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                }
                            }
                            skillTriggered = true;
                            break;
                        }
                    } else if (skill.kind === 'roar') {
                        if (distToPlayer <= skill.reach) {
                            m.intentX = 0;
                            m.intentY = 0;
                            if (tick >= m.nextDecisionTick && tick >= readyAt) {
                                if (activeSpecialCount < specialCap) {
                                    activeSpecialCount++;
                                    m.action = {
                                        startTick: tick,
                                        hitTick: tick + skill.windupTicks,
                                        endTick: tick + skill.superArmorTicks + skill.recoveryTicks,
                                        superArmorEndTick: tick + skill.superArmorTicks,
                                        facing: dx >= 0 ? 1 : -1,
                                        damage: attackSnapshot(m.attackPower, skill.coefficient),
                                        released: false,
                                        skillRef: ref,
                                        kind: 'roar',
                                        contactTicks: skill.contactTicks.map(dt => tick + dt),
                                        contactsDone: [],
                                        maxHpSnapshot: player.maxHp,
                                        accumulatedRoarDamage: '0',
                                        roarKnocked: false,
                                    };
                                    m.readyAtTick = tick + skill.cooldownTicks;
                                    m.cooldowns[ref] = tick + skill.cooldownTicks;
                                    m.sequence++;
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                    emit(events, m, 'actionAccepted', tick);
                                } else {
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                }
                            }
                            skillTriggered = true;
                            break;
                        }
                    } else if (skill.kind === 'combo') {
                        if (distToPlayer <= skill.reach) {
                            m.intentX = 0;
                            m.intentY = 0;
                            if (tick >= m.nextDecisionTick && tick >= readyAt) {
                                if (activeSpecialCount < specialCap) {
                                    activeSpecialCount++;
                                    m.action = {
                                        startTick: tick,
                                        hitTick: tick + skill.trampleTicks[0],
                                        endTick: tick + 800,
                                        superArmorEndTick: tick + 800,
                                        facing: dx >= 0 ? 1 : -1,
                                        damage: attackSnapshot(m.attackPower, skill.trampleCoefficient),
                                        released: false,
                                        skillRef: ref,
                                        kind: 'combo',
                                        trampleDone: [],
                                        chargeLocked: false,
                                        chargeHit: false,
                                        travelled: 0,
                                        wallHit: false,
                                    };
                                    m.readyAtTick = tick + skill.cooldownTicks;
                                    m.cooldowns[ref] = tick + skill.cooldownTicks;
                                    m.sequence++;
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                    emit(events, m, 'actionAccepted', tick);
                                } else {
                                    m.nextDecisionTick = tick + cfg.decisionTicks;
                                }
                            }
                            skillTriggered = true;
                            break;
                        }
                    } else if (isMeleeSkill(skill)) {
                        if (Math.abs(dx) <= skill.rangeX && Math.abs(dy) <= skill.rangeY) {
                            m.intentX = 0;
                            m.intentY = 0;
                            if (tick >= m.nextDecisionTick && tick >= readyAt) {
                                const superArmorEndTick = skill.superArmorTicks !== undefined ? tick + skill.superArmorTicks : undefined;
                                m.action = {
                                    startTick: tick,
                                    hitTick: tick + skill.windupTicks,
                                    endTick: tick + skill.windupTicks + skill.recoveryTicks,
                                    facing: dx >= 0 ? 1 : -1,
                                    damage: attackSnapshot(m.attackPower, skill.coefficient),
                                    released: false,
                                    skillRef: ref,
                                    ...(superArmorEndTick !== undefined ? { superArmorEndTick } : {}),
                                };
                                m.readyAtTick = tick + skill.cooldownTicks;
                                m.cooldowns[ref] = tick + skill.cooldownTicks;
                                m.sequence++;
                                m.nextDecisionTick = tick + cfg.decisionTicks;
                                emit(events, m, 'actionAccepted', tick);
                            }
                            skillTriggered = true;
                            break;
                        }
                    }
                }

                if (skillTriggered)
                    continue;

                // General movement towards tactical target
                let targetDest = { x: Number(movement.x), y: Number(movement.y) };
                if (cfg.tactics && m.tactics?.role === 'flanker') {
                    const flankDest = tacticalDestination('flanker', m.actorIndex, t, targetDest, cfg.tactics, false);
                    if (flankDest)
                        targetDest = flankDest;
                } else if (cfg.tactics && (m.tactics?.role === 'heavy_guard' || m.tactics?.role === 'area_controller')) {
                    const tacticDest = tacticalDestination(m.tactics.role, m.actorIndex, t, targetDest, cfg.tactics, false);
                    if (tacticDest)
                        targetDest = tacticDest;
                }
                const moveDx = targetDest.x - t.x, moveDy = targetDest.y - t.y;
                if (tick >= m.nextDecisionTick) {
                    m.intentX = Math.sign(moveDx) * 1000;
                    m.intentY = Math.sign(moveDy) * 1000;
                    m.nextDecisionTick = tick + cfg.decisionTicks;
                }
                const primarySkill = cfg.skills[template.skillRefs?.[0] ?? template.skillRef];
                const moveSpeed = primarySkill?.speed ?? 1000;
                const step = advanceMovement(
                    { x: String(t.x), y: String(t.y), facing: dx >= 0 ? 1 : -1, intentX: 0, intentY: 0, remainderX: m.remainderX, remainderY: m.remainderY },
                    [{ seq: 1, tick, kind: 'move', x: m.intentX, y: m.intentY }],
                    tick,
                    tick + 1,
                    { ...input.movementConfig, walkSpeed: moveSpeed, runSpeed: moveSpeed, ySpeed: moveSpeed }
                ).state;
                t.x = Number(step.x);
                t.y = Number(step.y);
                m.remainderX = step.remainderX;
                m.remainderY = step.remainderY;
            }
            if(terminal)finishTerminal();
            return terminalFinalized || player.lifeState === 'dead' || tick < player.controlledUntilTick;
        } });
    finishTerminal();
    return { ...result, monsters, player, terminal };
}
