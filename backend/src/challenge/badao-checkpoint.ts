import {unpair,normalizeLegacyPairs} from './compact-effects-checkpoint.ts';
import { validateBadaoState } from '../../../shared/src/badao-combat-kernel.ts';
import type { BadaoState, BadaoSnapshot } from '../../../shared/src/badao-combat-kernel.ts';
import type { Rational } from '../../../shared/src/basic-combat-kernel.ts';
const q = (r: Rational) => [BigInt(r.n)<=4294967295n?Number(r.n):r.n,Number(r.d)];
const unq = (v: any): Rational => unpair(v);
const shot = (s: BadaoSnapshot) => [s.attackPower, q(s.haste), q(s.damageBonus), q(s.hit), q(s.crit), q(s.critMultiplier), s.x, s.y, s.facing, q(s.mastery), s.level];
const unshot = (a: any): BadaoSnapshot => ({ attackPower: a[0], haste: unq(a[1]), damageBonus: unq(a[2]), hit: unq(a[3]), crit: unq(a[4]), critMultiplier: unq(a[5]), x: a[6], y: a[7], facing: a[8], mastery: unq(a[9]), level: a[10] });
export function packBadao(state: BadaoState) {
    validateBadaoState(state);
    const snapshots: unknown[][] = [], by = new Map<string, number>();
    const index = (s: BadaoSnapshot) => { const row = shot(s), key = JSON.stringify(row); if (!by.has(key)) {
        by.set(key, snapshots.length);
        snapshots.push(row);
    } return by.get(key)!; };
    const c = state.cast, cast = c ? [c.sequence, q(c.originUs), q(c.endUs), q(c.nodeUs), c.node, index(c.snapshot), c.bleedBudget] : null;
    const effects = state.effects.map(e => [1, e.sequence, e.node, e.targetIndex, q(e.originUs), e.nextJump, index(e.snapshot), e.budget]);
    for (const row of snapshots)
        if (JSON.stringify(row).length > 192)
            throw new TypeError('BADAO_SNAPSHOT_BUDGET');
    for (const row of effects)
        if (JSON.stringify(row).length > 128)
            throw new TypeError('BADAO_EFFECT_BUDGET');
    return { version: 1, controller: [state.castSequence, state.randomCursor, q(state.readyAtUs), cast], snapshots, effects };
}
export function unpackBadao(raw: unknown): BadaoState {
    const p = raw as any;
    try {
        if (!p || typeof p !== 'object' || Object.keys(p).sort().join(',') !== 'controller,effects,snapshots,version' || p.version !== 1 || !Array.isArray(p.controller) || p.controller.length !== 4 || !Array.isArray(p.snapshots) || !Array.isArray(p.effects))
            throw 0;
        const snap = (i: any) => { if (!Number.isSafeInteger(i) || i < 0 || i >= p.snapshots.length)
            throw 0; const a = p.snapshots[i]; if (!Array.isArray(a) || a.length !== 11)
            throw 0; return unshot(a); };
        const c = p.controller[3];
        if (c !== null && (!Array.isArray(c) || c.length !== 7))
            throw 0;
        const state: BadaoState = { castSequence: p.controller[0], randomCursor: p.controller[1], readyAtUs: unq(p.controller[2]), cast: c ? { sequence: c[0], originUs: unq(c[1]), endUs: unq(c[2]), nodeUs: unq(c[3]), node: c[4], snapshot: snap(c[5]), bleedBudget: c[6] } : null, effects: p.effects.map((e: any) => { if (!Array.isArray(e) || e.length !== 8)
                throw 0; return e[0] === 1 ? { kind: 'bleed', sequence: e[1], node: e[2], targetIndex: e[3], originUs: unq(e[4]), nextJump: e[5], snapshot: snap(e[6]), budget: e[7] } : (() => { throw 0; })(); }) };
        validateBadaoState(state);
        if (JSON.stringify(packBadao(state)) !== JSON.stringify(normalizeLegacyPairs(raw)))
            throw 0;
        return state;
    }
    catch {
        throw new TypeError('INVALID_BADAO_CHECKPOINT');
    }
}
