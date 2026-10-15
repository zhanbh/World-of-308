import { _decorator, Component, Node, Graphics, Color, UITransform, Label,
    input, Input, EventTouch, EventKeyboard, KeyCode, Vec3, view, ResolutionPolicy, game, Game } from 'cc';
import { CombatModel } from './CombatModel';
import { WarriorView } from './WarriorView';
import { EnemyModel } from './EnemyModel';
import { SwordWaveModel, swordWaveTuning } from './SwordWaveModel';

const { ccclass } = _decorator;
const stages = ['左砍', '右砍', '上挑', '双刀交叉横扫'];

@ccclass('Prototype')
export class Prototype extends Component {
    private model = new CombatModel();
    private canvas!: UITransform;
    private world!: Graphics;
    private actor!: Graphics;
    private enemyVisuals: Graphics[] = [];
    private lastDepthOrder: Node[] = [];
    private warrior = new WarriorView();
    private swordWave = new SwordWaveModel();
    private controls!: Graphics;
    private status!: Label;
    private healthStatus!: Label;
    private skillLabel!: Label;
    private stickId: number | null = null;
    private attackIds = new Set<number>();
    private axis = { x: 0, y: 0 };
    private keys = new Set<KeyCode>();
    private accumulator = 0;
    private fpsTime = 0;
    private frames = 0;
    private fps = 0;
    private enemies: EnemyModel[] = [];
    private lastImpactId = 0;
    private mode: 1 | 3 = 1;
    private retryTimer = 0;

    onLoad(): void {
        view.setDesignResolutionSize(960, 540, ResolutionPolicy.SHOW_ALL);
        this.canvas = this.node.getComponent(UITransform)!;
        this.world = this.makeGraphics('World');
        this.world.node.setScale(2, 2, 1);
        this.actor = this.makeGraphics('Warrior');
        this.controls = this.makeGraphics('Controls');
        this.text('308 动作样板 v0.6 · 近战对抗', 0, 242, 22);
        this.text('WASD / 方向键移动 · 空格普攻 · Q 剑气 · R 重置 · 1/3 敌人数', 0, 212, 16);
        this.healthStatus = this.text('', -330, 178, 17);
        this.status = this.text('', 0, -242, 17);
        this.modeLabels = [this.text('单怪', 255, 168, 14, 70), this.text('三怪', 355, 168, 14, 70)];
        this.text('摇杆', -345, -218, 18);
        this.text('普攻', 345, -160, 22);
        this.skillLabel = this.text('剑气 Q', 265, -65, 14, 76);
        this.text('受击预警 · 走出红框躲避', 0, -208, 16);
        this.restartEncounter();
        input.on(Input.EventType.TOUCH_START, this.touchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
        input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.on(Input.EventType.KEY_UP, this.keyUp, this);
        game.on(Game.EVENT_HIDE, this.clearInput, this);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.touchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
        input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.off(Input.EventType.KEY_UP, this.keyUp, this);
        game.off(Game.EVENT_HIDE, this.clearInput, this);
    }

    private makeGraphics(name: string): Graphics {
        const n = new Node(name);
        n.layer = this.node.layer;
        this.node.addChild(n);
        n.addComponent(UITransform);
        return n.addComponent(Graphics);
    }

    private text(value: string, x: number, y: number, size: number, width = 920): Label {
        const n = new Node('Label');
        n.layer = this.node.layer;
        this.node.addChild(n);
        n.setPosition(x, y);
        n.addComponent(UITransform).setContentSize(width, 30);
        const label = n.addComponent(Label);
        label.string = value;
        label.fontSize = size;
        label.lineHeight = size + 4;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.color = new Color(231, 233, 220);
        return label;
    }

    private point(e: EventTouch): Vec3 {
        const p = e.getUILocation();
        return this.canvas.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    }

    private touchStart(e: EventTouch): void {
        const id = e.getID();
        if (id === null) return;
        const p = this.point(e);
        if (p.y > 145 && p.y < 190 && Math.abs(p.x - 255) < 40) {
            this.mode = 1; this.restartEncounter();
        } else if (p.y > 145 && p.y < 190 && Math.abs(p.x - 355) < 40) {
            this.mode = 3; this.restartEncounter();
        } else if (Math.hypot(p.x - 265, p.y + 65) < 38) {
            this.castSwordWave();
        } else if (this.stickId === null && Math.hypot(p.x + 345, p.y + 150) < 95) {
            this.stickId = id;
            this.touchMove(e);
        } else if (Math.hypot(p.x - 345, p.y + 150) < 68 && !this.swordWave.casting) {
            this.attackIds.add(id);
            this.model.press();
        }
    }

    private touchMove(e: EventTouch): void {
        if (e.getID() !== this.stickId) return;
        const p = this.point(e);
        const x = (p.x + 345) / 68;
        const y = (p.y + 150) / 68;
        const scale = Math.max(1, Math.hypot(x, y));
        this.axis = { x: x / scale, y: y / scale };
    }

    private touchEnd(e: EventTouch): void {
        const id = e.getID();
        if (id === null) return;
        if (e.getID() === this.stickId) {
            this.stickId = null;
            this.axis = { x: 0, y: 0 };
        }
        this.attackIds.delete(id);
        if (this.attackIds.size === 0 && !this.keys.has(KeyCode.SPACE)) this.model.release();
    }

    private keyDown(e: EventKeyboard): void {
        if (this.keys.has(e.keyCode)) return;
        this.keys.add(e.keyCode);
        if (e.keyCode === KeyCode.SPACE && !this.swordWave.casting) this.model.press();
        if (e.keyCode === KeyCode.KEY_Q) this.castSwordWave();
        if (e.keyCode === KeyCode.KEY_R) this.restartEncounter();
        if (e.keyCode === KeyCode.DIGIT_1) { this.mode = 1; this.restartEncounter(); }
        if (e.keyCode === KeyCode.DIGIT_3) { this.mode = 3; this.restartEncounter(); }
    }

    private keyUp(e: EventKeyboard): void {
        this.keys.delete(e.keyCode);
        if (e.keyCode === KeyCode.SPACE && this.attackIds.size === 0) this.model.release();
    }

    private clearInput(): void {
        this.keys.clear(); this.attackIds.clear(); this.stickId = null;
        this.axis = { x: 0, y: 0 }; this.model.release(); this.model.buffered = false;
    }

    update(dt: number): void {
        this.frames++; this.fpsTime += dt;
        if (this.fpsTime >= 0.5) { this.fps = Math.round(this.frames / this.fpsTime); this.frames = this.fpsTime = 0; }
        const has = (a: KeyCode, b: KeyCode) => Number(this.keys.has(a) || this.keys.has(b));
        const x = this.stickId !== null ? this.axis.x : has(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) - has(KeyCode.KEY_A, KeyCode.ARROW_LEFT);
        const y = this.stickId !== null ? this.axis.y : has(KeyCode.KEY_W, KeyCode.ARROW_UP) - has(KeyCode.KEY_S, KeyCode.ARROW_DOWN);
        this.accumulator += Math.min(dt, 0.1);
        while (this.accumulator >= 1 / 120) {
            const fixedDt = 1 / 120;
            this.swordWave.update(fixedDt);
            const skillWindup = this.swordWave.windupProgress;
            this.model.update(fixedDt, skillWindup === null ? x : 0, skillWindup === null ? y : 0);
            if (this.model.impactId !== this.lastImpactId) {
                this.lastImpactId = this.model.impactId;
                this.resolveMeleeHit();
            }
            this.resolveSwordWaveHits();
            for (const enemy of this.enemies) enemy.update(fixedDt, this.model);
            this.accumulator -= fixedDt;
        }
        this.retryTimer = this.model.hp <= 0 || this.enemies.every(enemy => enemy.state === 'dead')
            ? this.retryTimer + Math.min(dt, 0.05) : 0;
        if (this.retryTimer > 2.2) this.restartEncounter();
        this.draw(dt);
        this.healthStatus.string = `战士 ${this.healthBar(this.model.hp, 100)}     法力 ${this.swordWave.mana}/${swordWaveTuning.maxMana}     近战怪 ${this.mode} 只`;
        const state = this.model.hp <= 0 ? '受击倒下 · 即将重试' : this.enemies.every(enemy => enemy.state === 'dead')
            ? '清场 · 即将重试' : this.enemies.some(enemy => enemy.state === 'telegraph') ? '红色预警 · 离开锁定区域' : '攻击怪物，闪开预警';
        const skillState = this.swordWave.waveProgress !== null ? '剑气扩散'
            : this.swordWave.windupProgress !== null ? '双刀连挥'
                : this.swordWave.cooldown > 0 ? `剑气冷却 ${this.swordWave.cooldown.toFixed(1)}s` : '剑气就绪';
        this.status.string = `${this.fps} FPS | ${state} | ${this.model.stage < 0 ? (this.model.moving ? (this.model.running ? '跑' : '走') : '待机') : stages[this.model.stage]} | ${skillState}`;
        this.skillLabel.string = this.swordWave.ready ? '剑气 Q' : this.swordWave.mana < swordWaveTuning.manaCost
            ? '魔法不足' : `${this.swordWave.cooldown.toFixed(1)}s`;
    }

    private rect(g: Graphics, x: number, y: number, w: number, h: number, color: string): void {
        g.fillColor = new Color().fromHEX(color); g.rect(x, y, w, h); g.fill();
    }

    private draw(dt: number): void {
        const ui = this.controls;
        ui.clear();
        const g = this.world;
        g.clear();
        this.rect(g, -240, -135, 480, 270, '#18252d');
        this.rect(g, -232, -42, 464, 135, '#34433d');
        g.strokeColor = new Color(71, 87, 75); g.lineWidth = 0.5;
        for (let x = -224; x < 240; x += 16) { g.moveTo(x, -42); g.lineTo(x, 93); }
        for (let y = -42; y <= 93; y += 16) { g.moveTo(-232, y); g.lineTo(232, y); }
        g.stroke();
        const m = this.model;
        this.drawSwordWave(g);
        this.drawEnemies(g);
        const x = Math.round(m.x), y = Math.round(m.y);
        g.fillColor = new Color(15, 24, 25, 150); g.ellipse(x, y, 14, 4.8); g.fill();
        this.actor.node.setPosition(x * 2, y * 2);
        this.actor.node.setScale(2.4 * m.facing, 2.4 * (m.hitStun > 0 ? 0.88 : 1), 1);
        this.actor.node.active = m.invulnerable <= 0 || Math.floor(m.invulnerable * 16) % 2 === 0;
        this.warrior.draw(this.actor, m, Math.min(dt, 0.05), this.swordWave.windupProgress);
        this.sortActorsByDepth();
        this.drawHealthBar(-330, 154, m.hp, 100, '#65d6b2');
        this.rect(this.controls, 220, 154, 70, 28, this.mode === 1 ? '#53757e' : '#293941');
        this.rect(this.controls, 320, 154, 70, 28, this.mode === 3 ? '#53757e' : '#293941');
        this.textMode();
        ui.fillColor = new Color(82, 111, 121, 155); ui.circle(-345, -150, 75); ui.fill();
        ui.fillColor = new Color(176, 207, 202, 210); ui.circle(-345 + this.axis.x * 55, -150 + this.axis.y * 55, 27); ui.fill();
        ui.fillColor = new Color(151, 81, 55, 210); ui.circle(345, -150, 61); ui.fill();
        ui.fillColor = this.swordWave.ready ? new Color(67, 151, 158, 230) : new Color(67, 91, 96, 210);
        ui.circle(265, -65, 38); ui.fill();
    }

    private restartEncounter(): void {
        this.model.hp = 100; this.model.x = 0; this.model.y = 0;
        this.model.reset(); this.model.hitStun = this.model.invulnerable = this.model.knockX = 0;
        this.swordWave.reset();
        this.lastImpactId = this.model.impactId;
        this.retryTimer = 0;
        const starts = this.mode === 1 ? [[76, 2]] : [[76, -8], [-100, 16], [153, 25]];
        this.enemies = starts.map(([x, y], index) => new EnemyModel(x, y, index));
        while (this.enemyVisuals.length < this.enemies.length) {
            this.enemyVisuals.push(this.makeGraphics(`Enemy-${this.enemyVisuals.length}`));
        }
        this.enemyVisuals.forEach((view, index) => view.node.active = index < this.enemies.length);
    }

    private resolveMeleeHit(): void {
        for (const enemy of this.enemies) {
            if (enemy.state === 'dead' || enemy.state === 'stunned') continue;
            const dx = enemy.x - this.model.x, dy = enemy.y - this.model.y;
            if (Math.abs(dx) <= 52 && Math.abs(dy) <= 23 && dx * this.model.facing >= -8) enemy.hit(this.model.x);
        }
    }

    private castSwordWave(): void {
        if (!this.swordWave.cast()) return;
        this.model.reset();
        this.attackIds.clear();
    }

    private resolveSwordWaveHits(): void {
        for (const enemy of this.enemies) {
            if (enemy.state === 'dead' || enemy.state === 'stunned') continue;
            if (this.swordWave.hitsTarget(enemy.id, enemy.x, enemy.y + 13,
                this.model.x, this.model.y + 18, this.model.facing)) enemy.hit(this.model.x);
        }
    }

    private drawSwordWave(g: Graphics): void {
        const radius = this.swordWave.waveRadius;
        if (radius === null) return;
        const facing = this.model.facing;
        const centerX = this.model.x, centerY = this.model.y + 18;
        const inner = Math.max(0, radius - swordWaveTuning.thickness / 2);
        const outer = radius + swordWaveTuning.thickness / 2;
        const segments = 24;
        const start = facing > 0 ? -swordWaveTuning.halfAngle : Math.PI - swordWaveTuning.halfAngle;
        const end = facing > 0 ? swordWaveTuning.halfAngle : Math.PI + swordWaveTuning.halfAngle;
        const alpha = Math.round(210 * (1 - (this.swordWave.waveProgress ?? 0) * 0.45));
        g.fillColor = new Color(143, 232, 229, alpha);
        for (let i = 0; i <= segments; i++) {
            const angle = start + (end - start) * i / segments;
            const x = centerX + Math.cos(angle) * outer;
            const y = centerY + Math.sin(angle) * outer;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        for (let i = segments; i >= 0; i--) {
            const angle = start + (end - start) * i / segments;
            g.lineTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
        }
        g.close(); g.fill();
        g.strokeColor = new Color(223, 255, 251, alpha); g.lineWidth = 2;
        g.stroke();
    }

    private drawEnemies(g: Graphics): void {
        for (const enemy of this.enemies) {
            const visual = this.enemyVisuals[enemy.id];
            if (!visual) continue;
            visual.node.setScale(2, 2, 1);
            visual.node.setPosition(enemy.x * 2, enemy.y * 2);
            const eg = visual; eg.clear();
            if (enemy.state === 'dead') continue;
            if (enemy.state === 'telegraph') {
                g.fillColor = new Color(224, 67, 57, 75);
                g.rect(enemy.lockedX - 40, enemy.lockedY - 18, 80, 36); g.fill();
                g.strokeColor = new Color(255, 114, 90, 220); g.lineWidth = 2;
                g.rect(enemy.lockedX - 40, enemy.lockedY - 18, 80, 36); g.stroke();
            }
            const x = 0, y = 0;
            eg.fillColor = new Color(13, 19, 23, 140); eg.ellipse(x, y, 11, 4); eg.fill();
            this.rect(eg, x - 6, y + 2, 12, 14, enemy.flash > 0 ? '#f5ddd0' : '#806348');
            this.rect(eg, x - 5, y + 15, 10, 9, enemy.flash > 0 ? '#f5ddd0' : '#bb8960');
            this.rect(eg, x - 6, y + 21, 12, 4, '#443d37');
            const facing = Math.sign(this.model.x - enemy.x) || 1;
            this.rect(eg, facing * 3, y + 17, 2, 2, '#251f1b');
            if (enemy.state === 'telegraph') {
                eg.strokeColor = new Color(255, 136, 98); eg.lineWidth = 3;
                eg.moveTo(-7, 25); eg.lineTo(facing * 13, 13); eg.stroke();
            }
            this.drawHealthBar(enemy.x * 2 - 18, enemy.y * 2 + 54, enemy.hp, 3, '#ff967c');
        }
    }

    private sortActorsByDepth(): void {
        // Higher ground Y is farther away, so draw those actors first. Keep the
        // room behind them and the controls/labels in front of them.
        const actors = [
            { node: this.actor.node, y: this.model.y },
            ...this.enemies
                .filter(enemy => enemy.state !== 'dead')
                .map(enemy => ({ node: this.enemyVisuals[enemy.id].node, y: enemy.y })),
        ].sort((a, b) => b.y - a.y).map(actor => actor.node);
        if (actors.length === this.lastDepthOrder.length
            && actors.every((node, index) => node === this.lastDepthOrder[index])) return;
        const firstActorIndex = this.world.node.getSiblingIndex() + 1;
        actors.forEach((node, index) => node.setSiblingIndex(firstActorIndex + index));
        this.lastDepthOrder = actors;
    }

    private drawHealthBar(x: number, y: number, hp: number, max: number, fill: string): void {
        this.controls.fillColor = new Color(16, 24, 27, 225);
        this.controls.rect(x, y, 70, 7); this.controls.fill();
        this.controls.fillColor = new Color().fromHEX(fill);
        this.controls.rect(x + 1, y + 1, 68 * Math.max(0, hp) / max, 5); this.controls.fill();
    }

    private healthBar(hp: number, max: number): string {
        const cells = Math.max(0, Math.ceil(hp / max * 10));
        return `${'█'.repeat(cells)}${'░'.repeat(10 - cells)}`;
    }

    private textMode(): void {
        // Mode names are drawn into the same screen space as their clickable pills.
        // Label nodes stay stable across frames so the display does not flicker.
        if (!this.modeLabels) return;
        this.modeLabels[0].string = this.mode === 1 ? '单怪 ✓' : '单怪';
        this.modeLabels[1].string = this.mode === 3 ? '三怪 ✓' : '三怪';
    }

    private modeLabels: Label[] = [];
}
