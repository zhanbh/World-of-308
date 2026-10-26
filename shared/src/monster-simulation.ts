import { advanceEarthSimulation } from './earth-simulation.ts';
import type { EarthSimulationInput } from './earth-simulation.ts';
import type { CombatEvent, CombatTarget, Rational } from './basic-combat-kernel.ts';
import { advanceMovement } from './movement-kernel.ts';
export type MonsterTemplate = {
    type: 'humanoid' | 'beast' | 'undead' | 'mechanical';
    skillRef: string;
    behavior: 'chase';
    rewardTag: string;
    resist: {
        bleed: boolean;
        stagger: boolean;
        knockback: boolean;
        knockdown: boolean;
    };
};
export type MeleeSkill = {
    kind: 'melee';
    windupTicks: number;
    recoveryTicks: number;
    cooldownTicks: number;
    rangeX: number;
    rangeY: number;
    speed: number;
    coefficient: Rational;
    staggerTicks: number;
};
export type MonsterConfig = {
    version: 'local-melee-v1';
    decisionTicks: number;
    control: {
        staggerTicks: number;
        knockback: number;
    };
    templates: Record<string, MonsterTemplate>;
    skills: Record<string, MeleeSkill>;
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
    };
    staggerUntilTick: number;
    intentX: number;
    intentY: number;
    remainderX: string;
    remainderY: string;
};
export type MonsterPlayer = {
    hp: string;
    maxHp: string;
    lifeState: 'alive' | 'dead';
    controlledUntilTick: number;
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
    fields(c, ['version', 'decisionTicks', 'control', 'templates', 'skills']);
    check(c.version === 'local-melee-v1');
    integer(c.decisionTicks, 1, 100);
    fields(c.control, ['staggerTicks', 'knockback']);
    integer(c.control.staggerTicks, 0, 100);
    integer(c.control.knockback, 0, 100000);
    check(Object.keys(c.templates).length > 0 && Object.keys(c.templates).length <= 32 && Object.keys(c.skills).length > 0 && Object.keys(c.skills).length <= 32);
    for (const [id, t] of Object.entries(c.templates)) {
        token(id);
        fields(t, ['type', 'skillRef', 'behavior', 'rewardTag', 'resist']);
        check(['humanoid', 'beast', 'undead', 'mechanical'].includes(t.type) && t.behavior === 'chase');
        token(t.rewardTag);
        token(t.skillRef);
        check(Object.hasOwn(c.skills, t.skillRef));
        fields(t.resist, ['bleed', 'stagger', 'knockback', 'knockdown']);
        for (const r of Object.values(t.resist))
            check(typeof r === 'boolean');
    }
    for (const [id, s] of Object.entries(c.skills)) {
        token(id);
        fields(s, ['kind', 'windupTicks', 'recoveryTicks', 'cooldownTicks', 'rangeX', 'rangeY', 'speed', 'coefficient', 'staggerTicks']);
        check(s.kind === 'melee');
        for (const k of ['windupTicks', 'recoveryTicks', 'cooldownTicks'] as const)
            integer(s[k], 1, 10000);
        check(s.cooldownTicks >= Math.max(50, s.windupTicks + s.recoveryTicks));
        for (const k of ['rangeX', 'rangeY', 'speed', 'staggerTicks'] as const)
            integer(s[k], 0, 1000000);
        fields(s.coefficient, ['n', 'd']);
        check(/^(0|[1-9][0-9]{0,5})$/.test(s.coefficient.n) && /^[1-9][0-9]{0,5}$/.test(s.coefficient.d) && BigInt(s.coefficient.n) <= 100n * BigInt(s.coefficient.d));
    }
    return structuredClone(c);
}
export function validateMonsterRuntime(v: unknown): MonsterRuntime {
    const m = v as MonsterRuntime;
    fields(m, ['actorId', 'actorIndex', 'templateRef', 'identity', 'attackPower', 'nextDecisionTick', 'readyAtTick', 'sequence', 'action', 'staggerUntilTick', 'intentX', 'intentY', 'remainderX', 'remainderY']);
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
    if (m.action) {
        const a = m.action;
        fields(a, ['startTick', 'hitTick', 'endTick', 'facing', 'damage', 'released']);
        integer(a.startTick);
        integer(a.hitTick, a.startTick + 1);
        integer(a.endTick, a.hitTick + 1);
        fields(a.damage, ['n', 'd']);
        check(/^(0|[1-9][0-9]{0,18})$/.test(a.damage.n) && /^[1-9][0-9]{0,5}$/.test(a.damage.d));
        check((a.facing === 1 || a.facing === -1) && typeof a.released === 'boolean');
    }
    return structuredClone(m);
}
export const initialMonsterState = (spawns: {
    actorId: string;
    actorIndex: number;
    templateRef: string;
    identity: 'ordinary' | 'elite' | 'boss';
    attackPower: string;
}[]): MonsterRuntime[] => spawns.map(s => ({ ...s, nextDecisionTick: 0, readyAtTick: 0, sequence: 0, action: null, staggerUntilTick: 0, intentX: 0, intentY: 0, remainderX: '0', remainderY: '0' }));
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
    monsterConfig: MonsterConfig;
    monsters: MonsterRuntime[];
    player: MonsterPlayer;
};
/** Integer-tick enemy nodes join the existing rational player scheduler before new input. */
export function advanceMonsterSimulation(input: MonsterSimulationInput) {
    const cfg = validateMonsterConfig(input.monsterConfig), monsters = input.monsters.map(validateMonsterRuntime).sort((a, b) => a.actorIndex - b.actorIndex), player = structuredClone(input.player);
    check(monsters.length === input.targets.length && monsters.length <= 8 && new Set(monsters.map(m => m.actorId)).size === monsters.length);
    for (const m of monsters)
        check(cfg.templates[m.templateRef] && input.targets.some(t => t.actorId === m.actorId && t.actorIndex === m.actorIndex));
    check(/^(0|[1-9][0-9]*)$/.test(player.hp) && BigInt(player.hp) <= BigInt(player.maxHp) && (player.lifeState === 'dead') === (player.hp === '0'));
    integer(player.controlledUntilTick, 0, Number.MAX_SAFE_INTEGER);
    const emit = (events: CombatEvent[], m: MonsterRuntime, kind: CombatEvent['kind'], tick: number, damage: string | null = null) => events.push({ kind, eventId: `monster:${input.context.challengeId}:${input.context.sceneEpoch}:${m.actorIndex}:${m.sequence}:${kind}`, actorId: m.actorId, tick, seq: null, targetId: input.context.actorId, damage, critical: damage === null ? null : false, code: null });
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
            if (!resist.stagger)
                m.staggerUntilTick = Math.max(m.staggerUntilTick, tick + cfg.control.staggerTicks);
            if (!resist.knockback) {
                const moved = advanceMovement({ x: String(t.x), y: String(t.y), remainderX: '0', remainderY: '0', intentX: 0, intentY: 0, facing: movement.facing }, [{ seq: 1, tick, kind: 'move', x: movement.facing * 1000, y: 0 }], tick, tick + 1, { ...input.movementConfig, walkSpeed: cfg.control.knockback * 100, runSpeed: cfg.control.knockback * 100, ySpeed: 0 }).state;
                t.x = Number(moved.x);
                t.y = Number(moved.y);
            }
        }
    };
    const result = advanceEarthSimulation({ ...input, context: { ...input.context, tagDamage: true, immuneToBleed: monsters.filter(m => cfg.templates[m.templateRef].resist.bleed).map(m => m.actorIndex) }, jointAfterNode: (at, movement, targets, events) => applyControls(Number((BigInt(at.n) + 10000n * BigInt(at.d) - 1n) / (10000n * BigInt(at.d))), movement, targets, events), jointControlled: tick => player.lifeState === 'dead' || tick < player.controlledUntilTick, jointPrepare: (tick, targets) => {
            if (input.playerResources)
                Object.assign(player, input.playerResources(player));
            playerAliveAtBoundary = player.lifeState === 'alive';
            due = new Set(monsters.filter(m => m.action && !m.action.released && m.action.hitTick === tick && targets.some(t => t.actorId === m.actorId && t.lifeState === 'alive' && m.staggerUntilTick <= tick && (t.downUntilTick === null || t.downUntilTick <= tick))).map(m => m.actorId));
            duePositions = new Map(targets.filter(t => due.has(t.actorId)).map(t => [t.actorId, { x: t.x, y: t.y }]));
        }, joint: (tick, movement, targets, events) => {
            for (const m of monsters) {
                const t = targets.find(t => t.actorId === m.actorId)!, template = cfg.templates[m.templateRef], skill = cfg.skills[template.skillRef];
                t.controlImmune = template.resist.knockdown;
                const unavailable = t.lifeState === 'dead' || m.staggerUntilTick > tick || t.downUntilTick !== null && t.downUntilTick > tick;
                if (unavailable && !due.has(m.actorId)) {
                    m.action = null;
                    m.intentX = 0;
                    m.intentY = 0;
                    continue;
                }
                if (m.action) {
                    const a = m.action;
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
                                player.lifeState = 'dead';
                                emit(events, m, 'death', tick);
                            }
                            else if (n > 0n)
                                player.controlledUntilTick = Math.max(player.controlledUntilTick, tick + skill.staggerTicks);
                            input.onPlayerChange?.(player);
                        }
                    }
                    if (tick >= a.endTick || unavailable)
                        m.action = null;
                }
                if (unavailable)
                    continue;
                if (player.lifeState === 'dead' || m.action) {
                    m.intentX = 0;
                    m.intentY = 0;
                    continue;
                }
                const dx = Number(movement.x) - t.x, dy = Number(movement.y) - t.y;
                if (Math.abs(dx) <= skill.rangeX && Math.abs(dy) <= skill.rangeY) {
                    m.intentX = 0;
                    m.intentY = 0;
                    if (tick >= m.nextDecisionTick && tick >= m.readyAtTick) {
                        m.action = { startTick: tick, hitTick: tick + skill.windupTicks, endTick: tick + skill.windupTicks + skill.recoveryTicks, facing: dx >= 0 ? 1 : -1, damage: attackSnapshot(m.attackPower, skill.coefficient), released: false };
                        m.readyAtTick = tick + skill.cooldownTicks;
                        m.sequence++;
                        m.nextDecisionTick = tick + cfg.decisionTicks;
                        emit(events, m, 'actionAccepted', tick);
                    }
                    continue;
                }
                if (tick >= m.nextDecisionTick) {
                    m.intentX = Math.sign(dx) * 1000;
                    m.intentY = Math.sign(dy) * 1000;
                    m.nextDecisionTick = tick + cfg.decisionTicks;
                }
                const step = advanceMovement({ x: String(t.x), y: String(t.y), facing: dx >= 0 ? 1 : -1, intentX: 0, intentY: 0, remainderX: m.remainderX, remainderY: m.remainderY }, [{ seq: 1, tick, kind: 'move', x: m.intentX, y: m.intentY }], tick, tick + 1, { ...input.movementConfig, walkSpeed: skill.speed, runSpeed: skill.speed, ySpeed: skill.speed }).state;
                t.x = Number(step.x);
                t.y = Number(step.y);
                m.remainderX = step.remainderX;
                m.remainderY = step.remainderY;
            }
            return player.lifeState === 'dead' || tick < player.controlledUntilTick;
        } });
    return { ...result, monsters, player };
}
