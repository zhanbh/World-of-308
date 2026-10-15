import { Color, Graphics } from 'cc';
import { CombatModel, tuning } from './CombatModel';

type Point = { x: number; y: number };
type Pose = {
    lean: number; crouch: number; twist: number;
    backX: number; backY: number; backAngle: number;
    frontX: number; frontY: number; frontAngle: number;
};
type Trail = { base: Point; tip: Point; life: number };
const rest: Pose = { lean: 0, crouch: 0, twist: 0,
    backX: -7, backY: 15, backAngle: -1.05,
    frontX: 10, frontY: 17, frontAngle: -0.6 };
const pose = (values: Partial<Pose>): Pose => ({ ...rest, ...values });
const mix = (a: Pose, b: Pose, t: number): Pose => {
    const out = { ...a };
    for (const key of Object.keys(a) as (keyof Pose)[]) {
        const delta = b[key] - a[key];
        // Returning to guard must not rotate a sword the long way around.
        out[key] = a[key] + (key.endsWith('Angle') ? Math.atan2(Math.sin(delta), Math.cos(delta)) : delta) * t;
    }
    return out;
};
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

// Each cut has a wind-up, a quick stroke and a slower recovery. Coordinates
// face right; mirroring the whole visual keeps the two hands coordinated.
const cuts: { windup: Pose; strike: Pose; finish: Pose; reopen?: Pose; hand: 'front' | 'back' | 'both' }[] = [
    {
        hand: 'back',
        windup: pose({ lean: -2, crouch: 1, twist: -4, backX: -11, backY: 25, backAngle: 2.4 }),
        strike: pose({ lean: 3, crouch: 2, twist: 4, backX: 17, backY: 19, backAngle: -0.3, frontX: 5, frontY: 16 }),
        finish: pose({ lean: 2, twist: 3, backX: 12, backY: 13, backAngle: -0.9 }),
    },
    {
        hand: 'front',
        windup: pose({ lean: -1, crouch: 1, twist: 4, frontX: -7, frontY: 17, frontAngle: -2.2 }),
        strike: pose({ lean: 4, crouch: 2, twist: -4, frontX: 19, frontY: 24, frontAngle: 0.5, backX: -4, backY: 16 }),
        finish: pose({ lean: 2, twist: -3, frontX: 12, frontY: 21, frontAngle: 0.8 }),
    },
    {
        hand: 'front',
        windup: pose({ lean: -2, crouch: 5, twist: -2, frontX: 7, frontY: 10, frontAngle: -1.7, backAngle: -1.4 }),
        strike: pose({ lean: 3, crouch: -2, twist: 3, frontX: 15, frontY: 32, frontAngle: 1.1, backX: 4, backY: 23 }),
        finish: pose({ lean: 1, crouch: -1, frontX: 9, frontY: 33, frontAngle: 1.8, backX: 1, backY: 26, backAngle: 1.9 }),
    },
    {
        hand: 'both',
        // Back arm represents the left hand; front arm the right hand.
        // Open guard -> cross inward -> reverse outward -> recover.
        windup: pose({ lean: -1, crouch: 2, twist: -1, backX: -12, backY: 23, backAngle: 2.9, frontX: 14, frontY: 19, frontAngle: 0.25 }),
        strike: pose({ lean: 3, crouch: 3, twist: 1, backX: 13, backY: 22, backAngle: 0.2, frontX: -11, frontY: 19, frontAngle: 2.95 }),
        reopen: pose({ lean: 2, crouch: 2, twist: -1, backX: -15, backY: 23, backAngle: 2.95, frontX: 17, frontY: 19, frontAngle: 0.15 }),
        finish: pose({ lean: 0, crouch: 1, backX: -10, backY: 17, backAngle: 3.65, frontX: 12, frontY: 16, frontAngle: -0.5 }),
    },
];

const skillCuts: { windup: Pose; strike: Pose; finish: Pose; hand: 'front' | 'back' }[] = [
    {
        hand: 'back',
        windup: pose({ lean: -2, twist: -3, backX: -11, backY: 23, backAngle: 2.7 }),
        strike: pose({ lean: 3, twist: 4, backX: 17, backY: 20, backAngle: 0.05, frontX: 7, frontY: 17 }),
        finish: pose({ lean: 1, twist: 1, backX: 10, backY: 17, backAngle: -0.15 }),
    },
    {
        hand: 'front',
        windup: pose({ lean: -1, twist: 3, frontX: 15, frontY: 19, frontAngle: 0.2 }),
        strike: pose({ lean: 3, twist: -4, frontX: -7, frontY: 21, frontAngle: 3.05, backX: 8, backY: 18 }),
        finish: pose({ lean: 1, twist: -1, frontX: 8, frontY: 17, frontAngle: 3.25 }),
    },
];

export class WarriorView {
    private current = { ...rest };
    private entry = { ...rest };
    private lastStage = -1;
    private step = 0;
    private stride = 0;
    private trails: Trail[][] = [[], []];

    draw(g: Graphics, m: CombatModel, dt: number, skillWindup: number | null = null): void {
        const p = m.stage < 0 ? 0 : m.elapsed / tuning.durations[m.stage];
        let skillHand: 'front' | 'back' | null = null;
        if (m.stage !== this.lastStage) {
            this.entry = { ...this.current };
            this.lastStage = m.stage;
        }
        if (skillWindup !== null) {
            const scaled = skillWindup * 2;
            const phase = Math.min(1, Math.floor(scaled));
            const phaseProgress = scaled - phase;
            const cut = skillCuts[phase];
            if (phaseProgress < 0.18) this.current = mix(this.current, cut.windup, smooth(phaseProgress / 0.18));
            else if (phaseProgress < 0.70) this.current = mix(cut.windup, cut.strike, smooth((phaseProgress - 0.18) / 0.52));
            else this.current = mix(cut.strike, cut.finish, smooth((phaseProgress - 0.70) / 0.30));
            skillHand = cut.hand;
        } else if (m.stage >= 0) {
            const cut = cuts[m.stage];
            if (cut.reopen) {
                if (p < 0.12) this.current = mix(this.entry, cut.windup, smooth(p / 0.12));
                else if (p < 0.30) this.current = mix(cut.windup, cut.strike, smooth((p - 0.12) / 0.18));
                else if (p < 0.38) this.current = cut.strike;
                else if (p < 0.57) this.current = mix(cut.strike, cut.reopen, smooth((p - 0.38) / 0.19));
                else if (p < 0.75) this.current = cut.reopen;
                else this.current = mix(cut.reopen, cut.finish, smooth((p - 0.75) / 0.25));
            } else if (p < 0.24) this.current = mix(this.entry, cut.windup, smooth(p / 0.24));
            else if (p < 0.56) this.current = mix(cut.windup, cut.strike, smooth((p - 0.24) / 0.32));
            else this.current = mix(cut.strike, cut.finish, smooth((p - 0.56) / 0.44));
        } else {
            const pace = m.running ? 18 : 10;
            if (m.moving) this.step += Math.min(dt, 0.05) * pace;
            this.stride += ((m.moving ? Math.sin(this.step) * (m.running ? 4 : 2.5) : 0) - this.stride) * Math.min(1, dt * 18);
            const target = pose({ lean: m.running ? 2 : 0, crouch: m.moving ? Math.abs(Math.sin(this.step)) : 0,
                frontX: 10 + this.stride * 0.4, backX: -7 - this.stride * 0.4 });
            this.current = mix(this.current, target, 1 - Math.exp(-dt * 18));
        }
        if (m.stage >= 0) this.stride *= Math.exp(-dt * 20);
        for (const trail of this.trails) {
            for (const point of trail) point.life -= dt;
            while (trail.length && trail[0].life <= 0) trail.shift();
        }
        g.clear();
        const q = this.current;
        // Feet stay at the ground anchor. Torso motion never moves collision.
        const hip = { x: q.lean * 0.35, y: 13 - q.crouch };
        this.limb(g, { x: hip.x - 3, y: hip.y }, { x: -5 - this.stride, y: 2 }, 5, '#263646');
        this.limb(g, { x: hip.x + 3, y: hip.y }, { x: 6 + this.stride, y: 2 }, 5, '#344859');
        this.box(g, -8 - this.stride, 0, 7, 3, '#17232e');
        this.box(g, 3 + this.stride, 0, 8, 3, '#17232e');
        const dualSweep = m.stage === 3 && ((p >= 0.12 && p < 0.30) || (p >= 0.38 && p < 0.57));
        this.arm(g, q, false, skillHand === 'back' || dualSweep || (m.stage >= 0 && cuts[m.stage].hand === 'back' && p >= 0.24 && p < 0.62));
        this.polygon(g, [
            { x: hip.x - 6, y: hip.y }, { x: hip.x + 7, y: hip.y },
            { x: q.lean + 7 - q.twist * 0.3, y: 26 - q.crouch },
            { x: q.lean - 7 + q.twist * 0.3, y: 26 - q.crouch },
        ], '#b5754f');
        this.box(g, hip.x - 6, hip.y, 13, 3, '#63482f');
        this.box(g, hip.x + 1, hip.y, 3, 3, '#d8b969');
        this.limb(g, { x: q.lean - 3, y: 25 - q.crouch }, { x: hip.x + 4, y: hip.y + 3 }, 2, '#533f36');
        const head = { x: q.lean + 1, y: 29 - q.crouch };
        this.box(g, head.x - 5, head.y - 2, 11, 10, '#dfb58a');
        this.box(g, head.x - 6, head.y + 3, 12, 5, '#3c3837');
        this.box(g, head.x - 6, head.y + 2, 3, 5, '#3c3837');
        this.box(g, head.x + 3, head.y + 2, 2, 2, '#1c2930');
        this.box(g, q.lean - 6, 25 - q.crouch, 13, 3, '#6f9b9b');
        this.arm(g, q, true, skillHand === 'front' || dualSweep || (m.stage >= 0 && cuts[m.stage].hand === 'front' && p >= 0.24 && p < 0.62));
        // Sword trails follow actual blade segments, rather than a fixed arc.
        for (const trail of this.trails) {
            for (let i = 1; i < trail.length; i++) {
                const a = trail[i - 1], b = trail[i];
                const alpha = Math.round(Math.max(0, b.life / 0.075) * 105);
                this.polygon(g, [a.base, a.tip, b.tip, b.base], new Color(150, 230, 218, alpha));
            }
        }
    }

    private arm(g: Graphics, q: Pose, front: boolean, active: boolean): void {
        const shoulder = { x: q.lean + (front ? 4 : -4), y: 24 - q.crouch };
        const hand = { x: front ? q.frontX : q.backX, y: (front ? q.frontY : q.backY) - q.crouch };
        const dx = hand.x - shoulder.x, dy = hand.y - shoulder.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const elbow = { x: (hand.x + shoulder.x) / 2 - dy / length * 3,
            y: (hand.y + shoulder.y) / 2 + dx / length * 3 };
        this.limb(g, shoulder, elbow, 4, front ? '#9d6248' : '#81523f');
        this.limb(g, elbow, hand, 3, '#d4aa7e');
        const angle = front ? q.frontAngle : q.backAngle;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        const side = { x: -direction.y, y: direction.x };
        const base = { x: hand.x + direction.x * 3, y: hand.y + direction.y * 3 };
        const tip = { x: base.x + direction.x * 22, y: base.y + direction.y * 22 };
        this.limb(g, { x: hand.x - direction.x * 3, y: hand.y - direction.y * 3 }, base, 2.5, '#604b37');
        this.limb(g, { x: base.x - side.x * 3, y: base.y - side.y * 3 },
            { x: base.x + side.x * 3, y: base.y + side.y * 3 }, 1.8, '#c6a05a');
        this.polygon(g, [
            { x: base.x + side.x * 1.5, y: base.y + side.y * 1.5 },
            { x: base.x - side.x * 1.5, y: base.y - side.y * 1.5 }, tip,
        ], front ? '#e1f0eb' : '#a6c4c4');
        if (active) {
            const trail = this.trails[front ? 1 : 0];
            trail.push({ base, tip, life: 0.075 });
            if (trail.length > 10) trail.shift();
        }
    }

    private limb(g: Graphics, a: Point, b: Point, width: number, color: string): void {
        g.strokeColor = new Color().fromHEX(color); g.lineWidth = width;
        g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }

    private box(g: Graphics, x: number, y: number, w: number, h: number, color: string): void {
        g.fillColor = new Color().fromHEX(color); g.rect(x, y, w, h); g.fill();
    }

    private polygon(g: Graphics, points: Point[], color: string | Color): void {
        g.fillColor = typeof color === 'string' ? new Color().fromHEX(color) : color;
        g.moveTo(points[0].x, points[0].y);
        for (const p of points.slice(1)) g.lineTo(p.x, p.y);
        g.close(); g.fill();
    }
}
