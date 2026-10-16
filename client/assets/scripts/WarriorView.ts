import { Color, Graphics } from 'cc';
import { CombatModel, tuning } from './CombatModel';
import { WarriorSkillId } from './WarriorSkillsModel';

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

// Original procedural fallback follows the same three-beat silhouette as the atlas.
const cross = pose({ lean: 5, crouch: 2, twist: 7, backX: 13, backY: 24, backAngle: -0.55,
    frontX: 17, frontY: 16, frontAngle: 0.6 });
const high = pose({ lean: 1, crouch: -2, twist: -3, backX: -6, backY: 34, backAngle: 2.1,
    frontX: 13, frontY: 35, frontAngle: 1.2 });
const low = pose({ lean: 7, crouch: 8, twist: 5, backX: -9, backY: 30, backAngle: 2.1,
    frontX: 20, frontY: 12, frontAngle: -0.35 });
const cuts = [
    { windup: pose({ lean: -3, twist: -6, backAngle: 2.3 }), first: cross, second: cross,
        finish: pose({ lean: 2, backY: 23, frontY: 25, frontAngle: 0.8 }),
        firstHand: 'both', secondHand: 'both' },
    { windup: cross, first: high, second: high, finish: high,
        firstHand: 'both', secondHand: 'both' },
    { windup: high, first: low, second: low, finish: rest,
        firstHand: 'both', secondHand: 'both' },
];

const skillPoses: Record<WarriorSkillId, { windup: Pose; strike: Pose; follow: Pose; finish: Pose }> = {
    cross: {
        windup: pose({ lean: -2, crouch: 3, twist: -6, backX: -11, backY: 23, backAngle: 2.6, frontX: 13, frontY: 16, frontAngle: -0.2 }),
        strike: pose({ lean: 4, crouch: 1, twist: 7, backX: 13, backY: 21, backAngle: 0.55, frontX: -7, frontY: 20, frontAngle: 2.55 }),
        follow: pose({ lean: 2, crouch: 1, twist: -4, backX: -7, backY: 19, backAngle: 2.45, frontX: 18, frontY: 20, frontAngle: 0.6 }),
        finish: pose({ lean: 0, crouch: 0, backX: -7, backY: 17, backAngle: 1.8, frontX: 10, frontY: 17, frontAngle: 0.1 }),
    },
    bengshan: {
        windup: pose({ lean: -2, crouch: 7, twist: -3, backX: -12, backY: 12, backAngle: -1.9, frontX: 10, frontY: 12, frontAngle: -1.2 }),
        strike: pose({ lean: 1, crouch: -3, twist: 0, backX: -11, backY: 34, backAngle: 1.45, frontX: 13, frontY: 33, frontAngle: 1.75 }),
        follow: pose({ lean: 5, crouch: 2, twist: 3, backX: 12, backY: 13, backAngle: -1.0, frontX: 16, frontY: 13, frontAngle: -1.1 }),
        finish: pose({ lean: 0, crouch: 1, backX: -8, backY: 16, backAngle: -0.8, frontX: 10, frontY: 16, frontAngle: -0.6 }),
    },
    badao: {
        windup: pose({ lean: -3, crouch: 3, twist: -6, backX: -10, backY: 15, backAngle: 2.8, frontX: 3, frontY: 14, frontAngle: 3.0 }),
        strike: pose({ lean: 6, crouch: 1, twist: 8, backX: -4, backY: 19, backAngle: 0.15, frontX: 22, frontY: 18, frontAngle: 0.05 }),
        follow: pose({ lean: 3, crouch: 1, twist: 3, backX: 8, backY: 17, backAngle: 0.1, frontX: 17, frontY: 16, frontAngle: -0.15 }),
        finish: pose({ lean: 0, crouch: 0, backX: -7, backY: 17, backAngle: -0.9, frontX: 10, frontY: 17, frontAngle: -0.6 }),
    },
    earth: {
        windup: pose({ lean: -2, crouch: 9, twist: -2, backX: -11, backY: 11, backAngle: 2.3, frontX: 11, frontY: 10, frontAngle: 0.8 }),
        strike: pose({ lean: 0, crouch: -4, twist: 0, backX: -10, backY: 36, backAngle: 1.7, frontX: 15, frontY: 36, frontAngle: 1.45 }),
        follow: pose({ lean: 7, crouch: 4, twist: 1, backX: 9, backY: 11, backAngle: -1.1, frontX: 14, frontY: 10, frontAngle: -1.4 }),
        finish: pose({ lean: 1, crouch: 2, backX: -8, backY: 16, backAngle: -0.8, frontX: 9, frontY: 16, frontAngle: -0.5 }),
    },
};

export class WarriorView {
    private current = { ...rest };
    private entry = { ...rest };
    private lastStage = -1;
    private lastSkill: WarriorSkillId | null = null;
    private step = 0;
    private stride = 0;
    private trails: Trail[][] = [[], []];

    draw(g: Graphics, m: CombatModel, dt: number,
        skill: { id: WarriorSkillId; progress: number } | null = null): void {
        const p = m.stage < 0 ? 0 : m.elapsed / tuning.durations[m.stage];
        let skillHandActive = false;
        if (m.stage !== this.lastStage) {
            this.entry = { ...this.current };
            this.lastStage = m.stage;
        }
        if (skill) {
            if (this.lastSkill !== skill.id) this.entry = { ...this.current };
            this.lastSkill = skill.id;
            const poses = skillPoses[skill.id], q = skill.progress;
            if (q < 0.20) this.current = mix(this.entry, poses.windup, smooth(q / 0.20));
            else if (q < 0.43) this.current = mix(poses.windup, poses.strike, smooth((q - 0.20) / 0.23));
            else if (q < 0.61) this.current = mix(poses.strike, poses.follow, smooth((q - 0.43) / 0.18));
            else this.current = mix(poses.follow, poses.finish, smooth((q - 0.61) / 0.39));
            skillHandActive = true;
        } else if (m.stage >= 0) {
            this.lastSkill = null;
            const cut = cuts[m.stage];
            const contact = m.stage === 0 ? 0.4 : m.stage === 1 ? 0.10 / 0.22 : 0.14 / 0.36;
            if (p < 0.16) this.current = mix(this.entry, cut.windup, smooth(p / 0.16));
            else if (p < contact) this.current = mix(cut.windup, cut.first, smooth((p - 0.16) / (contact - 0.16)));
            else if (p < 0.65) this.current = cut.first;
            else this.current = mix(cut.first, cut.finish, smooth((p - 0.65) / 0.35));
        } else {
            this.lastSkill = null;
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
        const comboCut = m.stage >= 0 ? cuts[m.stage] : null;
        const firstSwing = !!comboCut && p >= 0.16 && p < 0.65;
        const secondSwing = !!comboCut && false;
        const skillSweep = !!skill && ((skill.progress >= 0.20 && skill.progress < 0.61));
        this.arm(g, q, false, skillHandActive
            || (!!comboCut && ((firstSwing && (comboCut.firstHand === 'back' || comboCut.firstHand === 'both'))
                || (secondSwing && (comboCut.secondHand === 'back' || comboCut.secondHand === 'both')))) || skillSweep);
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
        this.arm(g, q, true, skillHandActive
            || (!!comboCut && ((firstSwing && (comboCut.firstHand === 'front' || comboCut.firstHand === 'both'))
                || (secondSwing && (comboCut.secondHand === 'front' || comboCut.secondHand === 'both')))) || skillSweep);
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
