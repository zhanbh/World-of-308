import { Node, Graphics, Color, UITransform, Label, Mask, Vec3, EventTouch, EventMouse, sys, game, Game } from 'cc';
import type { BankCoordinator, BankCoordinatorState } from '../net/BankCoordinator';
import { InventoryGesture } from './InventoryGesture';
type Options = { contextId: string; nextOperationId: () => string; templateLabel: (id: string) => string; onVisibility: (visible: boolean) => void };
type Side = 'backpack' | 'vault';
const ROW = 60, CELL = 56, HEIGHT = 240;
/** Bank presentation: all inventory, prices and outcomes come from authenticated services. */
export class BankPanel {
    private root: Node;
    private status: Label;
    private titles: Record<Side, Label>;
    private content: Record<Side, Node>;
    private cells: Record<Side, { g: Graphics; label: Label }[]> = { backpack: [], vault: [] };
    private scroll: Record<Side, number> = { backpack: 0, vault: 0 };
    private gesture = new InventoryGesture();
    private source: Side | null = null;
    private tappedIndex: number | null = null;
    private state: BankCoordinatorState;
    private visible = false;
    private stamp = '';
    private modal: Node;
    private modalLabel: Label;
    private selected: { side: Side; target: { kind: 'stack'; stackId: string }; quantity: number; max: number; stamp: string } | null = null;
    private quantity = 1;
    private modalButtons: Node[] = [];
    private localError = '';
    private modalKind: 'quantity' | 'expand' | null = null;
    private buttonResets: Array<() => void> = [];
    private inputEpoch = 0;
    private browserPointer: 'mouse' | 'touch' = 'touch';
    private suppressMouseUntil = 0;
    private trackPointer = (e: PointerEvent): void => { this.browserPointer = e.pointerType === 'mouse' ? 'mouse' : 'touch'; };
    private releaseOutside = (e: PointerEvent): void => { if (e.isPrimary) { const epoch = this.inputEpoch; setTimeout(() => { if (epoch === this.inputEpoch) this.cancel(); }, 0); } };
    private cancelPointer = (e: PointerEvent): void => { if (e.isPrimary) this.cancel(); };
    private releaseOnReturn = (e: PointerEvent): void => { if (e.pointerType === 'mouse' && e.buttons === 0) this.cancel(); };
    private isMouseTouch(e: EventTouch): boolean { return e.simulate || (sys.isBrowser && this.browserPointer === 'mouse'); }
    constructor(parent: Node, private coordinator: BankCoordinator, private options: Options) {
        this.state = coordinator.state;
        this.root = this.node(parent, 'BankPanel', 0, 0, 960, 540);
        const bg = this.root.addComponent(Graphics); bg.fillColor = new Color(12, 19, 27); bg.rect(-480, -270, 960, 540); bg.fill();
        this.label(this.root, '银行 · 左库右包', 0, 238, 24, 650);
        this.button('关闭', 410, 238, () => this.close(), true, 90);
        this.button('个人金库', -300, 190, () => this.tab('personalVault'), true, 130);
        this.button('账号金库', -150, 190, () => this.tab('accountVault'), true, 130);
        this.titles = { vault: this.label(this.root, '', -215, 145, 18, 350), backpack: this.label(this.root, '', 215, 145, 18, 350) };
        this.content = {} as Record<Side, Node>;
        for (const side of ['vault', 'backpack'] as Side[]) {
            const x = side === 'vault' ? -215 : 215;
            const viewport = this.node(this.root, side + '-viewport', x, -5, 300, HEIGHT);
            viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
            this.content[side] = this.node(viewport, side + '-content', 0, 0, 300, 1200);
            for (let i = 0; i < 100; i++) {
                const n = this.node(this.content[side], side + '-slot-' + i, -120 + i % 5 * ROW, 90 - Math.floor(i / 5) * ROW, CELL, CELL);
                this.cells[side].push({ g: n.addComponent(Graphics), label: this.label(n, '', 0, 0, 12, 52, 52) });
            }
            this.button('↑', x + 178, 80, () => this.scrollBy(side, -ROW), true, 40);
            this.button('↓', x + 178, -100, () => this.scrollBy(side, ROW), true, 40);
            this.button('扩容 +20', x, -151, () => { void this.quote(side); }, false, 130);
        }
        this.status = this.label(this.root, '', 0, -196, 15, 920, 42);
        this.button('刷新', -250, -242, () => { if (!this.modalKind) void this.run(() => this.coordinator.open(this.options.contextId, this.state.vaultKind), true); }, true, 120);
        this.button('确认操作结果', 0, -242, () => { if (this.state.status === 'unknown') void this.run(() => this.coordinator.recover(), true); }, true, 150);
        this.button('继续此操作', 200, -242, () => { if (this.state.status === 'unknown') void this.run(() => this.coordinator.retryOriginal(), true); }, true, 140);
        this.modal = this.node(this.root, 'BankConfirmation', 0, 0, 620, 230);
        const mg = this.modal.addComponent(Graphics); mg.fillColor = new Color(24, 34, 46); mg.rect(-310, -115, 620, 230); mg.fill();
        this.modalLabel = this.label(this.modal, '', 0, 40, 20, 570, 100);
        // Modal buttons use the same pointer ownership rules as the grids.
        this.modalButton('−', -200, -20, () => { this.quantity = Math.max(1, this.quantity - 1); this.renderModal(); });
        this.modalButton('+', 200, -20, () => { if (this.selected) this.quantity = Math.min(this.selected.max, this.quantity + 1); this.renderModal(); });
        this.modalButton('确认 / 金币', -170, -80, () => this.confirm('gold'));
        this.modalButton('点券', 0, -80, () => this.confirm('points'));
        this.modalButton('取消', 170, -80, () => this.dismiss());
        this.modal.active = false; this.root.active = false;
        this.root.on(Node.EventType.TOUCH_START, this.touchStart, this); this.root.on(Node.EventType.TOUCH_MOVE, this.touchMove, this); this.root.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.root.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { if (!this.isMouseTouch(e) && this.gesture.state.id === e.getID()) this.cancel(); });
        this.root.on(Node.EventType.MOUSE_DOWN, this.mouseStart, this); this.root.on(Node.EventType.MOUSE_MOVE, this.mouseMove, this); this.root.on(Node.EventType.MOUSE_UP, this.mouseEnd, this); this.root.on(Node.EventType.MOUSE_WHEEL, this.mouseWheel, this);
        if (sys.isBrowser && typeof window !== 'undefined') {
            this.browserPointer = navigator.maxTouchPoints === 0 ? 'mouse' : 'touch';
            window.addEventListener('pointerdown', this.trackPointer, true); window.addEventListener('pointerup', this.releaseOutside, true); window.addEventListener('pointercancel', this.cancelPointer, true); window.addEventListener('pointermove', this.releaseOnReturn, true); window.addEventListener('blur', this.cancel);
        }
        game.on(Game.EVENT_HIDE, this.onHide, this);
    }
    get isOpen(): boolean { return this.visible; }
    async open(): Promise<void> { this.visible = true; this.root.active = true; this.root.setSiblingIndex(this.root.parent!.children.length - 1); this.options.onVisibility(true); await this.run(() => this.coordinator.open(this.options.contextId), true); }
    close(): void { this.dismiss(); this.cancel(); this.visible = false; this.root.active = false; this.coordinator.close(); this.options.onVisibility(false); }
    dispose(): void { this.close(); game.off(Game.EVENT_HIDE, this.onHide, this); if (sys.isBrowser && typeof window !== 'undefined') { window.removeEventListener('pointerdown', this.trackPointer, true); window.removeEventListener('pointerup', this.releaseOutside, true); window.removeEventListener('pointercancel', this.cancelPointer, true); window.removeEventListener('pointermove', this.releaseOnReturn, true); window.removeEventListener('blur', this.cancel); } this.root.destroy(); }
    update(): void {
        if (!this.visible) return;
        this.state = this.coordinator.state;
        const stamp = JSON.stringify([this.state.vaultKind, this.state.backpack?.containerId, this.state.backpack?.version, this.state.vault?.containerId, this.state.vault?.version]);
        if (stamp !== this.stamp) { this.cancel(); this.dismiss(); this.stamp = stamp; }
        this.gesture.updateHold(Date.now());
        for (const side of ['vault', 'backpack'] as Side[]) {
            const view = this.state[side];
            this.titles[side].string = `${side === 'backpack' ? '背包' : this.state.vaultKind === 'accountVault' ? '账号金库' : '个人金库'} · ${view ? view.slots.length + '/' + view.capacity : '待读取'}`;
            this.cells[side].forEach(({ g, label }, i) => {
                const entry = view?.slots.find(s => s.index === i)?.entry;
                g.clear(); g.fillColor = new Color(i >= (view?.capacity ?? 0) ? 30 : 43, 46, 58); g.rect(-28, -28, CELL, CELL); g.fill();
                label.string = !view ? '待读取' : i >= view.capacity ? '锁定' : !entry ? '空' : entry.kind === 'stack' ? `${this.options.templateLabel(entry.templateRef)}\n×${entry.quantity}` : `装备\nLv${entry.sortHeader.itemLevel}`;
            }); this.scrollBy(side, 0);
        }
        const wallet = this.state.wallet;
        this.status.string = `${this.localError ? this.localError + ' · ' : ''}${this.state.status === 'ready' ? '长按或鼠标拖动到另一侧；两侧独立滚动' : this.state.status}${this.state.code ? ' · ' + this.state.code : ''}${this.state.availableCapacity !== null && this.state.availableCapacity !== undefined ? ' · 可容纳 ' + this.state.availableCapacity : ''}${wallet ? ' · 金币 ' + wallet.gold + ' / 点券 ' + wallet.points : ''}`;
    }
    private ready(): boolean { return this.state.status === 'ready'; }
    private async run(action: () => Promise<unknown>, recovery = false): Promise<void> { if (!this.visible || (!recovery && !this.ready()) || ['submitting', 'loading'].includes(this.coordinator.state.status)) return; this.cancel(); this.localError = ''; try { const p = action(); this.update(); await p; } catch { this.localError = '操作暂未完成，请刷新或确认操作结果'; } finally { this.update(); } }
    private tab(kind: 'personalVault' | 'accountVault'): void { if (this.modalKind || !this.ready()) return; this.dismiss(); this.cancel(); this.scroll.vault = 0; void this.run(() => this.coordinator.switchTab(kind)); }
    private async quote(side: Side): Promise<void> { if (!this.ready() || this.modalKind) return; await this.run(async () => { const q = await this.coordinator.expansionQuote(side); if (q && this.visible) { this.modalKind = 'expand'; this.modal.active = true; this.renderModal(); } }); }
    private renderModal(): void {
        this.modalButtons[0].active = this.modalKind === 'quantity'; this.modalButtons[1].active = this.modalKind === 'quantity';
        this.modalButtons[2].getComponentInChildren(Label)!.string = this.modalKind === 'quantity' ? '确认转移' : '金币支付';
        this.modalButtons[2].active = this.modalKind === 'quantity' || !!this.coordinator.state.quote?.costs.some(c => c.currency === 'gold');
        this.modalButtons[3].active = this.modalKind === 'expand' && !!this.coordinator.state.quote?.costs.some(c => c.currency === 'points');
        this.modalLabel.string = this.modalKind === 'quantity' ? `转移数量：${this.quantity} / ${this.selected?.max}\n默认全部；取消不会修改物品` : `扩容至 ${this.coordinator.state.quote?.nextCapacity ?? '?'} 格\n${this.coordinator.state.quote?.costs.map(c => `${c.currency === 'gold' ? '金币' : '点券'} ${c.amount}`).join(' / ') ?? ''}`; }
    private dismiss(): void { this.selected = null; this.modalKind = null; if (this.modal) this.modal.active = false; }
    private confirm(currency: 'gold' | 'points'): void { if (!this.ready()) return; if (this.modalKind === 'quantity') { if (currency !== 'gold' || !this.selected || this.selected.stamp !== this.stamp) return; const s = this.selected, q = this.quantity; this.dismiss(); void this.run(() => this.coordinator.transfer(this.options.nextOperationId(), s.side, s.target, q)); } else if (this.modalKind === 'expand') { this.dismiss(); void this.run(() => this.coordinator.expand(this.options.nextOperationId(), currency)); } }
    private modalButton(value: string, x: number, y: number, action: () => void): void { const before = this.root; this.root = this.modal; this.button(value, x, y, action, true, 145); this.modalButtons.push(this.modal.children[this.modal.children.length - 1]); this.root = before; }
    private point(e: EventTouch | EventMouse): { x: number; y: number } { const p = e.getUILocation(); return this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0)); }
    private sideAt(p: { x: number; y: number }): Side | null { return p.y < -125 || p.y > 115 ? null : Math.abs(p.x + 215) <= 150 ? 'vault' : Math.abs(p.x - 215) <= 150 ? 'backpack' : null; }
    private start(id: number, p: { x: number; y: number }, mouse: boolean): void {
        if (!this.ready() || this.modalKind || this.gesture.state.id !== null) return; const side = this.sideAt(p); if (!side) return; if (mouse) this.cancel();
        const x = side === 'vault' ? -215 : 215, col = Math.floor((p.x - x + 150) / ROW), row = Math.floor((115 - p.y + this.scroll[side]) / ROW), index = row * 5 + col;
        if (col < 0 || col > 4 || index < 0 || index >= 100 || Math.abs(p.x - (x - 120 + col * ROW)) > CELL / 2 || Math.abs(p.y - (85 - row * ROW + this.scroll[side])) > CELL / 2) return;
        const entry = this.state[side]?.slots.find(s => s.index === index)?.entry;
        this.gesture.pointerStart({ id, ...p, mouse, timeMs: Date.now(), sourceIndex: index, sourceKey: entry ? entry.kind === 'stack' ? entry.stackId : entry.itemId : null, bagVersion: this.state[side]?.version ?? -1 });
        if (this.gesture.state.id === id) { this.source = side; this.tappedIndex = index; }
    }
    private move(id: number, p: { x: number; y: number }): void { const r = this.gesture.pointerMove(id, p.x, p.y, Date.now()); if (r.scrollDelta && this.source) this.scrollBy(this.source, r.scrollDelta); }
    private end(id: number, p: { x: number; y: number }): void {
        if (this.gesture.state.id !== id) return;
        const source = this.source, tappedIndex = this.tappedIndex, r = this.gesture.pointerEnd(id, p.x, p.y, Date.now());
        if (!r) return;
        this.source = null; this.tappedIndex = null;
        if (!source || !r || !this.ready() || this.modalKind) return;
        const view = this.coordinator.state[source], entry = view?.slots.find(s => s.index === r.sourceIndex)?.entry;
        if (r.mode === 'tap' && !entry && tappedIndex !== null && tappedIndex >= (view?.capacity ?? 100)) { void this.quote(source); return; }
        if (r.mode !== 'drag' || this.sideAt(p) === null || this.sideAt(p) === source || view?.version !== r.bagVersion || !entry || (entry.kind === 'stack' ? entry.stackId : entry.itemId) !== r.sourceKey) return;
        if (entry.kind === 'equipment') void this.run(() => this.coordinator.transfer(this.options.nextOperationId(), source, { kind: 'equipment', itemId: entry.itemId }, 1));
        else { this.selected = { side: source, target: { kind: 'stack', stackId: entry.stackId }, max: entry.quantity, quantity: entry.quantity, stamp: this.stamp }; this.quantity = entry.quantity; this.modalKind = 'quantity'; this.modal.active = true; this.renderModal(); }
    }
    private onHide = (): void => { this.cancel(); this.dismiss(); };
    private cancel = (): void => { ++this.inputEpoch; this.gesture.cancel(); this.source = null; this.tappedIndex = null; this.buttonResets.forEach(r => r()); };
    private touchStart = (e: EventTouch): void => { if (!this.isMouseTouch(e) && e.getID() !== null) { this.suppressMouseUntil = Date.now() + 500; this.start(e.getID()!, this.point(e), false); e.propagationStopped = true; } };
    private touchMove = (e: EventTouch): void => { if (!this.isMouseTouch(e) && e.getID() !== null) { this.move(e.getID()!, this.point(e)); e.propagationStopped = true; } };
    private touchEnd = (e: EventTouch): void => { if (!this.isMouseTouch(e) && e.getID() !== null) { this.end(e.getID()!, this.point(e)); e.propagationStopped = true; } };
    private mouseStart = (e: EventMouse): void => { if (e.getButton() === 0 && Date.now() >= this.suppressMouseUntil) this.start(-1, this.point(e), true); e.propagationStopped = true; };
    private mouseMove = (e: EventMouse): void => { if (Date.now() >= this.suppressMouseUntil) this.move(-1, this.point(e)); e.propagationStopped = true; };
    private mouseEnd = (e: EventMouse): void => { if (e.getButton() === 0 && Date.now() >= this.suppressMouseUntil) this.end(-1, this.point(e)); e.propagationStopped = true; };
    private mouseWheel = (e: EventMouse): void => { if (!this.modalKind) { const s = this.sideAt(this.point(e)); if (s) this.scrollBy(s, -e.getScrollY() * .25); } e.propagationStopped = true; };
    private scrollBy(side: Side, delta: number): void { this.scroll[side] = Math.max(0, Math.min(1200 - HEIGHT, this.scroll[side] + delta)); this.content[side].setPosition(0, this.scroll[side]); this.cells[side].forEach(({ g }, i) => { const y = 85 - Math.floor(i / 5) * ROW + this.scroll[side]; g.node.active = y + 28 > -125 && y - 28 < 115; }); }
    private node(parent: Node, name: string, x: number, y: number, width: number, height: number): Node { const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.setPosition(x, y); n.addComponent(UITransform).setContentSize(width, height); return n; }
    private label(parent: Node, value: string, x: number, y: number, size: number, width: number, height = 32): Label { const n = this.node(parent, 'Text', x, y, width, height); const label = n.addComponent(Label); label.string = value; label.fontSize = size; label.lineHeight = size + 4; label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER; label.overflow = Label.Overflow.SHRINK; label.color = new Color(236, 229, 208); return label; }
    private button(value: string, x: number, y: number, action: () => void, always = false, width = 126, mode: 'write' | 'refresh' | 'recovery' = 'write'): void {
        const n = this.node(this.root, value, x, y, width, 32); const g = n.addComponent(Graphics); g.fillColor = new Color(62, 78, 89); g.rect(-width / 2, -16, width, 32); g.fill(); this.label(n, value, 0, 0, 15, width - 4);

        let touchedUntil = 0;
        let touchId: number | null = null;
        let mousePressed = false;
        this.buttonResets.push(() => { touchId = null; mousePressed = false; });
        const inside = (event: EventTouch | EventMouse): boolean => { const p = this.point(event); return Math.abs(p.x - x) <= width / 2 && Math.abs(p.y - y) <= 16; };
        n.on(Node.EventType.TOUCH_START, (e: EventTouch) => { if (this.isMouseTouch(e) || e.getID() === null) return; this.cancel(); touchId = e.getID(); e.propagationStopped = true; });
        n.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { if (this.isMouseTouch(e)) return; touchId = null; e.propagationStopped = true; });
        n.on(Node.EventType.TOUCH_END, (e: EventTouch) => { if (this.isMouseTouch(e) || e.getID() === null) return; const pressed = touchId === e.getID(); touchId = null; touchedUntil = Date.now() + 500; e.propagationStopped = true; this.cancel(); if (pressed && inside(e) && (always || this.visible)) action(); });
        n.on(Node.EventType.MOUSE_DOWN, (e: EventMouse) => { this.cancel(); mousePressed = e.getButton() === 0; e.propagationStopped = true; });
        n.on(Node.EventType.MOUSE_UP, (e: EventMouse) => { const pressed = mousePressed; mousePressed = false; e.propagationStopped = true; this.cancel(); if (pressed && inside(e) && Date.now() >= touchedUntil && e.getButton() === 0 && (always || this.visible)) action(); });
    }
}
