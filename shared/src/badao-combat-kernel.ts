import type { ActionInput } from './protocol/simulation-v2.ts';
import { validateCombatStats, validateCombatTarget } from './basic-combat-kernel.ts';
import type { CombatStats, CombatTarget, CombatEvent, Rational } from './basic-combat-kernel.ts';
export type BadaoConfig = {
    version: 'training-badao-v1';
    rewardPolicy: 'none';
    unlockLevel: number;
    mpCost: string;
    cooldownUs: number;
    durationUs: number;
    nodeOffsetUs: number;
    frontRangeX: number;
    rangeY: number;
    damage: {
        base: string;
        growth: string;
        coefficient: Rational;
    };
    bleed: {
        coefficient: Rational;
        jumps: number;
        intervalUs: number;
    };
    knockdownThreshold: Rational;
    knockdownDurationUs: number;
};
export type BadaoCurrent = CombatStats & {
    level: number;
    mp: string;
    controlled: boolean;
    mastery: Rational;
};
export type BadaoSnapshot = CombatStats & {
    mastery: Rational;
    level: number;
};
export type BadaoCast = {
    sequence: number;
    originUs: Rational;
    endUs: Rational;
    nodeUs: Rational;
    node: number;
    snapshot: BadaoSnapshot;
    bleedBudget: string;
};
export type BadaoBleed = {
    kind: 'bleed';
    sequence: number;
    node: number;
    targetIndex: number;
    originUs: Rational;
    nextJump: number;
    snapshot: BadaoSnapshot;
    budget: string;
};
export type BadaoState = {
    castSequence: number;
    randomCursor: number;
    readyAtUs: Rational;
    cast: BadaoCast | null;
    effects: BadaoBleed[];
};
export const initialBadaoState = (): BadaoState => ({ castSequence: 0, randomCursor: 0, readyAtUs: { n: '0', d: '1' }, cast: null, effects: [] });
const q = (n: bigint, d = 1n): Rational => { if (d <= 0n)
    fail(); let a = n < 0n ? -n : n, b = d; while (b) {
    const t = a % b;
    a = b;
    b = t;
} return { n: String(n / (a || 1n)), d: String(d / (a || 1n)) }; };
const r = (n: number) => q(BigInt(n));
const add = (a: Rational, b: Rational) => q(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d));
const mul = (a: Rational, b: Rational) => q(BigInt(a.n) * BigInt(b.n), BigInt(a.d) * BigInt(b.d));
const cmp = (a: Rational, b: Rational) => { const x = BigInt(a.n) * BigInt(b.d) - BigInt(b.n) * BigInt(a.d); return x < 0n ? -1 : x > 0n ? 1 : 0; };
const floor = (a: Rational) => BigInt(a.n) / BigInt(a.d);
const atTick = (a: Rational) => Number((BigInt(a.n) + 10000n * BigInt(a.d) - 1n) / (10000n * BigInt(a.d)));
const haste = (s: CombatStats) => cmp(s.haste, r(2)) > 0 ? r(2) : s.haste;
const offset = (origin: Rational, us: number, s: CombatStats) => add(origin, mul(r(us), { n: haste(s).d, d: haste(s).n }));
function fail(): never { throw new TypeError('INVALID_BADAO_STATE'); }
function obj(v: any, keys: string[]) { if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k) || !('value' in Object.getOwnPropertyDescriptor(v, k)!)))
    fail(); return v; }
function integer(v: any, min = 0, max = 2147483647) { if (!Number.isSafeInteger(v) || v < min || v > max || Object.is(v, -0))
    fail(); }
function uint(v: any) { if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v) || BigInt(v) > 18446744073709551615n)
    fail(); }
function frac(v: any, prob = false) { obj(v, ['n', 'd']); uint(v.n); uint(v.d); if (v.d === '0' || BigInt(v.d) > 4294967295n || q(BigInt(v.n), BigInt(v.d)).n !== v.n || q(BigInt(v.n), BigInt(v.d)).d !== v.d || prob && cmp(v, r(1)) > 0)
    fail(); }
function snapshot(v: any) { obj(v, ['attackPower', 'haste', 'damageBonus', 'hit', 'crit', 'critMultiplier', 'x', 'y', 'facing', 'mastery', 'level']); const { mastery, level, ...base } = v; validateCombatStats(base); frac(mastery); if (cmp(mastery, r(10)) > 0)
    fail(); integer(level, 1, 30); }
export function validateBadaoConfig(v: unknown): BadaoConfig { const c = obj(v, ['version', 'rewardPolicy', 'unlockLevel', 'mpCost', 'cooldownUs', 'durationUs', 'nodeOffsetUs', 'frontRangeX', 'rangeY', 'damage', 'bleed', 'knockdownThreshold', 'knockdownDurationUs']); if (c.version !== 'training-badao-v1' || c.rewardPolicy !== 'none' || c.unlockLevel !== 10)
    fail(); uint(c.mpCost); for (const k of ['cooldownUs', 'durationUs', 'frontRangeX', 'rangeY', 'knockdownDurationUs'])
    integer(c[k], 1); if (c.cooldownUs < 100000)
    fail(); integer(c.nodeOffsetUs, 1, c.durationUs); obj(c.damage, ['base', 'growth', 'coefficient']); uint(c.damage.base); uint(c.damage.growth); frac(c.damage.coefficient); obj(c.bleed, ['coefficient', 'jumps', 'intervalUs']); frac(c.bleed.coefficient); integer(c.bleed.jumps, 1, 20); integer(c.bleed.intervalUs, 10000, 10000000); if (c.bleed.intervalUs * c.bleed.jumps > 10000000)
    fail(); frac(c.knockdownThreshold, true); return c; }
export function validateBadaoState(v: unknown): BadaoState { const s = obj(v, ['castSequence', 'randomCursor', 'readyAtUs', 'cast', 'effects']); integer(s.castSequence); integer(s.randomCursor); frac(s.readyAtUs); if (s.cast !== null) {
    const c = obj(s.cast, ['sequence', 'originUs', 'endUs', 'nodeUs', 'node', 'snapshot', 'bleedBudget']);
    integer(c.sequence, 1, s.castSequence);
    frac(c.originUs);
    frac(c.endUs);
    frac(c.nodeUs);
    if (cmp(c.originUs, c.nodeUs) >= 0 || cmp(c.nodeUs, c.endUs) > 0)
        fail();
    integer(c.node, 0, 1);
    snapshot(c.snapshot);
    uint(c.bleedBudget);
} if (!Array.isArray(s.effects) || s.effects.length > 2048)
    fail(); const effectIds = new Set<string>(); for (const e of s.effects) {
    if (!e || typeof e !== 'object')
        fail();
    const kind = Object.getOwnPropertyDescriptor(e, 'kind')?.value;
    if (kind === 'bleed') {
        obj(e, ['kind', 'sequence', 'node', 'targetIndex', 'originUs', 'nextJump', 'snapshot', 'budget']);
        integer(e.node, 0, 0);
        integer(e.targetIndex, 1, 8);
        integer(e.nextJump, 0, 19);
        uint(e.budget);
    }
    else
        fail();
    const identity = JSON.stringify([e.kind, e.sequence, e.node, e.targetIndex]);
    if (effectIds.has(identity))
        fail();
    effectIds.add(identity);
    integer(e.sequence, 1, s.castSequence);
    frac(e.originUs);
    snapshot(e.snapshot);
} return s; }
export function advanceBadaoCombat(state: BadaoState, inputs: readonly ActionInput[], fromTick: number, toTick: number, config: BadaoConfig, context: {
    challengeId: string;
    sceneEpoch: number;
    actorId: string;
    immuneToBleed?: number[];
    processUntilUs?: Rational;
}, current: BadaoCurrent, targets: readonly CombatTarget[], random: (cursor: number) => number): {
    state: BadaoState;
    targets: CombatTarget[];
    events: CombatEvent[];
    accepted: {
        tick: number;
        seq: number;
    }[];
    mp: string;
} {
    validateBadaoConfig(config);
    validateBadaoState(state);
    if (state.effects.some(e => e.kind === 'bleed' && e.nextJump >= config.bleed.jumps))
        fail();
    const { mp, controlled, ...snap } = current;
    uint(mp);
    if (typeof controlled !== 'boolean')
        fail();
    snapshot(snap);
    integer(fromTick);
    integer(toTick, fromTick);
    targets.forEach(validateCombatTarget);
    const s = structuredClone(state), ts = structuredClone([...targets]).sort((a, b) => a.actorIndex - b.actorIndex), events: CombatEvent[] = [], accepted: {
        tick: number;
        seq: number;
    }[] = [];
    let mana = BigInt(mp);
    if (ts.length > 8 || new Set(ts.map(t => t.actorIndex)).size !== ts.length || new Set(ts.map(t => t.actorId)).size !== ts.length)
        fail();
    const emit = (kind: CombatEvent['kind'], at: Rational, sequence: number, node: number, jump: number, targetId: string | null = null, damage: string | null = null, critical: boolean | null = null, seq: number | null = null, code: string | null = null) => { const tuple = JSON.stringify([context.challengeId, context.sceneEpoch, context.actorId, 'badao', kind, sequence, node, jump, targetId, seq, at]); let h = 2166136261n; for (const ch of tuple)
        h = ((h ^ BigInt(ch.codePointAt(0)!)) * 1099511628211n) & ((1n << 128n) - 1n); events.push({ kind, eventId: `combat:${h.toString(16).padStart(32, '0')}`, actorId: context.actorId, tick: atTick(at), seq, targetId, damage, critical, code }); };
    const draw = (chance: Rational) => { const n = random(s.randomCursor++); integer(n, 0, 4294967295); return BigInt(n) * BigInt(chance.d) < BigInt(chance.n) * 4294967296n; };
    const damage = (t: CombatTarget, amount: Rational, shot: BadaoSnapshot, at: Rational, sequence: number, node: number, jump: number, dot: boolean) => { const critical = draw(shot.crit); if (critical)
        amount = mul(amount, shot.critMultiplier); amount = mul(amount, q(BigInt(t.mitigation.d) - BigInt(t.mitigation.n), BigInt(t.mitigation.d))); const n = t.damageImmune ? 0n : floor(amount); t.hp = String(n >= BigInt(t.hp) ? 0n : BigInt(t.hp) - n); if (!dot)
        t.directSinceRise = String(BigInt(t.directSinceRise) + n); emit('damage', at, sequence, node, jump, t.actorId, String(n), critical); if (t.hp === '0') {
        t.lifeState = 'dead';
        t.downUntilTick = null;
        emit('death', at, sequence, node, jump, t.actorId);
    }
    else if (!dot && n > 0n && !t.controlImmune && t.downUntilTick === null && cmp(q(BigInt(t.directSinceRise)), mul(q(BigInt(t.maxHp)), config.knockdownThreshold)) >= 0) {
        t.downUntilTick = atTick(add(at, r(config.knockdownDurationUs)));
        emit('knockdown', at, sequence, node, jump, t.actorId);
    } };
    const hit = (t: CombatTarget, shot: BadaoSnapshot, at: Rational, sequence: number, node: number, budget: string) => { if (!draw(mul(shot.hit, q(BigInt(t.evasion.d) - BigInt(t.evasion.n), BigInt(t.evasion.d))))) {
        emit('miss', at, sequence, node, -1, t.actorId);
        return;
    } const level = 1 + Math.floor((shot.level - config.unlockLevel) / 2); let amount = add(q(BigInt(config.damage.base) + BigInt(level - 1) * BigInt(config.damage.growth)), mul(q(BigInt(shot.attackPower)), config.damage.coefficient)); amount = mul(mul(amount, add(r(1), shot.mastery)), add(r(1), shot.damageBonus)); amount = q(floor(amount)); damage(t, amount, shot, at, sequence, node, -1, false); if (t.lifeState === 'alive' && !context.immuneToBleed?.includes(t.actorIndex) && BigInt(budget) > 0n)
        s.effects.push({ kind: 'bleed', sequence, node, targetIndex: t.actorIndex, originUs: at, nextJump: 0, snapshot: structuredClone(shot), budget }); };
    // All emitted effects run on fixed 10 ms ticks; rational origins remain unrounded for subsequent nodes/jumps.
    const process = (tickNo: number) => {
        if(current.controlled)s.cast=null;
        const at = context.processUntilUs??r(tickNo * 10000);
        for (const t of ts)
            if (t.lifeState === 'alive' && t.downUntilTick !== null && cmp(r(t.downUntilTick*10000),at)<=0) {
                t.downUntilTick = null;
                t.directSinceRise = '0';
                emit('rise', at, 0, 0, 0, t.actorId);
            }
        const c = s.cast;
        if (c) {
            if (c.node === 0 && cmp(c.nodeUs, at) <= 0) {
                c.node = 1;
                for (const t of ts) {
                    const dx = (t.x - c.snapshot.x) * c.snapshot.facing;
                    if (t.lifeState === 'alive' && dx >= 0 && dx <= config.frontRangeX && Math.abs(t.y - c.snapshot.y) <= config.rangeY)
                        hit(t, c.snapshot, c.nodeUs, c.sequence, 0, c.bleedBudget);
                }
            }
            if (cmp(c.endUs, at) <= 0)
                s.cast = null;
        }
        for (const e of [...s.effects]) {
            const t = ts.find(t => t.actorIndex === e.targetIndex);
            if (!t || t.lifeState === 'dead') {
                s.effects = s.effects.filter(v => v !== e);
                continue;
            }
            while (e.nextJump < config.bleed.jumps && cmp(offset(e.originUs, (e.nextJump + 1) * config.bleed.intervalUs, e.snapshot), at) <= 0) {
                const jump = e.nextJump++, base = BigInt(e.budget) / BigInt(config.bleed.jumps), part = jump === config.bleed.jumps - 1 ? BigInt(e.budget) - base * BigInt(config.bleed.jumps - 1) : base;
                damage(t, q(part), e.snapshot, offset(e.originUs, (jump + 1) * config.bleed.intervalUs, e.snapshot), e.sequence, e.node, jump, true);
                if (t.hp === '0')
                    break;
            }
            if (e.nextJump === config.bleed.jumps || t.hp === '0')
                s.effects = s.effects.filter(v => v !== e);
        }
    };
    const sorted = [...inputs].sort((a, b) => a.tick - b.tick || a.seq - b.seq);
    for (const input of sorted) {
        integer(input.tick, fromTick, toTick - 1);
        integer(input.seq, 1);
    }
    for (let t = fromTick; t < toTick; t++) {
        process(t);
        for (const input of sorted.filter(i => i.tick === t && i.kind === 'skill' && i.skillId === 'badao')) {
            const at = r(t * 10000), code = current.level < config.unlockLevel ? 'SKILL_LOCKED' : controlled ? 'CONTROLLED' : s.cast ? 'ACTION_LOCKED' : cmp(at, s.readyAtUs) < 0 ? 'COOLDOWN' : mana < BigInt(config.mpCost) ? 'INSUFFICIENT_MP' : null;
            if (code) {
                emit('actionRejected', at, s.castSequence, -1, -1, null, null, null, input.seq, code);
                continue;
            }
            mana -= BigInt(config.mpCost);
            const shot = structuredClone(snap);
            const budget = floor(mul(mul(mul(q(BigInt(shot.attackPower)), config.bleed.coefficient), add(r(1), shot.mastery)), add(r(1), shot.damageBonus)));
            s.cast = { sequence: ++s.castSequence, originUs: at, endUs: offset(at, config.durationUs, shot), nodeUs: offset(at, config.nodeOffsetUs, shot), node: 0, snapshot: shot, bleedBudget: String(budget) };
            s.readyAtUs = offset(at, config.cooldownUs, shot);
            accepted.push({ tick: t, seq: input.seq });
            emit('actionAccepted', at, s.castSequence, -1, -1, null, null, null, input.seq);
        }
    }
    validateBadaoState(s);
    return { state: s, targets: ts, events, accepted, mp: String(mana) };
}
export type BadaoPublicSnapshot = Pick<BadaoSnapshot, 'x' | 'y' | 'facing' | 'haste'>;
export type BadaoPublicState = {
    castSequence: number;
    readyAtUs: Rational;
    cast: (Omit<BadaoCast, 'snapshot'> & {
        snapshot: BadaoPublicSnapshot;
    }) | null;
    effects: (Omit<BadaoBleed, 'snapshot'> & {
        snapshot: BadaoPublicSnapshot;
    })[];
};
const publicSnapshot = ({ x, y, facing, haste }: BadaoSnapshot): BadaoPublicSnapshot => structuredClone({ x, y, facing, haste });
export function publicBadaoState(state: BadaoState): BadaoPublicState { validateBadaoState(state); const { randomCursor: _, cast, effects, ...rest } = structuredClone(state); return { ...rest, cast: cast ? { ...cast, snapshot: publicSnapshot(cast.snapshot) } : null, effects: effects.map(e => ({ ...e, snapshot: publicSnapshot(e.snapshot) })) }; }
const displaySnapshot: BadaoSnapshot = { attackPower: '0', haste: { n: '1', d: '1' }, damageBonus: { n: '0', d: '1' }, hit: { n: '0', d: '1' }, crit: { n: '0', d: '1' }, critMultiplier: { n: '1', d: '1' }, x: 0, y: 0, facing: 1, mastery: { n: '0', d: '1' }, level: 1 };
function readPublicSnapshot(v: unknown): BadaoPublicSnapshot { const p = obj(v, ['x', 'y', 'facing', 'haste']); snapshot({ ...displaySnapshot, ...p }); return p; }
export function validateBadaoPublicState(value: unknown): BadaoPublicState { const v = obj(value, ['castSequence', 'readyAtUs', 'cast', 'effects']); if (!Array.isArray(v.effects))
    fail(); const restore = (e: any) => ({ ...e, snapshot: { ...displaySnapshot, ...readPublicSnapshot(e?.snapshot) } }); const restored = { ...v, randomCursor: 0, cast: v.cast === null ? null : restore(v.cast), effects: v.effects.map(restore) }; validateBadaoState(restored); return v; }
export function restoreBadaoPublic(value: BadaoPublicState, displayStats: BadaoCurrent | BadaoSnapshot): BadaoState { const v = validateBadaoPublicState(value); const { attackPower, haste, damageBonus, hit, crit, critMultiplier, x, y, facing, mastery, level } = displayStats; const shot = { attackPower, haste, damageBonus, hit, crit, critMultiplier, x, y, facing, mastery, level }; snapshot(shot); return structuredClone({ ...v, randomCursor: 0, cast: v.cast ? { ...v.cast, snapshot: { ...shot, ...v.cast.snapshot } } : null, effects: v.effects.map(e => ({ ...e, snapshot: { ...shot, ...e.snapshot } })) }); }
