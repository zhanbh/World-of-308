import { Node, Graphics, Color, UITransform, Label, Vec3, EventTouch, EventMouse, sys, game, Game } from 'cc';
import type { RepairCoordinator, RepairState } from '../net/RepairCoordinator.ts';

export interface RepairPanelOptions {
  contextId?: string;
  templateLabel?: (id: string) => string;
  onVisibility?: (visible: boolean) => void;
  onResult?: (result: NonNullable<RepairState['lastResult']>) => void;
}

interface ControlButton {
  name: string;
  node: Node;
  width: number;
  canEnable: () => boolean;
  action: () => void;
}

const SLOT_NAMES: Record<string, string> = {
  weapon: '主手武器',
  shoulder: '护肩',
  chest: '上衣',
  pants: '下装',
  belt: '腰带',
  boots: '鞋子',
  earring: '耳环',
};

function errorLabel(code: string): string {
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
    case 'CURRENCY_NOT_ENOUGH':
      return '金币不足以支付全部修理费用';
    case 'STALE_REPAIR_VIEW':
      return '装备或角色状态已变动，请重新报价';
    case 'INVALID_REPAIR_SET':
      return '非法修理目标集合';
    case 'REPAIR_VIEW_CHANGED':
      return '报价期间装备状态发生变化';
    case 'INVALID_REPAIR_QUOTE':
      return '修理报价校验失败';
    case 'IDENTITY_REQUIRED':
      return '请先登录角色';
    case 'CONTEXT_REQUIRED':
      return '修理上下文已失效，请重新打开';
    case 'SERVICE_UNAVAILABLE':
      return '修理服务暂时不可用';
    case 'RESULT_UNKNOWN':
      return '交易未决，请点击确认操作结果恢复';
    case 'REPAIR_NOT_READY':
      return '当前状态不可修理，请刷新后重试';
    default:
      return code;
  }
}

/**
 * Cocos presentation panel for Linus's equipment repair.
 * Connects with RepairCoordinator for single equipment repair and all-worn batch repair.
 * Strictly presents authoritative view/quote details from authenticated backend services.
 */
export class RepairPanel {
  private readonly root: Node;
  private readonly cardNode: Node;
  private readonly cardTitleLabel: Label;
  private readonly allWornRows: Array<{ slotLabel: Label; durLabel: Label; costLabel: Label }> = [];
  private readonly singleItemTitleLabel: Label;
  private readonly singleDurabilityLabel: Label;
  private readonly singleCostLabel: Label;
  private readonly summaryLabel: Label;
  private readonly resultBannerLabel: Label;
  private readonly statusLabel: Label;
  private readonly repairButtonNode: Node;
  private readonly refreshButtonNode: Node;
  private readonly recoverButtonNode: Node;
  private readonly allWornTabNode: Node;
  private readonly singleTabNode: Node;
  private readonly controls: ControlButton[] = [];

  private visible = false;
  private state: RepairState;
  private localError = '';
  private currentContextId: string | null = null;
  private currentMode: 'allWorn' | 'single' = 'allWorn';
  private selectedItemId: string | null = null;
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
  private isMouseTouch(e: EventTouch): boolean {
    return (e as any).simulate || (sys.isBrowser && this.browserPointer === 'mouse');
  }

  constructor(
    parent: Node,
    private readonly coordinator: RepairCoordinator,
    private readonly options: RepairPanelOptions = {}
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

    this.root = this.node(parent, 'RepairPanel', 0, 0, 960, 540);
    this.root.active = false;

    // Background mask & styling
    const bg = this.root.addComponent(Graphics);
    bg.fillColor = new Color(12, 19, 27, 250);
    bg.rect(-480, -270, 960, 540);
    bg.fill();

    // Panel Header
    this.label(this.root, '林纳克斯 · 装备修理', 0, 230, 24, 600);
    this.button('关闭', 410, 230, () => this.close(), () => true, 90);

    // Mode Toggle Tabs
    this.allWornTabNode = this.button(
      '全部穿戴 (一键全修)',
      -120,
      190,
      () => void this.switchMode('allWorn'),
      () => this.currentMode !== 'allWorn' && this.state.status !== 'submitting',
      190
    );
    this.singleTabNode = this.button(
      '单件修理',
      100,
      190,
      () => void this.switchMode('single'),
      () => this.currentMode !== 'single' && this.state.status !== 'submitting',
      140
    );

    // Center Stage Card
    this.cardNode = this.node(this.root, 'StageCard', 0, 20, 680, 270);
    const cardBg = this.cardNode.addComponent(Graphics);
    cardBg.fillColor = new Color(22, 32, 44, 230);
    cardBg.roundRect(-340, -135, 680, 270, 8);
    cardBg.fill();
    cardBg.strokeColor = new Color(68, 88, 108);
    cardBg.lineWidth = 2;
    cardBg.roundRect(-340, -135, 680, 270, 8);
    cardBg.stroke();

    this.cardTitleLabel = this.label(this.cardNode, '当前穿戴装备耐久度明细 (7 槽位)', 0, 108, 18, 640);
    this.cardTitleLabel.color = new Color(210, 225, 240);

    // 7 allWorn slot rows
    for (let i = 0; i < 7; i++) {
      const y = 78 - i * 26;
      const slotLabel = this.label(this.cardNode, '', -210, y, 14, 200, 22);
      slotLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

      const durLabel = this.label(this.cardNode, '', 0, y, 14, 180, 22);
      durLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

      const costLabel = this.label(this.cardNode, '', 200, y, 14, 180, 22);
      costLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

      this.allWornRows.push({ slotLabel, durLabel, costLabel });
    }

    // Single item labels (shared on cardNode, toggled by currentMode)
    this.singleItemTitleLabel = this.label(this.cardNode, '', 0, 60, 20, 600);
    this.singleDurabilityLabel = this.label(this.cardNode, '', 0, 15, 17, 600);
    this.singleCostLabel = this.label(this.cardNode, '', 0, -30, 17, 600);

    // Summary line at the bottom of the card
    this.summaryLabel = this.label(this.cardNode, '', 0, -112, 16, 640);
    this.summaryLabel.color = new Color(255, 215, 0);

    // Result notification banner
    this.resultBannerLabel = this.label(this.root, '', 0, -135, 17, 860, 32);

    // Status bar at bottom
    this.statusLabel = this.label(this.root, '', 0, -180, 15, 900, 32);

    // Bottom Action buttons
    this.repairButtonNode = this.button(
      '确认修理',
      0,
      -230,
      () => void this.repair(),
      () => this.canRepair(),
      180
    );

    this.refreshButtonNode = this.button(
      '刷新报价',
      -220,
      -230,
      () => void this.refresh(),
      () => this.canRefresh(),
      130
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

  get mode(): 'allWorn' | 'single' {
    return this.currentMode;
  }

  async open(contextId?: string, itemId?: string | null): Promise<void> {
    this.visible = true;
    this.root.active = true;
    this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    this.localError = '';
    if (contextId) this.currentContextId = contextId;
    if (this.options.onVisibility) this.options.onVisibility(true);

    if (itemId) {
      this.currentMode = 'single';
      this.selectedItemId = itemId;
    }

    const ctx = this.currentContextId;
    if (ctx) {
      try {
        if (this.currentMode === 'allWorn') {
          await this.coordinator.openAll(ctx);
        } else {
          await this.coordinator.open(ctx, this.selectedItemId);
        }
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

  async switchMode(mode: 'allWorn' | 'single', itemId?: string | null): Promise<void> {
    if (this.state.status === 'submitting') return;
    this.currentMode = mode;
    this.localError = '';
    if (itemId !== undefined) this.selectedItemId = itemId;

    const ctx = this.currentContextId;
    if (!ctx) {
      this.localError = 'CONTEXT_REQUIRED';
      this.update();
      return;
    }
    try {
      if (mode === 'allWorn') {
        await this.coordinator.openAll(ctx);
      } else {
        await this.coordinator.open(ctx, this.selectedItemId);
      }
    } catch (e) {
      this.localError = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
    }
    this.update();
  }

  async selectSingleItem(itemId: string | null): Promise<void> {
    await this.switchMode('single', itemId);
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

  async repair(): Promise<void> {
    if (!this.canRepair()) return;
    this.localError = '';
    try {
      const p = this.coordinator.repair();
      this.update();
      await p;
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
      const p = this.coordinator.recover();
      this.update();
      await p;
      if (this.coordinator.state.lastResult && this.options.onResult) {
        this.options.onResult(this.coordinator.state.lastResult);
      }
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

  canRepair(): boolean {
    const s = this.coordinator.state;
    return this.visible && s.status === 'ready' && !!s.quote;
  }

  canRefresh(): boolean {
    const s = this.coordinator.state;
    return (
      this.visible &&
      s.status !== 'closed' &&
      s.status !== 'submitting' &&
      s.status !== 'unknown'
    );
  }

  canRecover(): boolean {
    return this.visible && this.coordinator.state.status === 'unknown';
  }

  update(): void {
    this.state = this.coordinator.state;
    const s = this.state;
    const stamp = JSON.stringify({
      visible: this.visible,
      mode: this.currentMode,
      selectedItemId: this.selectedItemId,
      status: s.status,
      code: s.code,
      localError: this.localError,
      lastResult: s.lastResult,
      target: s.target,
      view: s.view,
      quote: s.quote,
    });
    if (stamp === this.renderedStamp) return;
    this.renderedStamp = stamp;

    // Status bar label
    if (this.localError) {
      this.statusLabel.string = `本地错误: ${errorLabel(this.localError)}`;
      this.statusLabel.color = new Color(255, 120, 120);
    } else if (s.status === 'loading') {
      this.statusLabel.string = '正在获取修理报价与最新装备数据...';
      this.statusLabel.color = new Color(210, 225, 240);
    } else if (s.status === 'submitting') {
      this.statusLabel.string = '正在提交修理请求，请稍候...';
      this.statusLabel.color = new Color(255, 220, 100);
    } else if (s.status === 'ready') {
      this.statusLabel.string = '修理报价已就绪，可确认执行修理';
      this.statusLabel.color = new Color(130, 230, 150);
    } else if (s.status === 'empty') {
      this.statusLabel.string = '当前无需要修理的装备';
      this.statusLabel.color = new Color(200, 205, 210);
    } else if (s.status === 'failed') {
      this.statusLabel.string = `修理失败: ${errorLabel(s.code ?? 'UNKNOWN_ERROR')}`;
      this.statusLabel.color = new Color(255, 100, 100);
    } else if (s.status === 'unknown') {
      this.statusLabel.string = '交易状态未决，请点击【确认操作结果】安全恢复，切勿重复支付';
      this.statusLabel.color = new Color(255, 180, 80);
    } else {
      this.statusLabel.string = '';
    }

    const isAllWorn = this.currentMode === 'allWorn';

    // Toggle card presentation based on mode
    if (isAllWorn) {
      this.cardTitleLabel.string = '当前穿戴装备耐久度明细 (7 槽位)';
      this.singleItemTitleLabel.string = '';
      this.singleDurabilityLabel.string = '';
      this.singleCostLabel.string = '';

      const viewItems = s.view && 'items' in s.view ? s.view.items : [];
      const quoteItems = s.quote?.repair?.items ?? [];
      const totalCost = s.quote?.costs?.[0]?.amount ?? '0';

      for (let i = 0; i < 7; i++) {
        const row = this.allWornRows[i];
        if (i < viewItems.length) {
          const item = viewItems[i];
          const q = quoteItems.find(qi => qi.itemId === item.itemId);
          const slotName = SLOT_NAMES[item.slotKind] ?? item.slotKind;
          const templateName = this.options.templateLabel ? this.options.templateLabel(item.templateRef) : item.templateRef;
          row.slotLabel.string = `[${slotName}] ${templateName}`;

          const cur = item.durability.current ?? 0;
          const max = item.durability.max ?? 1;
          row.durLabel.string = `耐久: ${cur} / ${max}`;
          if (cur === 0) {
            row.durLabel.color = new Color(255, 80, 80);
          } else if (cur <= max / 2) {
            row.durLabel.color = new Color(255, 200, 80);
          } else {
            row.durLabel.color = new Color(130, 230, 150);
          }

          if (q && q.missing > 0) {
            row.costLabel.string = `缺失 ${q.missing} 点 (需 ${q.gold} 金币)`;
            row.costLabel.color = new Color(255, 215, 0);
          } else {
            row.costLabel.string = '完好 (0 金币)';
            row.costLabel.color = new Color(170, 180, 190);
          }
        } else {
          row.slotLabel.string = '';
          row.durLabel.string = '';
          row.costLabel.string = '';
        }
      }

      if (viewItems.length === 0 && s.status === 'ready') {
        this.summaryLabel.string = '当前未穿戴任何可磨损装备';
      } else if (quoteItems.every(qi => qi.missing === 0) && s.status === 'ready') {
        this.summaryLabel.string = '所有穿戴装备完好无损，无需修理 (0 金币)';
        this.summaryLabel.color = new Color(130, 230, 150);
      } else if (s.status === 'ready') {
        const repairCount = quoteItems.filter(qi => qi.missing > 0).length;
        this.summaryLabel.string = `共 ${viewItems.length} 件穿戴装备，其中 ${repairCount} 件需修理 | 总费用: ${totalCost} 金币`;
        this.summaryLabel.color = new Color(255, 215, 0);
      } else {
        this.summaryLabel.string = '';
      }
    } else {
      // Single Target mode
      this.cardTitleLabel.string = '单件装备修理';
      for (const row of this.allWornRows) {
        row.slotLabel.string = '';
        row.durLabel.string = '';
        row.costLabel.string = '';
      }

      if (s.view && 'item' in s.view) {
        const item = s.view.item;
        const slotName = SLOT_NAMES[item.slotKind] ?? item.slotKind;
        const templateName = this.options.templateLabel ? this.options.templateLabel(item.templateRef) : item.templateRef;
        this.singleItemTitleLabel.string = `【${slotName}】${templateName} (装等 ${item.itemLevel} · 品质 ${item.quality})`;

        const cur = item.durability.current ?? 0;
        const max = item.durability.max ?? 1;
        this.singleDurabilityLabel.string = `当前耐久度: ${cur} / ${max}`;
        if (cur === 0) {
          this.singleDurabilityLabel.color = new Color(255, 80, 80);
        } else if (cur <= max / 2) {
          this.singleDurabilityLabel.color = new Color(255, 200, 80);
        } else {
          this.singleDurabilityLabel.color = new Color(130, 230, 150);
        }

        const q = s.quote?.repair?.items?.[0];
        if (q && q.missing > 0) {
          this.singleCostLabel.string = `缺失耐久: ${q.missing} 点 | 修理费用: ${q.gold} 金币 (单价 ${q.unitGold} 金币/点)`;
          this.singleCostLabel.color = new Color(255, 215, 0);
          this.summaryLabel.string = `修理扣除: ${q.gold} 金币`;
        } else if (q) {
          this.singleCostLabel.string = '该装备耐久度完好，无需修理 (0 金币)';
          this.singleCostLabel.color = new Color(130, 230, 150);
          this.summaryLabel.string = '无需修理';
        } else {
          this.singleCostLabel.string = '';
          this.summaryLabel.string = '';
        }
      } else {
        this.singleItemTitleLabel.string = s.status === 'empty' ? '请选择需要修理的穿戴或背包装备' : '';
        this.singleDurabilityLabel.string = '';
        this.singleCostLabel.string = '';
        this.summaryLabel.string = '';
      }
    }

    // Result Banner
    if (s.lastResult) {
      const r = s.lastResult;
      this.resultBannerLabel.string = `【修理成功】扣除 ${r.chargedGold} 金币，已成功修满 ${r.repairedItemIds.length} 件装备！`;
      this.resultBannerLabel.color = new Color(100, 255, 120);
    } else {
      this.resultBannerLabel.string = '';
    }

    // Recover button active only when status === 'unknown'
    this.recoverButtonNode.active = s.status === 'unknown';

    // Update button states & colors
    for (const ctrl of this.controls) {
      const enabled = ctrl.canEnable();
      const g = ctrl.node.getComponent(Graphics)!;
      g.clear();
      g.fillColor = enabled ? new Color(62, 78, 89) : new Color(31, 39, 46);
      g.roundRect(-ctrl.width / 2, -16, ctrl.width, 32, 4);
      g.fill();
      const label = ctrl.node.getComponentInChildren(Label);
      if (label) {
        label.color = enabled ? new Color(236, 229, 208) : new Color(119, 126, 130);
      }
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
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(62, 78, 89);
    g.roundRect(-width / 2, -16, width, 32, 4);
    g.fill();
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
    });

    n.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
      if (this.isMouseTouch(e)) return;
      touchId = null;
      (e as any).propagationStopped = true;
    });

    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (this.isMouseTouch(e) || e.getID() === null) return;
      const pressed = touchId === e.getID();
      touchId = null;
      touchedUntil = Date.now() + 500;
      (e as any).propagationStopped = true;
      this.cancel();
      if (pressed && inside(e) && this.visible && canEnable()) action();
    });

    n.on(Node.EventType.MOUSE_DOWN, (e: EventMouse) => {
      this.cancel();
      mousePressed = (e as any).getButton() === 0;
      (e as any).propagationStopped = true;
    });

    n.on(Node.EventType.MOUSE_UP, (e: EventMouse) => {
      const pressed = mousePressed;
      mousePressed = false;
      (e as any).propagationStopped = true;
      this.cancel();
      if (pressed && inside(e) && Date.now() >= touchedUntil && (e as any).getButton() === 0 && this.visible && canEnable()) {
        action();
      }
    });

    return n;
  }
}
