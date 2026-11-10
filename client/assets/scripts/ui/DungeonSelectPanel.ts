import { Node, Graphics, Color, UITransform, Label, sys, game, Game } from 'cc';
import type { ChallengeEntryCoordinator, ChallengeEntryState } from '../net/ChallengeEntryCoordinator.ts';
import { skinSprite } from './UISkin';

export type DungeonKind = 'first' | 'workshop' | 'rift';
export type DifficultyKind = 'normal' | 'adventure' | 'warrior';

export interface DungeonMeta {
  id: DungeonKind;
  name: string;
  subtitle: string;
  levelRange: string;
  desc: string;
  monsters: string;
  recommendedPower: { normal: string; adventure: string; warrior: string };
  staminaCost: number;
}

export const DUNGEON_CATALOG: Record<DungeonKind, DungeonMeta> = {
  first: {
    id: 'first',
    name: '幽暗密林深处',
    subtitle: '格兰之森外围 · 哥布林与狂暴猫妖',
    levelRange: 'Lv. 1 ~ 15',
    desc: '幽暗阴森的密林深处，受狂暴魔法影响的低级魔物在此聚集，是新晋勇士踏上征程的试炼之地。',
    monsters: '哥布林投掷手、荧光猫妖、十夫长、狂暴牛头怪',
    recommendedPower: { normal: '120', adventure: '200', warrior: '350' },
    staminaCost: 8,
  },
  workshop: {
    id: 'workshop',
    name: '格兰之森工坊',
    subtitle: '遗弃魔界机械厂 · 充能落雷',
    levelRange: 'Lv. 8 ~ 20',
    desc: '古代战争遗留的魔导机械工坊，失控的机械傀儡与带电的落雷凯诺前哨在此徘徊。',
    monsters: '机械巡逻犬、自爆哥布林、带电哥布林、钢铁机甲牛',
    recommendedPower: { normal: '280', adventure: '420', warrior: '650' },
    staminaCost: 8,
  },
  rift: {
    id: 'rift',
    name: '裂隙深处',
    subtitle: '异界深渊裂缝 · 虚空扭曲',
    levelRange: 'Lv. 15 ~ 30',
    desc: '被深渊撕裂的虚空空间，涌动着危险的异界魔法与狂暴的深渊领主，挑战者需备齐精炼武装。',
    monsters: '暗夜潜伏者、深渊幽魂、暴戾狂徒、异界领主',
    recommendedPower: { normal: '500', adventure: '750', warrior: '1100' },
    staminaCost: 8,
  },
};

export const DIFFICULTY_NAMES: Record<DifficultyKind, string> = {
  normal: '普通',
  adventure: '冒险',
  warrior: '勇士',
};

export interface DungeonSelectPanelOptions {
  contextId?: string;
  onVisibility?: (visible: boolean) => void;
  onStart?: (dungeonId: DungeonKind, difficultyId: DifficultyKind, startData: any) => void;
  getStamina?: () => number;
  hasWeapon?: () => boolean;
  isWeaponBroken?: () => boolean;
}

interface ControlButton {
  name: string;
  node: Node;
  width: number;
  canEnable: () => boolean;
  action: () => void;
}

export class DungeonSelectPanel {
  private readonly root: Node;
  private readonly coordinator: ChallengeEntryCoordinator;
  private readonly options: DungeonSelectPanelOptions;

  private visible = false;
  private state: ChallengeEntryState;
  private selectedDungeon: DungeonKind = 'first';
  private selectedDifficulty: DifficultyKind = 'normal';

  private readonly titleLabel: Label;
  private readonly staminaPillLabel: Label;

  // Left column nodes
  private readonly dungeonCardNodes: Map<DungeonKind, Node> = new Map();
  private readonly dungeonCardTitleLabels: Map<DungeonKind, Label> = new Map();
  private readonly dungeonCardSubLabels: Map<DungeonKind, Label> = new Map();

  // Right column nodes
  private readonly detailTitleLabel: Label;
  private readonly detailDescLabel: Label;
  private readonly detailMonstersLabel: Label;
  private readonly diffTabNodes: Map<DifficultyKind, Node> = new Map();
  private readonly staminaReqLabel: Label;
  private readonly weaponReqLabel: Label;
  private readonly gateResultLabel: Label;
  private readonly startButtonNode: Node;
  private readonly recoverButtonNode: Node;
  private readonly statusLabel: Label;

  private readonly controls: ControlButton[] = [];
  private readonly buttonResets: Array<() => void> = [];
  private suppressMouseUntil = 0;
  private browserPointer: 'mouse' | 'touch' = 'touch';

  private readonly trackPointer = (e: PointerEvent): void => {
    this.browserPointer = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  };
  private readonly cancelPointer = (e: PointerEvent): void => {
    if (e.isPrimary) this.cancel();
  };
  private readonly releaseOutside = (e: PointerEvent): void => {
    if (e.isPrimary) this.cancel();
  };
  private readonly cancel = (): void => {
    for (const reset of this.buttonResets) reset();
  };
  private readonly onHide = (): void => {
    this.cancel();
    if (this.visible) this.close();
  };

  constructor(parent: Node, coordinator: ChallengeEntryCoordinator, options: DungeonSelectPanelOptions = {}) {
    this.coordinator = coordinator;
    this.options = options;
    this.state = coordinator.state;

    if (sys.isBrowser && typeof window !== 'undefined') {
      this.browserPointer = navigator.maxTouchPoints === 0 ? 'mouse' : 'touch';
      window.addEventListener('pointerdown', this.trackPointer, true);
      window.addEventListener('pointerup', this.releaseOutside, true);
      window.addEventListener('pointercancel', this.cancelPointer, true);
      window.addEventListener('blur', this.cancel);
    }
    game.on(Game.EVENT_HIDE, this.onHide, this);

    // Root Panel (960 x 540)
    this.root = this.node(parent, 'DungeonSelectPanel', 0, 0, 960, 540);
    this.root.active = false;

    // Dark background mask
    const bg = this.root.addComponent(Graphics);
    bg.fillColor = new Color(16, 24, 30, 245);
    bg.rect(-480, -270, 960, 540);
    bg.fill();

    // 9-Patch Window Frame
    skinSprite(this.node(this.root, 'WindowFrame', 0, 0, 912, 500), 'ui/slices/panel_window_frame', true);

    // Top Header
    this.titleLabel = this.label(this.root, '格兰之森 · 传送门 (地下城选择)', -110, 226, 22, 500);
    this.titleLabel.color = new Color(255, 225, 120);

    this.staminaPillLabel = this.label(this.root, '疲劳值: 308/308', 220, 226, 16, 180);
    this.staminaPillLabel.color = new Color(140, 230, 255);

    this.button('✕ 关闭', 390, 226, () => this.close(), () => true, 80, 30);
    this.button('✕ 关闭', -390, 226, () => this.close(), () => true, 80, 30);

    // Left Column: Dungeon Selection List (360 x 410 at x = -245, y = -20)
    const leftWell = this.node(this.root, 'LeftDungeonListWell', -245, -20, 360, 410);
    skinSprite(leftWell, 'ui/slices/panel_well_inner', true);

    const listTitle = this.label(this.root, '地下城探索区域', -245, 160, 18, 320);
    listTitle.color = new Color(200, 220, 240);

    // 3 Dungeon Cards
    const dungeonKinds: DungeonKind[] = ['first', 'workshop', 'rift'];
    const cardYPositions = [95, -5, -105];

    dungeonKinds.forEach((dKind, index) => {
      const meta = DUNGEON_CATALOG[dKind];
      const y = cardYPositions[index];
      const cardNode = this.node(this.root, `DungeonCard_${dKind}`, -245, y, 330, 85);
      skinSprite(cardNode, 'ui/slices/button_normal', true);

      const title = this.label(cardNode, `${meta.name} [${meta.levelRange}]`, 0, 18, 16, 310);
      title.color = new Color(255, 235, 160);

      const sub = this.label(cardNode, `${meta.subtitle} · 耗费${meta.staminaCost}疲劳`, 0, -16, 12, 310);
      sub.color = new Color(180, 200, 220);

      this.interactiveButton(cardNode, 330, 85, () => void this.selectDungeon(dKind), () => true);

      this.dungeonCardNodes.set(dKind, cardNode);
      this.dungeonCardTitleLabels.set(dKind, title);
      this.dungeonCardSubLabels.set(dKind, sub);
    });

    // Right Column: Dungeon Details & Difficulty & Confirmation (470 x 410 at x = 200, y = -20)
    const rightWell = this.node(this.root, 'RightDetailWell', 200, -20, 470, 410);
    skinSprite(rightWell, 'ui/slices/panel_well_inner', true);

    this.detailTitleLabel = this.label(this.root, '', 200, 160, 20, 440);
    this.detailTitleLabel.color = new Color(255, 230, 130);

    this.detailDescLabel = this.label(this.root, '', 200, 105, 13, 440, 60);
    this.detailDescLabel.color = new Color(210, 220, 230);

    this.detailMonstersLabel = this.label(this.root, '', 200, 58, 12, 440);
    this.detailMonstersLabel.color = new Color(170, 210, 240);

    // Difficulty Tabs Header & Buttons
    const diffHeader = this.label(this.root, '难度选择:', 200, 26, 15, 440);
    diffHeader.color = new Color(240, 240, 250);

    const diffConfigs: Array<{ id: DifficultyKind; name: string; x: number }> = [
      { id: 'normal', name: '普通', x: 70 },
      { id: 'adventure', name: '冒险', x: 200 },
      { id: 'warrior', name: '勇士', x: 330 },
    ];

    for (const dc of diffConfigs) {
      const btn = this.node(this.root, `DiffTab_${dc.id}`, dc.x, -6, 110, 32);
      skinSprite(btn, 'ui/slices/button_normal', true);
      const lbl = this.label(btn, dc.name, 0, 0, 14, 100);
      lbl.color = new Color(240, 240, 240);
      this.interactiveButton(btn, 110, 32, () => void this.selectDifficulty(dc.id), () => true);
      this.diffTabNodes.set(dc.id, btn);
    }

    // Readiness & Gate Verification Status Box
    this.staminaReqLabel = this.label(this.root, '', 200, -48, 13, 440);
    this.weaponReqLabel = this.label(this.root, '', 200, -72, 13, 440);
    this.gateResultLabel = this.label(this.root, '', 200, -96, 14, 440);

    // Primary Action Button: "开启挑战"
    this.startButtonNode = this.button(
      '开启挑战 (消耗 8 疲劳)',
      200,
      -145,
      () => void this.confirmStart(),
      () => this.canStart(),
      260,
      40
    );

    // Recovery / Retry Button (Active in 'unknown' state)
    this.recoverButtonNode = this.button(
      '状态恢复 / 重试',
      200,
      -145,
      () => void this.retry(),
      () => this.state.status === 'unknown',
      180,
      36
    );
    this.recoverButtonNode.active = false;

    // Status Message Line
    this.statusLabel = this.label(this.root, '', 200, -188, 13, 440);
  }

  public get isOpen(): boolean {
    return this.visible;
  }

  public async open(dungeonId: DungeonKind = 'first'): Promise<void> {
    this.visible = true;
    this.root.active = true;
    this.selectedDungeon = dungeonId;
    this.options.onVisibility?.(true);

    await this.fetchEntry(dungeonId);
  }

  public close(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.active = false;
    this.cancel();
    this.coordinator.close();
    this.state = this.coordinator.state;
    this.options.onVisibility?.(false);
  }

  public dispose(): void {
    if (sys.isBrowser && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.trackPointer, true);
      window.removeEventListener('pointerup', this.releaseOutside, true);
      window.removeEventListener('pointercancel', this.cancelPointer, true);
      window.removeEventListener('blur', this.cancel);
    }
    game.off(Game.EVENT_HIDE, this.onHide, this);
    this.root.destroy();
  }

  private async selectDungeon(dungeonId: DungeonKind): Promise<void> {
    if (this.selectedDungeon === dungeonId && this.state.status === 'choosing') return;
    this.selectedDungeon = dungeonId;
    await this.fetchEntry(dungeonId);
  }

  private selectDifficulty(difficultyId: DifficultyKind): void {
    this.selectedDifficulty = difficultyId;
    this.render();
  }

  private async fetchEntry(dungeonId: DungeonKind): Promise<void> {
    this.statusLabel.string = '正在查询地下城准入资格与疲劳状态...';
    this.statusLabel.color = new Color(200, 220, 255);
    try {
      await this.coordinator.open(dungeonId);
      this.state = this.coordinator.state;
    } catch {
      this.state = this.coordinator.state;
    }
    this.render();
  }

  private canStart(): boolean {
    if (!this.visible) return false;
    if (this.state.status !== 'choosing') return false;
    if (!this.state.selection) return false;

    const opt = this.state.selection.options.find(o => o.difficultyId === this.selectedDifficulty);
    return Boolean(opt?.canEnter);
  }

  private async confirmStart(): Promise<void> {
    if (!this.canStart()) return;
    const opId = `start-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.statusLabel.string = '正在开启房间并锁定疲劳快照...';
    this.statusLabel.color = new Color(255, 230, 100);
    this.render();

    try {
      await this.coordinator.confirm(this.selectedDifficulty, opId);
      this.state = this.coordinator.state;
    } catch {
      this.state = this.coordinator.state;
    }

    if (this.state.status === 'started' && this.state.started) {
      this.statusLabel.string = '挑战开启成功，正在进入地下城...';
      this.statusLabel.color = new Color(100, 255, 140);
      const started = this.state.started;
      const d = this.selectedDungeon;
      const diff = this.selectedDifficulty;
      this.close();
      this.options.onStart?.(d, diff, started);
    } else {
      this.render();
    }
  }

  private async retry(): Promise<void> {
    this.statusLabel.string = '正在重试未决挑战状态...';
    this.statusLabel.color = new Color(255, 210, 120);
    try {
      await this.coordinator.retry();
      this.state = this.coordinator.state;
    } catch {
      this.state = this.coordinator.state;
    }
    if (this.state.status === 'started' && this.state.started) {
      const started = this.state.started;
      const d = this.selectedDungeon;
      const diff = this.selectedDifficulty;
      this.close();
      this.options.onStart?.(d, diff, started);
    } else {
      this.render();
    }
  }

  public render(): void {
    const meta = DUNGEON_CATALOG[this.selectedDungeon];
    const stamina = this.options.getStamina ? this.options.getStamina() : 308;
    this.staminaPillLabel.string = `疲劳值: ${stamina}/308`;

    // 1. Update left dungeon cards selection state
    for (const [id, node] of this.dungeonCardNodes.entries()) {
      const isSelected = id === this.selectedDungeon;
      skinSprite(node, isSelected ? 'ui/slices/button_pressed' : 'ui/slices/button_normal', true);
      const titleLbl = this.dungeonCardTitleLabels.get(id);
      if (titleLbl) {
        titleLbl.color = isSelected ? new Color(255, 240, 120) : new Color(200, 210, 220);
      }
    }

    // 2. Update right details
    this.detailTitleLabel.string = `${meta.name}  [${meta.levelRange}]`;
    this.detailDescLabel.string = meta.desc;
    this.detailMonstersLabel.string = `主要魔物: ${meta.monsters}`;

    // 3. Update difficulty tabs
    for (const [id, btn] of this.diffTabNodes.entries()) {
      const isSelected = id === this.selectedDifficulty;
      skinSprite(btn, isSelected ? 'ui/slices/button_pressed' : 'ui/slices/button_normal', true);
      const lbl = btn.getComponentInChildren(Label);
      if (lbl) {
        lbl.color = isSelected ? new Color(255, 220, 100) : new Color(180, 190, 200);
      }
    }

    // 4. Update gate verification checks
    const opt = this.state.selection?.options.find(o => o.difficultyId === this.selectedDifficulty);
    const hasWeapon = this.options.hasWeapon ? this.options.hasWeapon() : true;
    const weaponBroken = this.options.isWeaponBroken ? this.options.isWeaponBroken() : false;

    // Stamina check display
    const staminaCost = meta.staminaCost;
    if (stamina < staminaCost || stamina < 1) {
      this.staminaReqLabel.string = `● 疲劳需求: ${staminaCost} 点 (当前剩余 ${stamina} 点，疲劳不足)`;
      this.staminaReqLabel.color = new Color(255, 100, 100);
    } else {
      this.staminaReqLabel.string = `● 疲劳需求: ${staminaCost} 点 (当前剩余 ${stamina} 点，充足)`;
      this.staminaReqLabel.color = new Color(130, 240, 150);
    }

    // Weapon check display
    if (!hasWeapon) {
      this.weaponReqLabel.string = '● 装备检查: 未装备武器 (必须装备主手武器)';
      this.weaponReqLabel.color = new Color(255, 100, 100);
    } else if (weaponBroken) {
      this.weaponReqLabel.string = '● 装备检查: 武器耐久为 0 (请前往林纳克斯处修理)';
      this.weaponReqLabel.color = new Color(255, 100, 100);
    } else {
      this.weaponReqLabel.string = `● 装备检查: 武器耐久正常 · 推荐物攻 ${meta.recommendedPower[this.selectedDifficulty]}+`;
      this.weaponReqLabel.color = new Color(130, 240, 150);
    }

    // Gate Result Verdict
    if (this.state.status === 'loading') {
      this.gateResultLabel.string = '● 准入审核: 正在校验地下城资格...';
      this.gateResultLabel.color = new Color(220, 220, 220);
    } else if (this.state.status === 'unknown') {
      this.gateResultLabel.string = '● 准入审核: 挑战创建处于未决状态，请点击重试';
      this.gateResultLabel.color = new Color(255, 200, 80);
    } else if (opt && !opt.canEnter) {
      const reasonText = this.explainReason(opt.reason);
      this.gateResultLabel.string = `● 准入审核: 拦截进入 [${reasonText}]`;
      this.gateResultLabel.color = new Color(255, 90, 90);
    } else if (opt && opt.canEnter) {
      this.gateResultLabel.string = '● 准入审核: 条件全部满足，随时可进入地下城';
      this.gateResultLabel.color = new Color(100, 255, 130);
    } else {
      this.gateResultLabel.string = '● 准入审核: 等待获取准入数据';
      this.gateResultLabel.color = new Color(180, 190, 200);
    }

    // 5. Update Action Buttons
    if (this.state.status === 'unknown') {
      this.startButtonNode.active = false;
      this.recoverButtonNode.active = true;
      skinSprite(this.recoverButtonNode, 'ui/slices/button_normal', true);
    } else {
      this.recoverButtonNode.active = false;
      this.startButtonNode.active = true;
      const canStart = this.canStart();
      skinSprite(this.startButtonNode, canStart ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      const startLbl = this.startButtonNode.getComponentInChildren(Label);
      if (startLbl) {
        startLbl.color = canStart ? new Color(255, 245, 200) : new Color(140, 140, 140);
      }
    }

    // 6. Update status bar message
    if (this.state.status === 'failed') {
      this.statusLabel.string = `操作失败: ${this.state.code ?? 'UNKNOWN_ERROR'}`;
      this.statusLabel.color = new Color(255, 90, 90);
    } else if (this.state.status === 'submitting') {
      this.statusLabel.string = '正在向服务器申请地下城挑战房间...';
      this.statusLabel.color = new Color(255, 230, 100);
    } else if (this.state.status === 'loading') {
      this.statusLabel.string = '正在同步准入信息...';
      this.statusLabel.color = new Color(200, 220, 255);
    } else if (this.state.status === 'unknown') {
      this.statusLabel.string = '网络或服务端未决响应，已持久化断线保护，点击上方恢复重试';
      this.statusLabel.color = new Color(255, 180, 90);
    } else {
      this.statusLabel.string = '提示: 挑战开启后将建立安全房间，中途放弃将消耗疲劳';
      this.statusLabel.color = new Color(160, 180, 200);
    }
  }

  private explainReason(code: string | null): string {
    if (!code) return '暂未满足进本条件';
    switch (code) {
      case 'LEVEL_REQUIRED': return '等级未达标';
      case 'DIFFICULTY_LOCKED': return '难度尚未解锁（需通关前置难度）';
      case 'WEAPON_REQUIRED': return '未装备武器';
      case 'WEAPON_BROKEN': return '武器已损坏（0耐久）';
      case 'STAMINA_NOT_ENOUGH': return '疲劳值不足';
      case 'ACTIVE_CHALLENGE_EXISTS': return '已有进行中的挑战';
      case 'SCENE_STILL_OPEN': return '场景尚未关闭结算';
      case 'CONFIG_NOT_READY': return '地下城配置未就绪';
      default: return code;
    }
  }

  public hitTest(
    x: number,
    y: number
  ): 'close' | 'dungeon_first' | 'dungeon_workshop' | 'dungeon_rift' | 'diff_normal' | 'diff_adventure' | 'diff_warrior' | 'start' | 'recover' | null {
    if (!this.visible) return null;

    // Close buttons (at x = 390 and -390, y = 226)
    if (Math.abs(y - 226) <= 20) {
      if (Math.abs(x - 390) <= 50) return 'close';
      if (Math.abs(x - (-390)) <= 50) return 'close';
    }

    // Dungeon card hitzones (x = -245, w = 330, h = 85)
    if (Math.abs(x - (-245)) <= 165) {
      if (Math.abs(y - 95) <= 42) return 'dungeon_first';
      if (Math.abs(y - (-5)) <= 42) return 'dungeon_workshop';
      if (Math.abs(y - (-105)) <= 42) return 'dungeon_rift';
    }

    // Difficulty tabs (y = -6, w = 110, h = 32)
    if (Math.abs(y - (-6)) <= 18) {
      if (Math.abs(x - 70) <= 55) return 'diff_normal';
      if (Math.abs(x - 200) <= 55) return 'diff_adventure';
      if (Math.abs(x - 330) <= 55) return 'diff_warrior';
    }

    // Action button hitzone (y = -145)
    if (Math.abs(y - (-145)) <= 22) {
      if (this.state.status === 'unknown') {
        if (Math.abs(x - 200) <= 90) return 'recover';
      } else {
        if (Math.abs(x - 200) <= 130) return 'start';
      }
    }

    return null;
  }

  private node(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    n.setPosition(x, y, 0);
    const tr = n.addComponent(UITransform);
    tr.setContentSize(w, h);
    parent.addChild(n);
    return n;
  }

  private label(parent: Node, text: string, x: number, y: number, size: number, w = 300, h?: number): Label {
    const n = new Node('Label');
    n.layer = parent.layer;
    n.setPosition(x, y, 0);
    const tr = n.addComponent(UITransform);
    tr.setContentSize(w, h ?? (size + 8));
    const lbl = n.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = size;
    lbl.lineHeight = size + 4;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    lbl.color = new Color(230, 235, 240);
    parent.addChild(n);
    return lbl;
  }

  private button(
    text: string,
    x: number,
    y: number,
    action: () => void,
    canEnable: () => boolean,
    width = 120,
    height = 36
  ): Node {
    const btn = this.node(this.root, `Btn_${text.slice(0, 8)}`, x, y, width, height);
    skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
    this.label(btn, text, 0, 0, 14, width);

    this.interactiveButton(btn, width, height, action, canEnable);
    this.controls.push({ name: text, node: btn, width, canEnable, action });
    return btn;
  }

  private interactiveButton(
    btn: Node,
    _width: number,
    _height: number,
    action: () => void,
    canEnable: () => boolean
  ): void {
    let pressed = false;
    const reset = () => {
      if (pressed) {
        pressed = false;
        skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      }
    };
    this.buttonResets.push(reset);

    const onDown = () => {
      if (Date.now() < this.suppressMouseUntil) return;
      if (!canEnable()) return;
      pressed = true;
      skinSprite(btn, 'ui/slices/button_pressed', true);
    };

    const onUp = () => {
      if (Date.now() < this.suppressMouseUntil) return;
      if (!pressed) return;
      pressed = false;
      skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      action();
    };

    btn.on(Node.EventType.TOUCH_START, onDown);
    btn.on(Node.EventType.TOUCH_END, onUp);
    btn.on(Node.EventType.TOUCH_CANCEL, reset);
    btn.on(Node.EventType.MOUSE_DOWN, onDown);
    btn.on(Node.EventType.MOUSE_UP, onUp);
  }
}
