import { Node, Graphics, Color, UITransform, Label } from 'cc';
import { DeathReviveHUDModel, DEATH_REVIVE_LAYOUT } from '../DeathReviveHUDModel';
import { skinSprite } from './UISkin';

export interface DeathRevivePanelOptions {
  onRevive?: () => void;
  onLeave?: () => void;
}

export class DeathRevivePanel {
  private readonly root: Node;
  private readonly model: DeathReviveHUDModel;
  private readonly options: DeathRevivePanelOptions;

  private readonly backdropGraphics: Graphics;
  private readonly auraGraphics: Graphics;
  private readonly modalNode: Node;
  private readonly titleLabel: Label;

  private readonly progressTrackNode: Node;
  private readonly progressFillNode: Node;
  private readonly progressFillTransform: UITransform;
  private readonly countdownLabel: Label;

  private readonly emblemLabel: Label;
  private readonly limitLabel: Label;
  private readonly promptLabel: Label;

  private readonly reviveBtnNode: Node;
  private readonly reviveBtnLabel: Label;
  private readonly leaveBtnNode: Node;
  private readonly leaveBtnLabel: Label;

  private readonly fadeoutGraphics: Graphics;

  constructor(parent: Node, model: DeathReviveHUDModel, options: DeathRevivePanelOptions = {}) {
    this.model = model;
    this.options = options;

    this.root = this.node(parent, 'DeathRevivePanel', 0, 0, 960, 540);
    this.root.active = false;

    // Dark backdrop overlay
    const backdropNode = this.node(this.root, 'Backdrop', 0, 0, 960, 540);
    this.backdropGraphics = backdropNode.addComponent(Graphics);

    // Golden aura effect for resurrection
    const auraNode = this.node(this.root, 'AuraEffect', 0, 0, 960, 540);
    this.auraGraphics = auraNode.addComponent(Graphics);

    // Modal Window Container (340 x 230)
    const p = DEATH_REVIVE_LAYOUT.panel;
    this.modalNode = this.node(this.root, 'ModalWindow', p.x, p.y, p.width + 20, p.height + 10);
    skinSprite(this.modalNode, 'ui/slices/panel_window_frame', true);

    const innerWell = this.node(this.modalNode, 'InnerWell', 0, 0, p.width + 4, p.height - 6);
    skinSprite(innerWell, 'ui/slices/panel_well_inner', true);

    // Header Title
    this.titleLabel = this.label(this.modalNode, '角色阵亡', 0, 72, 20, 300);
    this.titleLabel.color = new Color(255, 215, 75);

    // Countdown Progress Bar
    const pb = DEATH_REVIVE_LAYOUT.progressBar;
    this.progressTrackNode = this.node(this.modalNode, 'ProgressBarTrack', pb.x, pb.y, pb.width, pb.height);
    skinSprite(this.progressTrackNode, 'ui/slices/bar_track_bg', true);

    this.progressFillNode = this.node(this.progressTrackNode, 'ProgressBarFill', -pb.width / 2, 0, pb.width, pb.height - 4);
    this.progressFillTransform = this.progressFillNode.getComponent(UITransform)!;
    this.progressFillTransform.setAnchorPoint(0, 0.5);
    skinSprite(this.progressFillNode, 'ui/slices/bar_fill_exp', true);

    this.countdownLabel = this.label(this.modalNode, '剩余时间: 10.0s', pb.x, pb.y, 12, pb.width);
    this.countdownLabel.color = new Color(255, 255, 255);

    // Details: Emblem & Limit & Notice
    this.emblemLabel = this.label(this.modalNode, '复活纹章: 10', 0, 5, 14, 280);
    this.emblemLabel.color = new Color(225, 240, 245);

    this.limitLabel = this.label(this.modalNode, '普通副本无次数限制', 0, -18, 13, 280);
    this.limitLabel.color = new Color(165, 190, 200);

    this.promptLabel = this.label(this.modalNode, '', 0, -36, 12, 300);
    this.promptLabel.color = new Color(255, 100, 100);

    // Revive Button
    const rb = DEATH_REVIVE_LAYOUT.reviveButton;
    this.reviveBtnNode = this.node(this.modalNode, 'ReviveButton', rb.x, rb.y, rb.width, rb.height);
    skinSprite(this.reviveBtnNode, 'ui/slices/button_normal', true);
    this.reviveBtnLabel = this.label(this.reviveBtnNode, '立即复活', 0, 0, 14, rb.width);

    // Leave Button
    const lb = DEATH_REVIVE_LAYOUT.leaveButton;
    this.leaveBtnNode = this.node(this.modalNode, 'LeaveButton', lb.x, lb.y, lb.width, lb.height);
    skinSprite(this.leaveBtnNode, 'ui/slices/button_normal', true);
    this.leaveBtnLabel = this.label(this.leaveBtnNode, '放弃退出', 0, 0, 14, lb.width);

    // Fullscreen Fadeout Overlay
    const fadeoutNode = this.node(this.root, 'FadeoutOverlay', 0, 0, 960, 540);
    this.fadeoutGraphics = fadeoutNode.addComponent(Graphics);
  }

  public get isVisible(): boolean {
    return this.model.isVisible || this.model.goldenAura.active || this.model.fadeOut.active;
  }

  public update(dt: number, playerX = 0, playerY = 0): { timeoutTriggered: boolean; fadeOutComplete: boolean } {
    const result = this.model.update(dt);
    this.render(playerX, playerY);
    return result;
  }

  public render(playerX = 0, playerY = 0): void {
    const visible = this.model.isVisible;
    this.root.active = visible || this.model.goldenAura.active || this.model.fadeOut.active;

    if (!this.root.active) return;

    // 1. Render backdrop
    this.backdropGraphics.clear();
    if (visible) {
      this.backdropGraphics.fillColor = new Color(0, 0, 0, 160);
      this.backdropGraphics.rect(-480, -270, 960, 540);
      this.backdropGraphics.fill();
    }

    // 2. Render resurrection golden aura
    this.auraGraphics.clear();
    if (this.model.goldenAura.active) {
      const aura = this.model.goldenAura;
      const progress = aura.elapsedSec / aura.durationSec;
      const currentRadius = aura.radius * (0.8 + 0.4 * Math.sin(progress * Math.PI));
      const alpha = Math.round(200 * (1 - progress));

      this.auraGraphics.fillColor = new Color(255, 215, 0, Math.round(alpha * 0.4));
      this.auraGraphics.circle(playerX * 2, playerY * 2, currentRadius * 2);
      this.auraGraphics.fill();

      this.auraGraphics.strokeColor = new Color(255, 235, 120, alpha);
      this.auraGraphics.lineWidth = 3;
      this.auraGraphics.circle(playerX * 2, playerY * 2, currentRadius * 2);
      this.auraGraphics.stroke();
    }

    // 3. Render modal panel
    this.modalNode.active = visible;
    if (visible) {
      // Progress bar
      const pb = DEATH_REVIVE_LAYOUT.progressBar;
      const fillW = Math.max(2, (pb.width - 4) * this.model.progress);
      this.progressFillTransform.setContentSize(fillW, pb.height - 4);

      // Slices for progress fill: red if under 3s, gold/green if plenty
      const fillSkin = this.model.remainingSec > 3 ? 'ui/slices/bar_fill_exp' : 'ui/slices/bar_fill_hp';
      skinSprite(this.progressFillNode, fillSkin, true);

      // Labels
      this.countdownLabel.string = this.model.countdownLabel;
      this.emblemLabel.string = this.model.emblemLabel;
      this.limitLabel.string = this.model.limitLabel;

      if (this.model.promptMessage) {
        this.promptLabel.node.active = true;
        this.promptLabel.string = this.model.promptMessage;
      } else {
        this.promptLabel.node.active = false;
      }

      // Buttons
      this.reviveBtnLabel.string = this.model.reviveButtonLabel;
      if (this.model.reviveButtonState === 'disabled') {
        skinSprite(this.reviveBtnNode, 'ui/slices/button_disabled', true);
        this.reviveBtnLabel.color = new Color(130, 135, 140);
      } else if (this.model.reviveButtonState === 'submitting') {
        skinSprite(this.reviveBtnNode, 'ui/slices/button_pressed', true);
        this.reviveBtnLabel.color = new Color(255, 220, 120);
      } else {
        skinSprite(this.reviveBtnNode, 'ui/slices/button_normal', true);
        this.reviveBtnLabel.color = new Color(245, 245, 240);
      }

      this.leaveBtnLabel.string = this.model.leaveButtonLabel;
      if (this.model.leaveButtonState === 'submitting') {
        skinSprite(this.leaveBtnNode, 'ui/slices/button_pressed', true);
        this.leaveBtnLabel.color = new Color(255, 220, 120);
      } else {
        skinSprite(this.leaveBtnNode, 'ui/slices/button_normal', true);
        this.leaveBtnLabel.color = new Color(245, 245, 240);
      }
    }

    // 4. Render fadeout
    this.fadeoutGraphics.clear();
    if (this.model.fadeOut.active) {
      this.fadeoutGraphics.fillColor = new Color(0, 0, 0, Math.round(this.model.fadeOut.alpha * 255));
      this.fadeoutGraphics.rect(-480, -270, 960, 540);
      this.fadeoutGraphics.fill();
    }
  }

  public hitTest(x: number, y: number): 'revive' | 'leave' | null {
    if (!this.model.isVisible) return null;
    return this.model.hitTest(x, y);
  }

  public dispose(): void {
    this.root.destroy();
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

  private label(parent: Node, text: string, x: number, y: number, size: number, w = 300): Label {
    const n = new Node('Label');
    n.layer = parent.layer;
    n.setPosition(x, y, 0);
    const tr = n.addComponent(UITransform);
    tr.setContentSize(w, size + 6);
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
}
