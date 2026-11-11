import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { skinSprite } from './UISkin';

export type TownNpcServiceId = 'repair' | 'shop' | 'enhancement' | 'mail' | 'bank' | 'portal';

export interface TownNpcSpec {
  id: TownNpcServiceId;
  title: string;
  actionTag: string;
  promptText: string;
  worldX: number;
  canvasX: number;
  color: string;
  iconStem: string;
  border: 'rough' | 'fine' | 'rare' | 'unique' | 'epic' | 'legendary';
  hitMinX: number;
  hitMaxX: number;
}

export const TOWN_NPC_PROXIMITY_RADIUS = 48;

export const TOWN_NPCS: readonly TownNpcSpec[] = [
  {
    id: 'repair',
    title: '铁匠·林纳克斯',
    actionTag: '[修理 M]',
    promptText: '修理装备 [M]',
    worldX: -150,
    canvasX: -300,
    color: '#ffd782',
    iconStem: 'armor_chest',
    border: 'legendary',
    hitMinX: -340,
    hitMaxX: -260,
  },
  {
    id: 'shop',
    title: '商人·德利拉',
    actionTag: '[商店 P]',
    promptText: '打开商店 [P]',
    worldX: -80,
    canvasX: -160,
    color: '#ffdc64',
    iconStem: 'consumable_hp_potion',
    border: 'fine',
    hitMinX: -200,
    hitMaxX: -120,
  },
  {
    id: 'enhancement',
    title: '炉火·玛丽',
    actionTag: '[强化 K]',
    promptText: '装备强化 [K]',
    worldX: -10,
    canvasX: -20,
    color: '#ffa0d2',
    iconStem: 'weapon_dual_blades',
    border: 'unique',
    hitMinX: -60,
    hitMaxX: 20,
  },
  {
    id: 'mail',
    title: '旅店·信箱',
    actionTag: '[邮箱 I]',
    promptText: '查看邮件 [I]',
    worldX: 50,
    canvasX: 100,
    color: '#82dcff',
    iconStem: 'special_book',
    border: 'rare',
    hitMinX: 60,
    hitMaxX: 140,
  },
  {
    id: 'bank',
    title: '行长·金库',
    actionTag: '[银行 N]',
    promptText: '金库仓库 [N]',
    worldX: 120,
    canvasX: 240,
    color: '#8ce6ff',
    iconStem: 'material_adamantite',
    border: 'rare',
    hitMinX: 200,
    hitMaxX: 280,
  },
  {
    id: 'portal',
    title: '格兰之森',
    actionTag: '[传送门 ▶]',
    promptText: '进入地下城',
    worldX: 198,
    canvasX: 396,
    color: '#d2aaff',
    iconStem: 'special_stone',
    border: 'epic',
    hitMinX: 350,
    hitMaxX: 465,
  },
];

interface NpcVisualEntry {
  spec: TownNpcSpec;
  container: Node;
  badge: Node;
  nameplate: Label;
  promptPill: Node;
  color: Color;
}

const FEET_Y = -14;

/**
 * Town NPC Canvas HUD + world-space animated pixel avatars.
 * Canvas coordinates use worldX * 2 to stay aligned with the 2x world layer.
 */
export class TownNPCHUD {
  private readonly root: Node;
  private readonly entries: NpcVisualEntry[] = [];

  constructor(parent: Node) {
    this.root = new Node('TownNPCHUD');
    this.root.layer = parent.layer;
    parent.addChild(this.root);

    for (const spec of TOWN_NPCS) {
      const container = this.node(this.root, `NPC_${spec.id}`, spec.canvasX, 0, 130, 180);
      const color = new Color().fromHEX(spec.color);

      const badge = this.node(container, 'ServiceBadge', 0, 46, 24, 24);
      const base = this.node(badge, 'Base', 0, 0, 24, 24);
      skinSprite(base, 'ui/slices/slot_grid_base', true);
      const icon = this.node(badge, 'Icon', 0, 0, 18, 18);
      skinSprite(icon, `icons/${spec.iconStem}_48`, false);
      const border = this.node(badge, 'Border', 0, 0, 24, 24);
      skinSprite(border, `ui/slices/slot_border_${spec.border}`, true);

      const nameplate = this.label(container, `${spec.title}\n${spec.actionTag}`, 0, 78, 12, 124);
      nameplate.color = color;

      const promptPill = this.node(container, 'PromptPill', 0, -48, 94, 24);
      skinSprite(promptPill, 'ui/slices/button_normal', true);
      const promptLabel = this.label(promptPill, spec.promptText, 0, 0, 12, 88);
      promptLabel.color = new Color(236, 229, 208);
      promptPill.active = false;

      this.entries.push({ spec, container, badge, nameplate, promptPill, color });
    }
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
    const n = new Node('NPCLabel');
    n.layer = this.root.layer;
    parent.addChild(n);
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(width, 36);
    const l = n.addComponent(Label);
    l.string = text;
    l.fontSize = size;
    l.lineHeight = size + 4;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    return l;
  }

  private isNear(spec: TownNpcSpec, playerWorldX: number, playerWorldY: number): boolean {
    if (spec.id === 'portal' && playerWorldX >= 175 && Math.abs(playerWorldY - 10) < TOWN_NPC_PROXIMITY_RADIUS) {
      return true;
    }
    return Math.hypot(playerWorldX - spec.worldX, playerWorldY - 10) < TOWN_NPC_PROXIMITY_RADIUS;
  }

  setVisible(visible: boolean): void {
    this.root.active = visible;
  }

  update(time: number, playerWorldX: number, playerWorldY: number): void {
    if (!this.root.active) return;
    this.entries.forEach((entry, idx) => {
      const near = this.isNear(entry.spec, playerWorldX, playerWorldY);
      const bob = Math.sin(time * 2.6 + idx * 0.9) * 2;
      entry.badge.setPosition(0, 46 + bob + (near ? 3 : 0));
      const scale = near ? 1.15 : 1;
      entry.badge.setScale(scale, scale, 1);
      entry.promptPill.active = near;
    });
  }

  hitTest(canvasX: number, canvasY: number): TownNpcServiceId | null {
    if (!this.root.active) return null;
    if (canvasY < -64 || canvasY > 98) return null;
    for (const entry of this.entries) {
      const { spec } = entry;
      if (canvasX >= spec.hitMinX && canvasX <= spec.hitMaxX) {
        return spec.id;
      }
    }
    return null;
  }

  /**
   * Draw world-space animated pixel avatars, portal vortex, and proximity halos.
   * Coordinates match Prototype's 2x world layer directly.
   */
  drawTownAvatars(g: Graphics, time: number, playerWorldX: number, playerWorldY: number): void {
    this.entries.forEach((entry, idx) => {
      const { spec, color } = entry;
      const near = this.isNear(spec, playerWorldX, playerWorldY);
      this.drawGroundRing(g, spec.worldX, color, near, time);

      switch (spec.id) {
        case 'repair':
          this.drawLinus(g, spec.worldX, time, idx);
          break;
        case 'shop':
          this.drawDelilah(g, spec.worldX, time, idx);
          break;
        case 'enhancement':
          this.drawMary(g, spec.worldX, time, idx);
          break;
        case 'mail':
          this.drawMailbox(g, spec.worldX, time);
          break;
        case 'bank':
          this.drawBanker(g, spec.worldX, time, idx);
          break;
        case 'portal':
          this.drawPortalVortex(g, spec.worldX, time);
          break;
      }

      if (near) {
        this.drawNearIndicator(g, spec.worldX, color, time);
      }
    });
  }

  private drawGroundRing(g: Graphics, x: number, color: Color, near: boolean, time: number): void {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(x, FEET_Y, 10, 3.5);
    g.fill();
    if (!near) return;

    const pulse = 0.7 + 0.3 * Math.sin(time * 5);
    g.fillColor = new Color(color.r, color.g, color.b, Math.round(60 * pulse));
    g.ellipse(x, FEET_Y, 28, 10);
    g.fill();
    g.strokeColor = new Color(color.r, color.g, color.b, Math.round(190 * pulse));
    g.lineWidth = 1.4;
    g.ellipse(x, FEET_Y, 28, 10);
    g.stroke();
  }

  private drawNearIndicator(g: Graphics, x: number, color: Color, time: number): void {
    const bounceY = Math.sin(time * 6) * 2.5;
    g.fillColor = new Color(color.r, color.g, color.b, 235);
    g.moveTo(x - 4.5, 22 + bounceY);
    g.lineTo(x + 4.5, 22 + bounceY);
    g.lineTo(x, 17 + bounceY);
    g.close();
    g.fill();
  }

  private drawHumanoidBase(
    g: Graphics,
    x: number,
    bob: number,
    bodyHex: string,
    accentHex: string,
    skinHex: string,
    time: number,
    phase: number,
  ): void {
    const y = FEET_Y;
    // Boots
    g.fillColor = new Color().fromHEX('#2e2522');
    g.rect(x - 4, y, 3, 3);
    g.rect(x + 1, y, 3, 3);
    g.fill();
    // Tunic / torso
    g.fillColor = new Color().fromHEX(bodyHex);
    g.rect(x - 5, y + 3 + bob, 10, 12);
    g.fill();
    g.fillColor = new Color().fromHEX(accentHex);
    g.rect(x - 5, y + 8 + bob, 10, 2);
    g.fill();
    // Head
    g.fillColor = new Color().fromHEX(skinHex);
    g.rect(x - 4, y + 15 + bob, 8, 8);
    g.fill();
    // Periodic blink every ~4 seconds
    const blinking = ((time * 0.7 + phase) % 3.2) > 3.05;
    g.fillColor = new Color(35, 28, 30, 255);
    if (blinking) {
      g.rect(x - 2.5, y + 18 + bob, 2, 1);
      g.rect(x + 0.5, y + 18 + bob, 2, 1);
    } else {
      g.rect(x - 2.5, y + 18 + bob, 1.5, 2);
      g.rect(x + 1, y + 18 + bob, 1.5, 2);
    }
    g.fill();
  }

  private drawLinus(g: Graphics, x: number, time: number, idx: number): void {
    const bob = Math.sin(time * 2.5 + idx) * 0.7;
    this.drawHumanoidBase(g, x, bob, '#8d6e63', '#5d4037', '#f5caa2', time, 0.3);
    // Red bandana & beard
    g.fillColor = new Color().fromHEX('#c62828');
    g.rect(x - 4.5, FEET_Y + 21 + bob, 9, 3);
    g.fill();
    g.fillColor = new Color().fromHEX('#d7ccc8');
    g.rect(x - 3, FEET_Y + 13 + bob, 6, 3);
    g.fill();
    // Animated smithing hammer arm + forge spark
    const swing = Math.sin(time * 5.2);
    const hy = FEET_Y + 11 + bob + swing * 4;
    g.fillColor = new Color().fromHEX('#5d4037');
    g.rect(x + 5, hy - 2, 5, 2);
    g.fill();
    g.fillColor = new Color().fromHEX('#cfd8dc');
    g.rect(x + 8, hy, 4, 3);
    g.fill();
    if (swing < -0.75) {
      g.fillColor = new Color(255, 200, 70, 240);
      g.rect(x + 9, FEET_Y + 7, 2, 2);
      g.rect(x + 12, FEET_Y + 9, 1.5, 1.5);
      g.fill();
    }
  }

  private drawDelilah(g: Graphics, x: number, time: number, idx: number): void {
    const bob = Math.sin(time * 2.3 + idx) * 0.9;
    this.drawHumanoidBase(g, x, bob, '#2e7d32', '#f9a825', '#ffe0bd', time, 1.1);
    // Feathered beret
    g.fillColor = new Color().fromHEX('#8d6e63');
    g.rect(x - 5, FEET_Y + 21 + bob, 10, 3);
    g.fill();
    g.fillColor = new Color().fromHEX('#ffca28');
    g.rect(x + 2, FEET_Y + 24 + bob, 3, 2);
    g.fill();
    // Potion bottle held in hand
    const pulseY = Math.sin(time * 3 + 0.5) * 1;
    g.fillColor = new Color().fromHEX('#ef5350');
    g.rect(x - 8, FEET_Y + 9 + bob + pulseY, 3, 4);
    g.fill();
    g.fillColor = new Color(255, 240, 240, 220);
    g.rect(x - 7.5, FEET_Y + 13 + bob + pulseY, 2, 1.5);
    g.fill();
  }

  private drawMary(g: Graphics, x: number, time: number, idx: number): void {
    const bob = Math.sin(time * 2.8 + idx) * 1.1;
    this.drawHumanoidBase(g, x, bob, '#5e35b1', '#ce93d8', '#ffe4d0', time, 1.9);
    // Pointed arcane wizard hat
    g.fillColor = new Color().fromHEX('#4527a0');
    g.rect(x - 6, FEET_Y + 21 + bob, 12, 2.5);
    g.moveTo(x - 4, FEET_Y + 23.5 + bob);
    g.lineTo(x + 4, FEET_Y + 23.5 + bob);
    g.lineTo(x, FEET_Y + 30 + bob);
    g.close();
    g.fill();
    // Orbiting arcane crystal
    const orbX = x + 9;
    const orbY = FEET_Y + 15 + Math.sin(time * 3.8) * 2.5;
    g.fillColor = new Color(255, 130, 220, 95);
    g.circle(orbX, orbY, 4.2);
    g.fill();
    g.fillColor = new Color().fromHEX('#f48fb1');
    g.circle(orbX, orbY, 2.2);
    g.fill();
  }

  private drawMailbox(g: Graphics, x: number, time: number): void {
    // Timber post + blue iron mail chest
    g.fillColor = new Color().fromHEX('#5d4037');
    g.rect(x - 2, FEET_Y, 4, 9);
    g.fill();
    g.fillColor = new Color().fromHEX('#1976d2');
    g.rect(x - 6, FEET_Y + 9, 12, 8);
    g.fill();
    g.fillColor = new Color().fromHEX('#ffd54f');
    g.rect(x - 6, FEET_Y + 13, 12, 1.5);
    g.fill();
    // Sealed letter peeking out
    const letterBob = Math.sin(time * 3.2) * 0.8;
    g.fillColor = new Color().fromHEX('#fff8e1');
    g.rect(x - 3, FEET_Y + 16 + letterBob, 6, 4);
    g.fill();
    g.fillColor = new Color().fromHEX('#e53935');
    g.rect(x - 1, FEET_Y + 17.5 + letterBob, 2, 1.5);
    g.fill();
    // Perched courier owl with subtle wing flutter
    const wingY = Math.sin(time * 6) * 0.8;
    g.fillColor = new Color().fromHEX('#eceff1');
    g.rect(x + 2, FEET_Y + 18, 5, 5);
    g.rect(x + 1, FEET_Y + 19 + wingY, 1.5, 3);
    g.fill();
    g.fillColor = new Color().fromHEX('#ffb300');
    g.rect(x + 4, FEET_Y + 20, 1.5, 1.5);
    g.fill();
  }

  private drawBanker(g: Graphics, x: number, time: number, idx: number): void {
    const bob = Math.sin(time * 2.1 + idx) * 0.6;
    this.drawHumanoidBase(g, x, bob, '#263238', '#ffca28', '#f6d1b3', time, 2.6);
    // Tall top hat with gold band
    g.fillColor = new Color().fromHEX('#1a2228');
    g.rect(x - 6, FEET_Y + 21 + bob, 12, 2);
    g.rect(x - 4, FEET_Y + 23 + bob, 8, 6);
    g.fill();
    g.fillColor = new Color().fromHEX('#ffd54f');
    g.rect(x - 4, FEET_Y + 23 + bob, 8, 1.5);
    g.fill();
    // Stacked gold bullion beside banker
    g.fillColor = new Color().fromHEX('#ffca28');
    g.rect(x - 10, FEET_Y, 5, 3);
    g.rect(x - 9, FEET_Y + 3, 4, 2.5);
    g.fill();
  }

  private drawPortalVortex(g: Graphics, x: number, time: number): void {
    const breathe = 1 + 0.12 * Math.sin(time * 3.4);
    g.fillColor = new Color(165, 105, 255, 65);
    g.ellipse(x, 2, 13 * breathe, 20 * breathe);
    g.fill();
    g.strokeColor = new Color(215, 175, 255, 200);
    g.lineWidth = 1.4;
    g.ellipse(x, 2, 9 * breathe, 14 * breathe);
    g.stroke();

    // Two orbiting dimensional motes
    for (let i = 0; i < 2; i++) {
      const angle = time * 2.8 + i * Math.PI;
      const sx = x + Math.cos(angle) * 10;
      const sy = 2 + Math.sin(angle) * 15;
      g.fillColor = new Color(230, 205, 255, 230);
      g.rect(sx - 1.2, sy - 1.2, 2.4, 2.4);
      g.fill();
    }
  }

  dispose(): void {
    this.root.destroy();
  }
}

