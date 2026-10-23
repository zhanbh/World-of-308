import { Node, Graphics, Color, UITransform, Label, Mask, Vec3, EventTouch, EventMouse, sys, game, Game } from 'cc';
import type { InventoryCoordinator, InventoryCoordinatorState } from '../net/InventoryCoordinator';
import { InventoryGesture } from './InventoryGesture';

type Options = { nextOperationId: () => string; templateLabel: (id: string) => string; canAssign: (id: string) => boolean; onVisibility: (visible: boolean) => void };
type Entry = NonNullable<InventoryCoordinatorState['backpack']>['slots'][number]['entry'];
const CELL = 64, ROW = 68, LEFT = -342, VIEW_HEIGHT = 272;
/** Cocos presentation only. Every visible result comes from the coordinator's authoritative view. */
export class InventoryPanel {
    private readonly root: Node;
    private readonly content: Node;
    private readonly status: Label;
    private readonly gridLabels: Label[] = [];
    private readonly gridGraphics: Graphics[] = [];
    private readonly quickLabels: Label[] = [];
    private readonly ghost: Label;
    private readonly controls: Array<{ node: Node; width: number; always: boolean; mode: 'write' | 'refresh' | 'recovery' }> = [];
    private readonly gesture = new InventoryGesture();
    private expansionModal: Node;
    private expansionText: Label;
    private expansionOpen = false;
    private tappedIndex: number | null = null;
    private visible = false;
    private scroll = 0;
    private rendered = '';
    private bagStamp = '';
    private state: InventoryCoordinatorState;
    private localError = '';
    private pointerPosition = { x: 0, y: 0 };
    private suppressMouseUntil = 0;
    private inputEpoch = 0;
    private buttonResets: Array<() => void> = [];
    private releaseOutside = (event: PointerEvent): void => { if (!event.isPrimary) return; const epoch = this.inputEpoch; setTimeout(() => { if (epoch === this.inputEpoch) this.cancel(); }, 0); };
    private cancelPointer = (event: PointerEvent): void => { if (event.isPrimary) this.cancel(); };
    private releaseOnReturn = (event: PointerEvent): void => { if (event.pointerType === 'mouse' && event.buttons === 0) this.cancel(); };
    private browserPointer: 'mouse' | 'touch' = 'touch';
    private trackPointer = (event: PointerEvent): void => { this.browserPointer = event.pointerType === 'mouse' ? 'mouse' : 'touch'; };
    private isMouseTouch(event: EventTouch): boolean { return event.simulate || (sys.isBrowser && this.browserPointer === 'mouse'); }
    constructor(parent: Node, private readonly coordinator: InventoryCoordinator, private readonly options: Options) {
        if (!Mask) throw new Error('MASK_MODULE_REQUIRED');
        if (sys.isBrowser && typeof window !== 'undefined') {
            this.browserPointer = navigator.maxTouchPoints === 0 ? 'mouse' : 'touch';
            window.addEventListener('pointerdown', this.trackPointer, true);
            window.addEventListener('pointerup', this.releaseOutside, true);
            window.addEventListener('pointercancel', this.cancelPointer, true);
            window.addEventListener('pointermove', this.releaseOnReturn, true);
            window.addEventListener('blur', this.cancel);
        }
        game.on(Game.EVENT_HIDE, this.onHide, this);
        this.state = coordinator.state;
        this.root = this.node(parent, 'InventoryPanel', 0, 0, 960, 540);
        this.root.active = false;
        const shade = this.root.addComponent(Graphics); shade.fillColor = new Color(9, 14, 22, 255); shade.rect(-480, -270, 960, 540); shade.fill();
        this.label(this.root, '背包 · 整理与快捷位', -50, 226, 26, 700);
        this.button('关闭', 403, 226, () => this.close(), true);
        this.status = this.label(this.root, '', 0, 179, 16, 900);
        const viewport = this.node(this.root, 'InventoryViewport', -206, -34, 340, VIEW_HEIGHT);
        viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.content = this.node(viewport, 'InventoryContent', 0, 0, 340, 1360);
        for (let index = 0; index < 100; index++) {
            const cell = this.node(this.content, `Slot-${index}`, -136 + index % 5 * ROW, 102 - Math.floor(index / 5) * ROW, CELL, CELL);
            this.gridGraphics.push(cell.addComponent(Graphics));
            this.gridLabels.push(this.label(cell, '', 0, 0, 12, 60, 58));
        }
        this.label(this.root, '道具快捷位', 226, 115, 20, 260);
        for (let index = 0; index < 3; index++) {
            this.quickLabels.push(this.label(this.root, '', 213, 52 - index * 82, 15, 220, 50));
            this.button('清空', 391, 52 - index * 82, () => this.run(() => this.coordinator.assign(this.options.nextOperationId(), index, null)));
        }
        this.label(this.root, '触屏：长按物品后拖入快捷位\n上下滑动背包；鼠标拖动道具', 228, -190, 14, 340, 54);
        this.button('↑', -406, 90, () => this.scrollBy(-ROW), true, 44);
        this.button('↓', -406, -128, () => this.scrollBy(ROW), true, 44);
        this.button('正序整理', -280, -218, () => this.run(() => this.coordinator.organize(this.options.nextOperationId(), 'forward')));
        this.button('倒序整理', -142, -218, () => this.run(() => this.coordinator.organize(this.options.nextOperationId(), 'reverse')));
        this.button('刷新视图', -6, -218, () => { if (this.state.status !== 'unknown') this.run(() => this.coordinator.open(), true); }, false, 126, 'refresh');
        this.button('确认操作结果', 140, -252, () => { if (this.state.status === 'unknown') this.run(() => this.coordinator.recover(), true); }, false, 126, 'recovery');
        this.button('继续此操作', 306, -252, () => { if (this.state.status === 'unknown') this.run(() => this.coordinator.retryOriginal(), true); }, false, 126, 'recovery');
        this.button('扩容 +20', 0, 134, () => { void this.quoteExpansion(); }, false, 126);
        this.expansionModal = this.node(this.root, 'BackpackExpansionConfirmation', 0, 0, 620, 230);
        const quoteBg = this.expansionModal.addComponent(Graphics); quoteBg.fillColor = new Color(24, 34, 46); quoteBg.rect(-310, -115, 620, 230); quoteBg.fill();
        this.expansionText = this.label(this.expansionModal, '', 0, 32, 21, 570, 110);
        this.button('金币支付', -120, -65, () => { if (!this.expansionOpen) return; this.dismissExpansion(); void this.run(() => this.coordinator.expand(this.options.nextOperationId())); }, true, 150, 'write', this.expansionModal);
        this.button('取消', 120, -65, () => this.dismissExpansion(), true, 150, 'write', this.expansionModal);
        this.expansionModal.active = false;
        this.ghost = this.label(this.root, '', 0, 0, 16, 150, 50); this.ghost.node.active = false;
        this.root.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.root.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.root.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.root.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { if (!this.isMouseTouch(e) && this.gesture.state.id === e.getID()) this.cancel(); }, this);
        this.root.on(Node.EventType.MOUSE_DOWN, this.mouseStart, this);
        this.root.on(Node.EventType.MOUSE_MOVE, this.mouseMove, this);
        this.root.on(Node.EventType.MOUSE_UP, this.mouseEnd, this);
        this.root.on(Node.EventType.MOUSE_WHEEL, this.mouseWheel, this);
        this.root.active = false;
        this.scrollBy(0);
    }
    get isOpen(): boolean { return this.visible; }
    async open(): Promise<void> {
        this.visible = true; this.root.active = true; this.root.setSiblingIndex(this.root.parent!.children.length - 1);
        this.options.onVisibility(true); this.localError = ''; this.update();
        try { await this.coordinator.open(); } catch { this.localError = '暂时无法读取背包，请刷新重试'; }
        this.update();
    }
    close(): void { this.dismissExpansion(); this.cancel(); this.visible = false; this.root.active = false; this.coordinator.close(); this.options.onVisibility(false); }
    dispose(): void { this.close(); game.off(Game.EVENT_HIDE, this.onHide, this); if (sys.isBrowser && typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', this.trackPointer, true); window.removeEventListener('pointerup', this.releaseOutside, true); window.removeEventListener('pointercancel', this.cancelPointer, true); window.removeEventListener('pointermove', this.releaseOnReturn, true); window.removeEventListener('blur', this.cancel);
    } this.root.destroy(); }
    update(): void {
        if (!this.visible) return;
        this.state = this.coordinator.state;
        const stamp = `${this.state.backpack?.containerId}:${this.state.backpack?.version}`;
        if (stamp !== this.bagStamp) { this.dismissExpansion(); this.cancel(); this.bagStamp = stamp; }
        this.gesture.updateHold(Date.now());
        this.ghost.node.active = this.gesture.state.mode === 'drag';
        if (this.ghost.node.active) { this.ghost.string = '拖入道具快捷位'; this.ghost.node.setPosition(this.pointerPosition.x, this.pointerPosition.y + 30); }
        const key = JSON.stringify([this.state, this.localError]);
        if (key === this.rendered) return;
        this.rendered = key; this.render();
    }
    private render(): void {
        const s = this.state, bag = s.backpack;
        const captions: Record<InventoryCoordinatorState['status'], string> = { closed: '背包已关闭', loading: '正在读取背包…', ready: '拖动道具绑定快捷位', empty: '背包为空', submitting: '正在处理，请稍候…', unknown: '正在确认操作结果，请查询进度或继续此操作', failed: '读取或操作失败：请刷新视图' };
        this.status.string = this.localError || `${captions[s.status]}${bag ? ` · ${bag.slots.length}/${bag.capacity}（上限100）` : ''}${s.lastMergeCount !== null ? ` · 上次合并${s.lastMergeCount}堆` : ''}`;
        for (const control of this.controls) {
            control.node.active = control.mode !== 'recovery' || s.status === 'unknown';
            const enabled = control.always || (control.mode === 'write' ? this.ready() : control.mode === 'refresh' ? ['ready', 'empty', 'failed'].includes(s.status) : s.status === 'unknown');
            const g = control.node.getComponent(Graphics)!; g.clear(); g.fillColor = enabled ? new Color(62, 78, 89) : new Color(31, 39, 46); g.rect(-control.width / 2, -16, control.width, 32); g.fill();
            control.node.getComponentInChildren(Label)!.color = enabled ? new Color(236, 229, 208) : new Color(119, 126, 130);
        }
        for (let index = 0; index < 100; index++) {
            const entry = bag?.slots.find(slot => slot.index === index)?.entry;
            const locked = bag !== null && index >= bag.capacity;
            const g = this.gridGraphics[index]; g.clear(); g.fillColor = locked ? new Color(33, 35, 41) : new Color(44, 56, 65); g.rect(-32, -32, 64, 64); g.fill();
            g.strokeColor = new Color(115, 124, 120); g.rect(-32, -32, 64, 64); g.stroke();
            this.gridLabels[index].string = !bag ? '待读取' : locked ? '未开放' : entry?.kind === 'stack' ? `${this.options.templateLabel(entry.templateRef)}\n×${entry.quantity}` : entry?.kind === 'equipment' ? `装备\nLv${entry.sortHeader.itemLevel}` : '空';
        }
        for (let index = 0; index < 3; index++) {
            const slot = s.quickSlots?.slots.find(slot => slot.slotIndex === index);
            this.quickLabels[index].string = !s.quickSlots ? `${index + 1} · 待读取` : slot?.templateId ? `${index + 1} · ${this.options.templateLabel(slot.templateId)}\n数量 ${slot.quantity}${slot.quantity === 0 ? '（耗尽，保留绑定）' : ''}` : `${index + 1} · 未绑定`;
        }
    }
    private ready(): boolean { return ['ready', 'empty'].includes(this.state.status); }
    private async run(action: () => Promise<void>, recovery = false): Promise<void> {
        if (!this.visible || this.expansionOpen || (!recovery && !this.ready()) || this.state.status === 'submitting' || this.state.status === 'loading') return;
        this.cancel(); this.localError = '';
        try { const promise = action(); this.update(); await promise; } catch { this.localError = '操作未完成，请刷新视图后重试'; }
        this.update();
    }
    private dismissExpansion(): void { this.expansionOpen = false; if (this.expansionModal) this.expansionModal.active = false; }
    private async quoteExpansion(): Promise<void> {
        if (!this.ready() || this.expansionOpen) return;
        await this.run(async () => { const q = await this.coordinator.expansionQuote(); if (!q || !this.visible) return;
            this.expansionOpen = true; this.expansionModal.active = true; this.expansionModal.setSiblingIndex(this.root.children.length - 1);
            this.expansionText.string = `背包扩容：${q.nextCapacity - 20} → ${q.nextCapacity} 格\n金币 ${q.costs.find(c => c.currency === 'gold')?.amount ?? '?'}\n取消不会扣款`;
        });
    }
    private point(event: EventTouch | EventMouse): { x: number; y: number } {
        const p = event.getUILocation(); const local = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
        return { x: local.x, y: local.y };
    }
    private sourceAt(x: number, y: number): number | null {
        if (x < LEFT - 32 || x > LEFT - 32 + 340 || y > 102 || y < -170) return null;
        const col = Math.floor((x - LEFT + 32) / ROW), row = Math.floor((102 - y + this.scroll) / ROW);
        const index = row * 5 + col;
        if (Math.abs(x - (LEFT + col * ROW)) > CELL / 2 || Math.abs(y - (68 - row * ROW + this.scroll)) > CELL / 2) return null;
        return col >= 0 && col < 5 && index >= 0 && index < 100 ? index : null;
    }
    private entryKey(entry?: Entry): string | null { return !entry ? null : entry.kind === 'stack' ? entry.stackId : entry.itemId; }
    private start(id: number, p: { x: number; y: number }, mouse: boolean): void {
        if (!this.ready() || this.expansionOpen || this.gesture.state.id !== null || p.x < -376 || p.x > -36 || p.y < -170 || p.y > 102) return;
        if (mouse && this.gesture.state.id === -1) this.cancel();
        const sourceIndex = this.sourceAt(p.x, p.y);
        const entry = this.state.backpack?.slots.find(slot => slot.index === sourceIndex)?.entry;
        this.gesture.pointerStart({ id, ...p, timeMs: Date.now(), sourceIndex, sourceKey: this.entryKey(entry), bagVersion: this.state.backpack?.version ?? -1, mouse });
        if (this.gesture.state.id === id) this.tappedIndex = sourceIndex;
        this.pointerPosition = p;
    }
    private move(id: number, p: { x: number; y: number }): void { this.pointerPosition = p; const move = this.gesture.pointerMove(id, p.x, p.y, Date.now()); if (move.scrollDelta) this.scrollBy(move.scrollDelta); this.update(); }
    private end(id: number, p: { x: number; y: number }): void {
        if (this.gesture.state.id !== id) return;
        const tappedIndex = this.tappedIndex;
        const result = this.gesture.pointerEnd(id, p.x, p.y, Date.now()); this.ghost.node.active = false;
        this.state = this.coordinator.state;
        if (!result) return;
        this.tappedIndex = null;
        if (result.mode === 'tap' && tappedIndex !== null && tappedIndex >= (this.state.backpack?.capacity ?? 100)) { void this.quoteExpansion(); return; }
        if (result.mode !== 'drag' || !this.ready()) return;
        const bag = this.coordinator.state.backpack;
        const entry = bag?.slots.find(slot => slot.index === result.sourceIndex)?.entry;
        if (bag?.version !== result.bagVersion || this.entryKey(entry) !== result.sourceKey || entry?.kind !== 'stack' || !this.options.canAssign(entry.templateRef)) return;
        const target = [52, -30, -112].findIndex(y => Math.abs(p.y - y) <= 30 && p.x >= 103 && p.x <= 323);
        if (target >= 0) void this.run(() => this.coordinator.assign(this.options.nextOperationId(), target, entry.templateRef));
    }
    private onHide = (): void => { this.cancel(); this.dismissExpansion(); };
    private cancel = (): void => { ++this.inputEpoch; this.gesture.cancel(); this.tappedIndex = null; for (const reset of this.buttonResets) reset(); if (this.ghost) this.ghost.node.active = false; };
    private touchStart = (e: EventTouch): void => { if (this.isMouseTouch(e) || e.getID() === null) return; this.suppressMouseUntil = Date.now() + 500; this.start(e.getID()!, this.point(e), false); e.propagationStopped = true; };
    private touchMove = (e: EventTouch): void => { if (this.isMouseTouch(e) || e.getID() === null) return; this.move(e.getID()!, this.point(e)); e.propagationStopped = true; };
    private touchEnd = (e: EventTouch): void => { if (this.isMouseTouch(e) || e.getID() === null) return; this.end(e.getID()!, this.point(e)); e.propagationStopped = true; };
    private mouseStart = (e: EventMouse): void => { if (Date.now() >= this.suppressMouseUntil && e.getButton() === 0) this.start(-1, this.point(e), true); e.propagationStopped = true; };
    private mouseMove = (e: EventMouse): void => { if (Date.now() >= this.suppressMouseUntil) this.move(-1, this.point(e)); e.propagationStopped = true; };
    private mouseEnd = (e: EventMouse): void => { if (Date.now() >= this.suppressMouseUntil && e.getButton() === 0) this.end(-1, this.point(e)); e.propagationStopped = true; };
    private mouseWheel = (e: EventMouse): void => { const p = this.point(e); if (p.x >= -376 && p.x <= -36 && p.y >= -170 && p.y <= 102) this.scrollBy(-e.getScrollY() * 0.25); e.propagationStopped = true; };
    private scrollBy(delta: number): void {
        this.scroll = Math.max(0, Math.min(20 * ROW - VIEW_HEIGHT, this.scroll + delta)); this.content.setPosition(0, this.scroll);
        this.gridGraphics.forEach((g, index) => { const y = 68 - Math.floor(index / 5) * ROW + this.scroll; g.node.active = y + 32 > -170 && y - 32 < 102; });
    };
    private node(parent: Node, name: string, x: number, y: number, width: number, height: number): Node { const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.setPosition(x, y); n.addComponent(UITransform).setContentSize(width, height); return n; }
    private label(parent: Node, value: string, x: number, y: number, size: number, width: number, height = 32): Label { const n = this.node(parent, 'Text', x, y, width, height); const label = n.addComponent(Label); label.string = value; label.fontSize = size; label.lineHeight = size + 4; label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER; label.overflow = Label.Overflow.SHRINK; label.color = new Color(236, 229, 208); return label; }
    private button(value: string, x: number, y: number, action: () => void, always = false, width = 126, mode: 'write' | 'refresh' | 'recovery' = 'write', parent: Node = this.root): void {
        const n = this.node(parent, value, x, y, width, 32); const g = n.addComponent(Graphics); g.fillColor = new Color(62, 78, 89); g.rect(-width / 2, -16, width, 32); g.fill(); this.label(n, value, 0, 0, 15, width - 4);
        this.controls.push({ node: n, width, always, mode });
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
