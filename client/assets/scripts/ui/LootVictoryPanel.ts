import { Node, Graphics, Color, Label, UITransform } from 'cc';
import type { LootSceneCoordinator } from '../net/LootSceneCoordinator';
import { skinSprite } from './UISkin';

export class LootVictoryPanel {
  private readonly root: Node;
  private readonly drops: Graphics;
  private readonly fade: Graphics;
  private readonly names: Label[] = [];

  // Victory Card Container & Subnodes
  private readonly victoryCard: Node;
  private readonly title: Label;
  private readonly totals: Label;
  private readonly equipSlot: Node;
  private readonly equipment: Label;
  private readonly route: Label;
  private readonly leaveBtn: Node;
  private readonly leave: Label;

  // Prompts & Badges
  private readonly collectBtn: Node;
  private readonly collect: Label;
  private readonly notice: Label;
  private readonly retryBtn: Node;
  private readonly retry: Label;

  constructor(parent: Node) {
    this.root = new Node('AuthoritativeLootHUD');
    this.root.layer = parent.layer;
    parent.addChild(this.root);

    this.drops = this.graphics('GroundDropPillars');

    // Victory Card hierarchy (centered at 250, -5, size 330×240)
    this.victoryCard = this.node(this.root, 'VictoryCard', 250, -5, 330, 240);
    this.victoryCard.active = false;
    skinSprite(this.victoryCard, 'ui/slices/panel_window_frame', true);

    const innerWell = this.node(this.victoryCard, 'InnerWell', 0, 0, 314, 224);
    skinSprite(innerWell, 'ui/slices/panel_well_inner', true);

    this.title = this.label(this.victoryCard, '通关胜利', 0, 85, 20, 300);
    this.title.color = new Color(255, 215, 0);

    this.totals = this.label(this.victoryCard, '', 0, 45, 14, 300);
    this.totals.color = new Color(220, 235, 245);

    this.equipSlot = this.node(this.victoryCard, 'EquipSlot', 0, -5, 290, 34);
    skinSprite(this.equipSlot, 'ui/slices/button_pressed', true);

    this.equipment = this.label(this.equipSlot, '', 0, 0, 15, 280);
    this.equipment.color = new Color(255, 235, 130);

    this.route = this.label(this.victoryCard, '', 0, -50, 13, 300);
    this.route.color = new Color(170, 195, 210);

    this.leaveBtn = this.node(this.victoryCard, 'LeaveButton', 0, -95, 250, 32);
    skinSprite(this.leaveBtn, 'ui/slices/button_normal', true);
    this.leave = this.label(this.leaveBtn, '离开副本 [L]', 0, 0, 15, 240);
    this.leave.color = new Color(236, 229, 208);

    // Left Collect prompt pill
    this.collectBtn = this.node(this.root, 'CollectPill', -285, 95, 260, 32);
    skinSprite(this.collectBtn, 'ui/slices/button_normal', true);
    this.collect = this.label(this.collectBtn, '', 0, 0, 14, 250);
    this.collect.color = new Color(236, 229, 208);

    this.notice = this.label(this.root, '', -285, 65, 16, 300);
    this.notice.color = new Color(255, 200, 100);

    // Top Retry prompt pill
    this.retryBtn = this.node(this.root, 'RetryPill', 0, 105, 220, 32);
    skinSprite(this.retryBtn, 'ui/slices/button_normal', true);
    this.retry = this.label(this.retryBtn, '', 0, 0, 13, 210);
    this.retry.color = new Color(255, 120, 120);
    this.retryBtn.active = false;

    this.fade = this.graphics('ConfirmedLeaveFade');
  }

  private graphics(name: string): Graphics {
    const n = new Node(name);
    n.layer = this.root.layer;
    this.root.addChild(n);
    return n.addComponent(Graphics);
  }

  private node(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
    const n = new Node(name);
    n.layer = this.root.layer;
    parent.addChild(n);
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(width, height);
    return n;
  }

  private label(parent: Node, text: string, x: number, y: number, size: number, width: number): Label {
    const n = new Node('LootLabel');
    n.layer = this.root.layer;
    parent.addChild(n);
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(width, 40);
    const l = n.addComponent(Label);
    l.string = text;
    l.fontSize = size;
    l.lineHeight = size + 6;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    return l;
  }

  update(scene: LootSceneCoordinator): void {
    const m = scene.hud;
    const g = this.drops;
    g.clear();

    while (this.names.length < m.drops.length) {
      this.names.push(this.label(this.root, '', 0, 0, 12, 180));
    }

    this.names.forEach((l, i) => {
      const d = m.drops[i];
      l.node.active = !!d;
      if (!d) return;
      const x = (d.x / 1000) * 2;
      const y = (d.y / 1000) * 2;
      l.string = d.name;
      l.node.setPosition(x, y + 36 + i * 15);
      l.color = new Color().fromHEX(d.color);

      const color = new Color().fromHEX(d.color);
      g.fillColor = new Color(color.r, color.g, color.b, d.near ? 140 : 70);
      g.rect(x - 5, y + 5, 10, 30);
      g.fill();
      g.fillColor = color;
      g.moveTo(x, y + 18);
      g.lineTo(x + 7, y + 10);
      g.lineTo(x, y + 2);
      g.lineTo(x - 7, y + 10);
      g.close();
      g.fill();
      if (d.near) {
        g.strokeColor = color;
        g.lineWidth = 2;
        g.ellipse(x, y, 16, 6);
        g.stroke();
      }
    });

    const v = m.victory;
    this.victoryCard.active = !!v;
    if (v) {
      this.title.string = v.title;
      this.totals.string = `${v.elapsed} · 击杀 ${v.kills}\n金币 ${v.gold} · 经验 ${v.xp}`;
      const flip = Math.max(0.05, Math.abs(Math.cos(m.flipProgress * Math.PI)));
      this.equipSlot.setScale(flip, 1, 1);
      this.equipment.string = m.flipProgress < 0.5 ? '通关装备 · 翻牌中' : v.equipment;
      this.route.string = v.routeMessage;
      this.leave.string =
        scene.terminal.state.status === 'unknown'
          ? '结果待恢复 · 点击重试'
          : scene.terminal.state.status === 'closed'
          ? '已离开副本'
          : scene.busy
          ? '请等待当前操作…'
          : '离开副本 [L]';
    }

    this.collect.string = scene.busy
      ? '正在确认操作…'
      : m.nearest
      ? '拾取附近掉落 [P]'
      : '靠近掉落物（32px）';
    this.notice.string = m.notice;

    const needsRetry =
      scene.movement.state.status === 'unknown' ||
      scene.movement.state.status === 'error' ||
      scene.drops.state.status === 'unknown' ||
      scene.terminal.state.status === 'unknown' ||
      scene.terminal.state.status === 'failed';
    this.retryBtn.active = needsRetry;
    this.retry.string = needsRetry ? '网络结果待确认 · 重试 [V]' : '';

    // Keep confirmation fade on top
    this.fade.node.setSiblingIndex(this.root.children.length - 1);
    this.fade.clear();
    if (m.fadeAlpha > 0) {
      this.fade.fillColor = new Color(0, 0, 0, Math.round(255 * m.fadeAlpha));
      this.fade.rect(-480, -270, 960, 540);
      this.fade.fill();
    }
  }

  hitTest(x: number, y: number): 'collect' | 'leave' | 'retry' | null {
    if (Math.abs(x + 285) < 150 && Math.abs(y - 95) < 20) return 'collect';
    if (Math.abs(x - 250) < 150 && Math.abs(y + 100) < 22) return 'leave';
    if (Math.abs(x) < 120 && Math.abs(y - 105) < 20) return 'retry';
    return null;
  }

  dispose(): void {
    this.root.destroy();
  }
}
