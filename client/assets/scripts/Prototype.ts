import { _decorator, Component, Node, Graphics, Color, UITransform, Label,
    input, Input, EventTouch, EventKeyboard, KeyCode, Vec3, view, ResolutionPolicy, game, Game, profiler } from 'cc';
import { CombatModel, tuning, attackSpeedTuning } from './CombatModel';
import { WarriorView } from './WarriorView';
import { EnemyModel, CombatFeedback, hitSparkPixels, hitFeedbackTuning, damageText, EncounterModel, enemyKnockdownPolicies } from './EnemyModel';
import { WarriorSkillsModel, WarriorSkillId, warriorSkillNames, warriorSkillTuning, tryCastWarriorSkill } from './WarriorSkillsModel';
import { WarriorSpriteSheetView } from './WarriorSpriteSheetView';
import { WarriorSkillEffects } from './WarriorSkillEffects';
import { skillCuePixels, WarriorBodyAnimation } from './WarriorSkillAnimation';
import { BankPanel } from './ui/BankPanel';
import { connectBankPreview } from './net/BankPreview';
import type { BankCoordinator } from './net/BankCoordinator';
import { InventoryPanel } from './ui/InventoryPanel';
import { connectInventoryPreview } from './net/InventoryPreview';
import type { InventoryCoordinator } from './net/InventoryCoordinator';
import { buildEncounterRoomSpawnsForDungeon, type DungeonKind } from '../../../shared/src/encounter-layout.ts';
import { MovementCoordinator } from './net/MovementCoordinator';
import { connectChallengePreview } from './net/ChallengePreview';

const { ccclass } = _decorator;
const stages = ['交叉斩', '反手上挑', '下劈收势'];

@ccclass('Prototype')
export class Prototype extends Component {
    private model = new CombatModel();
    private canvas!: UITransform;
    private world!: Graphics;
    private actor!: Graphics;
    private enemyVisuals: Graphics[] = [];
    private lastDepthOrder: Node[] = [];
    private warrior = new WarriorView();
    private warriorSprite!: WarriorSpriteSheetView;
    private skills = new WarriorSkillsModel();
    private skillEffects = new WarriorSkillEffects();
    private controls!: Graphics;
    private status!: Label;
    private healthStatus!: Label;
    private skillLabels: Partial<Record<WarriorSkillId, Label>> = {};
    private stickId: number | null = null;
    private attackIds = new Set<number>();
    private axis = { x: 0, y: 0 };
    private keys = new Set<KeyCode>();
    private accumulator = 0;
    private fpsTime = 0;
    private frames = 0;
    private fps = 0;
    private enemies: EnemyModel[] = [];
    private enemyLabels: Label[] = [];
    private feedback = new CombatFeedback();
    private damageLabels: Label[] = [];
    private bodyAnimation = new WarriorBodyAnimation();
    private speedLabels: Label[] = [];
    private lastImpactId = 0;
    private mode: 1 | 3 | 7 = 7;
    private dungeonKind: DungeonKind = 'first';
    private roomNo = 0;
    private roomCleared = false;
    private encounter = new EncounterModel();
    private roundLabel!: Label;
    private bankPanel: BankPanel | null = null;
    private bankConnecting = false;
    private bankGeneration = 0;
    private bankKeyHeld = false;
    private bankHadStats = false;
    private inventoryPanel: InventoryPanel | null = null;
    private inventoryConnecting = false;
    private inventoryConnectGeneration = 0;
    private inventoryKeyHeld = false;
    private inventoryHadStats = false;
    private inventoryNotice!: Label;
    private operationSequence = 0;
    private challengeCoordinator: MovementCoordinator | null = null;
    private challengeConnecting = false;
    private challengeGeneration = 0;
    private challengeNotice!: Label;
    private challengeTick = 0;

    onLoad(): void {
        view.setDesignResolutionSize(960, 540, ResolutionPolicy.SHOW_ALL);
        this.canvas = this.node.getComponent(UITransform)!;
        this.world = this.makeGraphics('World');
        this.world.node.setScale(2, 2, 1);
        this.actor = this.makeGraphics('Warrior');
        this.warriorSprite = new WarriorSpriteSheetView(this.actor.node);
        this.controls = this.makeGraphics('Controls');
        this.text('308 动作样板 · 战士技能与三副本实机联调', -30, 242, 22, 730);
        this.text('背包 B', 430, 242, 16, 80);
        this.text('银行 N', 430, 198, 16, 80);
        this.inventoryNotice = this.text('N：银行（需本机预览服务）', 0, 150, 17, 800);
        this.challengeNotice = this.text('战斗链路：本地沙盒模式（按 C 或传参 challengePreview=1 连权威服务）', 0, 126, 14, 800);
        this.text('WASD/摇杆移动 · 空格普攻 · E/F/Q/G技能 · 1首本/2工坊/3裂隙 · 走向右侧绿门/换房', 0, 212, 14);
        this.healthStatus = this.text('', -130, 178, 17, 660);
        this.healthStatus.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.healthStatus.overflow = Label.Overflow.SHRINK;
        this.healthStatus.enableWrapText = false;
        this.status = this.text('', 0, -242, 17);
        this.status.overflow = Label.Overflow.SHRINK;
        this.status.enableWrapText = false;
        this.roundLabel = this.text('', 0, 75, 20, 850);
        this.modeLabels = [
            this.text('首本', 215, 168, 14, 55),
            this.text('工坊', 275, 168, 14, 55),
            this.text('裂隙', 335, 168, 14, 55),
            this.text('换房', 395, 168, 14, 55),
        ];
        this.text('摇杆', -345, -218, 18);
        this.text('普攻', 345, -160, 22);
        const skillButtons: { id: WarriorSkillId; x: number; label: string }[] = [
            { id: 'cross', x: 150, label: '十字斩 E' },
            { id: 'bengshan', x: 215, label: '崩山 F' },
            { id: 'badao', x: 280, label: '拔刀 Q' },
            { id: 'earth', x: 345, label: '大蹦 G' },
        ];
        for (const button of skillButtons) this.skillLabels[button.id] = this.text(button.label, button.x, -65, 11, 62);
        this.text('受击预警 · 走出红框躲避', 0, -208, 16);
        this.speedLabels = attackSpeedTuning.presets.map((rate, index) => this.text(`${rate}×`, -360 + index * 70, 126, 12, 64));
        this.restartEncounter();
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('challengePreview') === '1') {
            void this.toggleChallenge();
        }
        input.on(Input.EventType.TOUCH_START, this.touchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
        input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.on(Input.EventType.KEY_UP, this.keyUp, this);
        game.on(Game.EVENT_HIDE, this.onHideInput, this);
    }

    onDestroy(): void {
        ++this.inventoryConnectGeneration;
        input.off(Input.EventType.TOUCH_START, this.touchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
        input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.off(Input.EventType.KEY_UP, this.keyUp, this);
        game.off(Game.EVENT_HIDE, this.onHideInput, this);
        ++this.bankGeneration;
        this.bankPanel?.dispose();
        this.inventoryPanel?.dispose();
        this.warriorSprite.dispose();
    }

    /** Production login may inject an authenticated transport; the action sample never invents assets. */
    public attachInventory(coordinator: InventoryCoordinator, labels: Record<string, string>, assignable: ReadonlySet<string>, preview = false): void {
        this.inventoryPanel?.dispose();
        this.inventoryPanel = new InventoryPanel(this.node, coordinator, {
            nextOperationId: () => `bag-${Date.now().toString(36)}-${++this.operationSequence}-${Math.random().toString(36).slice(2, 10)}`,
            templateLabel: id => labels[id] ?? id,
            canAssign: id => assignable.has(id),
            onVisibility: visible => {
                if (visible) { this.clearInput(); this.inventoryHadStats = profiler.isShowingStats(); profiler.hideStats(); }
                else if (this.inventoryHadStats) profiler.showStats();
            },
        });
        this.inventoryNotice.string = preview ? '本机背包试玩 · 临时数据' : '';
    }

    public attachBank(coordinator: BankCoordinator, contextId: string, labels: Record<string, string>): void {
        this.bankPanel?.dispose();
        this.bankPanel = new BankPanel(this.node, coordinator, { contextId,
            nextOperationId: () => `bank-${Date.now().toString(36)}-${++this.operationSequence}-${Math.random().toString(36).slice(2, 10)}`,
            templateLabel: id => labels[id] ?? id,
            onVisibility: visible => { if (visible) { this.clearInput(); this.bankHadStats = profiler.isShowingStats(); profiler.hideStats(); } else if (this.bankHadStats) profiler.showStats(); },
        });
    }

    public attachChallenge(coordinator: MovementCoordinator, preview = false): void {
        this.challengeCoordinator = coordinator;
        this.challengeNotice.string = preview ? '权威战斗已连接 · MovementCoordinator 服务端驱动' : '';
    }

    private async toggleChallenge(): Promise<void> {
        if (this.challengeCoordinator) {
            this.challengeCoordinator = null;
            this.challengeNotice.string = '战斗链路：已切换回本地沙盒模式';
            return;
        }
        if (this.challengeConnecting) return;
        const gen = ++this.challengeGeneration;
        this.challengeConnecting = true;
        this.challengeNotice.string = '正在连接权威战斗服务…';
        try {
            const preview = await connectChallengePreview();
            if (!this.isValid || gen !== this.challengeGeneration) return;
            this.attachChallenge(preview.coordinator, true);
        } catch {
            if (this.isValid && gen === this.challengeGeneration) {
                this.challengeNotice.string = '权威战斗服务未启动（8790 端口未就绪）；保持本地沙盒模式';
            }
        } finally {
            if (gen === this.challengeGeneration) this.challengeConnecting = false;
        }
    }
    private async toggleBank(): Promise<void> {
        if (this.bankPanel?.isOpen) { this.bankPanel.close(); return; }
        if (this.inventoryPanel?.isOpen || this.inventoryConnecting) return;
        if (this.bankConnecting) { ++this.bankGeneration; this.bankConnecting = false; this.inventoryNotice.string = ''; return; }
        if (!this.bankPanel) {
            const generation = ++this.bankGeneration; this.bankConnecting = true; this.inventoryNotice.string = '正在连接银行…';
            try { const preview = await connectBankPreview(); if (!this.isValid || generation !== this.bankGeneration) return; this.attachBank(preview.coordinator, preview.contextId, preview.labels); this.inventoryNotice.string = '本机银行试玩 · 临时数据与测试价格'; }
            catch { if (this.isValid && generation === this.bankGeneration) this.inventoryNotice.string = '银行尚未连接；本机试玩需启用 bankPreview 并启动银行服务'; return; }
            finally { if (generation === this.bankGeneration) this.bankConnecting = false; }
        }
        await this.bankPanel?.open();
    }

    private async toggleInventory(): Promise<void> {
        if (this.bankPanel?.isOpen || this.bankConnecting) return;
        if (this.inventoryPanel?.isOpen) { this.inventoryPanel.close(); return; }
        if (this.inventoryConnecting) { ++this.inventoryConnectGeneration; this.inventoryConnecting = false; this.inventoryNotice.string = ''; return; }
        if (!this.inventoryPanel) {
            const generation = ++this.inventoryConnectGeneration;
            this.inventoryConnecting = true;
            this.inventoryNotice.string = '正在连接背包…';
            try {
                const preview = await connectInventoryPreview();
                if (!this.isValid || generation !== this.inventoryConnectGeneration) return;
                this.attachInventory(preview.coordinator, preview.labels, preview.assignable, true);
            } catch {
                if (this.isValid && generation === this.inventoryConnectGeneration) this.inventoryNotice.string = '背包尚未连接，请先登录；本机试玩需启动背包预览服务';
                return;
            } finally { if (generation === this.inventoryConnectGeneration) this.inventoryConnecting = false; }
        }
        await this.inventoryPanel?.open();
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
        if (this.inventoryPanel?.isOpen || this.bankPanel?.isOpen) return;
        const id = e.getID();
        if (id === null) return;
        const p = this.point(e);
        if (p.x >= 390 && p.x <= 470 && p.y >= 180 && p.y <= 215) { void this.toggleBank(); return; }
        if (p.x >= 390 && p.x <= 470 && p.y >= 225 && p.y <= 260) { void this.toggleInventory(); return; }
        if (this.inventoryConnecting || this.bankConnecting) return;
        if (Math.abs(p.x) < 410 && p.y > 45 && p.y < 105 && this.encounter.state !== 'fighting') {
            if (this.encounter.state !== 'ready') this.restartEncounter();
            this.encounter.start();
            return;
        }
        if (p.y >= 110 && p.y <= 142 && p.x >= -394 && p.x <= -186) {
            const index = Math.max(0, Math.min(2, Math.floor((p.x + 395) / 70)));
            this.model.setAttackSpeedBonuses({ buff: attackSpeedTuning.presets[index] - 1 });
            return;
        }
        if (p.y > 145 && p.y < 190 && Math.abs(p.x - 215) < 28) {
            this.mode = 7; this.dungeonKind = 'first'; this.roomNo = 0; this.restartEncounter();
        } else if (p.y > 145 && p.y < 190 && Math.abs(p.x - 275) < 28) {
            this.mode = 7; this.dungeonKind = 'workshop'; this.roomNo = 0; this.restartEncounter();
        } else if (p.y > 145 && p.y < 190 && Math.abs(p.x - 335) < 28) {
            this.mode = 7; this.dungeonKind = 'rift'; this.roomNo = 0; this.restartEncounter();
        } else if (p.y > 145 && p.y < 190 && Math.abs(p.x - 395) < 28) {
            if (this.roomNo < 6) {
                this.roomNo++;
                this.restartEncounter();
                this.encounter.start();
            }
        } else if (this.encounter.state !== 'fighting') {
            return;
        } else if (this.touchSkillButton(p.x, p.y)) {
            return;
        } else if (this.stickId === null && Math.hypot(p.x + 345, p.y + 150) < 95) {
            this.stickId = id;
            this.touchMove(e);
        } else if (Math.hypot(p.x - 345, p.y + 150) < 68 && !this.skills.casting) {
            this.attackIds.add(id);
            this.model.press();
        }
    }

    private touchMove(e: EventTouch): void {
        if (this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting) return;
        if (e.getID() !== this.stickId) return;
        const p = this.point(e);
        const x = (p.x + 345) / 68;
        const y = (p.y + 150) / 68;
        const scale = Math.max(1, Math.hypot(x, y));
        this.axis = { x: x / scale, y: y / scale };
    }

    private touchEnd(e: EventTouch): void {
        if (this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting) return;
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
        if (e.keyCode === KeyCode.KEY_C) { void this.toggleChallenge(); return; }
        if (e.keyCode === KeyCode.KEY_N) { if (!this.bankKeyHeld) { this.bankKeyHeld = true; void this.toggleBank(); } return; }
        if (e.keyCode === KeyCode.ESCAPE && this.bankConnecting) { ++this.bankGeneration; this.bankConnecting = false; this.inventoryNotice.string = ''; return; }
        if (e.keyCode === KeyCode.ESCAPE && this.bankPanel?.isOpen) { this.bankPanel.close(); return; }
        if (e.keyCode === KeyCode.KEY_B) { if (!this.inventoryKeyHeld) { this.inventoryKeyHeld = true; void this.toggleInventory(); } return; }
        if (e.keyCode === KeyCode.ESCAPE && this.inventoryConnecting) { ++this.inventoryConnectGeneration; this.inventoryConnecting = false; this.inventoryNotice.string = ''; return; }
        if (e.keyCode === KeyCode.ESCAPE && this.inventoryPanel?.isOpen) { this.inventoryPanel.close(); return; }
        if (this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting) return;
        if (e.keyCode === KeyCode.ENTER && this.encounter.state !== 'fighting') {
            if (this.encounter.state !== 'ready') this.restartEncounter();
            this.encounter.start(); return;
        }
        if (e.keyCode === KeyCode.KEY_R) { this.restartEncounter(); return; }
        if (e.keyCode === KeyCode.DIGIT_1) {
            this.mode = 7; this.dungeonKind = 'first'; this.roomNo = 0; this.restartEncounter(); return;
        }
        if (e.keyCode === KeyCode.DIGIT_2) {
            this.mode = 7; this.dungeonKind = 'workshop'; this.roomNo = 0; this.restartEncounter(); return;
        }
        if (e.keyCode === KeyCode.DIGIT_3) {
            this.mode = 7; this.dungeonKind = 'rift'; this.roomNo = 0; this.restartEncounter(); return;
        }
        if (this.encounter.state !== 'fighting') return;
        if (this.keys.has(e.keyCode)) return;
        this.keys.add(e.keyCode);
        if (e.keyCode === KeyCode.SPACE && !this.skills.casting) this.model.press();
        if (e.keyCode === KeyCode.KEY_E) this.castSkill('cross');
        if (e.keyCode === KeyCode.KEY_F) this.castSkill('bengshan');
        if (e.keyCode === KeyCode.KEY_Q) this.castSkill('badao');
        if (e.keyCode === KeyCode.KEY_G) this.castSkill('earth');
    }

    private keyUp(e: EventKeyboard): void {
        if (e.keyCode === KeyCode.KEY_N) this.bankKeyHeld = false;
        if (e.keyCode === KeyCode.KEY_B) this.inventoryKeyHeld = false;
        this.keys.delete(e.keyCode);
        if (e.keyCode === KeyCode.SPACE && this.attackIds.size === 0) this.model.release();
    }

    private onHideInput(): void { this.bankKeyHeld = false; if (this.bankConnecting) { ++this.bankGeneration; this.bankConnecting = false; } this.inventoryKeyHeld = false; if (this.inventoryConnecting) { ++this.inventoryConnectGeneration; this.inventoryConnecting = false; this.inventoryNotice.string = ''; } this.clearInput(); }

    private clearInput(): void {
        this.keys.clear(); this.attackIds.clear(); this.stickId = null;
        this.axis = { x: 0, y: 0 }; this.model.release(); this.model.buffered = false;
    }

    update(dt: number): void {
        this.inventoryPanel?.update();
        this.bankPanel?.update();
        this.frames++; this.fpsTime += dt;
        if (this.fpsTime >= 0.5) { this.fps = Math.round(this.frames / this.fpsTime); this.frames = this.fpsTime = 0; }
        const has = (a: KeyCode, b: KeyCode) => Number(this.keys.has(a) || this.keys.has(b));
        const inventoryBlocked = this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting;
        const x = inventoryBlocked ? 0 : this.horizontalInput();
        const y = inventoryBlocked ? 0 : this.stickId !== null ? this.axis.y : has(KeyCode.KEY_W, KeyCode.ARROW_UP) - has(KeyCode.KEY_S, KeyCode.ARROW_DOWN);
        this.accumulator += Math.min(dt, 0.1);
        while (this.accumulator >= 1 / 120) {
            const fixedDt = 1 / 120;
            if (this.encounter.state !== 'fighting') {
                this.feedback.update(fixedDt);
                for (const enemy of this.enemies) if (enemy.state === 'dead') enemy.update(fixedDt, this.model, true);
                this.accumulator -= fixedDt; continue;
            }
            if (this.feedback.update(fixedDt)) { this.accumulator -= fixedDt; continue; }
            this.skillEffects.update(fixedDt);
            this.skills.update(fixedDt);
            if (this.challengeCoordinator) {
                this.challengeTick++;
                if (x !== 0 || y !== 0) {
                    try {
                        this.challengeCoordinator.enqueue({
                            seq: 0,
                            tick: this.challengeTick,
                            kind: 'move',
                            x: Math.round(x * 1000),
                            y: Math.round(y * 1000),
                        });
                    } catch {}
                }
                if (this.keys.has(KeyCode.SPACE)) {
                    try {
                        this.challengeCoordinator.enqueue({
                            seq: 0,
                            tick: this.challengeTick,
                            kind: 'basic',
                            pressed: true,
                        });
                    } catch {}
                }
                try {
                    this.challengeCoordinator.predict(this.challengeTick);
                } catch {}
                if (this.challengeTick % 10 === 0 && this.challengeCoordinator.state.queued > 0) {
                    void this.challengeCoordinator.submit(`op-${this.challengeTick}`, this.challengeTick);
                }
                const coordMonsters = this.challengeCoordinator.state.monsters;
                if (coordMonsters && coordMonsters.length > 0) {
                    for (let i = 0; i < Math.min(this.enemies.length, coordMonsters.length); i++) {
                        const cm = coordMonsters[i];
                        if (cm.action && cm.action.superArmorEndTick && cm.action.superArmorEndTick > this.challengeTick) {
                            this.enemies[i].superArmor = true;
                        }
                    }
                }
            }
            if (this.skills.casting && this.skills.canMove && (x !== 0 || y !== 0)) this.skills.cancel();
            this.model.update(fixedDt, this.skills.casting ? 0 : x, this.skills.casting ? 0 : y);
            this.model.x = Math.max(-218, Math.min(218, this.model.x + this.skills.motionDelta));
            this.skills.resolveHits(this.enemies, this.model.x, this.model.y);
            if (this.skills.lastImpact) this.resolveSkillImpact(this.skills.lastImpact, fixedDt);
            if (this.model.impactId !== this.lastImpactId) {
                this.lastImpactId = this.model.impactId;
                this.resolveMeleeHit();
            }
            const hpBeforeEnemies = this.model.hp;
            for (const enemy of this.enemies) enemy.update(fixedDt, this.model);
            this.feedback.observe(this.enemies);
            if (this.model.hp < hpBeforeEnemies) this.skills.cancel();
            if (this.model.hp <= 0) this.skillEffects.clear();
            this.bodyAnimation.update(fixedDt, this.model.moving, this.model.running, this.model.hitStun,
                this.skills.casting || this.model.stage >= 0, this.model.hp <= 0);
            this.encounter.update(fixedDt, this.model.hp, this.enemies);
            if (this.encounter.state === 'victory') {
                this.roomCleared = true;
            }
            if (this.encounter.state !== 'fighting' && !this.roomCleared) {
                this.clearInput(); this.model.reset(); this.model.moving = this.model.running = false;
                this.skills.cancel(); this.skillEffects.clear();
            }
            if (this.roomCleared && this.roomNo < 6 && this.model.x >= 170 && Math.abs(this.model.y - 20) <= 30) {
                this.roomNo++;
                this.restartEncounter();
                this.encounter.start();
            }
            this.accumulator -= fixedDt;
        }
        const round = this.encounter.state;
        const dName = this.dungeonKind === 'first' ? '首本牛头怪' : (this.dungeonKind === 'workshop' ? '失落工坊' : '裂隙遗址');
        this.roundLabel.string = this.roomCleared
            ? (this.roomNo < 6 ? '清场完毕！走向右侧绿门换房 ▶' : '通关！已击败首领！按R重新挑战')
            : round === 'fighting' ? ''
            : round === 'ready' ? `[${dName} R${this.roomNo + 1}/7] 点击场地上方开始战斗 / Enter`
            : `战败 · ${this.encounter.elapsed.toFixed(1)}秒 · 点击再挑战 / Enter`;
        this.draw(dt);
        const aliveEnemies = this.enemies.filter(e => e.state !== 'dead').length;
        this.healthStatus.string = `战士 ${this.healthBar(this.model.hp, 100)}   法力 ${this.skills.mana}/${this.skills.maxMana}   [${dName} R${this.roomNo + 1}/7] 敌怪: ${aliveEnemies}/${this.enemies.length}`;
        const state = round !== 'fighting' ? '点击场地上方文字开始 / 再挑战' : this.enemies.some(enemy => enemy.state === 'telegraph') ? '红色预警 · 离开锁定区域' : '攻击怪物，闪开预警';
        const skillState = this.skills.activeId
            ? `${warriorSkillNames[this.skills.activeId]}出招`
            : '十字斩 / 崩山击 / 拔刀斩 / 崩山裂地斩';
        this.status.string = `${this.fps} FPS | 攻速${this.model.attackSpeedMultiplier.toFixed(2)}× | ${state} | ${this.model.stage < 0 ? (this.model.moving ? (this.model.running ? '跑' : '走') : '待机') : stages[this.model.stage]} | ${skillState}`;
        this.speedLabels.forEach((label, index) => label.color = new Color().fromHEX(
            this.model.attackSpeedMultiplier === attackSpeedTuning.presets[index] ? '#a5ffcf' : '#d0dadd'));
        this.updateSkillLabels();
    }

    private rect(g: Graphics, x: number, y: number, w: number, h: number, color: string): void {
        g.fillColor = new Color().fromHEX(color); g.rect(x, y, w, h); g.fill();
    }

    private draw(dt: number): void {
        const ui = this.controls;
        ui.clear();
        this.rect(ui, 390, 225, 80, 32, '#334a50');
        const g = this.world;
        const shake = this.feedback.shakeOffset;
        g.node.setPosition(shake.x * 2, shake.y * 2);
        g.clear();
        this.rect(g, -240, -135, 480, 270, '#18252d');
        this.rect(g, -232, -42, 464, 135, '#34433d');
        if (this.roomNo < 6) {
            const doorColor = this.roomCleared ? new Color(70, 230, 110, 220) : new Color(180, 50, 50, 150);
            const doorFill = this.roomCleared ? new Color(50, 200, 90, 80) : new Color(120, 30, 30, 60);
            g.fillColor = doorFill;
            g.rect(185, 0, 25, 40); g.fill();
            g.strokeColor = doorColor; g.lineWidth = 2;
            g.rect(185, 0, 25, 40); g.stroke();
        }
        g.strokeColor = new Color(71, 87, 75); g.lineWidth = 0.5;
        for (let x = -224; x < 240; x += 16) { g.moveTo(x, -42); g.lineTo(x, 93); }
        for (let y = -42; y <= 93; y += 16) { g.moveTo(-232, y); g.lineTo(232, y); }
        g.stroke();
        const m = this.model;
        this.drawSkillEffect(g);
        this.drawEnemies(g);
        const x = Math.round(m.x), y = Math.round(m.y);
        g.fillColor = new Color(15, 24, 25, 150); g.ellipse(x, y, 14, 4.8); g.fill();
        this.actor.node.setPosition((x + shake.x) * 2, (y + this.skills.jumpLift + shake.y) * 2);
        this.actor.node.setScale(2.4 * m.facing, 2.4, 1);
        this.actor.node.active = m.hitStun > 0 || m.invulnerable <= 0 || Math.floor(m.invulnerable * 16) % 2 === 0;
        const useSprite = this.bodyAnimation.frame !== null && (m.hitStun > 0 || m.hp <= 0)
            ? this.warriorSprite.showBody(this.bodyAnimation.frame) || this.warriorSprite.showReady()
            : this.skills.activeId
            ? this.warriorSprite.showSkill(this.skills.activeId, this.skills.elapsed)
            : (m.stage >= 0
            ? this.warriorSprite.showAttack(m.stage, m.elapsed)
            : this.bodyAnimation.frame !== null ? this.warriorSprite.showBody(this.bodyAnimation.frame, this.bodyAnimation.gaitFrame) || this.warriorSprite.showReady() : this.warriorSprite.showReady());
        this.actor.enabled = !useSprite;
        if (!useSprite) {
            this.warriorSprite.hide();
            const skillProgress = this.skills.progress;
            this.warrior.draw(this.actor, m, Math.min(dt, 0.05), this.skills.activeId && skillProgress !== null
                ? { id: this.skills.activeId, progress: skillProgress } : null);
        }
        for (const cue of skillCuePixels(this.skills.activeId, this.skills.elapsed)) {
            ui.fillColor = new Color(206, 246, 255, Math.round(cue.alpha * 255));
            ui.rect(Math.round(m.x + cue.x * this.skills.facing + shake.x) * 2,
                Math.round(m.y + cue.y + shake.y) * 2, cue.size * 2, cue.size * 2); ui.fill();
        }
        for (const spark of this.feedback.sparks) {
            for (const pixel of hitSparkPixels(spark.age, spark.heavy)) {
                ui.fillColor = pixel.core ? new Color(255, 250, 222) : new Color(255, 191, 83,
                    Math.round(255 * (1 - spark.age / hitFeedbackTuning.sparkLife)));
                ui.rect(Math.round(spark.x + pixel.x + shake.x) * 2, Math.round(spark.y + pixel.y + shake.y) * 2, pixel.size * 2, pixel.size * 2); ui.fill();
            }
        }
        while (this.damageLabels.length < this.feedback.numbers.length) {
            this.damageLabels.push(this.text('', 0, 0, 16, 64));
        }
        this.damageLabels.forEach((label, index) => {
            const number = this.feedback.numbers[index];
            label.node.active = !!number;
            if (!number) return;
            const progress = number.age / hitFeedbackTuning.numberLife;
            label.string = damageText(number.damage);
            label.color = new Color(255, number.heavy ? 188 : 239, number.heavy ? 99 : 210,
                Math.round(255 * Math.min(1, (1 - progress) * 2)));
            label.node.setPosition((number.x + shake.x) * 2, (number.y + progress * 12 + shake.y) * 2);
        });
        for (let index = 0; index < attackSpeedTuning.presets.length; index++) {
            this.rect(ui, -392 + index * 70, 112, 64, 28,
                m.attackSpeedMultiplier === attackSpeedTuning.presets[index] ? '#376554' : '#293941');
        }
        this.sortActorsByDepth();
        this.drawHealthBar(-330, 154, m.hp, 100, '#65d6b2');
        this.rect(this.controls, 185, 154, 55, 28, this.dungeonKind === 'first' ? '#53757e' : '#293941');
        this.rect(this.controls, 245, 154, 55, 28, this.dungeonKind === 'workshop' ? '#53757e' : '#293941');
        this.rect(this.controls, 305, 154, 55, 28, this.dungeonKind === 'rift' ? '#53757e' : '#293941');
        this.rect(this.controls, 365, 154, 55, 28, this.roomCleared ? '#3e7855' : '#293941');
        this.textMode();
        ui.fillColor = new Color(82, 111, 121, 155); ui.circle(-345, -150, 75); ui.fill();
        ui.fillColor = new Color(176, 207, 202, 210); ui.circle(-345 + this.axis.x * 55, -150 + this.axis.y * 55, 27); ui.fill();
        ui.fillColor = new Color(151, 81, 55, 210); ui.circle(345, -150, 61); ui.fill();
        const skillButtons: { id: WarriorSkillId; x: number }[] = [
            { id: 'cross', x: 150 }, { id: 'bengshan', x: 215 }, { id: 'badao', x: 280 }, { id: 'earth', x: 345 },
        ];
        for (const button of skillButtons) {
            ui.fillColor = this.skills.ready(button.id) ? new Color(67, 151, 158, 230) : new Color(67, 91, 96, 210);
            ui.circle(button.x, -65, 29); ui.fill();
        }
    }

    private restartEncounter(): void {
        this.clearInput(); this.encounter.reset(); this.accumulator = 0;
        this.model.hp = 100; this.model.x = -140; this.model.y = 20;
        this.model.reset(); this.model.hitStun = this.model.invulnerable = this.model.knockX = 0;
        this.skills.reset();
        this.skillEffects.clear();
        this.feedback.clear();
        this.bodyAnimation.reset();
        this.lastImpactId = this.model.impactId;
        this.roomCleared = false;

        if (this.mode === 1) {
            this.enemies = [new EnemyModel(76, 2, 0, 3, enemyKnockdownPolicies.normal, 'ordinary', 'humanoid', 'melee')];
        } else if (this.mode === 3) {
            this.enemies = [
                new EnemyModel(76, -8, 0, 3, enemyKnockdownPolicies.normal, 'ordinary', 'humanoid', 'melee'),
                new EnemyModel(-60, 16, 1, 3, enemyKnockdownPolicies.normal, 'ordinary', 'humanoid', 'ranged'),
                new EnemyModel(140, 25, 2, 3, enemyKnockdownPolicies.normal, 'ordinary', 'humanoid', 'charge'),
            ];
        } else {
            const spawns = buildEncounterRoomSpawnsForDungeon(this.dungeonKind, this.roomNo, null, 'monster');
            this.enemies = spawns.map((s, index) => {
                const maxHp = s.role === 'boss' ? 15 : (s.role === 'elite' ? 6 : (s.role === 'purple' ? 4 : 3));
                const kdPolicy = s.role === 'boss' ? enemyKnockdownPolicies.boss : (s.role === 'elite' ? enemyKnockdownPolicies.elite : enemyKnockdownPolicies.normal);
                return new EnemyModel(
                    Math.round(s.x / 1000),
                    Math.round(s.y / 1000),
                    index,
                    maxHp,
                    kdPolicy,
                    s.role,
                    s.category ?? 'humanoid',
                    s.tacticsKind
                );
            });
        }
        while (this.enemyVisuals.length < this.enemies.length) {
            this.enemyVisuals.push(this.makeGraphics(`Enemy-${this.enemyVisuals.length}`));
        }
        this.enemyVisuals.forEach((view, index) => view.node.active = index < this.enemies.length);
        while (this.enemyLabels.length < this.enemies.length) {
            this.enemyLabels.push(this.text('', 0, 0, 11, 80));
        }
        this.enemyLabels.forEach((lbl, index) => lbl.node.active = index < this.enemies.length);
    }

    private resolveMeleeHit(): void {
        for (const enemy of this.enemies) {
            if (enemy.state === 'dead') continue;
            const dx = enemy.x - this.model.x, dy = enemy.y - this.model.y;
            if (Math.abs(dx) <= 52 && Math.abs(dy) <= 23 && dx * this.model.facing >= -8) enemy.hit(this.model.x);
        }
    }

    private horizontalInput(): number {
        return this.stickId !== null ? this.axis.x
            : Number(this.keys.has(KeyCode.KEY_D) || this.keys.has(KeyCode.ARROW_RIGHT))
                - Number(this.keys.has(KeyCode.KEY_A) || this.keys.has(KeyCode.ARROW_LEFT));
    }

    private castSkill(id: WarriorSkillId): void {
        if (this.encounter.state !== 'fighting') return;
        if (!tryCastWarriorSkill(this.model, this.skills, id, this.feedback, this.horizontalInput())) return;
        this.model.release();
        this.attackIds.clear();
    }

    private touchSkillButton(x: number, y: number): boolean {
        if (Math.abs(y + 65) > 34) return false;
        const buttons: { id: WarriorSkillId; x: number }[] = [
            { id: 'cross', x: 150 }, { id: 'bengshan', x: 215 }, { id: 'badao', x: 280 }, { id: 'earth', x: 345 },
        ];
        const button = buttons.find(item => Math.hypot(x - item.x, y + 65) < 31);
        if (!button) return false;
        this.castSkill(button.id);
        return true;
    }

    private updateSkillLabels(): void {
        const controls: { id: WarriorSkillId; key: string; short: string }[] = [
            { id: 'cross', key: 'E', short: '十字' },
            { id: 'bengshan', key: 'F', short: '崩山' },
            { id: 'badao', key: 'Q', short: '拔刀' },
            { id: 'earth', key: 'G', short: '大蹦' },
        ];
        for (const item of controls) {
            const label = this.skillLabels[item.id];
            if (!label) continue;
            const cooldown = this.skills.cooldown(item.id);
            label.string = cooldown > 0 ? `${item.short} ${cooldown.toFixed(1)}`
                : this.skills.mana < warriorSkillTuning[item.id].manaCost ? `${item.short} 缺蓝`
                    : `${item.short} ${item.key}`;
        }
    }

    private resolveSkillImpact(id: WarriorSkillId, step: number): void {
        this.feedback.groundImpact(id);
        // Enemies consume this same simulation step below. Age the new effect by
        // the same amount so ultimate knockdown cannot end a frame before it.
        const offsetX = id === 'earth' ? this.skills.facing * 64 : 0;
        this.skillEffects.impact(id, this.model.x + offsetX, this.model.y, this.skills.facing, step);
    }

    private drawSkillEffect(g: Graphics): void {
        // First cross stroke precedes the single contact event at 290ms.
        if (this.skills.activeId === 'cross' && this.skills.elapsed >= 0.17 && this.skills.elapsed < 0.29) {
            this.slashBand(g, this.model.x + this.skills.facing * 29, this.model.y + 22,
                43, 3, 0, new Color(179, 241, 255, 210), this.skills.facing);
        }
        for (const effect of this.skillEffects.items) {
            const { id, x, y, facing, age, lifetime } = effect;
            const fade = Math.max(0, 1 - age / lifetime);
            if (id === 'cross') {
                const cx = x + facing * (29 + Math.max(0, age - 0.05) * 260);
                this.slashBand(g, cx, y + 22, 43, 3 * fade, 0, new Color(177, 237, 255, Math.round(210 * fade)), facing);
                this.slashBand(g, cx, y + 22, 45, 4 * fade, Math.PI / 2, new Color(240, 253, 255, Math.round(240 * fade)), facing);
            } else if (id === 'badao') {
                // Front-only elliptical crescent; no misleading full 360-degree ring.
                const radius = 85 + Math.min(1, age / 0.1) * 57;
                for (const [thickness, opacity] of [[7, 100], [2.3, 240]]) {
                    g.strokeColor = new Color(194, 248, 255, Math.round(opacity * fade)); g.lineWidth = thickness * fade;
                    for (let i = 0; i <= 24; i++) {
                        const a = -Math.PI / 2 + i / 24 * Math.PI;
                        const px = x + facing * Math.cos(a) * radius;
                        const py = y + 22 + Math.sin(a) * 34;
                        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
                    }
                    g.stroke();
                }
            } else {
                const large = id === 'earth';
                const radius = large ? 82 : warriorSkillTuning[id].range;
                const grow = Math.min(1, age / (large ? 0.18 : 0.16));
                g.strokeColor = new Color(255, large ? 124 : 203, 112, Math.round(190 * fade));
                g.lineWidth = large ? 2.5 : 1.5;
                g.ellipse(x, y, radius * grow, radius * grow); g.stroke();
                for (let i = 0; i < (large ? 12 : 7); i++) {
                    const a = i * Math.PI * 2 / (large ? 12 : 7);
                    const length = radius * grow * (0.72 + (i % 3) * 0.12);
                    g.moveTo(x, y);
                    g.lineTo(x + Math.cos(a + 0.09) * length * 0.48, y + Math.sin(a + 0.09) * length * 0.48);
                    g.lineTo(x + Math.cos(a) * length, y + Math.sin(a) * length);
                }
                g.stroke();
                if (large && age >= 0.12 && age < 0.60) {
                    const pulse = Math.sin((age - 0.12) / 0.48 * Math.PI);
                    for (let i = 0; i < 9; i++) {
                        const a = i * 2.39996;
                        const px = x + Math.cos(a) * radius * 0.68;
                        const py = y + Math.sin(a) * radius * 0.55;
                        const height = (26 + i % 3 * 9) * pulse;
                        g.fillColor = new Color(255, 135 + i % 3 * 24, 65, Math.round(115 * pulse));
                        g.moveTo(px - 5, py); g.lineTo(px - 2, py + height * 0.58);
                        g.lineTo(px + 2, py + height); g.lineTo(px + 6, py); g.close(); g.fill();
                    }
                }
            }
        }
    }

    private slashBand(g: Graphics, centerX: number, centerY: number, length: number, width: number,
        angle: number, color: Color, facing: number): void {
        const direction = { x: Math.cos(angle) * facing, y: Math.sin(angle) };
        const side = { x: -direction.y, y: direction.x };
        const a = { x: centerX - direction.x * length / 2, y: centerY - direction.y * length / 2 };
        const b = { x: centerX + direction.x * length / 2, y: centerY + direction.y * length / 2 };
        g.fillColor = color;
        g.moveTo(a.x + side.x * width / 2, a.y + side.y * width / 2);
        g.lineTo(b.x + side.x * width / 2, b.y + side.y * width / 2);
        g.lineTo(b.x - side.x * width / 2, b.y - side.y * width / 2);
        g.lineTo(a.x - side.x * width / 2, a.y - side.y * width / 2);
        g.close(); g.fill();
    }

    private drawEnemies(g: Graphics): void {
        for (const enemy of this.enemies) {
            const visual = this.enemyVisuals[enemy.id];
            if (!visual) continue;
            visual.node.setScale(2, 2, 1);
            visual.node.setPosition((enemy.x + this.feedback.shakeOffset.x) * 2, (enemy.y + this.feedback.shakeOffset.y) * 2);
            const eg = visual; eg.clear();
            if (enemy.deathOpacity <= 0) {
                const enemyLabel = this.enemyLabels[enemy.id];
                if (enemyLabel) enemyLabel.node.active = false;
                continue;
            }
            if (enemy.state === 'telegraph') {
                if (enemy.tacticsKind === 'ranged') {
                    // Ranged: locked target ellipse and aim line
                    g.fillColor = new Color(224, 67, 57, 65);
                    g.ellipse(enemy.lockedX, enemy.lockedY, 28, 16); g.fill();
                    g.strokeColor = new Color(255, 114, 90, 220); g.lineWidth = 1.5;
                    g.ellipse(enemy.lockedX, enemy.lockedY, 28, 16); g.stroke();
                    g.strokeColor = new Color(255, 80, 80, 140); g.lineWidth = 1;
                    g.moveTo(enemy.x, enemy.y); g.lineTo(enemy.lockedX, enemy.lockedY); g.stroke();
                } else if (enemy.tacticsKind === 'charge') {
                    // Charge: directional warning strip
                    const facing = Math.sign(enemy.lockedX - enemy.x) || 1;
                    const stripW = 150;
                    const startX = facing > 0 ? enemy.x : enemy.x - stripW;
                    g.fillColor = new Color(255, 100, 50, 70);
                    g.rect(startX, enemy.y - 12, stripW, 24); g.fill();
                    g.strokeColor = new Color(255, 140, 60, 220); g.lineWidth = 2;
                    g.rect(startX, enemy.y - 12, stripW, 24); g.stroke();
                } else if (enemy.role === 'boss') {
                    // Boss wide warning
                    g.fillColor = new Color(240, 50, 50, 80);
                    g.rect(enemy.lockedX - 72, enemy.lockedY - 36, 144, 72); g.fill();
                    g.strokeColor = new Color(255, 70, 70, 240); g.lineWidth = 2.5;
                    g.rect(enemy.lockedX - 72, enemy.lockedY - 36, 144, 72); g.stroke();
                } else if (enemy.role === 'elite') {
                    // Elite warning
                    g.fillColor = new Color(235, 120, 50, 75);
                    g.rect(enemy.lockedX - 64, enemy.lockedY - 32, 128, 64); g.fill();
                    g.strokeColor = new Color(255, 150, 60, 220); g.lineWidth = 2;
                    g.rect(enemy.lockedX - 64, enemy.lockedY - 32, 128, 64); g.stroke();
                } else {
                    // Standard melee
                    g.fillColor = new Color(224, 67, 57, 75);
                    g.rect(enemy.lockedX - 40, enemy.lockedY - 18, 80, 36); g.fill();
                    g.strokeColor = new Color(255, 114, 90, 220); g.lineWidth = 2;
                    g.rect(enemy.lockedX - 40, enemy.lockedY - 18, 80, 36); g.stroke();
                }
            }
            const x = 0, y = 0;
            eg.fillColor = new Color(13, 19, 23, Math.round(140 * enemy.deathOpacity)); eg.ellipse(x, y, 11, 4); eg.fill();
            const facing = Math.sign(this.model.x - enemy.x) || 1;
            this.drawEnemyBody(eg, enemy, facing);
            if (enemy.state === 'telegraph') {
                eg.strokeColor = new Color(255, 136, 98); eg.lineWidth = 3;
                eg.moveTo(-7, 25); eg.lineTo(facing * 13, 13); eg.stroke();
            }
            const enemyLabel = this.enemyLabels[enemy.id];
            if (enemyLabel) {
                if (enemy.state !== 'dead') {
                    const roleBadge = enemy.role === 'boss'
                        ? `[BOSS P${enemy.phase}]`
                        : enemy.role === 'elite'
                        ? '[精英]'
                        : enemy.role === 'purple'
                        ? '[紫名]'
                        : '[普通]';
                    enemyLabel.string = roleBadge;
                    enemyLabel.color = enemy.role === 'boss'
                        ? new Color(255, 70, 70)
                        : enemy.role === 'elite'
                        ? new Color(255, 185, 60)
                        : enemy.role === 'purple'
                        ? new Color(210, 110, 255)
                        : new Color(185, 205, 215);
                    enemyLabel.node.setPosition((enemy.x + this.feedback.shakeOffset.x) * 2, (enemy.y + this.feedback.shakeOffset.y) * 2 + 67);
                    enemyLabel.node.active = true;
                } else {
                    enemyLabel.node.active = false;
                }
            }
            if (enemy.state !== 'dead') {
                const barColor = enemy.role === 'boss' ? '#ff3b4e' : enemy.role === 'elite' ? '#ffa033' : enemy.role === 'purple' ? '#bd4aff' : '#ff967c';
                this.drawHealthBar((enemy.x + this.feedback.shakeOffset.x) * 2 - 18, (enemy.y + this.feedback.shakeOffset.y) * 2 + 54, enemy.hp, enemy.maxHp, barColor);
            }
        }
    }

    private drawEnemyBody(g: Graphics, enemy: EnemyModel, facing: number): void {
        const angle = -Math.PI / 2 * enemy.downPose * enemy.fallDirection;
        const c = Math.cos(angle), s = Math.sin(angle), pulse = enemy.bleedPulse;
        const quad = (x: number, y: number, w: number, h: number, color: Color): void => {
            const white = enemy.deathWhite;
            g.fillColor = new Color(Math.round(color.r + (255 - color.r) * white),
                Math.round(color.g + (255 - color.g) * white), Math.round(color.b + (255 - color.b) * white),
                Math.round(color.a * enemy.deathOpacity));
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(([px, py], i) => {
                const tx = px * c - (py - 4) * s, ty = px * s + (py - 4) * c + 4;
                if (i === 0) g.moveTo(tx, ty); else g.lineTo(tx, ty);
            });
            g.close(); g.fill();
        };
        const tint = (r: number, green: number, b: number): Color => {
            if (enemy.flash > 0) return new Color(245, 221, 208);
            const t = pulse * 0.65;
            return new Color(Math.round(r + (235 - r) * t), Math.round(green * (1 - t * 0.8)), Math.round(b * (1 - t * 0.7)));
        };
        if (pulse > 0) {
            quad(-7.5, 0.5, 15, 17, new Color(224, 43, 53, Math.round(70 * pulse)));
            quad(-6.5, 13.5, 13, 12, new Color(244, 50, 62, Math.round(60 * pulse)));
        }
        const categoryBase = enemy.category === 'mechanical'
            ? { r: 110, g: 130, b: 155 }
            : enemy.category === 'undead'
            ? { r: 115, g: 150, b: 140 }
            : enemy.category === 'beast'
            ? { r: 160, g: 95, b: 55 }
            : { r: 128, g: 99, b: 72 };
        quad(-6, 2, 12, 14, tint(categoryBase.r, categoryBase.g, categoryBase.b));
        quad(-5, 15, 10, 9, tint(Math.min(255, categoryBase.r + 50), Math.min(255, categoryBase.g + 35), Math.min(255, categoryBase.b + 20)));
        quad(-6, 21, 12, 4, tint(Math.max(0, categoryBase.r - 60), Math.max(0, categoryBase.g - 40), Math.max(0, categoryBase.b - 20)));
        quad(facing * 3, 17, 2, 2, new Color(37, 31, 27));

        if (enemy.superArmor) {
            g.strokeColor = new Color(255, 215, 0, 230);
            g.lineWidth = 2.5;
            g.rect(-8, 0, 16, 26);
            g.stroke();
        }
        if (enemy.state === 'stunned') {
            g.strokeColor = new Color(255, 240, 80, 220);
            g.lineWidth = 1.5;
            g.ellipse(0, 27, 8, 4);
            g.stroke();
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
        if (!this.modeLabels || this.modeLabels.length < 4) return;
        this.modeLabels[0].string = this.dungeonKind === 'first' ? '首本 ✓' : '首本';
        this.modeLabels[1].string = this.dungeonKind === 'workshop' ? '工坊 ✓' : '工坊';
        this.modeLabels[2].string = this.dungeonKind === 'rift' ? '裂隙 ✓' : '裂隙';
        this.modeLabels[3].string = this.roomCleared ? '换房 ▶' : '下一房';
    }

    private modeLabels: Label[] = [];
}
