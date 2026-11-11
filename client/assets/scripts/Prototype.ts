import './polyfill';
import { _decorator, Component, Node, Graphics, Color, UITransform, Label,
    input, Input, EventTouch, EventKeyboard, EventMouse, KeyCode, Vec3, view, ResolutionPolicy, game, Game, profiler, sys } from 'cc';
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
import { RepairPanel } from './ui/RepairPanel';
import type { RepairCoordinator } from './net/RepairCoordinator';
import { EnhancementPanel } from './ui/EnhancementPanel';
import type { EnhancementCoordinator } from './net/EnhancementCoordinator';
import { RankingPanel } from './ui/RankingPanel';
import type { RankingCoordinator, RankingIdentity } from './net/RankingCoordinator';
import { InventoryPanel } from './ui/InventoryPanel';
import { connectInventoryPreview } from './net/InventoryPreview';
import type { InventoryCoordinator } from './net/InventoryCoordinator';
import { ShopPanel } from './ui/ShopPanel';
import type { ShopCoordinator } from './net/ShopCoordinator';
import { MailPanel } from './ui/MailPanel';
import type { MailCoordinator } from './net/MailCoordinator';
import { DungeonSelectPanel, type DifficultyKind } from './ui/DungeonSelectPanel';
import type { ChallengeEntryCoordinator } from './net/ChallengeEntryCoordinator';
import { createSandboxRepairCoordinator, createSandboxEnhancementCoordinator, createSandboxRankingCoordinator, createSandboxInventoryCoordinator, createSandboxBankCoordinator, createSandboxShopCoordinator, createSandboxMailCoordinator, createSandboxChallengeEntryCoordinator } from './net/PrototypePreview';
import { buildEncounterRoomSpawnsForDungeon, type DungeonKind } from '../../../shared/src/encounter-layout.ts';
import type {CombatLifecycleAdapter} from './net/CombatLifecycleAdapter';
import { MovementCoordinator } from './net/MovementCoordinator';
import { connectChallengePreview } from './net/ChallengePreview';
import type { LootSceneCoordinator } from './net/LootSceneCoordinator';
import { LootVictoryPanel } from './ui/LootVictoryPanel';
import { SupplyHUDModel, SUPPLY_BUTTON_LAYOUT } from './SupplyHUDModel';
import { DeathReviveHUDModel, DEATH_REVIVE_LAYOUT } from './DeathReviveHUDModel';
import { DeathRevivePanel } from './ui/DeathRevivePanel';
import { CombatSupplyHUD } from './ui/CombatSupplyHUD';
import { PlayerStatusHUD } from './ui/PlayerStatusHUD';
import { TownNPCHUD } from './ui/TownNPCHUD';

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
    private supplyHUD = new SupplyHUDModel();
    private supplyLabels: Label[] = [];
    private deathReviveHUD = new DeathReviveHUDModel();
    private deathRevivePanel!: DeathRevivePanel;
    private supplyHUDView!: CombatSupplyHUD;
    private playerStatusHUD!: PlayerStatusHUD;
    private deathTitleLabel!: Label;
    private deathCountdownLabel!: Label;
    private deathEmblemLabel!: Label;
    private deathLimitLabel!: Label;
    private deathReviveBtnLabel!: Label;
    private deathLeaveBtnLabel!: Label;
    private deathPromptLabel!: Label;
    private sandboxEmblemCount = 10;
    private paidRevives = 0;
    private localCooldowns: { cooldownId: string; readyAtTick: number }[] = [];
    private localBuffs: { buffId: string; templateRef: string; endsAtTick: number }[] = [];
    private localElapsedTicks = 0;
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
    private repairPanel: RepairPanel | null = null;
    private repairCoordinator: RepairCoordinator | null = null;
    private repairKeyHeld = false;
    private repairHadStats = false;
    private enhancementPanel: EnhancementPanel | null = null;
    private enhancementCoordinator: EnhancementCoordinator | null = null;
    private enhancementKeyHeld = false;
    private enhancementHadStats = false;
    private rankingPanel: RankingPanel | null = null;
    private rankingCoordinator: RankingCoordinator | null = null;
    private rankingKeyHeld = false;
    private rankingHadStats = false;
    private rankingIdentity: RankingIdentity | null = null;
    private shopPanel: ShopPanel | null = null;
    private shopCoordinator: ShopCoordinator | null = null;
    private shopKeyHeld = false;
    private mailPanel: MailPanel | null = null;
    private mailCoordinator: MailCoordinator | null = null;
    private mailKeyHeld = false;
    private dungeonSelectPanel: DungeonSelectPanel | null = null;
    private challengeEntryCoordinator: ChallengeEntryCoordinator | null = null;
    private brokenEquipmentNotice!: Label;
    private sceneMode: 'town' | 'dungeon' = 'town';
    private townNPCHUD!: TownNPCHUD;
    private sceneSwitchLabel!: Label;
    private titleLabel!: Label;
    private hudLabels: Label[] = [];
    private inventoryPanel: InventoryPanel | null = null;
    private inventoryCoordinator: InventoryCoordinator | null = null;
    private inventoryConnecting = false;
    private inventoryConnectGeneration = 0;
    private inventoryKeyHeld = false;
    private inventoryHadStats = false;
    private inventoryNotice!: Label;
    private operationSequence = 0;
    private lifecycle: CombatLifecycleAdapter | null = null;
    private challengeCoordinator: MovementCoordinator | null = null;
    private challengeConnecting = false;
    private challengeGeneration = 0;
    private challengeNotice!: Label;
    private challengeTick = 0;
    private lootScene: LootSceneCoordinator | null = null;
    private lootPanel: LootVictoryPanel | null = null;
    private authorityClockBase = 0;
    private authorityBasicHeld = false;

    onLoad(): void {
        view.setDesignResolutionSize(960, 540, ResolutionPolicy.SHOW_ALL);
        this.canvas = this.node.getComponent(UITransform)!;
        this.world = this.makeGraphics('World');
        this.world.node.setScale(2, 2, 1);
        this.actor = this.makeGraphics('Warrior');
        this.warriorSprite = new WarriorSpriteSheetView(this.actor.node);
        this.controls = this.makeGraphics('Controls');
        this.titleLabel = this.text('308 世界 · 微风小镇', -375, 242, 16, 190);
        this.titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.sceneSwitchLabel = this.text('▶ 前往地下城', -215, 242, 13, 100);
        this.sceneSwitchLabel.color = new Color(255, 215, 64);
        this.hudLabels = [
            this.text('背包 B', -100, 242, 13, 60),
            this.text('银行 N', -30, 242, 13, 60),
            this.text('修理 M', 40, 242, 13, 60),
            this.text('强化 K', 110, 242, 13, 60),
            this.text('排行 O', 180, 242, 13, 60),
            this.text('商店 P', 250, 242, 13, 60),
            this.text('信箱 I', 320, 242, 13, 60),
        ];
        this.townNPCHUD = new TownNPCHUD(this.node);
        this.brokenEquipmentNotice = this.text('', 0, 102, 14, 800);
        this.brokenEquipmentNotice.color = new Color(255, 90, 90);
        this.inventoryNotice = this.text('', 0, 150, 17, 800);
        this.challengeNotice = this.text('全业务闭环：微风小镇安全区与三大地下城实机联动', -60, 126, 14, 680);
        this.text('WASD移动 · 空格普攻 · E/F/Q/G技能 · B背包 · N银行 · M修理 · K强化 · O排行 · P商店 · I信箱', -50, 212, 12, 740);
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
        this.deathRevivePanel = new DeathRevivePanel(this.node, this.deathReviveHUD);
        this.supplyHUDView = new CombatSupplyHUD(this.node, this.supplyHUD);
        this.playerStatusHUD = new PlayerStatusHUD(this.node, -390, 150);
        this.supplyLabels = [
            this.text('1 药', SUPPLY_BUTTON_LAYOUT.slot0.x, SUPPLY_BUTTON_LAYOUT.slot0.y, 11, 56),
            this.text('2 药', SUPPLY_BUTTON_LAYOUT.slot1.x, SUPPLY_BUTTON_LAYOUT.slot1.y, 11, 56),
            this.text('3 药', SUPPLY_BUTTON_LAYOUT.slot2.x, SUPPLY_BUTTON_LAYOUT.slot2.y, 11, 56),
            this.text('饰品 T', SUPPLY_BUTTON_LAYOUT.trinket.x, SUPPLY_BUTTON_LAYOUT.trinket.y, 11, 56),
        ];
        this.supplyLabels.forEach(l => l.node.active = false);
        this.deathTitleLabel = this.text('角色阵亡', 0, 72, 20, 300);
        this.deathTitleLabel.color = new Color(255, 210, 75);
        this.deathTitleLabel.node.active = false;
        this.deathCountdownLabel = this.text('剩余时间: 10.0s', 0, 35, 12, 240);
        this.deathCountdownLabel.color = new Color(255, 255, 255);
        this.deathCountdownLabel.node.active = false;
        this.deathEmblemLabel = this.text('复活纹章: 10', 0, 5, 14, 280);
        this.deathEmblemLabel.color = new Color(225, 240, 245);
        this.deathEmblemLabel.node.active = false;
        this.deathLimitLabel = this.text('普通副本无次数限制', 0, -18, 13, 280);
        this.deathLimitLabel.color = new Color(165, 190, 200);
        this.deathLimitLabel.node.active = false;
        this.deathPromptLabel = this.text('', 0, -36, 12, 300);
        this.deathPromptLabel.color = new Color(255, 140, 100);
        this.deathPromptLabel.node.active = false;
        this.deathReviveBtnLabel = this.text('立即复活', DEATH_REVIVE_LAYOUT.reviveButton.x, DEATH_REVIVE_LAYOUT.reviveButton.y, 14, 120);
        this.deathReviveBtnLabel.node.active = false;
        this.deathLeaveBtnLabel = this.text('放弃退出', DEATH_REVIVE_LAYOUT.leaveButton.x, DEATH_REVIVE_LAYOUT.leaveButton.y, 14, 120);
        this.deathLeaveBtnLabel.node.active = false;
        this.text('受击预警 · 走出红框躲避', 0, -208, 16);
        this.speedLabels = attackSpeedTuning.presets.map((rate, index) => this.text(`${rate}×`, -360 + index * 70, 126, 12, 64));
        this.restartEncounter();
        this.returnToTown();
        const search = (sys.isBrowser && typeof window !== 'undefined' && window.location?.search) ? window.location.search : '';
        if (search && typeof URLSearchParams !== 'undefined' && new URLSearchParams(search).get('challengePreview') === '1') {
            void this.toggleChallenge();
        }
        if (search && typeof URLSearchParams !== 'undefined' && new URLSearchParams(search).get('inventoryPreview') === '1') {
            void this.toggleInventory();
        }
        input.on(Input.EventType.TOUCH_START, this.touchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
        input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.on(Input.EventType.KEY_UP, this.keyUp, this);
        game.on(Game.EVENT_HIDE, this.onHideInput, this);
        game.on(Game.EVENT_SHOW, this.onShowAuthority, this);
    }

    private updateTownNPCVisibility(visible: boolean): void {
        if (this.townNPCHUD) {
            this.townNPCHUD.setVisible(visible);
            if (visible) this.townNPCHUD.update(0, this.model.x, this.model.y);
        }
        if (this.modeLabels) this.modeLabels.forEach(l => l.node.active = !visible);
        if (this.sceneSwitchLabel) this.sceneSwitchLabel.string = visible ? '▶ 进入地下城' : '◀ 返回城镇';
        if (this.roundLabel) {
            this.roundLabel.node.active = true;
            this.roundLabel.node.setPosition(0, visible ? -104 : 75);
        }
        if (this.supplyHUDView) this.supplyHUDView.setVisible(!visible);
        if (this.playerStatusHUD) this.playerStatusHUD.setVisible(!visible);
    }

    private enterDungeon(dungeon?: DungeonKind, _difficulty?: string): void {
        if (dungeon) this.dungeonKind = dungeon;
        this.sceneMode = 'dungeon';
        this.roomNo = 0;
        this.model.x = -140;
        this.model.y = 20;
        this.restartEncounter();
        this.encounter.start();
        this.updateTownNPCVisibility(false);
    }

    private returnToTown(): void {
        this.sceneMode = 'town';
        this.model.hp = 100;
        this.model.x = 0;
        this.model.y = 0;
        this.clearInput();
        this.skills.reset();
        this.skillEffects.clear();
        this.feedback.clear();
        this.enemies = [];
        this.enemyVisuals.forEach(v => v.node.active = false);
        this.updateTownNPCVisibility(true);
    }

    private toggleSceneMode(): void {
        this.closeAllPanels();
        if (this.sceneMode === 'town') {
            void this.openDungeonSelect();
        } else {
            this.returnToTown();
        }
    }

    onDestroy(): void {
        ++this.challengeGeneration;this.lifecycle?.destroy();this.lifecycle=null;
        ++this.inventoryConnectGeneration;
        input.off(Input.EventType.TOUCH_START, this.touchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
        input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.off(Input.EventType.KEY_UP, this.keyUp, this);
        game.off(Game.EVENT_HIDE, this.onHideInput, this);
        game.off(Game.EVENT_SHOW, this.onShowAuthority, this);
        ++this.bankGeneration;
        this.bankPanel?.dispose();
        this.repairPanel?.dispose();
        this.enhancementPanel?.dispose();
        this.rankingPanel?.dispose();
        this.shopPanel?.dispose();
        this.mailPanel?.dispose();
        this.dungeonSelectPanel?.dispose();
        this.deathRevivePanel?.dispose();
        this.supplyHUDView?.dispose();
        this.playerStatusHUD?.dispose();
        this.townNPCHUD?.dispose();
        this.inventoryPanel?.dispose();
        this.warriorSprite.dispose();
        this.lootPanel?.dispose();
        this.lootScene?.close();
    }

    /** Production login may inject an authenticated transport; the action sample never invents assets. */
    public attachInventory(coordinator: InventoryCoordinator, labels: Record<string, string>, assignable: ReadonlySet<string>, preview = false): void {
        this.inventoryPanel?.dispose();
        this.inventoryCoordinator=coordinator;
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

    public attachRepair(coordinator: RepairCoordinator, contextId: string, labels: Record<string, string> = {}): void {
        this.repairPanel?.dispose();
        this.repairCoordinator = coordinator;
        this.repairPanel = new RepairPanel(this.node, coordinator, {
            contextId,
            templateLabel: id => labels[id] ?? id,
            onVisibility: visible => {
                if (visible) { this.clearInput(); this.repairHadStats = profiler.isShowingStats(); profiler.hideStats(); }
                else if (this.repairHadStats) profiler.showStats();
            },
        });
    }

    public attachEnhancement(coordinator: EnhancementCoordinator, contextId: string, labels: Record<string, string> = {}): void {
        this.enhancementPanel?.dispose();
        this.enhancementCoordinator = coordinator;
        this.enhancementPanel = new EnhancementPanel(this.node, coordinator, {
            contextId,
            templateLabel: id => labels[id] ?? id,
            onVisibility: visible => {
                if (visible) { this.clearInput(); this.enhancementHadStats = profiler.isShowingStats(); profiler.hideStats(); }
                else if (this.enhancementHadStats) profiler.showStats();
            },
        });
    }

    public attachRanking(coordinator: RankingCoordinator, identity?: RankingIdentity): void {
        this.rankingPanel?.dispose();
        this.rankingCoordinator = coordinator;
        this.rankingPanel = new RankingPanel(this.node, coordinator, {
            onVisibility: visible => {
                if (visible) { this.clearInput(); this.rankingHadStats = profiler.isShowingStats(); profiler.hideStats(); }
                else if (this.rankingHadStats) profiler.showStats();
            },
        });
        if (identity) this.rankingIdentity = { ...identity };
    }

    public attachChallenge(coordinator: MovementCoordinator, preview = false, loot?: LootSceneCoordinator, lifecycle?: (clearInput:()=>void,reenter:()=>void)=>CombatLifecycleAdapter, reenter?:()=>void): void {
        if(lifecycle&&!reenter)throw Error('LOGIN_ROUTE_REQUIRED');
        ++this.challengeGeneration;this.lifecycle?.destroy();this.lifecycle=null;
        this.lootScene?.close();
        this.challengeCoordinator = coordinator;
        this.lootScene = loot ?? null;
        this.lootPanel?.dispose();
        this.lootPanel = loot ? new LootVictoryPanel(this.node) : null;
        this.clearInput();
        this.authorityBasicHeld = false;
        this.authorityClockBase = Date.now();
        this.lifecycle=lifecycle?.(()=>{this.clearInput();this.authorityBasicHeld=false;this.authorityClockBase=Date.now();},reenter!)??null;
        this.challengeNotice.string = preview ? '权威战斗已连接 · MovementCoordinator 服务端驱动' : '';
    }

    private async toggleChallenge(): Promise<void> {
        if (this.challengeCoordinator) {
            if(this.lootScene?.busy){void this.lootScene.retry();return;}
            this.lifecycle?.destroy();this.lifecycle=null;
            this.challengeCoordinator = null;
            this.lootScene?.close();this.lootPanel?.dispose();this.lootPanel=null;this.lootScene=null;
            this.restartEncounter();
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
            this.challengeConnecting=false;this.attachChallenge(preview.coordinator, true, preview.loot,preview.lifecycle,()=>{this.challengeNotice.string='请通过登录入口重新进入游戏';});
            this.challengeNotice.string=preview.mode==='local-test-terminal'?'ST15 本机终局奖励测试 · 隔离临时资产':'ST12 无奖励训练 · 权威服务';
        } catch {
            if (this.isValid && gen === this.challengeGeneration) {
                this.challengeNotice.string = '权威战斗服务未启动（8790 端口未就绪）；保持本地沙盒模式';
            }
        } finally {
            if (gen === this.challengeGeneration) this.challengeConnecting = false;
        }
    }
    public closeAllPanels(): void {
        if (this.inventoryPanel?.isOpen) this.inventoryPanel.close();
        if (this.bankPanel?.isOpen) this.bankPanel.close();
        if (this.repairPanel?.isOpen) this.repairPanel.close();
        if (this.enhancementPanel?.isOpen) this.enhancementPanel.close();
        if (this.rankingPanel?.isOpen) this.rankingPanel.close();
        if (this.shopPanel?.isOpen) this.shopPanel.close();
        if (this.mailPanel?.isOpen) this.mailPanel.close();
        if (this.dungeonSelectPanel?.isOpen) this.dungeonSelectPanel.close();
    }

    private stamina = 308;

    private getCharacterWeaponStatus(): { hasWeapon: boolean; isWeaponBroken: boolean } {
        const coord = this.repairCoordinator?.state;
        if (coord?.view) {
            const items = 'items' in coord.view ? coord.view.items : [coord.view.item];
            const weapon = items.find(i => i.slotKind === 'weapon');
            if (weapon) {
                const broken = (weapon.durability?.current ?? 1) <= 0;
                return { hasWeapon: true, isWeaponBroken: broken };
            }
        }
        return { hasWeapon: true, isWeaponBroken: false };
    }

    public async openDungeonSelect(dungeonId: DungeonKind = this.dungeonKind): Promise<void> {
        if (this.dungeonSelectPanel?.isOpen) { this.dungeonSelectPanel.close(); return; }
        this.closeAllPanels();
        if (!this.dungeonSelectPanel) {
            const sandbox = createSandboxChallengeEntryCoordinator({
                getStamina: () => this.stamina,
                hasWeapon: () => this.getCharacterWeaponStatus().hasWeapon,
                isWeaponBroken: () => this.getCharacterWeaponStatus().isWeaponBroken,
            });
            this.attachDungeonSelect(sandbox.coordinator, sandbox.contextId);
            this.inventoryNotice.string = '地下城传送门已开启';
        }
        await this.dungeonSelectPanel?.open(dungeonId);
    }

    public attachDungeonSelect(coordinator: ChallengeEntryCoordinator, _contextId: string): void {
        this.dungeonSelectPanel?.dispose();
        this.challengeEntryCoordinator = coordinator;
        this.dungeonSelectPanel = new DungeonSelectPanel(this.node, coordinator, {
            getStamina: () => this.stamina,
            hasWeapon: () => this.getCharacterWeaponStatus().hasWeapon,
            isWeaponBroken: () => this.getCharacterWeaponStatus().isWeaponBroken,
            onVisibility: visible => {
                if (visible) this.clearInput();
            },
            onStart: (dungeonId, difficultyId) => {
                this.stamina = Math.max(0, this.stamina - 8);
                this.enterDungeon(dungeonId, difficultyId);
            },
        });
    }

    private async toggleMail(): Promise<void> {
        if (this.mailPanel?.isOpen) { this.mailPanel.close(); return; }
        this.closeAllPanels();
        if (!this.mailPanel) {
            const sandbox = createSandboxMailCoordinator();
            this.attachMail(sandbox.coordinator, sandbox.contextId);
            this.inventoryNotice.string = '本地沙盒邮箱模式';
        }
        await this.mailPanel?.open();
    }

    public attachMail(coordinator: MailCoordinator, contextId: string): void {
        this.mailPanel?.dispose();
        this.mailCoordinator = coordinator;
        this.mailPanel = new MailPanel(this.node, coordinator, {
            contextId,
            onVisibility: visible => {
                if (visible) this.clearInput();
            },
            onSuccess: (_type, msg) => {
                this.inventoryNotice.string = msg;
            },
        });
    }

    private async toggleShop(): Promise<void> {
        if (this.shopPanel?.isOpen) { this.shopPanel.close(); return; }
        this.closeAllPanels();
        if (!this.shopPanel) {
            const sandbox = createSandboxShopCoordinator();
            this.attachShop(sandbox.coordinator, sandbox.contextId, sandbox.quoteRef);
            this.inventoryNotice.string = '本地沙盒商店模式';
        }
        await this.shopPanel?.open();
    }

    public attachShop(coordinator: ShopCoordinator, contextId: string, quoteRef: string): void {
        this.shopPanel?.dispose();
        this.shopCoordinator = coordinator;
        this.shopPanel = new ShopPanel(this.node, coordinator, {
            contextId,
            quoteRef,
            onVisibility: visible => {
                if (visible) this.clearInput();
            },
            onSuccess: (_type, msg) => {
                this.inventoryNotice.string = msg;
            },
        });
    }

    private async toggleBank(): Promise<void> {
        if (this.bankPanel?.isOpen) { this.bankPanel.close(); return; }
        this.closeAllPanels();
        if (!this.bankPanel) {
            const sandbox = createSandboxBankCoordinator();
            this.attachBank(sandbox.coordinator, sandbox.contextId, sandbox.labels);
            this.inventoryNotice.string = '本地沙盒银行模式';
        }
        await this.bankPanel?.open();
    }

    private async toggleRepair(): Promise<void> {
        if (this.repairPanel?.isOpen) { this.repairPanel.close(); return; }
        this.closeAllPanels();
        if (!this.repairPanel) {
            const sandbox = createSandboxRepairCoordinator();
            this.attachRepair(sandbox.coordinator, sandbox.contextId, sandbox.labels);
        }
        await this.repairPanel?.open();
    }

    private async toggleEnhancement(): Promise<void> {
        if (this.enhancementPanel?.isOpen) { this.enhancementPanel.close(); return; }
        this.closeAllPanels();
        if (!this.enhancementPanel) {
            const sandbox = createSandboxEnhancementCoordinator();
            this.attachEnhancement(sandbox.coordinator, sandbox.contextId, sandbox.labels);
        }
        await this.enhancementPanel?.open();
    }

    private async toggleRanking(): Promise<void> {
        if (this.rankingPanel?.isOpen) { this.rankingPanel.close(); return; }
        this.closeAllPanels();
        if (!this.rankingPanel) {
            const sandbox = createSandboxRankingCoordinator();
            this.attachRanking(sandbox.coordinator, sandbox.identity);
        }
        const identity = this.rankingIdentity ?? { sessionId: 'sandbox-session', sessionEpoch: 1, characterId: 'char-test-308' };
        await this.rankingPanel?.open(identity);
    }

    private async toggleInventory(): Promise<void> {
        if (this.inventoryPanel?.isOpen) { this.inventoryPanel.close(); return; }
        this.closeAllPanels();
        if (!this.inventoryPanel) {
            const local = sys.isBrowser && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('inventoryPreview') === '1';
            if (local) {
                const generation = ++this.inventoryConnectGeneration;
                this.inventoryConnecting = true; this.inventoryNotice.string = '正在连接本机背包服务…';
                try {
                    const preview = await connectInventoryPreview();
                    if (generation !== this.inventoryConnectGeneration) return;
                    this.attachInventory(preview.coordinator, preview.labels, preview.assignable, true);
                    this.inventoryNotice.string = '本机背包服务 · 临时测试数据';
                } catch {
                    if (generation === this.inventoryConnectGeneration) this.inventoryNotice.string = '本机背包服务未连接，请启动预览服务后重试';
                    return;
                } finally { if (generation === this.inventoryConnectGeneration) this.inventoryConnecting = false; }
            } else {
            const sandbox = createSandboxInventoryCoordinator();
            this.attachInventory(sandbox.coordinator, sandbox.labels, sandbox.assignable, true);
            this.inventoryNotice.string = '本地沙盒背包模式';
            }
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

    private mouseDown(e: EventMouse): void {
        const fakeTouch = {
            getID: () => 1,
            getUILocation: () => e.getUILocation(),
        } as unknown as EventTouch;
        this.touchStart(fakeTouch);
    }

    private mouseMove(e: EventMouse): void {
        const fakeTouch = {
            getID: () => 1,
            getUILocation: () => e.getUILocation(),
        } as unknown as EventTouch;
        this.touchMove(fakeTouch);
    }

    private mouseUp(e: EventMouse): void {
        const fakeTouch = {
            getID: () => 1,
            getUILocation: () => e.getUILocation(),
        } as unknown as EventTouch;
        this.touchEnd(fakeTouch);
    }

    private touchStart(e: EventTouch): void {
        const id = e.getID();
        if (id === null) return;
        const p = this.point(e);
        if (p.y >= 214 && p.y <= 256) {
            if (p.x >= -265 && p.x <= -165) { this.toggleSceneMode(); return; }
            if (p.x >= -130 && p.x <= -70)  { void this.toggleInventory(); return; }
            if (p.x >= -60  && p.x <= 0)    { void this.toggleBank(); return; }
            if (p.x >= 10   && p.x <= 70)   { void this.toggleRepair(); return; }
            if (p.x >= 80   && p.x <= 140)  { void this.toggleEnhancement(); return; }
            if (p.x >= 150  && p.x <= 210)  { void this.toggleRanking(); return; }
            if (p.x >= 220  && p.x <= 280)  { void this.toggleShop(); return; }
            if (p.x >= 290  && p.x <= 350)  { void this.toggleMail(); return; }
        }
        if (this.inventoryPanel?.isOpen || this.bankPanel?.isOpen || this.repairPanel?.isOpen || this.enhancementPanel?.isOpen || this.rankingPanel?.isOpen || this.shopPanel?.isOpen || this.mailPanel?.isOpen || this.dungeonSelectPanel?.isOpen) return;
        if(this.challengeCoordinator){this.authorityTouch(p.x,p.y,id,e);return;}
        if (this.deathReviveHUD.isVisible) {
            const hit = this.deathReviveHUD.hitTest(p.x, p.y);
            if (hit === 'revive') {
                this.handleDeathRevive();
            } else if (hit === 'leave') {
                this.handleDeathLeave();
            }
            return;
        }
        if (this.sceneMode === 'town') {
            const npcHit = this.townNPCHUD?.hitTest(p.x, p.y);
            if (npcHit === 'repair') { void this.toggleRepair(); return; }
            if (npcHit === 'shop') { void this.toggleShop(); return; }
            if (npcHit === 'enhancement') { void this.toggleEnhancement(); return; }
            if (npcHit === 'mail') { void this.toggleMail(); return; }
            if (npcHit === 'bank') { void this.toggleBank(); return; }
            if (npcHit === 'portal') { void this.openDungeonSelect(); return; }
            if (this.stickId === null && Math.hypot(p.x + 345, p.y + 150) < 95) {
                this.stickId = id;
                this.touchMove(e);
            }
            return;
        }
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
            this.mode = 7; this.dungeonKind = 'first'; this.roomNo = 0; this.restartEncounter(); return;
        } else if (p.y > 145 && p.y < 190 && Math.abs(p.x - 275) < 28) {
            this.mode = 7; this.dungeonKind = 'workshop'; this.roomNo = 0; this.restartEncounter(); return;
        } else if (p.y > 145 && p.y < 190 && Math.abs(p.x - 335) < 28) {
            this.mode = 7; this.dungeonKind = 'rift'; this.roomNo = 0; this.restartEncounter(); return;
        } else if (p.y > 145 && p.y < 190 && Math.abs(p.x - 395) < 28) {
            if (this.roomNo < 6) {
                this.roomNo++;
                this.restartEncounter();
                this.encounter.start();
            }
            return;
        }
        if (this.encounter.state === 'ready') {
            this.encounter.start();
        } else if (this.encounter.state !== 'fighting' && !this.roomCleared) {
            return;
        }
        if (this.touchSupplyButton(p.x, p.y)) {
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
        if (this.deathReviveHUD.isVisible) return;
        if (this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting || this.repairPanel?.isOpen || this.enhancementPanel?.isOpen || this.rankingPanel?.isOpen || this.shopPanel?.isOpen || this.mailPanel?.isOpen) return;
        if (e.getID() !== this.stickId) return;
        const p = this.point(e);
        const x = (p.x + 345) / 68;
        const y = (p.y + 150) / 68;
        const scale = Math.max(1, Math.hypot(x, y));
        this.axis = { x: x / scale, y: y / scale };
    }

    private touchEnd(e: EventTouch): void {
        if (this.deathReviveHUD.isVisible) return;
        if (this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting || this.repairPanel?.isOpen || this.enhancementPanel?.isOpen || this.rankingPanel?.isOpen || this.shopPanel?.isOpen || this.mailPanel?.isOpen) return;
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
        if(this.challengeCoordinator){
            if(e.keyCode===KeyCode.KEY_C){void this.toggleChallenge();return;}
            if(e.keyCode===KeyCode.KEY_P){this.authorityAction('collect');return;}
            if(e.keyCode===KeyCode.KEY_L){this.authorityAction('leave');return;}
            if(e.keyCode===KeyCode.KEY_V){this.retryCombat();return;}
            if(e.keyCode===KeyCode.ESCAPE){this.pauseCombat();return;}
            if(e.keyCode===KeyCode.ENTER){if(this.lifecycle?.state.phase==='terminal')this.reenterGame();else this.resumeCombat();return;}
            if(this.lifecycle&&!this.lifecycle.state.canMove)return;
            const combat=this.challengeCoordinator.state.confirmed?.result!=='completed';
            if(!this.keys.has(e.keyCode)&&combat){const skill=e.keyCode===KeyCode.KEY_E?'cross':e.keyCode===KeyCode.KEY_F?'bengshan':e.keyCode===KeyCode.KEY_Q?'badao':e.keyCode===KeyCode.KEY_G?'earth':null;if(skill)this.authoritySkill(skill);}
            this.keys.add(e.keyCode);return;
        }
        if (this.deathReviveHUD.isVisible) {
            if (e.keyCode === KeyCode.ENTER) { this.handleDeathRevive(); return; }
            if (e.keyCode === KeyCode.ESCAPE) { this.handleDeathLeave(); return; }
            return;
        }
        if (e.keyCode === KeyCode.KEY_C) { void this.toggleChallenge(); return; }
        if (e.keyCode === KeyCode.KEY_N) { if (!this.bankKeyHeld) { this.bankKeyHeld = true; void this.toggleBank(); } return; }
        if (e.keyCode === KeyCode.KEY_M) { if (!this.repairKeyHeld) { this.repairKeyHeld = true; void this.toggleRepair(); } return; }
        if (e.keyCode === KeyCode.KEY_K) { if (!this.enhancementKeyHeld) { this.enhancementKeyHeld = true; void this.toggleEnhancement(); } return; }
        if (e.keyCode === KeyCode.KEY_O) { if (!this.rankingKeyHeld) { this.rankingKeyHeld = true; void this.toggleRanking(); } return; }
        if (e.keyCode === KeyCode.KEY_P) { if (!this.shopKeyHeld) { this.shopKeyHeld = true; void this.toggleShop(); } return; }
        if (e.keyCode === KeyCode.KEY_I) { if (!this.mailKeyHeld) { this.mailKeyHeld = true; void this.toggleMail(); } return; }
        if (e.keyCode === KeyCode.ESCAPE && this.bankConnecting) { ++this.bankGeneration; this.bankConnecting = false; this.inventoryNotice.string = ''; return; }
        if (e.keyCode === KeyCode.ESCAPE && this.bankPanel?.isOpen) { if (!this.bankPanel.closeDetails()) this.bankPanel.close(); return; }
        if (e.keyCode === KeyCode.ESCAPE && this.repairPanel?.isOpen) { this.repairPanel.close(); return; }
        if (e.keyCode === KeyCode.ESCAPE && this.enhancementPanel?.isOpen) { this.enhancementPanel.close(); return; }
        if (e.keyCode === KeyCode.ESCAPE && this.rankingPanel?.isOpen) { this.rankingPanel.close(); return; }
        if (e.keyCode === KeyCode.ESCAPE && this.shopPanel?.isOpen) { this.shopPanel.close(); return; }
        if (e.keyCode === KeyCode.ESCAPE && this.mailPanel?.isOpen) { this.mailPanel.close(); return; }
        if (e.keyCode === KeyCode.ESCAPE && this.dungeonSelectPanel?.isOpen) { this.dungeonSelectPanel.close(); return; }
        if (e.keyCode === KeyCode.KEY_B) { if (!this.inventoryKeyHeld) { this.inventoryKeyHeld = true; void this.toggleInventory(); } return; }
        if (e.keyCode === KeyCode.ESCAPE && this.inventoryConnecting) { ++this.inventoryConnectGeneration; this.inventoryConnecting = false; this.inventoryNotice.string = ''; return; }
        if (e.keyCode === KeyCode.ESCAPE && this.inventoryPanel?.isOpen) { if (!this.inventoryPanel.closeDetails()) this.inventoryPanel.close(); return; }
        if (this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting || this.repairPanel?.isOpen || this.enhancementPanel?.isOpen || this.rankingPanel?.isOpen || this.shopPanel?.isOpen || this.mailPanel?.isOpen || this.dungeonSelectPanel?.isOpen) return;
        if (this.encounter.state === 'ready') {
            this.encounter.start();
        }
        if (e.keyCode === KeyCode.KEY_V) { this.toggleSceneMode(); return; }
        if (e.keyCode === KeyCode.ENTER && this.encounter.state !== 'fighting') {
            if (this.encounter.state !== 'ready') this.restartEncounter();
            this.encounter.start(); return;
        }
        if (e.keyCode === KeyCode.KEY_R) { this.restartEncounter(); return; }
        if (e.keyCode === KeyCode.DIGIT_1) {
            if (this.encounter.state === 'fighting' || this.roomCleared) { this.useSupplySlot(0); return; }
            this.mode = 7; this.dungeonKind = 'first'; this.roomNo = 0; this.restartEncounter(); return;
        }
        if (e.keyCode === KeyCode.DIGIT_2) {
            if (this.encounter.state === 'fighting' || this.roomCleared) { this.useSupplySlot(1); return; }
            this.mode = 7; this.dungeonKind = 'workshop'; this.roomNo = 0; this.restartEncounter(); return;
        }
        if (e.keyCode === KeyCode.DIGIT_3) {
            if (this.encounter.state === 'fighting' || this.roomCleared) { this.useSupplySlot(2); return; }
            this.mode = 7; this.dungeonKind = 'rift'; this.roomNo = 0; this.restartEncounter(); return;
        }
        if (this.encounter.state !== 'fighting' && !this.roomCleared) return;
        if (this.keys.has(e.keyCode)) return;
        this.keys.add(e.keyCode);
        if (e.keyCode === KeyCode.SPACE && !this.skills.casting) this.model.press();
        if (e.keyCode === KeyCode.KEY_E) this.castSkill('cross');
        if (e.keyCode === KeyCode.KEY_F) this.castSkill('bengshan');
        if (e.keyCode === KeyCode.KEY_Q) this.castSkill('badao');
        if (e.keyCode === KeyCode.KEY_G) this.castSkill('earth');
        if (e.keyCode === KeyCode.KEY_T) this.useTrinket();
    }

    private keyUp(e: EventKeyboard): void {
        if (e.keyCode === KeyCode.KEY_N) this.bankKeyHeld = false;
        if (e.keyCode === KeyCode.KEY_M) this.repairKeyHeld = false;
        if (e.keyCode === KeyCode.KEY_K) this.enhancementKeyHeld = false;
        if (e.keyCode === KeyCode.KEY_O) this.rankingKeyHeld = false;
        if (e.keyCode === KeyCode.KEY_P) this.shopKeyHeld = false;
        if (e.keyCode === KeyCode.KEY_I) this.mailKeyHeld = false;
        if (e.keyCode === KeyCode.KEY_B) this.inventoryKeyHeld = false;
        this.keys.delete(e.keyCode);
        if (e.keyCode === KeyCode.SPACE && this.attackIds.size === 0) this.model.release();
    }

    public pauseCombat():void {void this.lifecycle?.pause();}
    public resumeCombat():void {void this.lifecycle?.resume();}
    public retryCombat():void {void this.lifecycle?.retry();}
    public reenterGame():void {this.lifecycle?.reenter();}
    private onShowAuthority():void {void this.lifecycle?.show();}
    private onHideInput(): void { void this.lifecycle?.hide(); this.bankKeyHeld = false; if (this.bankConnecting) { ++this.bankGeneration; this.bankConnecting = false; } this.inventoryKeyHeld = false; if (this.inventoryConnecting) { ++this.inventoryConnectGeneration; this.inventoryConnecting = false; this.inventoryNotice.string = ''; } this.repairKeyHeld = false; this.enhancementKeyHeld = false; this.rankingKeyHeld = false; this.shopKeyHeld = false; this.mailKeyHeld = false; this.clearInput(); }

    private clearInput(): void {
        this.keys.clear(); this.attackIds.clear(); this.stickId = null;
        this.axis = { x: 0, y: 0 }; this.model.release(); this.model.buffered = false;
    }

    private checkBrokenEquipment(): void {
        const coord = this.repairCoordinator?.state;
        let weaponBroken = false;
        let anyBroken = false;
        if (coord?.view) {
            const items = 'items' in coord.view ? coord.view.items : [coord.view.item];
            for (const item of items) {
                if (item.durability && item.durability.current === 0) {
                    anyBroken = true;
                    if (item.slotKind === 'weapon') weaponBroken = true;
                }
            }
        }
        if (weaponBroken) {
            this.brokenEquipmentNotice.string = '【装备破损警告】主手武器耐久归零，攻击力加成失效，但可继续战斗！';
        } else if (anyBroken) {
            this.brokenEquipmentNotice.string = '【装备破损警告】部分防具耐久归零，防御与套装属性失效！';
        } else {
            this.brokenEquipmentNotice.string = '';
        }
    }

    update(dt: number): void {
        this.inventoryPanel?.update();
        this.bankPanel?.update();
        this.repairPanel?.update();
        this.enhancementPanel?.update();
        this.shopPanel?.update();
        this.mailPanel?.update();
        this.checkBrokenEquipment();
        if(this.challengeCoordinator){this.updateAuthority(dt);return;}
        this.frames++; this.fpsTime += dt;
        if (this.fpsTime >= 0.5) { this.fps = Math.round(this.frames / this.fpsTime); this.frames = this.fpsTime = 0; }
        const has = (a: KeyCode, b: KeyCode) => Number(this.keys.has(a) || this.keys.has(b));
        const inventoryBlocked = this.inventoryPanel?.isOpen || this.inventoryConnecting || this.bankPanel?.isOpen || this.bankConnecting || this.repairPanel?.isOpen || this.enhancementPanel?.isOpen || this.rankingPanel?.isOpen || this.shopPanel?.isOpen || this.mailPanel?.isOpen || this.dungeonSelectPanel?.isOpen;
        const x = inventoryBlocked ? 0 : this.horizontalInput();
        const y = inventoryBlocked ? 0 : this.stickId !== null ? this.axis.y : has(KeyCode.KEY_W, KeyCode.ARROW_UP) - has(KeyCode.KEY_S, KeyCode.ARROW_DOWN);
        this.accumulator += Math.min(dt, 0.1);
        while (this.accumulator >= 1 / 120) {
            const fixedDt = 1 / 120;
            if (this.sceneMode === 'town') {
                this.model.update(fixedDt, x, y);
                this.model.x = Math.max(-218, Math.min(218, this.model.x));
                this.bodyAnimation.update(fixedDt, this.model.moving, this.model.running, 0, false, false);
                if (this.model.x >= 185 && this.model.y >= -15 && this.model.y <= 55) {
                    this.enterDungeon();
                }
                this.accumulator -= fixedDt;
                continue;
            }
            if (this.encounter.state !== 'fighting' && !this.roomCleared) {
                this.feedback.update(fixedDt);
                for (const enemy of this.enemies) if (enemy.state === 'dead') enemy.update(fixedDt, this.model, true);
                this.accumulator -= fixedDt; continue;
            }
            if (this.feedback.update(fixedDt)) { this.accumulator -= fixedDt; continue; }
            this.skillEffects.update(fixedDt);
            this.skills.update(fixedDt);
            const isPlayerSuperArmor = this.skills.isSuperArmor;
            this.model.superArmor = isPlayerSuperArmor;
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
            if (this.model.hp <= 0) {
                this.skills.cancel();
                this.skillEffects.clear();
            } else if (this.model.hp < hpBeforeEnemies && !isPlayerSuperArmor) {
                this.skills.cancel();
            }
            this.bodyAnimation.update(fixedDt, this.model.moving, this.model.running, this.model.hitStun,
                this.skills.casting || this.model.stage >= 0, this.model.hp <= 0);
            this.encounter.update(fixedDt, this.model.hp, this.enemies);
            const encounterState: string = this.encounter.state;
            if (encounterState === 'victory') {
                this.roomCleared = true;
            }
            if (this.model.isDead) {
                this.clearInput();
                this.skills.cancel();
                this.skillEffects.clear();
                if (this.deathReviveHUD.status === 'hidden') {
                    const emblems = this.getEmblemCount();
                    const isSpecial = this.dungeonKind === 'rift';
                    this.deathReviveHUD.open(this.model.deathIndex, 10000, 10000, emblems, isSpecial, this.paidRevives);
                }
            } else if (encounterState !== 'fighting' && !this.roomCleared) {
                this.clearInput(); this.model.reset(); this.model.moving = this.model.running = false;
                this.skills.cancel(); this.skillEffects.clear();
            }
            if (this.roomCleared && this.roomNo >= 6 && this.model.x >= 165 && this.model.y >= -20 && this.model.y <= 65) {
                this.returnToTown();
                return;
            }
            if (this.roomCleared && this.roomNo < 6 && this.model.x >= 165 && this.model.y >= -20 && this.model.y <= 65) {
                this.roomNo++;
                this.restartEncounter();
                this.encounter.start();
            }
            this.accumulator -= fixedDt;
        }
        const { timeoutTriggered, fadeOutComplete } = this.deathReviveHUD.update(dt);
        if (timeoutTriggered) {
            this.handleDeathTimeout();
        }
        if (fadeOutComplete) {
            this.handleFadeOutComplete();
        }
        this.deathRevivePanel.update(dt, this.model.x, this.model.y);
        if (this.sceneMode === 'town') {
            this.supplyHUDView?.setVisible(false);
            this.playerStatusHUD?.setVisible(false);
            this.roundLabel.string = '微风小镇安全区 · 走进NPC即可办理业务 · 走向右侧传送门进入地下城';
            this.healthStatus.string = '战士生命 100/100   法力 100/100   [微风小镇安全区] 自由探索中';
            this.status.string = `${this.fps} FPS | 微风小镇安全区 | ${this.model.moving ? (this.model.running ? '奔跑' : '漫步') : '站街'} | 邻近NPC可按快捷键或点击交互`;
            this.draw(dt);
            this.localElapsedTicks += dt * 100;
            return;
        }
        this.supplyHUDView?.setVisible(true);
        this.playerStatusHUD?.setVisible(true);
        this.playerStatusHUD?.update(this.model.hp, 100, this.skills.mana, this.skills.maxMana);
        const round = this.encounter.state;
        const dName = this.dungeonKind === 'first' ? '首本牛头怪' : (this.dungeonKind === 'workshop' ? '失落工坊' : '裂隙遗址');
        this.roundLabel.string = this.deathReviveHUD.isVisible ? '' : (this.roomCleared
            ? (this.roomNo < 6 ? '清场完毕！走向右侧绿门换房 ▶' : '通关！走向传送门返回城镇 ▶')
            : round === 'fighting' ? ''
            : round === 'ready' ? `[${dName} R${this.roomNo + 1}/7] 触控摇杆/技能或点击开始`
            : `战败 · ${this.encounter.elapsed.toFixed(1)}秒 · 点击再挑战 / Enter`);
        this.draw(dt);
        const aliveEnemies = this.enemies.filter(e => e.state !== 'dead').length;
        this.healthStatus.string = `战士 ${this.healthBar(this.model.hp, 100)}   法力 ${this.skills.mana}/${this.skills.maxMana}   [${dName} R${this.roomNo + 1}/7] 敌怪: ${aliveEnemies}/${this.enemies.length}`;
        const state = round !== 'fighting' ? '点击场地上方文字开始 / 再挑战' : this.enemies.some(enemy => enemy.state === 'telegraph') ? '红色预警 · 离开锁定区域' : '攻击怪物，闪开预警';
        const skillState = this.skills.activeId
            ? `${warriorSkillNames[this.skills.activeId]}出招${this.model.superArmor ? ' [霸体]' : ''}`
            : '十字斩 / 崩山击 / 拔刀斩 / 崩山裂地斩';
        this.status.string = `${this.fps} FPS | 攻速${this.model.attackSpeedMultiplier.toFixed(2)}× | ${state} | ${this.model.stage < 0 ? (this.model.moving ? (this.model.running ? '跑' : '走') : '待机') : stages[this.model.stage]} | ${skillState}`;
        this.speedLabels.forEach((label, index) => label.color = new Color().fromHEX(
            this.model.attackSpeedMultiplier === attackSpeedTuning.presets[index] ? '#a5ffcf' : '#d0dadd'));
        this.localElapsedTicks += dt * 100;
        this.syncSupplyHUD();
        this.updateSkillLabels();
        this.updateSupplyLabels();
        this.updateDeathReviveLabels();
    }

    private authorityAction(action:'collect'|'leave'|'retry'):void {
        const scene=this.lootScene;if(!scene)return;
        const generation=this.challengeGeneration;
        if(this.lifecycle&&this.lifecycle.state.phase!=='active'){if(action==='retry')this.retryCombat();return;}
        const task=action==='retry'?scene.retry():action==='leave'?scene.requestLeave(scene.nextOperation('leave')):scene.hud.nearest?scene.requestCollect(scene.nextOperation('collect'),scene.hud.nearest.dropId):Promise.resolve();
        void task.catch(e=>{if(!this.isValid||generation!==this.challengeGeneration)return;this.challengeNotice.string=e instanceof Error?e.message:'操作暂不可用';});
    }
    private authoritySkill(skill:WarriorSkillId):void {
        const c=this.challengeCoordinator;if(!c||!this.lootScene?.canMove||this.lifecycle&&!this.lifecycle.state.canAttack)return;
        try{c.enqueue({seq:0,tick:c.state.confirmed!.acceptedTick,kind:'skill',skillId:skill});}catch{}
    }
    private authorityTouch(x:number,y:number,id:number,e:EventTouch):void {
        if(this.lifecycle&&this.lifecycle.state.phase!=='active')return;
        const hit=this.lootPanel?.hitTest(x,y);if(hit){this.authorityAction(hit);return;}
        if(this.stickId===null&&Math.hypot(x+345,y+150)<95){this.stickId=id;this.touchMove(e);return;}
        if(this.challengeCoordinator?.state.confirmed?.result==='completed')return;
        if(Math.hypot(x-345,y+150)<68){this.attackIds.add(id);return;}
        const ids:WarriorSkillId[]=['cross','bengshan','badao','earth'];for(let i=0;i<4;i++)if(Math.abs(x-(150+i*65))<31&&Math.abs(y+65)<24)this.authoritySkill(ids[i]);
    }
    private updateAuthority(dt:number):void {
        const c=this.challengeCoordinator!,scene=this.lootScene,state=c.state,confirmed=state.confirmed;
        if(this.lifecycle&&this.lifecycle.state.phase==='active'&&!state.predictionEnabled)void this.lifecycle.retry();
        if(this.lifecycle?.state.message)this.challengeNotice.string=this.lifecycle.state.message;
        if(confirmed&&(scene?.canMove||scene?.canAdvanceDeathTail)&&state.status==='active'&&state.predictionEnabled){
            const x=this.horizontalInput(),y=this.stickId!==null?this.axis.y:Number(this.keys.has(KeyCode.KEY_W)||this.keys.has(KeyCode.ARROW_UP))-Number(this.keys.has(KeyCode.KEY_S)||this.keys.has(KeyCode.ARROW_DOWN));
            // Queue at the confirmed frontier and submit bounded 100Hz slices using wall time.
            const elapsed=Math.floor((Date.now()-this.authorityClockBase)/10),toTick=confirmed.acceptedTick+Math.min(50,Math.max(0,elapsed));
            if(toTick>confirmed.acceptedTick){
                try{if(confirmed.lifeState==='alive'){c.enqueue({seq:0,tick:confirmed.acceptedTick,kind:'move',x:Math.round(x*1000),y:Math.round(y*1000)});
                    const held=this.keys.has(KeyCode.SPACE)||this.attackIds.size>0;
                    if(confirmed.result!=='completed'&&held!==this.authorityBasicHeld){c.enqueue({seq:0,tick:confirmed.acceptedTick,kind:'basic',pressed:held});this.authorityBasicHeld=held;}}
                    c.predict(toTick);
                }catch{}
                if(elapsed>=10){this.authorityClockBase=Date.now();void scene.submit(scene.nextOperation('sim'),toTick).catch(()=>{});}
            }
        }
        const current=c.state,p=current.position;
        if(p){this.model.x=Number(p.x)/1000;this.model.y=Number(p.y)/1000;this.model.facing=p.facing;}
        this.model.moving=!!p&&(this.horizontalInput()!==0||this.axis.y!==0||this.keys.has(KeyCode.KEY_W)||this.keys.has(KeyCode.KEY_S));
        this.model.running=this.model.moving;this.model.stage=-1;this.model.hp=current.player?Number(current.player.hp):100;
        // All enemies and terminal status come from recovered public state, never local damage/EncounterModel.
        while(this.enemies.length<current.targets.length)this.enemies.push(new EnemyModel(0,0,this.enemies.length));
        this.enemies.length=current.targets.length;
        current.targets.forEach((t,i)=>{if(this.enemies[i].maxHp!==Number(t.maxHp))this.enemies[i]=new EnemyModel(t.x/1000,t.y/1000,i,Number(t.maxHp));const e=this.enemies[i];e.x=t.x/1000;e.y=t.y/1000;e.hp=Number(t.hp);e.state=BigInt(t.hp)<=0n?'dead':'approach';});
        this.roomCleared=confirmed?.roomPhase==='cleared';this.roomNo=scene?.drops.state.view?.data.roomNo??0;
        this.bodyAnimation.update(Math.min(dt,.05),this.model.moving,this.model.running,0,false,this.model.hp<=0);
        this.roundLabel.string=confirmed?.result==='completed'?'已通关 · 可继续移动拾取':current.status==='active'?'权威战斗中':'等待服务确认 · V 恢复';
        this.healthStatus.string=`确认 tick ${confirmed?.acceptedTick??0} · ${current.status} · ${current.targets.filter(t=>BigInt(t.hp)>0n).length} 敌怪`;
        this.status.string='WASD / 摇杆移动 · 空格普攻 · P拾取 · L离开 · V恢复 · C切换沙盒';
        this.draw(dt);scene?.update(dt);if(scene)this.lootPanel?.update(scene);
        if(scene?.hud.fadeAlpha===1){this.clearInput();this.roundLabel.string='已返回城镇';this.challengeNotice.string='挑战已关闭 · 体力已回城结算';}
    }

    private rect(g: Graphics, x: number, y: number, w: number, h: number, color: string): void {
        g.fillColor = new Color().fromHEX(color); g.rect(x, y, w, h); g.fill();
    }

    private drawTown(g: Graphics, _dt: number): void {
        const time = Date.now() / 1000;
        this.rect(g, -240, 20, 480, 115, '#121924');
        this.rect(g, -240, 20, 480, 50, '#1c2635');
        this.rect(g, -240, 20, 480, 25, '#273447');

        const stars = [[-210, 110], [-170, 125], [-110, 115], [-50, 120], [20, 128], [70, 112], [140, 122], [220, 118]];
        for (const [sx, sy] of stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(time * 3 + sx);
            g.fillColor = new Color(255, 240, 200, Math.round(150 + 100 * twinkle));
            g.circle(sx, sy, 1.2); g.fill();
        }

        g.fillColor = new Color(28, 38, 48); g.rect(-220, 25, 120, 65); g.fill();
        g.fillColor = new Color(130, 45, 40);
        g.moveTo(-225, 90); g.lineTo(-160, 122); g.lineTo(-95, 90); g.close(); g.fill();
        g.fillColor = new Color(70, 60, 55); g.rect(-205, 90, 14, 28); g.fill();
        for (let i = 0; i < 3; i++) {
            const smokeT = (time * 1.5 + i * 0.8) % 2.5;
            const smokeX = -198 + Math.sin(smokeT * 2 + i) * 8;
            const smokeY = 120 + smokeT * 18;
            const smokeAlpha = Math.max(0, 1 - smokeT / 2.5) * 120;
            g.fillColor = new Color(200, 200, 210, Math.round(smokeAlpha));
            g.circle(smokeX, smokeY, 4 + smokeT * 3); g.fill();
        }
        g.fillColor = new Color(255, 200, 60, 210); g.roundRect(-145, 45, 20, 22, 3); g.fill();
        g.strokeColor = new Color(100, 60, 30); g.lineWidth = 1;
        g.moveTo(-135, 45); g.lineTo(-135, 67); g.moveTo(-145, 56); g.lineTo(-125, 56); g.stroke();

        g.fillColor = new Color(34, 32, 50); g.rect(-60, 25, 100, 72); g.fill();
        g.fillColor = new Color(50, 42, 85);
        g.moveTo(-65, 97); g.lineTo(-10, 132); g.lineTo(45, 97); g.close(); g.fill();
        g.strokeColor = new Color(240, 180, 255, 220); g.lineWidth = 1.5;
        g.circle(-10, 115, 6); g.stroke();
        const arcaneGlow = 0.7 + 0.3 * Math.sin(time * 2);
        g.fillColor = new Color(190, 110, 255, Math.round(180 * arcaneGlow));
        g.roundRect(-22, 50, 24, 30, 4); g.fill();

        g.fillColor = new Color(42, 52, 64); g.rect(70, 25, 95, 68); g.fill();
        g.fillColor = new Color(60, 75, 90);
        g.moveTo(65, 93); g.lineTo(117, 118); g.lineTo(170, 93); g.close(); g.fill();
        g.strokeColor = new Color(220, 180, 90); g.lineWidth = 1.5;
        g.moveTo(65, 93); g.lineTo(117, 118); g.lineTo(170, 93); g.stroke();
        for (const px of [75, 100, 130, 155]) {
            g.fillColor = new Color(90, 105, 120); g.rect(px, 25, 8, 65); g.fill();
        }
        g.fillColor = new Color(160, 130, 50); g.circle(117, 45, 16); g.fill();
        g.strokeColor = new Color(240, 200, 80); g.lineWidth = 1.5; g.circle(117, 45, 16); g.stroke();
        g.circle(117, 45, 6); g.stroke();

        this.rect(g, -232, -42, 464, 68, '#2e3a44');
        g.fillColor = new Color(45, 85, 55); g.rect(-232, 23, 464, 4); g.fill();
        g.fillColor = new Color(65, 120, 75);
        for (let gx = -228; gx < 230; gx += 16) {
            g.moveTo(gx, 23); g.lineTo(gx + 3, 27); g.lineTo(gx + 6, 23); g.fill();
        }
        for (let y = -42; y <= 20; y += 14) {
            const rowOffset = (Math.floor(y / 14) % 2) * 12;
            for (let x = -232 + rowOffset; x < 232; x += 24) {
                const shade = 40 + Math.abs((x * 17 + y * 31) % 15);
                g.fillColor = new Color(shade, shade + 8, shade + 15, 220);
                g.roundRect(x + 1, y + 1, 22, 12, 2); g.fill();
                g.strokeColor = new Color(25, 33, 40, 180); g.lineWidth = 0.8;
                g.roundRect(x + 1, y + 1, 22, 12, 2); g.stroke();
            }
        }
        this.rect(g, -232, -45, 464, 3, '#1d252c');

        for (const lx of [-90, 55]) {
            g.fillColor = new Color(20, 25, 30); g.rect(lx - 2, -15, 4, 48); g.fill();
            g.circle(lx, 33, 4); g.fill();
            g.fillColor = new Color(255, 190, 70, 240); g.roundRect(lx - 5, 23, 10, 12, 2); g.fill();
            g.strokeColor = new Color(180, 120, 30); g.lineWidth = 1; g.roundRect(lx - 5, 23, 10, 12, 2); g.stroke();
            const lampPulse = 0.85 + 0.15 * Math.sin(time * 4 + lx);
            g.fillColor = new Color(255, 210, 100, Math.round(45 * lampPulse));
            g.circle(lx, 29, 22); g.fill();
        }

        for (let c = 0; c < 5; c++) {
            g.fillColor = c % 2 === 0 ? new Color(180, 50, 45) : new Color(235, 185, 70);
            g.rect(-175 + c * 10, 16, 10, 14); g.fill();
        }
        g.strokeColor = new Color(60, 35, 20); g.lineWidth = 1; g.rect(-175, 16, 50, 14); g.stroke();
        g.fillColor = new Color(90, 60, 35); g.rect(-162, -14, 24, 16); g.fill();
        g.fillColor = new Color(130, 138, 145);
        g.rect(-165, 0, 30, 8); g.fill();
        g.moveTo(-168, 7); g.lineTo(-165, 0); g.lineTo(-135, 0); g.lineTo(-132, 7); g.close(); g.fill();
        const heatPulse = 0.7 + 0.3 * Math.sin(time * 5);
        g.strokeColor = new Color(255, Math.round(90 + 50 * heatPulse), 20, 240); g.lineWidth = 2;
        g.moveTo(-160, 6); g.lineTo(-140, 6); g.stroke();
        g.fillColor = new Color(255, 140, 30, 220); g.circle(-130, 8, 7 + 2 * Math.sin(time * 6)); g.fill();
        g.fillColor = new Color(255, 230, 70, 240); g.circle(-130, 8, 4 + 1.5 * Math.sin(time * 8)); g.fill();

        // Merchant Delilah Stall (-80)
        for (let c = 0; c < 4; c++) {
            g.fillColor = c % 2 === 0 ? new Color(220, 80, 50) : new Color(250, 240, 220);
            g.rect(-96 + c * 8, 16, 8, 12); g.fill();
        }
        g.strokeColor = new Color(70, 45, 30); g.lineWidth = 1; g.rect(-96, 16, 32, 12); g.stroke();
        g.fillColor = new Color(85, 55, 35); g.roundRect(-98, -12, 36, 18, 2); g.fill();
        g.strokeColor = new Color(170, 130, 80); g.lineWidth = 1; g.roundRect(-98, -12, 36, 18, 2); g.stroke();
        g.fillColor = new Color(240, 70, 70, 230); g.circle(-90, 8, 3.5); g.fill();
        g.fillColor = new Color(70, 150, 255, 230); g.circle(-80, 8, 3.5); g.fill();
        g.fillColor = new Color(190, 80, 255, 230); g.circle(-70, 8, 3.5); g.fill();

        g.fillColor = new Color(90, 35, 130); g.roundRect(-35, 16, 50, 14, 2); g.fill();
        g.strokeColor = new Color(255, 215, 100); g.lineWidth = 1.2;
        g.moveTo(-35, 16); g.lineTo(15, 16); g.stroke();
        g.fillColor = new Color(55, 60, 75); g.roundRect(-22, -10, 24, 22, 4); g.fill();
        g.strokeColor = new Color(190, 120, 255); g.lineWidth = 1.5; g.roundRect(-22, -10, 24, 22, 4); g.stroke();
        const flamePulse = Math.sin(time * 4);
        g.fillColor = new Color(240, 80, 210, Math.round(190 + 50 * flamePulse));
        g.ellipse(-10, 8, 9, 6 + 1.5 * flamePulse); g.fill();
        g.fillColor = new Color(100, 230, 255, 220);
        g.circle(-10, 8, 3.5); g.fill();
        for (let sp = 0; sp < 4; sp++) {
            const st = (time * 2 + sp * 1.6) % 3;
            const sx = -10 + Math.sin(st * 3 + sp) * 12;
            const sy = 10 + st * 12;
            const sa = Math.max(0, 1 - st / 3) * 230;
            g.fillColor = new Color(220, 140, 255, Math.round(sa));
            g.circle(sx, sy, 1.8); g.fill();
        }

        // Hotel Mailbox (50)
        g.fillColor = new Color(70, 45, 30); g.rect(47, -12, 6, 18); g.fill();
        g.fillColor = new Color(175, 45, 45); g.roundRect(40, 6, 20, 24, 3); g.fill();
        g.strokeColor = new Color(240, 180, 60); g.lineWidth = 1; g.roundRect(40, 6, 20, 24, 3); g.stroke();
        g.fillColor = new Color(40, 20, 20); g.rect(44, 20, 12, 3); g.fill();
        g.fillColor = new Color(255, 215, 60); g.circle(50, 13, 2.5); g.fill();
        g.fillColor = new Color(240, 70, 60); g.rect(60, 18, 5, 4); g.fill();

        g.fillColor = new Color(75, 50, 35); g.roundRect(100, -8, 40, 22, 2); g.fill();
        g.strokeColor = new Color(190, 150, 90); g.lineWidth = 1; g.roundRect(100, -8, 40, 22, 2); g.stroke();
        g.fillColor = new Color(90, 55, 30); g.rect(103, 10, 16, 12); g.fill();
        g.fillColor = new Color(255, 215, 0, 245);
        g.ellipse(111, 19, 7, 5); g.fill();
        g.fillColor = new Color(255, 245, 140, 250); g.circle(109, 20, 1.8); g.circle(113, 19, 1.5); g.fill();
        const gemSparkle = 0.5 + 0.5 * Math.sin(time * 6);
        g.fillColor = new Color(255, 60, 80, Math.round(200 * gemSparkle));
        g.circle(111, 21, 2); g.fill();
        g.strokeColor = new Color(230, 190, 70); g.lineWidth = 1.2;
        g.moveTo(132, 10); g.lineTo(132, 24); g.moveTo(126, 21); g.lineTo(138, 21); g.stroke();
        g.circle(126, 18, 2.5); g.circle(138, 18, 2.5); g.stroke();

        g.fillColor = new Color(55, 50, 70);
        g.rect(178, -15, 10, 65); g.fill();
        g.rect(218, -15, 10, 65); g.fill();
        g.rect(174, 46, 58, 10); g.fill();
        g.strokeColor = new Color(130, 100, 180); g.lineWidth = 1.2;
        g.rect(178, -15, 10, 65); g.stroke();
        g.rect(218, -15, 10, 65); g.stroke();
        g.rect(174, 46, 58, 10); g.stroke();
        const runeGlow = 0.6 + 0.4 * Math.sin(time * 2.5);
        g.fillColor = new Color(160, 120, 255, Math.round(220 * runeGlow));
        for (const ry of [0, 16, 32]) {
            g.circle(183, ry, 2); g.fill();
            g.circle(223, ry, 2); g.fill();
        }
        const portalPulse = 0.8 + 0.2 * Math.sin(time * 3);
        g.fillColor = new Color(60, 20, 110, Math.round(180 * portalPulse));
        g.ellipse(203, 18, 15 * portalPulse, 26 * portalPulse); g.fill();
        g.fillColor = new Color(130, 50, 220, Math.round(210 * portalPulse));
        g.ellipse(203, 18, 10 * portalPulse, 20 * portalPulse); g.fill();
        g.fillColor = new Color(80, 220, 255, Math.round(230 * portalPulse));
        g.ellipse(203, 18, 5 * portalPulse, 12 * portalPulse); g.fill();
        g.fillColor = new Color(255, 255, 255, 240);
        g.circle(203, 18, 2.5); g.fill();
        g.strokeColor = new Color(190, 140, 255, Math.round(240 * portalPulse));
        g.lineWidth = 2;
        g.ellipse(203, 18, 15 * portalPulse, 26 * portalPulse); g.stroke();
        for (let vp = 0; vp < 5; vp++) {
            const vt = (time * 1.8 + vp * 1.2) % 2.5;
            const vx = 203 + Math.cos(time * 3 + vp * 1.3) * (8 + vt * 3);
            const vy = 5 + vt * 16;
            const va = Math.max(0, 1 - vt / 2.5) * 220;
            g.fillColor = new Color(180, 220, 255, Math.round(va));
            g.circle(vx, vy, 1.6); g.fill();
        }

        const px = this.model.x;
        const py = this.model.y;
        this.townNPCHUD?.update(time, px, py);
        this.townNPCHUD?.drawTownAvatars(g, time, px, py);
    }

    private draw(dt: number): void {
        const ui = this.controls;
        ui.clear();
        const isTown = this.sceneMode === 'town';
        ui.fillColor = isTown ? new Color(46, 93, 68, 240) : new Color(93, 56, 46, 240);
        ui.roundRect(-265, 228, 100, 28, 4);
        ui.fill();
        ui.strokeColor = isTown ? new Color(90, 180, 130, 220) : new Color(200, 95, 75, 220);
        ui.lineWidth = 1.5;
        ui.roundRect(-265, 228, 100, 28, 4);
        ui.stroke();
        for (const x of [-100, -30, 40, 110, 180]) {
            ui.fillColor = new Color(34, 48, 58, 235);
            ui.roundRect(x - 30, 228, 60, 28, 4);
            ui.fill();
            ui.strokeColor = new Color(68, 88, 108, 180);
            ui.lineWidth = 1.5;
            ui.roundRect(x - 30, 228, 60, 28, 4);
            ui.stroke();
        }
        const m = this.model;
        const g = this.world;
        const shake = this.feedback.shakeOffset;
        g.node.setPosition(shake.x * 2, shake.y * 2);
        g.clear();
        if (this.sceneMode === 'town') {
            this.drawTown(g, dt);
        } else {
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
            this.drawSkillEffect(g);
            this.drawEnemies(g);
        }
        const x = Math.round(m.x), y = Math.round(m.y);
        g.fillColor = new Color(15, 24, 25, 150); g.ellipse(x, y, 14, 4.8); g.fill();
        if (m.superArmor) {
            g.strokeColor = new Color(255, 215, 0, 220);
            g.lineWidth = 2.0;
            g.ellipse(x, y + this.skills.jumpLift + 16, 14, 22);
            g.stroke();
        }
        if (this.deathReviveHUD.goldenAura.active) {
            const aura = this.deathReviveHUD.goldenAura;
            const alpha = Math.max(0, 1 - aura.elapsedSec / aura.durationSec);
            g.strokeColor = new Color(255, 215, 0, Math.round(230 * alpha));
            g.lineWidth = 3.0;
            g.ellipse(x, y + this.skills.jumpLift + 16, aura.radius * 0.7, aura.radius);
            g.stroke();
            g.strokeColor = new Color(255, 245, 160, Math.round(180 * alpha));
            g.lineWidth = 1.5;
            g.ellipse(x, y + this.skills.jumpLift + 16, aura.radius * 0.5, aura.radius * 0.7);
            g.stroke();
        }
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
        this.rect(this.controls, 185, 154, 55, 28, this.dungeonKind === 'first' ? '#53757e' : '#293941');
        this.rect(this.controls, 245, 154, 55, 28, this.dungeonKind === 'workshop' ? '#53757e' : '#293941');
        this.rect(this.controls, 305, 154, 55, 28, this.dungeonKind === 'rift' ? '#53757e' : '#293941');
        this.rect(this.controls, 365, 154, 55, 28, this.roomCleared ? '#3e7855' : '#293941');
        this.textMode();

        // Virtual Joystick
        ui.fillColor = new Color(24, 36, 46, 175);
        ui.circle(-345, -150, 75);
        ui.fill();
        ui.strokeColor = new Color(80, 110, 130, 220);
        ui.lineWidth = 2;
        ui.circle(-345, -150, 75);
        ui.stroke();

        ui.fillColor = new Color(140, 180, 195, 220);
        ui.circle(-345 + this.axis.x * 55, -150 + this.axis.y * 55, 27);
        ui.fill();
        ui.strokeColor = new Color(210, 235, 240, 255);
        ui.lineWidth = 2;
        ui.circle(-345 + this.axis.x * 55, -150 + this.axis.y * 55, 27);
        ui.stroke();

        // Normal Attack Button
        const isAttacking = this.attackIds.size > 0;
        ui.fillColor = isAttacking ? new Color(180, 75, 45, 250) : new Color(140, 65, 45, 220);
        ui.circle(345, -150, 61);
        ui.fill();
        ui.strokeColor = new Color(255, 215, 80, 240);
        ui.lineWidth = 3;
        ui.circle(345, -150, 61);
        ui.stroke();
        ui.strokeColor = new Color(255, 230, 120, 120);
        ui.lineWidth = 1;
        ui.circle(345, -150, 52);
        ui.stroke();

        // Four Skill Buttons
        const skillButtons: { id: WarriorSkillId; x: number }[] = [
            { id: 'cross', x: 150 }, { id: 'bengshan', x: 215 }, { id: 'badao', x: 280 }, { id: 'earth', x: 345 },
        ];
        for (const button of skillButtons) {
            const isReady = this.skills.ready(button.id);
            ui.fillColor = isReady ? new Color(45, 120, 135, 240) : new Color(28, 40, 48, 210);
            ui.circle(button.x, -65, 29);
            ui.fill();
            ui.strokeColor = isReady ? new Color(100, 210, 230, 240) : new Color(60, 78, 90, 160);
            ui.lineWidth = isReady ? 2.5 : 1.5;
            ui.circle(button.x, -65, 29);
            ui.stroke();
            if (isReady) {
                ui.strokeColor = new Color(180, 240, 255, 100);
                ui.lineWidth = 1;
                ui.circle(button.x, -65, 24);
                ui.stroke();
            }
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
        if (this.roomNo === 0) {
            this.paidRevives = 0;
        }
        this.deathReviveHUD.status = 'hidden';
        this.deathReviveHUD.goldenAura.active = false;
        this.deathReviveHUD.fadeOut.active = false;

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

    private getEmblemCount(): number {
        const inv = this.inventoryCoordinator?.state;
        if (inv?.backpack?.slots) {
            let count = 0;
            for (const s of inv.backpack.slots) {
                if (s.entry.kind === 'stack' && (s.entry.templateRef === 'item:resurrection-emblem' || s.entry.templateRef === 'resurrection-emblem')) {
                    count += s.entry.quantity;
                }
            }
            return count;
        }
        return this.sandboxEmblemCount;
    }

    private handleDeathRevive(): void {
        const result = this.deathReviveHUD.onReviveClicked();
        if (!result.success) return;
        this.finishReviveLocally();
    }

    private finishReviveLocally(): void {
        const count = this.getEmblemCount();
        const isSpecial = this.dungeonKind === 'rift';
        if (count <= 0) {
            this.deathReviveHUD.onReviveFailed('EMBLEM_NOT_ENOUGH');
            return;
        }
        if (isSpecial && this.paidRevives >= 3) {
            this.deathReviveHUD.onReviveFailed('REVIVE_LIMIT_REACHED');
            return;
        }
        if (this.sandboxEmblemCount > 0) {
            this.sandboxEmblemCount--;
        }
        this.paidRevives++;
        this.deathReviveHUD.emblemCount = this.getEmblemCount();
        this.deathReviveHUD.paidRevives = this.paidRevives;
        this.model.hp = this.model.maxHp;
        this.model.lifeState = 'alive';
        this.model.invulnerable = 2.0;
        this.skills.mana = this.skills.maxMana;
        this.skills.resetCooldowns();
        this.encounter.state = 'fighting';
        this.deathReviveHUD.onReviveSuccess();
    }

    private handleDeathLeave(): void {
        const result = this.deathReviveHUD.onLeaveClicked();
        if (!result.success) return;
        this.deathReviveHUD.onLeaveSuccess();
    }

    private handleDeathTimeout(): void {
        this.deathReviveHUD.onLeaveSuccess();
    }

    private handleFadeOutComplete(): void {
        this.deathReviveHUD.status = 'hidden';
        this.deathReviveHUD.fadeOut.active = false;
        this.roomNo = 0;
        this.restartEncounter();
    }

    private drawDeathReviveHUD(_dt: number): void {
        // Skinned by DeathRevivePanel using 9-patch frame and slices.
    }

    private updateDeathReviveLabels(): void {
        // Managed by DeathRevivePanel.
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

    private touchSupplyButton(x: number, y: number): boolean {
        const hit = this.supplyHUD.hitTest(x, y);
        if (!hit) return false;
        if (hit.target === 'quickSlot') {
            this.useSupplySlot(hit.index);
        } else {
            this.useTrinket();
        }
        return true;
    }

    private useSupplySlot(index: number): void {
        const tick = Math.floor(this.localElapsedTicks);
        const input = this.supplyHUD.triggerQuickSlot(index, tick);
        if (!input) return;
        if (this.challengeCoordinator && this.challengeCoordinator.state.status === 'active') {
            try {
                this.challengeCoordinator.enqueue({...input,seq:0,tick:this.challengeCoordinator.state.confirmed!.acceptedTick});
            } catch {
                this.supplyHUD.resolveSubmission('quickSlot', index);
            }
        } else {
            const slot = this.supplyHUD.quickSlots[index];
            if (slot.kind === 'hp') {
                this.model.hp = Math.min(100, this.model.hp + 20);
                const cd = this.localCooldowns.find(c => c.cooldownId === 'hpPotion');
                if (cd) cd.readyAtTick = tick + 1000;
                else this.localCooldowns.push({ cooldownId: 'hpPotion', readyAtTick: tick + 1000 });
            } else if (slot.kind === 'mp') {
                this.skills.mana = Math.min(this.skills.maxMana, this.skills.mana + 40);
                const cd = this.localCooldowns.find(c => c.cooldownId === 'mpPotion');
                if (cd) cd.readyAtTick = tick + 1000;
                else this.localCooldowns.push({ cooldownId: 'mpPotion', readyAtTick: tick + 1000 });
            }
            this.supplyHUD.resolveSubmission('quickSlot', index);
        }
    }

    private useTrinket(): void {
        const tick = Math.floor(this.localElapsedTicks);
        const input = this.supplyHUD.triggerTrinket(tick);
        if (!input) return;
        if (this.challengeCoordinator && this.challengeCoordinator.state.status === 'active') {
            try {
                this.challengeCoordinator.enqueue({...input,seq:0,tick:this.challengeCoordinator.state.confirmed!.acceptedTick});
            } catch {
                this.supplyHUD.resolveSubmission('trinket');
            }
        } else {
            const cd = this.localCooldowns.find(c => c.cooldownId === 'trinket');
            if (cd) cd.readyAtTick = tick + 12000;
            else this.localCooldowns.push({ cooldownId: 'trinket', readyAtTick: tick + 12000 });
            this.localBuffs = [{ buffId: `b-local-${tick}`, templateRef: 'item:trinket-warrior-glory-v1', endsAtTick: tick + 1500 }];
            this.supplyHUD.resolveSubmission('trinket');
        }
    }

    private syncSupplyHUD(): void {
        const coord = this.challengeCoordinator;
        if (coord && coord.state.status === 'active' && coord.state.confirmed) {
            const cState = coord.state;
            const actor = cState.confirmed;
            const inv = this.inventoryCoordinator?.state;
            const quick = inv?.quickSlots?.slots ?? [];
            const quickSlotTemplates: (string | null)[] = [null, null, null];
            for (const s of quick) {
                if (s.slotIndex >= 0 && s.slotIndex < 3) quickSlotTemplates[s.slotIndex] = s.templateId;
            }
            const backpackStacks = (inv?.backpack?.slots ?? [])
                .flatMap(s => s.entry.kind==='stack'?[{templateId:s.entry.templateRef,quantity:s.entry.quantity}]:[]);

            if (cState.actionResults.length > 0) {
                this.supplyHUD.clearSubmissions();
            }

            this.supplyHUD.syncFromSnapshot({
                quickSlots: quickSlotTemplates,
                backpackStacks,
                equippedTrinket: null,
                cooldowns: [],
                buffs: [],
                currentTick: actor!.acceptedTick,
                lifeState: cState.player ? cState.player.lifeState : (this.model.hp > 0 ? 'alive' : 'dead'),
                isFighting: this.encounter.state === 'fighting'
            });
        } else {
            this.supplyHUD.syncFromSnapshot({
                quickSlots: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1', null],
                backpackStacks: [
                    { templateId: 'item:hp-potion-small-v1', quantity: 5 },
                    { templateId: 'item:mp-potion-small-v1', quantity: 5 }
                ],
                equippedTrinket: { itemId: 'inst-trinket-glory-1', templateRef: 'item:trinket-warrior-glory-v1' },
                cooldowns: this.localCooldowns,
                buffs: this.localBuffs,
                currentTick: Math.floor(this.localElapsedTicks),
                lifeState: this.model.hp > 0 ? 'alive' : 'dead',
                isFighting: this.encounter.state === 'fighting'
            });
        }
    }

    private updateSupplyLabels(): void {
        for (let i = 0; i < 3; i++) {
            if (this.supplyLabels[i]) {
                this.supplyLabels[i].string = this.supplyHUD.quickSlots[i].label;
            }
        }
        if (this.supplyLabels[3]) {
            this.supplyLabels[3].string = this.supplyHUD.trinket.label;
        }
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

    private drawPlayerHUD(_x: number, _y: number): void {
        // Skinned by PlayerStatusHUD using 9-patch bar_fill_hp/mp slices and inner well.
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
