import { Node, Color, UITransform, Label } from 'cc';
import { skinSprite } from './UISkin';

export class PlayerStatusHUD {
  private readonly root: Node;
  private readonly wellNode: Node;

  private readonly hpTrackNode: Node;
  private readonly hpFillNode: Node;
  private readonly hpFillTransform: UITransform;
  private readonly hpTextLabel: Label;

  private readonly mpTrackNode: Node;
  private readonly mpFillNode: Node;
  private readonly mpFillTransform: UITransform;
  private readonly mpTextLabel: Label;

  private readonly levelBadgeLabel: Label;

  constructor(parent: Node, x = -390, y = 150) {
    this.root = this.node(parent, 'PlayerStatusHUD', 0, 0, 960, 540);

    // Well background container (214 x 54)
    this.wellNode = this.node(this.root, 'StatusWell', x + 85, y, 214, 54);
    skinSprite(this.wellNode, 'ui/slices/panel_well_inner', true);

    // HP Bar Track
    this.hpTrackNode = this.node(this.wellNode, 'HpTrack', 0, 9, 186, 16);
    skinSprite(this.hpTrackNode, 'ui/slices/bar_track_bg', true);

    // HP Fill (anchored left)
    this.hpFillNode = this.node(this.hpTrackNode, 'HpFill', -91, 0, 182, 12);
    this.hpFillTransform = this.hpFillNode.getComponent(UITransform)!;
    this.hpFillTransform.setAnchorPoint(0, 0.5);
    skinSprite(this.hpFillNode, 'ui/slices/bar_fill_hp', true);

    // HP Text Label
    this.hpTextLabel = this.label(this.hpTrackNode, 'HP 100 / 100', 0, 0, 10, 180);
    this.hpTextLabel.color = new Color(255, 245, 245);

    // MP Bar Track
    this.mpTrackNode = this.node(this.wellNode, 'MpTrack', 0, -10, 186, 14);
    skinSprite(this.mpTrackNode, 'ui/slices/bar_track_bg', true);

    // MP Fill (anchored left)
    this.mpFillNode = this.node(this.mpTrackNode, 'MpFill', -91, 0, 182, 10);
    this.mpFillTransform = this.mpFillNode.getComponent(UITransform)!;
    this.mpFillTransform.setAnchorPoint(0, 0.5);
    skinSprite(this.mpFillNode, 'ui/slices/bar_fill_mp', true);

    // MP Text Label
    this.mpTextLabel = this.label(this.mpTrackNode, 'MP 100 / 100', 0, 0, 9, 180);
    this.mpTextLabel.color = new Color(220, 245, 255);

    // Level Badge at left
    this.levelBadgeLabel = this.label(this.wellNode, 'Lv.1 鬼剑士', 0, 28, 11, 200);
    this.levelBadgeLabel.color = new Color(255, 220, 120);
  }

  public setVisible(visible: boolean): void {
    this.root.active = visible;
  }

  public update(hp: number, maxHp: number, mp: number, maxMp: number, level = 1): void {
    const hpClamped = Math.max(0, Math.min(maxHp, hp));
    const hpRatio = maxHp > 0 ? hpClamped / maxHp : 0;
    const hpWidth = Math.max(2, 182 * hpRatio);
    this.hpFillTransform.setContentSize(hpWidth, 12);
    this.hpTextLabel.string = `HP ${Math.round(hpClamped)} / ${maxHp}`;

    const mpClamped = Math.max(0, Math.min(maxMp, mp));
    const mpRatio = maxMp > 0 ? mpClamped / maxMp : 0;
    const mpWidth = Math.max(2, 182 * mpRatio);
    this.mpFillTransform.setContentSize(mpWidth, 10);
    this.mpTextLabel.string = `MP ${Math.round(mpClamped)} / ${maxMp}`;

    this.levelBadgeLabel.string = `Lv.${level} 狂战士`;
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
