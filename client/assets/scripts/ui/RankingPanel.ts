import {
  Node,
  Graphics,
  Color,
  UITransform,
  Label,
  Vec3,
  EventTouch,
  EventMouse,
  sys,
  game,
  Game,
} from 'cc';
import type {
  RankingCoordinator,
  RankingCoordinatorState,
  RankingScope,
  RankingIdentity,
  RankingItemView,
} from '../net/RankingCoordinator.ts';
import { skinSprite } from './UISkin';

export interface RankingPanelOptions {
  onVisibility?: (visible: boolean) => void;
  pageSize?: number;
}

interface ControlButton {
  name: string;
  node: Node;
  width: number;
  canEnable: () => boolean;
  action: () => void;
}

interface RowView {
  node: Node;
  rankLabel: Label;
  nameLabel: Label;
  classLabel: Label;
  levelLabel: Label;
  scoreLabel: Label;
}

/**
 * Cocos presentation panel for Equipment Score Leaderboards.
 * Strictly presents authoritative view details from RankingCoordinator.
 * Supports scope switching (all/warrior/hunter), cursor-driven pagination,
 * own rank pinning/floating banner, cache freshness display, and error retry.
 */
export class RankingPanel {
  private readonly root: Node;
  private readonly cardNode: Node;
  private readonly titleLabel: Label;
  private readonly closeButtonNode: Node;
  private readonly allTabNode: Node;
  private readonly warriorTabNode: Node;
  private readonly hunterTabNode: Node;
  private readonly ownRankBannerNode: Node;
  private readonly ownRankLabel: Label;
  private readonly ownScoreLabel: Label;
  private readonly tableHeaderNode: Node;
  private readonly rows: RowView[] = [];
  private readonly loadMoreButtonNode: Node;
  private readonly retryButtonNode: Node;
  private readonly freshnessLabel: Label;
  private readonly statusLabel: Label;
  private readonly controls: ControlButton[] = [];

  private visible = false;
  private state: RankingCoordinatorState;
  private currentIdentity: RankingIdentity | null = null;
  private renderedStamp = '';
  private buttonResets: Array<() => void> = [];
  private inputEpoch = 0;
  private browserPointer: 'mouse' | 'touch' = 'touch';
  private suppressMouseUntil = 0;
  private unsubscribeCoordinator?: () => void;

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
    private readonly coordinator: RankingCoordinator,
    private readonly options: RankingPanelOptions = {},
  ) {
    this.state = coordinator.state;

    if (sys.isBrowser && typeof window !== 'undefined') {
      this.browserPointer = navigator.maxTouchPoints === 0 ? 'mouse' : 'touch';
      window.addEventListener('pointerdown', this.trackPointer, true);
      window.addEventListener('pointerup', this.releaseOutside, true);
      window.addEventListener('pointercancel', this.cancelPointer, true);
      window.addEventListener('pointermove', this.releaseOnReturn, true);
      window.addEventListener('blur', this.cancel);
    }
    game.on(Game.EVENT_HIDE, this.onHide, this);

    this.root = this.node(parent, 'RankingPanel', 0, 0, 960, 540);
    this.root.active = false;

    // Background mask & styling
    const bg = this.root.addComponent(Graphics);
    bg.fillColor = new Color(16, 24, 30, 255);
    bg.rect(-480, -270, 960, 540);
    bg.fill();

    skinSprite(this.node(this.root, 'RankingWindowFrame', 0, 0, 912, 500), 'ui/slices/panel_window_frame', true);

    // Panel Header
    this.titleLabel = this.label(this.root, '装备评分排行榜', 0, 226, 24, 600);
    this.titleLabel.color = new Color(245, 240, 220);

    this.closeButtonNode = this.button('✕ 关闭', 280, 226, () => this.close(), () => true, 80);
    this.button('✕ 关闭', -400, 226, () => this.close(), () => true, 80);

    // Scope Tabs
    this.allTabNode = this.button(
      '全服总榜',
      -160,
      185,
      () => void this.switchScope('all'),
      () => this.state.scope !== 'all' && this.state.status !== 'loading',
      120,
    );
    this.warriorTabNode = this.button(
      '战士榜',
      0,
      185,
      () => void this.switchScope('warrior'),
      () => this.state.scope !== 'warrior' && this.state.status !== 'loading',
      120,
    );
    this.hunterTabNode = this.button(
      '猎人榜',
      160,
      185,
      () => void this.switchScope('hunter'),
      () => this.state.scope !== 'hunter' && this.state.status !== 'loading',
      120,
    );

    // Own Rank Banner (Pinned at top of card)
    this.ownRankBannerNode = this.node(this.root, 'OwnRankBanner', 0, 138, 760, 42);
    skinSprite(this.ownRankBannerNode, 'ui/slices/panel_well_inner', true);

    this.ownRankLabel = this.label(this.ownRankBannerNode, '我的排名: 计算中...', -120, 0, 15, 420);
    this.ownRankLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.ownRankLabel.color = new Color(255, 215, 0);

    this.ownScoreLabel = this.label(this.ownRankBannerNode, '', 220, 0, 15, 260);
    this.ownScoreLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
    this.ownScoreLabel.color = new Color(220, 235, 250);

    // Center Stage Card
    this.cardNode = this.node(this.root, 'LeaderboardCard', 0, -22, 760, 246);
    skinSprite(this.cardNode, 'ui/slices/panel_well_inner', true);

    // Table Header
    this.tableHeaderNode = this.node(this.cardNode, 'TableHeader', 0, 102, 740, 26);
    const thRank = this.label(this.tableHeaderNode, '名次', -280, 0, 14, 80);
    const thName = this.label(this.tableHeaderNode, '角色名称', -120, 0, 14, 180);
    const thClass = this.label(this.tableHeaderNode, '职业', 40, 0, 14, 80);
    const thLevel = this.label(this.tableHeaderNode, '等级', 140, 0, 14, 80);
    const thScore = this.label(this.tableHeaderNode, '装备评分', 260, 0, 14, 120);

    thRank.color = new Color(160, 180, 200);
    thName.color = new Color(160, 180, 200);
    thClass.color = new Color(160, 180, 200);
    thLevel.color = new Color(160, 180, 200);
    thScore.color = new Color(160, 180, 200);

    // 7 visible rows
    for (let i = 0; i < 7; i++) {
      const y = 68 - i * 28;
      const rowNode = this.node(this.cardNode, `Row_${i}`, 0, y, 740, 26);

      const rankLabel = this.label(rowNode, '', -280, 0, 14, 80);
      const nameLabel = this.label(rowNode, '', -120, 0, 14, 180);
      nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

      const classLabel = this.label(rowNode, '', 40, 0, 14, 80);
      const levelLabel = this.label(rowNode, '', 140, 0, 14, 80);
      const scoreLabel = this.label(rowNode, '', 260, 0, 14, 120);
      scoreLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

      this.rows.push({
        node: rowNode,
        rankLabel,
        nameLabel,
        classLabel,
        levelLabel,
        scoreLabel,
      });
    }

    // Bottom Controls & Status
    this.freshnessLabel = this.label(this.root, '', -220, -170, 13, 300);
    this.freshnessLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

    this.statusLabel = this.label(this.root, '', 0, -210, 14, 800);

    this.loadMoreButtonNode = this.button(
      '加载更多',
      0,
      -170,
      () => void this.loadMore(),
      () => this.canLoadMore(),
      130,
    );

    this.retryButtonNode = this.button(
      '点击重试',
      200,
      -170,
      () => void this.retry(),
      () => this.canRetry(),
      110,
    );

    this.root.on(Node.EventType.TOUCH_START, this.touchStart, this);
    this.root.on(Node.EventType.TOUCH_END, this.touchEnd, this);
    this.root.on(Node.EventType.MOUSE_DOWN, this.mouseStart, this);
    this.root.on(Node.EventType.MOUSE_UP, this.mouseEnd, this);

    // Subscribe to coordinator updates
    this.unsubscribeCoordinator = this.coordinator.subscribe(s => {
      this.state = s;
      if (this.visible) {
        this.update();
      }
    });
  }

  get isOpen(): boolean {
    return this.visible;
  }

  get currentScope(): RankingScope {
    return this.state.scope;
  }

  get currentState(): RankingCoordinatorState {
    return this.state;
  }

  async open(identity: RankingIdentity, scope: RankingScope = 'all'): Promise<void> {
    this.visible = true;
    this.root.active = true;
    this.currentIdentity = { ...identity };
    if (this.options.onVisibility) this.options.onVisibility(true);

    try {
      await this.coordinator.open(identity, scope);
    } catch {
      // coordinator internal state transitions to 'failed'
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
    if (this.unsubscribeCoordinator) {
      this.unsubscribeCoordinator();
      this.unsubscribeCoordinator = undefined;
    }
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

  async switchScope(scope: RankingScope): Promise<void> {
    if (this.state.status === 'loading') return;
    try {
      await this.coordinator.switchScope(scope);
    } catch {
      // non-fatal
    }
    this.update();
  }

  async loadMore(): Promise<void> {
    if (!this.canLoadMore()) return;
    try {
      await this.coordinator.loadMore();
    } catch {
      // non-fatal
    }
    this.update();
  }

  async retry(): Promise<void> {
    if (!this.canRetry()) return;
    try {
      await this.coordinator.retry();
    } catch {
      // non-fatal
    }
    this.update();
  }

  private canLoadMore(): boolean {
    return this.state.status === 'ready' && this.state.hasMore && Boolean(this.state.nextCursor);
  }

  private canRetry(): boolean {
    return this.state.status === 'failed';
  }

  private formatClass(classId: 'warrior' | 'hunter'): string {
    return classId === 'warrior' ? '战士' : '猎人';
  }

  private update(): void {
    if (!this.visible) return;

    const s = this.state;
    const stamp = JSON.stringify({
      status: s.status,
      scope: s.scope,
      entriesCount: s.entries.length,
      ownRank: s.ownRank,
      stale: s.stale,
      hasMore: s.hasMore,
      errorCode: s.errorCode,
    });
    if (stamp === this.renderedStamp) return;
    this.renderedStamp = stamp;

    // 1. Update Own Rank Banner
    if (s.ownRank != null) {
      this.ownRankLabel.string = `我的排名: 第 ${s.ownRank} 名`;
      this.ownRankLabel.color = new Color(255, 215, 0);
    } else if (s.status === 'loading') {
      this.ownRankLabel.string = '我的排名: 加载中...';
      this.ownRankLabel.color = new Color(200, 200, 200);
    } else {
      this.ownRankLabel.string = s.scope === 'all'
        ? '我的排名: 暂不可用 (容量熔断或未评级)'
        : `我的排名: 暂不可用 (未参与${s.scope === 'warrior' ? '战士' : '猎人'}榜)`;
      this.ownRankLabel.color = new Color(180, 180, 180);
    }

    // 2. Render visible rows
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const item: RankingItemView | undefined = s.entries[i];
      if (item) {
        row.node.active = true;
        const rankNum = item.rank ?? (i + 1);
        row.rankLabel.string = `No.${rankNum}`;

        // Top 3 highlight colors
        if (rankNum === 1) {
          row.rankLabel.color = new Color(255, 215, 0); // Gold
        } else if (rankNum === 2) {
          row.rankLabel.color = new Color(210, 225, 240); // Silver
        } else if (rankNum === 3) {
          row.rankLabel.color = new Color(205, 127, 50); // Bronze
        } else {
          row.rankLabel.color = new Color(180, 190, 200);
        }

        row.nameLabel.string = item.characterName;
        row.classLabel.string = this.formatClass(item.classId);
        row.levelLabel.string = `Lv.${item.level}`;
        row.scoreLabel.string = item.score;
      } else {
        row.node.active = false;
        row.rankLabel.string = '';
        row.nameLabel.string = '';
        row.classLabel.string = '';
        row.levelLabel.string = '';
        row.scoreLabel.string = '';
      }
    }

    // 3. Freshness Indicator
    if (s.status === 'loading') {
      this.freshnessLabel.string = '数据刷新中...';
      this.freshnessLabel.color = new Color(180, 180, 180);
    } else if (s.stale) {
      this.freshnessLabel.string = '数据状态: 缓存快照 (15秒TTL)';
      this.freshnessLabel.color = new Color(240, 180, 60);
    } else {
      this.freshnessLabel.string = '数据状态: 实时最新';
      this.freshnessLabel.color = new Color(80, 220, 120);
    }

    // 4. Status and Error Message
    if (s.status === 'failed') {
      this.statusLabel.string = `加载失败: ${s.errorMessage ?? s.errorCode ?? '网络异常'}`;
      this.statusLabel.color = new Color(255, 80, 80);
      this.retryButtonNode.active = true;
    } else if (s.status === 'paging') {
      this.statusLabel.string = '正在加载后续名次...';
      this.statusLabel.color = new Color(200, 220, 240);
      this.retryButtonNode.active = false;
    } else if (s.entries.length === 0 && s.status === 'ready') {
      this.statusLabel.string = '暂无上榜角色';
      this.statusLabel.color = new Color(160, 160, 160);
      this.retryButtonNode.active = false;
    } else {
      this.statusLabel.string = '';
      this.retryButtonNode.active = false;
    }

    // 5. Load More Button visibility & text
    this.loadMoreButtonNode.active = s.hasMore || s.status === 'paging';
    const loadMoreLabel = this.loadMoreButtonNode.getComponentInChildren(Label);
    if (loadMoreLabel) {
      loadMoreLabel.string = s.status === 'paging' ? '加载中...' : '加载更多';
    }

    // 6. Update controls & buttons states
    for (const ctrl of this.controls) {
      const enabled = ctrl.canEnable();
      skinSprite(ctrl.node, 'ui/slices/button_' + (enabled ? 'normal' : 'disabled'), true);
      const label = ctrl.node.getComponentInChildren(Label);
      if (label) {
        label.color = enabled ? new Color(226, 235, 239) : new Color(89, 110, 124);
      }
    }

    // 7. Update Scope Tab Highlights
    const scope = this.state.scope;
    const tabs = [
      { node: this.allTabNode, active: scope === 'all' },
      { node: this.warriorTabNode, active: scope === 'warrior' },
      { node: this.hunterTabNode, active: scope === 'hunter' },
    ];
    for (const tab of tabs) {
      skinSprite(tab.node, tab.active ? 'ui/slices/button_pressed' : 'ui/slices/button_normal', true);
      const label = tab.node.getComponentInChildren(Label);
      if (label) label.color = tab.active ? new Color(255, 255, 255) : new Color(180, 195, 204);
    }
  }

  private onHide(): void {
    this.cancel();
  }

  private cancel = (): void => {
    this.inputEpoch++;
    for (const reset of this.buttonResets) reset();
  };

  private point(event: EventTouch | EventMouse): Vec3 {
    const loc = (event as any).getUILocation ? (event as any).getUILocation() : (event as any).getLocation();
    const transform = this.root.getComponent(UITransform);
    if (!transform) return new Vec3(loc.x - 480, loc.y - 270, 0);
    return transform.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
  }

  private touchStart = (e: EventTouch): void => {
    if (this.isMouseTouch(e)) return;
    this.suppressMouseUntil = Date.now() + 600;
  };

  private touchEnd = (e: EventTouch): void => {
    if (this.isMouseTouch(e)) return;
    this.suppressMouseUntil = Date.now() + 600;
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
    height = 30,
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
    width = 120,
    parent: Node = this.root,
  ): Node {
    const n = this.node(parent, value, x, y, width, 32);
    skinSprite(n, 'ui/slices/button_normal', true);
    this.label(n, value, 0, 0, 14, width - 4);

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
      if (
        pressed &&
        inside(e) &&
        Date.now() >= touchedUntil &&
        (e as any).getButton() === 0 &&
        this.visible &&
        canEnable()
      ) {
        action();
      }
    });

    return n;
  }
}
