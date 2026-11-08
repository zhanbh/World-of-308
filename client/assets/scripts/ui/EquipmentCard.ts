import { BlockInputEvents, Color, EventMouse, EventTouch, Graphics, Label, Mask, Node, UITransform, Vec3 } from 'cc';
import type { InventoryDetail } from './InventoryDetails';
import { detailBounds, equipmentLines, QUALITY_STYLE, SLOT_ICONS, SLOT_NAMES } from './InventoryPresentation';
import { skinSprite } from './UISkin';
import { InventoryGesture } from './InventoryGesture';

type Quality = keyof typeof QUALITY_STYLE;
/** Read-only equipment card. Closing it retires presentation; no operation is cancelled. */
export class EquipmentCard {
    private readonly root: Node;
    private card: Node | null = null;
    private anchor = { x: 0, y: 0 };
    private bounds = { x: 0, y: 0, width: 328, height: 220 };
    private header = '';
    private quality: Quality = 'white';
    private detail: InventoryDetail | null = null;
    private full = false;
    private content: Node | null = null;
    private viewport: Node | null = null;
    private scroll = 0;
    private maxScroll = 0;
    private pointer: { id: number; y: number } | null = null;
    private mouseY: number | null = null;
    private suppressedUntil = 0;
    private readonly dismissGesture = new InventoryGesture();
    constructor(parent: Node, private readonly name: (id: string) => string,
        private readonly retry: () => void, private readonly closed: () => void) {
        this.root = this.node(parent, 'EquipmentCardOverlay', 0, 0, 960, 540);
        this.root.addComponent(BlockInputEvents); this.root.active = false;
        this.root.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.root.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.root.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.root.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
            if (this.dismissGesture.state.id === e.getID()) this.dismissGesture.cancel();
            if (this.pointer?.id === e.getID()) this.pointer = null;
        }, this);
        this.root.on(Node.EventType.MOUSE_DOWN, this.mouseStart, this);
        this.root.on(Node.EventType.MOUSE_MOVE, this.mouseMove, this);
        this.root.on(Node.EventType.MOUSE_UP, this.mouseEnd, this);
        this.root.on(Node.EventType.MOUSE_WHEEL, this.wheel, this);
    }
    get isOpen(): boolean { return this.root.active; }
    open(header: string, quality: Quality, anchor: { x: number; y: number }, detail: InventoryDetail | null): void {
        this.header = header; this.quality = quality; this.anchor = anchor; this.full = false; this.scroll = 0;
        this.root.active = true; this.root.setSiblingIndex(this.root.parent!.children.length - 1);
        this.detail = detail; this.render();
    }
    update(detail: InventoryDetail | null): void {
        if (!this.isOpen || JSON.stringify(this.detail) === JSON.stringify(detail)) return;
        this.detail = detail; this.render();
    }
    close(): void { this.root.active = false; this.pointer = null; this.mouseY = null; this.dismissGesture.cancel(); this.closed(); }
    dispose(): void { this.root.destroy(); }
    private render(): void {
        for (const child of [...this.root.children]) { child.removeFromParent(); child.destroy(); }
        this.content = this.viewport = null; this.pointer = null; this.mouseY = null;
        this.dismissGesture.cancel();
        this.bounds = detailBounds(this.anchor, this.full);
        const r = this.bounds;
        this.card = this.node(this.root, 'EquipmentCard', r.x, r.y, r.width, r.height);
        skinSprite(this.card, 'ui/slices/panel_window_frame', true);
        const item = this.detail?.item;
        const resolved = item ? this.name(item.templateRef) : this.header;
        const title = item && resolved === item.templateRef ? this.header : resolved;
        this.label(this.card, this.full && item ? SLOT_NAMES[item.slotKind] + ' · 装备详情' : title, 0, r.height / 2 - 42, r.width - 32, 64, 21, QUALITY_STYLE[this.quality].color);
        if (this.full && item) {
            const height = r.height - 166;
            this.viewport = this.node(this.card, 'EquipmentDetailViewport', 0, -6, r.width - 32, height);
            this.viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
            this.content = this.node(this.viewport, 'EquipmentDetailContent', 0, height / 2, r.width - 40, 1000);
            this.content.getComponent(UITransform)!.setAnchorPoint(.5, 1);
            let y = 0;
            for (const line of [{ text: title, color: QUALITY_STYLE[this.quality].color }, ...equipmentLines(item, this.name)]) {
                const label = this.label(this.content, line.text, 0, -y, r.width - 48, 30, 18, line.color);
                label.node.getComponent(UITransform)!.setAnchorPoint(.5, 1);
                label.overflow = Label.Overflow.RESIZE_HEIGHT; label.updateRenderData(true);
                y += Math.max(26, label.node.getComponent(UITransform)!.height) + 8;
            }
            this.maxScroll = Math.max(0, y - height); this.scrollBy(0);
            this.button(this.card, '↑ 上移', -140, -r.height / 2 + 32, 116, () => this.scrollBy(-150));
            this.button(this.card, '↓ 下移', -12, -r.height / 2 + 32, 116, () => this.scrollBy(150));
            this.button(this.card, '关闭', 130, -r.height / 2 + 32, 116, () => this.close());
        } else {
            if (item) {
                const icon = this.node(this.card, 'EquipmentIcon', -r.width / 2 + 40, 4, 48, 48);
                skinSprite(icon, 'icons/' + SLOT_ICONS[item.slotKind] + '_48');
            }
            const lines = item ? equipmentLines(item, this.name).filter(line => !line.text.includes('来源')).slice(0, 3).map(line => line.text).join('\n')
                : this.detail?.status === 'failed' ? '装备详情暂时无法读取\n请重试' : '正在读取装备详情…';
            this.label(this.card, lines, item ? 30 : 0, -6, item ? r.width - 100 : r.width - 32, 78, 17, '#8fa2af');
            this.button(this.card, item ? '完整详情' : this.detail?.status === 'failed' ? '重试' : '读取中…', -62, -r.height / 2 + 32, 176,
                () => { if (item) { this.full = true; this.render(); } else this.retry(); }, !!item || this.detail?.status === 'failed');
            this.button(this.card, '关闭', 100, -r.height / 2 + 32, 116, () => this.close());
        }
    }
    private scrollBy(delta: number): void {
        this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + delta));
        const h = this.viewport?.getComponent(UITransform)!.height ?? 0;
        this.content?.setPosition(0, h / 2 + this.scroll);
    }
    private position(event: EventTouch | EventMouse, node = this.root): Vec3 {
        const p = event.getUILocation(); return node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    }
    private inside(event: EventTouch | EventMouse, node: Node): boolean {
        const p = this.position(event, node), t = node.getComponent(UITransform)!;
        return Math.abs(p.x) <= t.width / 2 && Math.abs(p.y) <= t.height / 2;
    }
    private touchStart(e: EventTouch): void {
        this.suppressedUntil = Date.now() + 500;
        const id = e.getID(), p = this.position(e);
        if (id !== null) this.dismissGesture.pointerStart({ id, x: p.x, y: p.y, timeMs: Date.now(), sourceIndex: null, sourceKey: null, bagVersion: null, mouse: false });
        if (this.viewport && this.inside(e, this.viewport) && this.dismissGesture.state.id === id && id !== null) this.pointer = { id, y: p.y };
        e.propagationStopped = true;
    }
    private touchMove(e: EventTouch): void {
        const id = e.getID(), p = this.position(e);
        if (id !== null) this.dismissGesture.pointerMove(id, p.x, p.y, Date.now());
        if (this.pointer?.id === e.getID()) { const y = this.position(e).y; this.scrollBy(y - this.pointer.y); this.pointer.y = y; }
        e.propagationStopped = true;
    }
    private touchEnd(e: EventTouch): void {
        const id = e.getID(), p = this.position(e);
        const result = id === null ? null : this.dismissGesture.pointerEnd(id, p.x, p.y, Date.now());
        if (this.pointer?.id === e.getID()) this.pointer = null;
        if (result?.mode === 'tap' && this.card && !this.inside(e, this.card)) this.close();
        e.propagationStopped = true;
    }
    private mouseStart(e: EventMouse): void {
        if (Date.now() >= this.suppressedUntil && e.getButton() === 0) {
            const p = this.position(e);
            this.dismissGesture.pointerStart({ id: 'mouse', x: p.x, y: p.y, timeMs: Date.now(), sourceIndex: null, sourceKey: null, bagVersion: null, mouse: true });
            if (this.viewport && this.inside(e, this.viewport) && this.dismissGesture.state.id === 'mouse') this.mouseY = p.y;
        }
        e.propagationStopped = true;
    }
    private mouseMove(e: EventMouse): void {
        const p = this.position(e); this.dismissGesture.pointerMove('mouse', p.x, p.y, Date.now());
        if (this.mouseY !== null) { const y = this.position(e).y; this.scrollBy(y - this.mouseY); this.mouseY = y; }
        e.propagationStopped = true;
    }
    private mouseEnd(e: EventMouse): void {
        this.mouseY = null;
        const p = this.position(e), result = this.dismissGesture.pointerEnd('mouse', p.x, p.y, Date.now());
        if (Date.now() >= this.suppressedUntil && result?.mode === 'tap' && this.card && !this.inside(e, this.card)) this.close();
        e.propagationStopped = true;
    }
    private wheel(e: EventMouse): void { if (this.viewport && this.inside(e, this.viewport)) this.scrollBy(-e.getScrollY() / 3); e.propagationStopped = true; }
    private node(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.setPosition(x, y);
        n.addComponent(UITransform).setContentSize(width, height); return n;
    }
    private label(parent: Node, text: string, x: number, y: number, width: number, height: number, size: number, color: string): Label {
        const l = this.node(parent, 'Text', x, y, width, height).addComponent(Label);
        l.string = text; l.fontSize = size; l.lineHeight = size + 5; l.color = new Color().fromHEX(color);
        l.horizontalAlign = Label.HorizontalAlign.LEFT; l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.CLAMP; l.enableWrapText = true; return l;
    }
    private button(parent: Node, text: string, x: number, y: number, width: number, action: () => void, enabled = true): void {
        const n = this.node(parent, text, x, y, width, 48);
        skinSprite(n, 'ui/slices/button_' + (enabled ? 'normal' : 'disabled'), true);
        const l = this.label(n, text, 0, 0, width - 8, 40, 17, enabled ? '#e2ebef' : '#596e7c');
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        let touch: number | null = null, mouse = false, until = 0;
        n.on(Node.EventType.TOUCH_START, (e: EventTouch) => { touch = enabled ? e.getID() : null; e.propagationStopped = true; });
        n.on(Node.EventType.TOUCH_END, (e: EventTouch) => { const pressed = touch !== null && touch === e.getID(); touch = null; until = Date.now() + 500; e.propagationStopped = true; if (pressed && this.inside(e, n)) action(); });
        n.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { touch = null; e.propagationStopped = true; });
        n.on(Node.EventType.MOUSE_DOWN, (e: EventMouse) => { mouse = enabled && e.getButton() === 0; e.propagationStopped = true; });
        n.on(Node.EventType.MOUSE_UP, (e: EventMouse) => { const pressed = mouse; mouse = false; e.propagationStopped = true; if (pressed && Date.now() >= until && this.inside(e, n)) action(); });
    }
}
