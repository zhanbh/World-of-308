import { Node, Color, UITransform, Label, Graphics } from 'cc';
import { SupplyHUDModel, SUPPLY_BUTTON_LAYOUT, QuickSlotViewState, TrinketViewState } from '../SupplyHUDModel';
import { skinSprite } from './UISkin';

export class CombatSupplyHUD {
  private readonly root: Node;
  private readonly model: SupplyHUDModel;

  private readonly slotNodes: Node[] = [];
  private readonly slotBorders: Node[] = [];
  private readonly slotMasks: Graphics[] = [];
  private readonly nameLabels: Label[] = [];
  private readonly countLabels: Label[] = [];
  private readonly cdLabels: Label[] = [];
  private readonly hotkeyLabels: Label[] = [];

  private readonly trinketNode: Node;
  private readonly trinketBorder: Node;
  private readonly trinketMask: Graphics;
  private readonly trinketNameLabel: Label;
  private readonly trinketCdLabel: Label;
  private readonly trinketHotkeyLabel: Label;

  constructor(parent: Node, model: SupplyHUDModel) {
    this.model = model;

    this.root = this.node(parent, 'CombatSupplyHUD', 0, 0, 960, 540);

    const geom = SUPPLY_BUTTON_LAYOUT;
    const positions = [geom.slot0, geom.slot1, geom.slot2];

    // Quick Slots 0, 1, 2
    for (let i = 0; i < 3; i++) {
      const pos = positions[i];
      const slot = this.node(this.root, `SupplySlot_${i}`, pos.x, pos.y, 56, 56);
      skinSprite(slot, 'ui/slices/slot_grid_base', true);

      const border = this.node(slot, 'Border', 0, 0, 56, 56);
      skinSprite(border, 'ui/slices/slot_border_rough', true);

      const maskNode = this.node(slot, 'CooldownMask', 0, 0, 56, 56);
      const mask = maskNode.addComponent(Graphics);

      const nameLbl = this.label(slot, '', 0, 14, 11, 52);
      nameLbl.color = new Color(255, 235, 180);

      const countLbl = this.label(slot, '', 0, -2, 12, 52);
      countLbl.color = new Color(220, 240, 255);

      const cdLbl = this.label(slot, '', 0, 0, 13, 52);
      cdLbl.color = new Color(255, 215, 80);
      cdLbl.node.active = false;

      const hotkeyLbl = this.label(slot, `${i + 1} 药`, 0, -20, 10, 52);
      hotkeyLbl.color = new Color(170, 185, 200);

      this.slotNodes.push(slot);
      this.slotBorders.push(border);
      this.slotMasks.push(mask);
      this.nameLabels.push(nameLbl);
      this.countLabels.push(countLbl);
      this.cdLabels.push(cdLbl);
      this.hotkeyLabels.push(hotkeyLbl);
    }

    // Trinket Slot
    const tPos = geom.trinket;
    this.trinketNode = this.node(this.root, 'TrinketSlot', tPos.x, tPos.y, 56, 56);
    skinSprite(this.trinketNode, 'ui/slices/slot_grid_base', true);

    this.trinketBorder = this.node(this.trinketNode, 'Border', 0, 0, 56, 56);
    skinSprite(this.trinketBorder, 'ui/slices/slot_border_epic', true);

    const tMaskNode = this.node(this.trinketNode, 'CooldownMask', 0, 0, 56, 56);
    this.trinketMask = tMaskNode.addComponent(Graphics);

    this.trinketNameLabel = this.label(this.trinketNode, '饰品', 0, 12, 11, 52);
    this.trinketNameLabel.color = new Color(230, 190, 255);

    this.trinketCdLabel = this.label(this.trinketNode, '', 0, -2, 12, 52);
    this.trinketCdLabel.color = new Color(255, 220, 100);

    this.trinketHotkeyLabel = this.label(this.trinketNode, '饰品 T', 0, -20, 10, 52);
    this.trinketHotkeyLabel.color = new Color(180, 175, 210);
  }

  public setVisible(visible: boolean): void {
    this.root.active = visible;
  }

  public render(): void {
    // 1. Render 3 Quick Slots
    for (let i = 0; i < 3; i++) {
      const state: QuickSlotViewState = this.model.quickSlots[i];
      const mask = this.slotMasks[i];
      const nameLbl = this.nameLabels[i];
      const countLbl = this.countLabels[i];
      const cdLbl = this.cdLabels[i];
      const border = this.slotBorders[i];

      mask.clear();

      if (state.kind === 'hp') {
        skinSprite(border, 'ui/slices/slot_border_fine', true);
        nameLbl.color = new Color(255, 160, 160);
      } else if (state.kind === 'mp') {
        skinSprite(border, 'ui/slices/slot_border_fine', true);
        nameLbl.color = new Color(150, 200, 255);
      } else {
        skinSprite(border, 'ui/slices/slot_border_rough', true);
        nameLbl.color = new Color(200, 200, 200);
      }

      const shortName = state.label ? state.label.split('\n')[0] : (state.name ? state.name.slice(0, 2) : (state.kind === 'hp' ? '生命' : state.kind === 'mp' ? '法力' : '空'));
      nameLbl.string = shortName;

      if (state.status === 'cooldown') {
        mask.fillColor = new Color(10, 14, 20, 180);
        mask.rect(-26, -26, 52, 52);
        mask.fill();

        cdLbl.node.active = true;
        cdLbl.string = `${state.cooldownLeftSec.toFixed(1)}s`;
        countLbl.node.active = false;
      } else if (state.status === 'empty') {
        mask.fillColor = new Color(40, 20, 20, 160);
        mask.rect(-26, -26, 52, 52);
        mask.fill();

        cdLbl.node.active = false;
        countLbl.node.active = true;
        countLbl.string = '0';
        countLbl.color = new Color(255, 90, 90);
      } else if (state.status === 'submitting') {
        mask.fillColor = new Color(255, 215, 80, 80);
        mask.rect(-26, -26, 52, 52);
        mask.fill();

        cdLbl.node.active = false;
        countLbl.node.active = true;
        countLbl.string = `×${state.quantity}`;
        countLbl.color = new Color(255, 235, 120);
      } else {
        cdLbl.node.active = false;
        countLbl.node.active = true;
        countLbl.string = state.quantity > 0 ? `×${state.quantity}` : '';
        countLbl.color = new Color(220, 240, 255);
      }
    }

    // 2. Render Trinket Slot
    const tState: TrinketViewState = this.model.trinket;
    this.trinketMask.clear();

    if (tState.status === 'active') {
      skinSprite(this.trinketBorder, 'ui/slices/slot_border_legendary', true);
      this.trinketNameLabel.string = '生效中';
      this.trinketNameLabel.color = new Color(255, 235, 100);
      this.trinketCdLabel.string = `${tState.buffLeftSec.toFixed(1)}s`;
      this.trinketCdLabel.color = new Color(255, 240, 120);
    } else if (tState.status === 'cooldown' || tState.status === 'waiting') {
      skinSprite(this.trinketBorder, 'ui/slices/slot_border_epic', true);
      this.trinketMask.fillColor = new Color(10, 14, 20, 180);
      this.trinketMask.rect(-26, -26, 52, 52);
      this.trinketMask.fill();

      const sec = tState.status === 'waiting' ? tState.waitLeftSec : tState.cooldownLeftSec;
      this.trinketNameLabel.string = tState.status === 'waiting' ? '准备中' : '冷却';
      this.trinketNameLabel.color = new Color(180, 170, 190);
      this.trinketCdLabel.string = `${sec.toFixed(1)}s`;
      this.trinketCdLabel.color = new Color(255, 215, 80);
    } else if (tState.status === 'submitting') {
      skinSprite(this.trinketBorder, 'ui/slices/slot_border_epic', true);
      this.trinketMask.fillColor = new Color(255, 215, 80, 80);
      this.trinketMask.rect(-26, -26, 52, 52);
      this.trinketMask.fill();

      this.trinketNameLabel.string = '触发中';
      this.trinketCdLabel.string = '...';
    } else if (tState.status === 'unbound') {
      skinSprite(this.trinketBorder, 'ui/slices/slot_border_rough', true);
      this.trinketNameLabel.string = '未装备';
      this.trinketNameLabel.color = new Color(140, 140, 150);
      this.trinketCdLabel.string = '';
    } else {
      skinSprite(this.trinketBorder, 'ui/slices/slot_border_epic', true);
      this.trinketNameLabel.string = tState.name ? tState.name.slice(0, 2) : '荣耀';
      this.trinketNameLabel.color = new Color(230, 190, 255);
      this.trinketCdLabel.string = '就绪';
      this.trinketCdLabel.color = new Color(130, 240, 150);
    }
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
    tr.setContentSize(w, size + 4);
    const lbl = n.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = size;
    lbl.lineHeight = size + 2;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.overflow = Label.Overflow.SHRINK;
    lbl.color = new Color(230, 235, 240);
    parent.addChild(n);
    return lbl;
  }
}
