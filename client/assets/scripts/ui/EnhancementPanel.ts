import { Node, Graphics, Color, UITransform, Label, Vec3, EventTouch, EventMouse, sys, game, Game } from 'cc';
import type { EnhancementCoordinator, EnhancementState } from '../net/EnhancementCoordinator.ts';
import { skinSprite } from './UISkin';

export interface EnhancementPanelOptions {
  contextId?: string;
  templateLabel?: (id: string) => string;
  onVisibility?: (visible: boolean) => void;
  onResult?: (result: NonNullable<EnhancementState['lastResult']>) => void;
}

interface ControlButton {
  name: string;
  node: Node;
  width: number;
  canEnable: () => boolean;
  action: () => void;
}

/**
 * Cocos presentation panel for Mary's equipment enhancement.
 * Strictly presents authoritative view/quote details from EnhancementCoordinator.
 * Hides all internal probabilities, random samples, and memory weights.
 */
export class EnhancementPanel {
  private readonly root: Node;
  private readonly statusLabel: Label;
  private readonly itemTitleLabel: Label;
  private readonly levelChangeLabel: Label;
  private readonly apChangeLabel: Label;
  private readonly riskLabel: Label;
  private readonly costGoldLabel: Label;
  private readonly costMaterialLabel: Label;
  private readonly mementoButtonLabel: Label;
  private readonly mementoButtonNode: Node;
  private readonly resultBannerLabel: Label;
  private readonly enhanceButtonNode: Node;
  private readonly refreshButtonNode: Node;
  private readonly recoverButtonNode: Node;
  private readonly controls: ControlButton[] = [];

  private visible = false;
  private state: EnhancementState;
  private localError = '';
  private currentContextId: string | null = null;
  private mementoEnabled = false;
  private renderedStamp = '';
  private buttonResets: Array<() => void> = [];
  private inputEpoch = 0;
  private browserPointer: 'mouse' | 'touch' = 'touch';
  private suppressMouseUntil = 0;

  private trackPointer = (e: PointerEvent): void => {
    this.browserPointer = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  };
  private cancelPointer = (e: PointerEvent): void => {
    if (e.isPrimary) this.cancel();
  };
  private releaseOutside = (e: PointerEvent): void => {
    if (e.isPrimary) {
      const epoch = this.inputEpoch;
      setTimeout(() => {
        if (epoch === this.inputEpoch) this.cancel();
      }, 0);
    }
  };
  private releaseOnReturn = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.buttons === 0) this.cancel();
  };
  private isMouseTouch(_e: EventTouch): boolean {
    return false;
  }

  constructor(
    parent: Node,
    private readonly coordinator: EnhancementCoordinator,
    private readonly options: EnhancementPanelOptions = {}
  ) {
    this.state = coordinator.state;
    this.currentContextId = options.contextId ?? null;

    if (sys.isBrowser && typeof window !== 'undefined') {
      this.browserPointer = navigator.maxTouchPoints === 0 ? 'mouse' : 'touch';
      window.addEventListener('pointerdown', this.trackPointer, true);
      window.addEventListener('pointerup', this.releaseOutside, true);
      window.addEventListener('pointercancel', this.cancelPointer, true);
      window.addEventListener('pointermove', this.releaseOnReturn, true);
      window.addEventListener('blur', this.cancel);
    }
    game.on(Game.EVENT_HIDE, this.onHide, this);

    this.root = this.node(parent, 'EnhancementPanel', 0, 0, 960, 540);
    this.root.active = false;

    // Background mask & styling
    const bg = this.root.addComponent(Graphics);
    bg.fillColor = new Color(16, 24, 30, 255);
    bg.rect(-480, -270, 960, 540);
    bg.fill();

    skinSprite(this.node(this.root, 'EnhancementWindowFrame', 0, 0, 912, 500), 'ui/slices/panel_window_frame', true);

    // Panel Header
    this.label(this.root, '玛丽 · 装备强化', 0, 226, 24, 600);
    this.button('✕ 关闭', 280, 226, () => this.close(), () => true, 90);
    this.button('✕ 关闭', -400, 226, () => this.close(), () => true, 90);

    // Center Stage Card
    const cardNode = this.node(this.root, 'StageCard', 0, 45, 620, 280);
    skinSprite(cardNode, 'ui/slices/panel_well_inner', true);

    this.itemTitleLabel = this.label(cardNode, '请选择需要强化的武器或耳环', 0, 105, 20, 580);
    this.levelChangeLabel = this.label(cardNode, '', 0, 65, 22, 580);
    this.levelChangeLabel.color = new Color(255, 215, 0);

    this.apChangeLabel = this.label(cardNode, '', 0, 25, 18, 580);
    this.riskLabel = this.label(cardNode, '', 0, -15, 16, 580);
    this.riskLabel.color = new Color(245, 150, 150);

    this.costGoldLabel = this.label(cardNode, '', -140, -60, 16, 260);
    this.costMaterialLabel = this.label(cardNode, '', 140, -60, 16, 260);

    // Memento toggle button on the card
    this.mementoButtonNode = this.button(
      '[ ] 使用纪念品',
      0,
      -105,
      () => void this.toggleMemento(),
      () => this.canToggleMemento(),
      220,
      cardNode
    );
    this.mementoButtonLabel = this.mementoButtonNode.getComponentInChildren(Label)!;

    // Result notification banner
    this.resultBannerLabel = this.label(this.root, '', 0, -130, 18, 800, 36);

    // Status bar at bottom
    this.statusLabel = this.label(this.root, '', 0, -180, 15, 900, 32);

    // Action buttons at the bottom
    this.enhanceButtonNode = this.button(
      '开始强化',
      0,
      -230,
      () => void this.enhance(),
      () => this.canEnhance(),
      180
    );

    this.refreshButtonNode = this.button(
      '刷新',
      -220,
      -230,
      () => void this.refresh(),
      () => this.canRefresh(),
      120
    );

    this.recoverButtonNode = this.button(
      '确认操作结果',
      220,
      -230,
      () => void this.recover(),
      () => this.canRecover(),
      160
    );

    this.root.on(Node.EventType.TOUCH_START, this.touchStart, this);
    this.root.on(Node.EventType.TOUCH_END, this.touchEnd, this);
    this.root.on(Node.EventType.MOUSE_DOWN, this.mouseStart, this);
    this.root.on(Node.EventType.MOUSE_UP, this.mouseEnd, this);
  }

  get isOpen(): boolean {
    return this.visible;
  }

  async open(contextId?: string, itemId?: string | null): Promise<void> {
    this.visible = true;
    this.root.active = true;
    this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    this.localError = '';
    if (contextId) this.currentContextId = contextId;
    if (this.options.onVisibility) this.options.onVisibility(true);

    const ctx = this.currentContextId;
    if (ctx) {
      try {
        await this.coordinator.open(ctx, itemId ?? null);
      } catch (e) {
        this.localError = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
      }
    }
    this.update();
  }

  close(): void {
    this.cancel();
    this.visible = false;
    this.root.active = false;
    this.coordinator.close();
    if (this.options.onVisibility) this.options.onVisibility(false);
  }

  dispose(): void {
    this.close();
    game.off(Game.EVENT_HIDE, this.onHide, this);
    if (sys.isBrowser && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.trackPointer, true);
      window.removeEventListener('pointerup', this.releaseOutside, true);
      window.removeEventListener('pointercancel', this.cancelPointer, true);
      window.removeEventListener('pointermove', this.releaseOnReturn, true);
      window.removeEventListener('blur', this.cancel);
    }
    this.root.destroy();
  }

  async selectItem(itemId: string | null): Promise<void> {
    if (!this.visible || this.state.status === 'submitting') return;
    this.localError = '';
    const ctx = this.currentContextId;
    if (!ctx) {
      this.localError = 'CONTEXT_REQUIRED';
      this.update();
      return;
    }
    try {
      await this.coordinator.open(ctx, itemId);
    } catch (e) {
      this.localError = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
    }
    this.update();
  }

  async toggleMemento(): Promise<void> {
    if (!this.canToggleMemento()) return;
    this.mementoEnabled = !this.mementoEnabled;
    try {
      await this.coordinator.setMemento(this.mementoEnabled);
    } catch (e) {
      this.localError = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
    }
    this.update();
  }

  async enhance(): Promise<void> {
    if (!this.canEnhance()) return;
    this.localError = '';
    try {
      await this.coordinator.enhance(this.mementoEnabled);
      if (this.coordinator.state.lastResult && this.options.onResult) {
        this.options.onResult(this.coordinator.state.lastResult);
      }
    } catch (e) {
      this.localError = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
    }
    this.update();
  }

  async recover(): Promise<void> {
    if (!this.canRecover()) return;
    this.localError = '';
    try {
      await this.coordinator.recover();
      if (this.coordinator.state.lastResult && this.options.onResult) {
        this.options.onResult(this.coordinator.state.lastResult);
      }
    } catch (e) {
      this.localError = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
    }
    this.update();
  }

  async refresh(): Promise<void> {
    if (!this.canRefresh()) return;
    this.localError = '';
    try {
      await this.coordinator.refresh();
    } catch (e) {
      this.localError = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
    }
    this.update();
  }

  clickButton(name: string): void {
    const ctrl = this.controls.find(c => c.name === name);
    if (ctrl && ctrl.canEnable() && this.visible) {
      ctrl.action();
    }
  }

  update(): void {
    if (!this.visible) return;
    this.state = this.coordinator.state;
    const stamp = JSON.stringify([this.state, this.localError, this.mementoEnabled]);
    if (stamp !== this.renderedStamp) {
      this.renderedStamp = stamp;
      this.render();
    }
  }

  private canEnhance(): boolean {
    return this.state.status === 'ready' && !!this.state.quote;
  }

  private canRefresh(): boolean {
    return (
      this.state.status === 'ready' ||
      this.state.status === 'empty' ||
      this.state.status === 'failed'
    );
  }

  private canRecover(): boolean {
    return this.state.status === 'unknown';
  }

  private canToggleMemento(): boolean {
    if (this.state.status !== 'ready' || !this.state.view) return false;
    const targetLevel = this.state.view.item.enhancementLevel + 1;
    return targetLevel >= 11;
  }

  private render(): void {
    const s = this.state;
    const v = s.view;
    const q = s.quote;

    // Status label mapping
    const statusCaptions: Record<EnhancementState['status'], string> = {
      closed: '强化已关闭',
      loading: '正在获取强化报价…',
      empty: s.code === 'MAX_GRADE_REACHED' ? '装备已达强化等级上限 (+20)' : '请选择需要强化的武器或耳环',
      ready: '强化准备就绪',
      submitting: '正在强化中，请稍候…',
      unknown: '强化结果确认中，请点击确认操作结果',
      failed: this.localError || (s.code ? `强化失败: ${s.code}` : '操作失败，请刷新重试'),
    };
    this.statusLabel.string = this.localError || statusCaptions[s.status];

    // Item and Target Info
    if (v) {
      const item = v.item;
      const targetLevel = item.enhancementLevel + 1;
      const ref = (item as any).templateRef ?? (item as any).templateId ?? item.itemId;
      const itemName = this.options.templateLabel ? this.options.templateLabel(ref) : ref;
      const slotText = item.slotKind === 'weapon' ? '武器' : '耳环';
      this.itemTitleLabel.string = `${itemName} [${slotText} · Lv${item.itemLevel}]`;
      this.levelChangeLabel.string = `强化等级: +${item.enhancementLevel} → +${targetLevel}`;

      if (q) {
        const apChange = q.displayChanges.find(c => c.kind === 'attackPower');
        if (apChange) {
          const diff = Number(apChange.after) - Number(apChange.before);
          this.apChangeLabel.string = `攻击力: ${apChange.before} → ${apChange.after} (+${diff})`;
        } else {
          const curAp = item.enhancementBonus?.attackPower ?? (item as any).attackPower ?? '基础';
          this.apChangeLabel.string = `当前攻击力: ${curAp}`;
        }

        // Failure consequence risk warning
        if (q.failureConsequences.includes('preserve')) {
          this.riskLabel.string = '失败后果: 保持当前等级不变 (保级)';
          this.riskLabel.color = new Color(130, 220, 130);
        } else if (q.failureConsequences.includes('downgrade')) {
          this.riskLabel.string = '失败后果: 强化等级降至 +10 (降级)';
          this.riskLabel.color = new Color(255, 180, 100);
        } else if (q.failureConsequences.includes('destroy')) {
          this.riskLabel.string = '失败后果: 装备永久损毁，返还纪念品 (损毁)';
          this.riskLabel.color = new Color(255, 100, 100);
        } else {
          this.riskLabel.string = '';
        }

        // Costs
        const goldCost = q.costs.find(c => c.currency === 'gold')?.amount ?? '0';
        this.costGoldLabel.string = `金币费用: ${goldCost}`;

        const matLines = q.materialCosts.map(m => {
          const mRef = (m as any).templateRef ?? (m as any).templateId;
          const name = this.options.templateLabel ? this.options.templateLabel(mRef) : mRef;
          return `${name} ×${m.quantity}`;
        });
        this.costMaterialLabel.string = matLines.length > 0 ? `材料: ${matLines.join('，')}` : '材料: 无';
      } else {
        const curAp = item.enhancementBonus?.attackPower ?? (item as any).attackPower ?? '基础';
        this.apChangeLabel.string = `当前攻击力: ${curAp}`;
        this.riskLabel.string = '';
        this.costGoldLabel.string = '';
        this.costMaterialLabel.string = '';
      }
    } else {
      this.itemTitleLabel.string = s.code === 'MAX_GRADE_REACHED' ? '已达最高强化等级 (+20)' : '请选择需要强化的武器或耳环';
      this.levelChangeLabel.string = '';
      this.apChangeLabel.string = '';
      this.riskLabel.string = '';
      this.costGoldLabel.string = '';
      this.costMaterialLabel.string = '';
    }

    // Memento Button
    const targetLvl = v ? v.item.enhancementLevel + 1 : 0;
    if (targetLvl >= 11) {
      this.mementoButtonNode.active = true;
      this.mementoButtonLabel.string = this.mementoEnabled ? '[√] 使用纪念品 (消耗加成)' : '[ ] 使用纪念品 (不使用)';
    } else {
      this.mementoButtonNode.active = false;
    }

    // Result Banner
    if (s.lastResult) {
      const r = s.lastResult;
      if (r.result === 'success') {
        this.resultBannerLabel.string = `【强化成功】装备成功强化至 +${r.targetLevel}！`;
        this.resultBannerLabel.color = new Color(100, 255, 120);
      } else if (r.result === 'failed') {
        const fallBack = r.targetLevel <= 10 ? `保持 +${r.targetLevel - 1}（已保级）` : '已降至 +10';
        this.resultBannerLabel.string = `【强化失败】装备${fallBack}`;
        this.resultBannerLabel.color = new Color(255, 200, 100);
      } else if (r.result === 'destroyed') {
        this.resultBannerLabel.string = '【装备损毁】强化失败装备已永久损毁！纪念品已返还';
        this.resultBannerLabel.color = new Color(255, 80, 80);
      }
    } else {
      this.resultBannerLabel.string = '';
    }

    // Recovery button only shown when status === 'unknown'
    this.recoverButtonNode.active = s.status === 'unknown';

    // Update button states & colors
    for (const ctrl of this.controls) {
      const enabled = ctrl.canEnable();
      skinSprite(ctrl.node, 'ui/slices/button_' + (enabled ? 'normal' : 'disabled'), true);
      const label = ctrl.node.getComponentInChildren(Label);
      if (label) {
        label.color = enabled ? new Color(226, 235, 239) : new Color(89, 110, 124);
      }
    }

    if (this.mementoEnabled) {
      skinSprite(this.mementoButtonNode, 'ui/slices/button_pressed', true);
      const mementoLabel = this.mementoButtonNode.getComponentInChildren(Label);
      if (mementoLabel) mementoLabel.color = new Color(255, 255, 255);
    }
  }

  private point(event: EventTouch | EventMouse): { x: number; y: number } {
    const p = (event as any).getUILocation();
    const local = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    return { x: local.x, y: local.y };
  }

  private onHide = (): void => {
    this.cancel();
  };

  private cancel = (): void => {
    ++this.inputEpoch;
    for (const reset of this.buttonResets) reset();
  };

  private touchStart = (e: EventTouch): void => {
    if (this.isMouseTouch(e) || e.getID() === null) return;
    this.suppressMouseUntil = Date.now() + 500;
    (e as any).propagationStopped = true;
  };

  private touchEnd = (e: EventTouch): void => {
    if (this.isMouseTouch(e) || e.getID() === null) return;
    (e as any).propagationStopped = true;
  };

  private mouseStart = (e: EventMouse): void => {
    if (Date.now() >= this.suppressMouseUntil && (e as any).getButton() === 0) {
      (e as any).propagationStopped = true;
    }
  };

  private mouseEnd = (e: EventMouse): void => {
    if (Date.now() >= this.suppressMouseUntil && (e as any).getButton() === 0) {
      (e as any).propagationStopped = true;
    }
  };

  private node(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    parent.addChild(n);
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(width, height);
    return n;
  }

  private label(
    parent: Node,
    value: string,
    x: number,
    y: number,
    size: number,
    width: number,
    height = 32
  ): Label {
    const n = this.node(parent, 'Text', x, y, width, height);
    const label = n.addComponent(Label);
    label.string = value;
    label.fontSize = size;
    label.lineHeight = size + 4;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.color = new Color(236, 229, 208);
    return label;
  }

  private button(
    value: string,
    x: number,
    y: number,
    action: () => void,
    canEnable: () => boolean,
    width = 126,
    parent: Node = this.root
  ): Node {
    const n = this.node(parent, value, x, y, width, 32);
    skinSprite(n, 'ui/slices/button_normal', true);
    this.label(n, value, 0, 0, 15, width - 4);

    this.controls.push({ name: value, node: n, width, canEnable, action });

    let touchedUntil = 0;
    let touchId: number | null = null;
    let mousePressed = false;

    this.buttonResets.push(() => {
      touchId = null;
      mousePressed = false;
    });

    const inside = (event: EventTouch | EventMouse): boolean => {
      const p = this.point(event);
      return Math.abs(p.x - x) <= width / 2 && Math.abs(p.y - y) <= 16;
    };

    n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      if (this.isMouseTouch(e) || e.getID() === null) return;
      this.cancel();
      touchId = e.getID();
      (e as any).propagationStopped = true;
      if (canEnable()) skinSprite(n, 'ui/slices/button_pressed', true);
    });

    n.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
      if (this.isMouseTouch(e)) return;
      touchId = null;
      (e as any).propagationStopped = true;
      skinSprite(n, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
    });

    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (this.isMouseTouch(e) || e.getID() === null) return;
      const pressed = touchId === e.getID();
      touchId = null;
      touchedUntil = Date.now() + 500;
      (e as any).propagationStopped = true;
      this.cancel();
      skinSprite(n, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      if (pressed && inside(e) && this.visible && canEnable()) action();
    });

    n.on(Node.EventType.MOUSE_DOWN, (e: EventMouse) => {
      this.cancel();
      mousePressed = (e as any).getButton() === 0;
      (e as any).propagationStopped = true;
      if (mousePressed && canEnable()) skinSprite(n, 'ui/slices/button_pressed', true);
    });

    n.on(Node.EventType.MOUSE_UP, (e: EventMouse) => {
      const pressed = mousePressed;
      mousePressed = false;
      (e as any).propagationStopped = true;
      this.cancel();
      skinSprite(n, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      if (pressed && inside(e) && Date.now() >= touchedUntil && (e as any).getButton() === 0 && this.visible && canEnable()) {
        action();
      }
    });

    return n;
  }
}
