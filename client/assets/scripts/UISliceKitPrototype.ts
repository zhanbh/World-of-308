import './polyfill';
import { _decorator, Component, Node, UITransform, Graphics, Color, Label, Sprite, SpriteFrame,
    Texture2D, ImageAsset, resources, Mask, Vec3, input, Input, EventTouch, EventMouse,
    EventKeyboard, KeyCode, view, ResolutionPolicy, game, Game, director, sys, profiler } from 'cc';
import { cardRect, contains, controlContains, geometryReport, hudControls, percentile,
    type KitControl, type KitPoint, type KitRect } from './ui/UISliceKitLayout';

// Isolated, in-memory candidate sample: validate the accepted draft, not alternative art directions.
// No backend, account, inventory mutation, combat clock, or authoritative damage is involved.
const { ccclass } = _decorator;
const C = { bg: '#10181e', panel: '#19252e', steel: '#5b7c8e', text: '#e2ebef', sub: '#8fa2af',
    gold: '#fbc02d', green: '#69f0ae', red: '#ff5252', blue: '#2b82c9' };
const QUALITY = ['rough', 'fine', 'rare', 'unique', 'legendary', 'epic'];
const QUALITY_NAMES = ['粗糙', '优秀', '精良', '稀有', '传说', '史诗'];
const QUALITY_COLORS = ['#b0bec5', '#66bb6a', '#29b6f6', '#ab47bc', '#ffa726', '#ff1744'];
type Item = { name: string; icon: string; quality: number; enhance: number; durability: number | null; count?: number; long?: boolean };
const ITEMS: Item[] = [
    { name: '狂暴冷钢双刀', icon: 'weapon_dual_blades', quality: 3, enhance: 10, durability: 120 },
    { name: '幽暗精钢胸甲', icon: 'armor_chest', quality: 2, enhance: 7, durability: 54 },
    { name: '生命药剂', icon: 'consumable_hp_potion', quality: 0, enhance: 0, durability: null, count: 20 },
    { name: '被遗忘的远古守望者·裂隙余烬冷钢双刀', icon: 'weapon_dual_blades', quality: 4, enhance: 15, durability: 0, long: true },
    { name: '新兵训练胸甲', icon: 'armor_chest', quality: 1, enhance: 0, durability: 120 },
    { name: '星陨战甲', icon: 'armor_chest', quality: 5, enhance: 12, durability: 24 },
];
type Button = KitRect & { label: string; action: () => void; node: Node; enabled: boolean; popup: boolean };
type Pointer = { target: string; start: KitPoint; last: KitPoint; button?: Button };
type WxHost = {
    getWindowInfo?: () => { windowWidth: number; windowHeight: number; safeArea?: { left: number; top: number; right: number; bottom: number } };
    getSystemInfoSync?: WxHost['getWindowInfo'];
    getMenuButtonBoundingClientRect?: () => { left: number; top: number; right: number; bottom: number };
    setClipboardData?: (options: { data: string; success: () => void; fail: () => void }) => void;
};

@ccclass('UISliceKitPrototype')
export class UISliceKitPrototype extends Component {
    private root!: Node;
    private popup: Node | null = null;
    private frames = new Map<string, SpriteFrame>();
    private textures: Texture2D[] = [];
    private buttons: Button[] = [];
    private slots: KitRect[] = [];
    private controls: KitControl[] = [];
    private controlGraphics = new Map<string, Graphics>();
    private pointers = new Map<number, Pointer>();
    private keys = new Set<KeyCode>();
    private counts: Record<string, number> = {};
    private safe: KitRect = { x: 24, y: 16, width: 912, height: 508 };
    private popupBounds: KitRect | null = null;
    private scrollViewport: KitRect | null = null;
    private scrollContent: Node | null = null;
    private scrollAmount = 0;
    private scrollLimit = 0;
    private page: 'bag' | 'hud' | 'report' = 'bag';
    private width = 960;
    private height = 540;
    private ready = false;
    private message = '';
    private assetError = '';
    private status!: Label;
    private live!: Label;
    private stickKnob: Graphics | null = null;
    private arenaActor: Graphics | null = null;
    private axis = { x: 0, y: 0 };
    private actor = { x: 260, y: 290 };
    private suppressMouseUntil = 0;
    private maxPointers = 0;
    private moveAndAction = false;
    private record = false;
    private frameTimes: number[] = [];
    private sampleSeconds = 0;
    private samplePage = '';
    private pageChangedDuringSample = false;
    private lastFps = 0;
    private liveTimer = 0;
    private liveFrames = 0;
    private maxDrawCalls: number | null = null;
    private sampleLastAt = 0;
    private maxJsHeap: number | null = null;
    private manual: Array<'待验' | '通过' | '问题'> = ['待验', '待验', '待验', '待验'];
    private events: string[] = [];
    private loadedAt = '';

    onLoad(): void {
        // Desktop windows may be nearly square. Letterbox there; phones use the full landscape width.
        view.setDesignResolutionSize(960, 540, sys.isBrowser && !sys.isMobile ? ResolutionPolicy.SHOW_ALL : ResolutionPolicy.FIXED_HEIGHT);
        profiler.hideStats();
        this.root = new Node('UISliceKitRoot'); this.root.layer = this.node.layer; this.node.addChild(this.root);
        this.root.addComponent(UITransform).setAnchorPoint(0, 1);
        input.on(Input.EventType.TOUCH_START, this.touchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
        input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
        input.on(Input.EventType.MOUSE_WHEEL, this.mouseWheel, this);
        input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.on(Input.EventType.KEY_UP, this.keyUp, this);
        view.on('canvas-resize', this.resize, this);
        game.on(Game.EVENT_HIDE, this.hide, this);
        this.render();
        void this.loadAssets();
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.touchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
        input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
        input.off(Input.EventType.MOUSE_WHEEL, this.mouseWheel, this);
        input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.off(Input.EventType.KEY_UP, this.keyUp, this);
        view.off('canvas-resize', this.resize, this);
        game.off(Game.EVENT_HIDE, this.hide, this);
        for (const frame of this.frames.values()) frame.destroy();
        for (const texture of this.textures) texture.destroy();
    }

    private wx(): WxHost | undefined { return (globalThis as unknown as { wx?: WxHost }).wx; }
    private measureSafe(): void {
        const visible = view.getVisibleSize();
        this.width = visible.width; this.height = visible.height;
        let left = 0, right = this.width, top = 0, bottom = this.height;
        const wx = this.wx();
        try {
            const info = wx?.getWindowInfo?.() ?? wx?.getSystemInfoSync?.();
            if (info) {
                const sx = this.width / info.windowWidth, sy = this.height / info.windowHeight;
                if (info.safeArea) {
                    left = info.safeArea.left * sx; right = info.safeArea.right * sx;
                    top = info.safeArea.top * sy; bottom = info.safeArea.bottom * sy;
                }
                const capsule = wx?.getMenuButtonBoundingClientRect?.();
                if (capsule && capsule.bottom > 0 && capsule.bottom < info.windowHeight / 3)
                    top = Math.max(top, capsule.bottom * sy);
            }
        } catch { this.message = '安全区读取失败，请人工检查屏幕边缘'; }
        this.safe = { x: left + 24, y: top + 12, width: right - left - 48, height: bottom - top - 28 };
        this.root.getComponent(UITransform)!.setContentSize(this.width, this.height);
        this.root.setPosition(-this.width / 2, this.height / 2);
    }

    private async loadAssets(): Promise<void> {
        const slices = ['panel_window_frame', 'panel_well_inner', 'button_normal', 'button_pressed', 'button_disabled',
            'slot_grid_base', 'bar_track_bg', 'bar_fill_hp', 'bar_fill_mp', 'bar_fill_exp', ...QUALITY.map(q => 'slot_border_' + q)];
        const paths = [...slices.map(s => 'ui/slices/' + s),
            ...['weapon_dual_blades', 'armor_chest', 'consumable_hp_potion'].map(s => 'icons/' + s + '_48')];
        const failures: string[] = [];
        await Promise.all(paths.map(path => new Promise<void>(resolve => {
            resources.load(path, ImageAsset, (error, image) => {
                if (!this.isValid) { resolve(); return; }
                if (error || !image) { failures.push(path); resolve(); return; }
                const texture = new Texture2D(); texture.image = image;
                texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                this.textures.push(texture);
                const frame = new SpriteFrame(); frame.texture = texture;
                const border = path.endsWith('panel_window_frame') ? 5 : 4;
                frame.insetLeft = frame.insetRight = frame.insetTop = frame.insetBottom = Math.min(border, image.width / 3);
                this.frames.set(path, frame); resolve();
            });
        })));
        if (!this.isValid) return;
        this.assetError = failures.join('、'); this.ready = failures.length === 0;
        this.loadedAt = new Date().toISOString();
        this.render();
    }

    private make(parent: Node, name: string, r: KitRect): Node {
        const n = new Node(name); n.layer = this.node.layer; parent.addChild(n);
        const t = n.addComponent(UITransform); t.setAnchorPoint(0, 1); t.setContentSize(r.width, r.height);
        n.setPosition(r.x, -r.y); return n;
    }
    private text(parent: Node, value: string, r: KitRect, size = 18, color = C.text): Label {
        const n = this.make(parent, 'Text', r), l = n.addComponent(Label);
        l.string = value; l.fontSize = size; l.lineHeight = size + 5; l.color = new Color().fromHEX(color);
        l.horizontalAlign = Label.HorizontalAlign.LEFT; l.verticalAlign = Label.VerticalAlign.TOP;
        l.overflow = Label.Overflow.CLAMP; l.enableWrapText = true; return l;
    }
    private sprite(parent: Node, path: string, r: KitRect, sliced = false): Sprite {
        const s = this.make(parent, path.split('/').pop()!, r).addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM; s.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        s.spriteFrame = this.frames.get(path) ?? null; return s;
    }
    private panel(parent: Node, r: KitRect, well = false): Node {
        return this.sprite(parent, 'ui/slices/' + (well ? 'panel_well_inner' : 'panel_window_frame'), r, true).node;
    }
    private button(label: string, r: KitRect, action: () => void, parent = this.root, popup = false, enabled = true): Button {
        const node = this.sprite(parent, 'ui/slices/button_' + (enabled ? 'normal' : 'disabled'), r, true).node;
        const l = this.text(node, label, { x: 4, y: 11, width: r.width - 8, height: 30 }, 17, enabled ? C.text : C.sub);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        const button = { ...r, label, action, node, enabled, popup };
        this.buttons.push(button); return button;
    }
    private log(value: string): void { this.events.push(new Date().toISOString() + ' ' + value); this.events = this.events.slice(-40); }
    private changePage(page: typeof this.page): void {
        if (this.record && page !== this.page) this.pageChangedDuringSample = true;
        this.page = page; this.clearInput(); this.render();
    }

    private render = (): void => {
        this.closePopup(); this.clearInput();
        this.buttons = []; this.slots = []; this.controls = []; this.controlGraphics.clear();
        this.stickKnob = null; this.arenaActor = null;
        for (const child of [...this.root.children]) { child.removeFromParent(); child.destroy(); }
        this.measureSafe();
        const bg = this.root.getComponent(Graphics) ?? this.root.addComponent(Graphics);
        bg.clear();
        bg.fillColor = new Color().fromHEX(C.bg); bg.rect(0, -this.height, this.width, this.height); bg.fill();
        const s = this.safe;
        this.text(this.root, '308 世界  /  UI 小样', { x: s.x, y: s.y, width: 360, height: 32 }, 25);
        this.text(this.root, '候选 · 模拟数据 · 不连接账号', { x: s.x + 335, y: s.y + 6, width: 320, height: 28 }, 15, C.sub);
        this.button('返回原型', { x: s.x + s.width - 116, y: s.y, width: 116, height: 48 }, () => {
            this.clearInput(); director.loadScene('Prototype');
        });
        const tabs: Array<[typeof this.page, string]> = [['bag', '背包与装备卡'], ['hud', '多指 HUD'], ['report', '验证记录']];
        tabs.forEach(([page, title], i) => {
            const b = this.button(title, { x: s.x + i * 174, y: s.y + 52, width: 162, height: 48 }, () => this.changePage(page));
            if (this.page === page) b.node.getComponent(Sprite)!.color = new Color(160, 219, 236);
        });
        this.status = this.text(this.root, '', { x: s.x, y: s.y + s.height - 24, width: s.width, height: 24 }, 14, C.sub);
        if (this.width < 800) {
            this.text(this.root, '请将设备旋转为横屏后验证', { x: s.x, y: s.y + 140, width: s.width, height: 100 }, 24);
            return;
        }
        if (!this.ready) {
            this.text(this.root, this.assetError ? '素材加载失败：' + this.assetError : '正在加载切片与透明图标…',
                { x: s.x, y: s.y + 130, width: s.width, height: 180 }, 20);
            if (this.assetError) this.button('重新加载', { x: s.x, y: s.y + 300, width: 160, height: 48 }, () => { void this.loadAssets(); });
            return;
        }
        if (this.page === 'bag') this.renderBag();
        if (this.page === 'hud') this.renderHud();
        if (this.page === 'report') this.renderReport();
        this.refreshStatus();
    };

    private renderBag(): void {
        const s = this.safe, top = s.y + 104;
        const bag = this.panel(this.root, { x: s.x, y: top, width: 346, height: 350 });
        this.text(bag, '背包 20 格  /  最高 100 格', { x: 16, y: 12, width: 320, height: 28 }, 18);
        for (let i = 0; i < 25; i++) {
            const r = { x: s.x + 15 + (i % 5) * 64, y: top + 42 + Math.floor(i / 5) * 60, width: 56, height: 56 };
            this.slots.push(r);
            this.sprite(this.root, 'ui/slices/slot_grid_base', r);
            if (i >= 20) { this.text(this.root, '锁定', { x: r.x + 8, y: r.y + 19, width: 45, height: 26 }, 16, C.sub); continue; }
            const item = ITEMS[i];
            if (!item) continue;
            this.sprite(this.root, 'icons/' + item.icon + '_48', { x: r.x + 4, y: r.y + 4, width: 48, height: 48 });
            this.sprite(this.root, 'ui/slices/slot_border_' + QUALITY[item.quality], r);
            if (item.enhance) this.text(this.root, '+' + item.enhance, { x: r.x + 22, y: r.y + 1, width: 34, height: 22 }, 13, C.gold);
            if (item.count) this.text(this.root, '×' + item.count, { x: r.x + 20, y: r.y + 34, width: 36, height: 22 }, 13);
            if (item.durability !== null) {
                this.sprite(this.root, 'ui/slices/bar_track_bg', { x: r.x + 4, y: r.y + 51, width: 48, height: 3 }, true);
                if (item.durability > 0) this.sprite(this.root, 'ui/slices/bar_fill_' + (item.durability <= 60 ? 'hp' : 'exp'),
                    { x: r.x + 4, y: r.y + 51, width: Math.max(2, 48 * item.durability / 120), height: 3 });
            }
        }
        const x = s.x + 364, width = s.width - 364;
        this.text(this.root, '点击物品查看小浮窗', { x, y: top + 8, width, height: 40 }, 24);
        this.text(this.root, '56 格子 / 48 透明图标\n品质框独立叠加，数量上限 20\n第 4 件：长名称、破损、16 条属性',
            { x, y: top + 54, width, height: 96 }, 18, C.sub);
        this.text(this.root, '四角避让检查', { x, y: top + 158, width, height: 28 }, 20);
        ['左上', '右上', '左下', '右下'].forEach((name, i) => {
            this.button(name, { x: x + (i % 2) * 126, y: top + 194 + Math.floor(i / 2) * 58, width: 116, height: 48 },
                () => {
                    const area = this.cardSafe(), edge = { x: i % 2 ? area.x + area.width - 56 : area.x,
                        y: i >= 2 ? area.y + area.height - 56 : area.y, width: 56, height: 56 };
                    this.openCompact(ITEMS[3], edge);
                });
        });
        this.button('禁用态示例', { x: x + 266, y: top + 194, width: Math.max(150, width - 266), height: 48 }, () => {}, this.root, false, false);
        this.text(this.root, '这是视觉样本，锁格不会触发金币购买。\n浮窗外点击关闭；详情支持滑动与滚轮。',
            { x, y: top + 312, width, height: 50 }, 16, C.sub);
    }

    private cardSafe(): KitRect {
        return { x: this.safe.x, y: this.safe.y + 106, width: this.safe.width, height: this.safe.height - 134 };
    }
    private closePopup(): void {
        if (this.popup) { this.popup.removeFromParent(); this.popup.destroy(); }
        for (const b of this.buttons.filter(b => b.popup)) { b.node.removeFromParent(); b.node.destroy(); }
        this.popup = null; this.popupBounds = null; this.scrollViewport = null; this.scrollContent = null;
        this.buttons = this.buttons.filter(b => !b.popup);
    }
    private openCompact(item: Item, anchor: KitRect): void {
        this.closePopup();
        const r = cardRect(anchor, { width: 328, height: 220 }, this.cardSafe());
        this.popupBounds = r; this.popup = this.panel(this.root, r);
        this.sprite(this.popup, 'icons/' + item.icon + '_48', { x: 16, y: 18, width: 48, height: 48 });
        this.text(this.popup, item.name, { x: 76, y: 14, width: 236, height: 66 }, 19, QUALITY_COLORS[item.quality]);
        this.text(this.popup, QUALITY_NAMES[item.quality] + ' · ' + (item.count ? '消耗品' : 'Lv.30 装备 +' + item.enhance)
            + '\n' + (item.durability === null ? '单堆 ×' + item.count : '耐久 ' + item.durability + '/120' + (item.durability === 0 ? ' · 已破损' : '')),
            { x: 16, y: 88, width: 296, height: 58 }, 18, item.durability === 0 ? C.red : C.sub);
        this.popupButton('完整详情', { x: r.x + 16, y: r.y + 158, width: 176, height: 48 }, () => this.openDetail(item, anchor));
        this.popupButton('关闭', { x: r.x + 206, y: r.y + 158, width: 106, height: 48 }, () => this.closePopup());
        this.log('打开紧凑卡：' + item.name + ' @' + Math.round(r.x) + ',' + Math.round(r.y));
    }
    private popupButton(label: string, r: KitRect, action: () => void): void {
        // Popup geometry remains in root coordinates for the shared hit tester.
        this.button(label, r, action, this.root, true);
        this.buttons[this.buttons.length - 1].node.setSiblingIndex(this.root.children.length - 1);
    }
    private openDetail(item: Item, anchor: KitRect): void {
        this.closePopup();
        const r = cardRect(anchor, { width: 480, height: this.cardSafe().height }, this.cardSafe());
        this.popupBounds = r; this.popup = this.panel(this.root, r);
        this.text(this.popup, item.name, { x: 16, y: 12, width: r.width - 32, height: 62 }, 22, QUALITY_COLORS[item.quality]);
        const area = { x: r.x + 16, y: r.y + 80, width: r.width - 32, height: r.height - 148 };
        this.scrollViewport = area;
        const viewport = this.make(this.popup, 'DetailScrollViewport', { x: 16, y: 80, width: area.width, height: area.height });
        viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.scrollContent = this.make(viewport, 'DetailScrollContent', { x: 0, y: 0, width: area.width - 8, height: 1200 });
        const rows = item.count ? [
            '消耗品 · 生命药剂', '堆叠数量：20 / 20', '回复生命值：600（候选展示数据）',
            '生命药共享冷却：10 秒', '满血拒绝使用，不消耗药品。', '正式恢复量以配置与角色属性为准。',
            '本小样仅展示，不执行使用或扣除。',
        ] : [
            QUALITY_NAMES[item.quality] + ' · Lv.30 · ' + (item.icon === 'armor_chest' ? '上衣' : '双刀'),
            '角色绑定 · 来源：裂隙遗址 · 示例数据',
            '强化等级 +' + item.enhance + '（不展示概率）',
            item.durability === null ? '堆叠数量：20 / 20' : '耐久：' + item.durability + ' / 120' + (item.durability === 0 ? ' · 武器属性失效' : ''),
            '—— 基础属性与强化加成 ——',
            '物理攻击力 158 = 基础 98 + 强化 60',
            '力量 +24    敏捷 +18',
            '—— 完整词条包络（16 条）——',
            ...Array.from({ length: 16 }, (_, i) => '词条 ' + String(i + 1).padStart(2, '0') + '：' + ['物理攻击力 +8', '生命上限 +32', '急速等级 +4', '暴击等级 +3'][i % 4]),
            '—— 套装与谱系 ——',
            '远古守望者套装（2 / 3）',
            '已激活：暴击伤害 +15%（展示样例）',
            '未激活：三件套效果（灰显）',
            '谱系：秘银原胚 → 冷钢锻造 → 裂隙淬炼',
            '损毁说明：高段强化失败可永久损毁。',
            '此卡仅验证全量文本滚动与裁切。',
        ];
        const label = this.text(this.scrollContent, rows.join('\n'), { x: 0, y: 0, width: area.width - 8, height: 1200 }, 18);
        label.lineHeight = 27;
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.updateRenderData(true);
        this.scrollLimit = Math.max(0, label.node.getComponent(UITransform)!.height - area.height);
        this.scrollAmount = 0;
        this.popupButton('↑ 上移', { x: r.x + 16, y: r.y + r.height - 58, width: 120, height: 48 }, () => this.scroll(-160));
        this.popupButton('↓ 下移', { x: r.x + 146, y: r.y + r.height - 58, width: 120, height: 48 }, () => this.scroll(160));
        this.popupButton('关闭', { x: r.x + r.width - 130, y: r.y + r.height - 58, width: 114, height: 48 }, () => this.closePopup());
        this.log('展开完整详情（16词条）');
    }
    private scroll(delta: number): void {
        this.scrollAmount = Math.max(0, Math.min(this.scrollLimit, this.scrollAmount + delta));
        this.scrollContent?.setPosition(0, this.scrollAmount);
    }

    private renderHud(): void {
        const s = this.safe;
        this.live = this.text(this.root, '', { x: s.x + 4, y: s.y + 108, width: s.width - 8, height: 68 }, 18, C.green);
        this.controls = hudControls(s);
        const arena = this.make(this.root, 'TouchArena', { x: 0, y: 0, width: this.width, height: this.height });
        arena.setSiblingIndex(0);
        const g = arena.addComponent(Graphics);
        g.strokeColor = new Color(43, 58, 70); g.lineWidth = 1;
        for (let x = s.x + 180; x < s.x + s.width - 400; x += 32) {
            g.moveTo(x, -(s.y + 190)); g.lineTo(x, -(s.y + s.height - 70));
        }
        for (let y = s.y + 190; y < s.y + s.height - 70; y += 32) {
            g.moveTo(s.x + 180, -y); g.lineTo(s.x + s.width - 400, -y);
        }
        g.stroke();
        this.arenaActor = this.make(this.root, 'TouchMarker', { x: 0, y: 0, width: 24, height: 24 }).addComponent(Graphics);
        this.arenaActor.fillColor = new Color().fromHEX(C.green); this.arenaActor.circle(0, 0, 10); this.arenaActor.fill();
        for (const c of this.controls) {
            const n = this.make(this.root, 'Control-' + c.id, c), graphics = n.addComponent(Graphics);
            this.controlGraphics.set(c.id, graphics);
            this.paintControl(c);
            if (c.id === 'stick') {
                this.stickKnob = this.make(n, 'StickKnob', { x: 55, y: 55, width: 32, height: 32 }).addComponent(Graphics);
                this.stickKnob.fillColor = new Color(91, 124, 142, 220); this.stickKnob.circle(0, 0, 17); this.stickKnob.fill();
            } else {
                const l = this.text(n, c.label + '\n' + c.key, { x: 0, y: c.height / 2 - 19, width: c.width, height: 43 }, c.width === 48 ? 12 : 15);
                l.horizontalAlign = Label.HorizontalAlign.CENTER;
            }
        }
        this.text(this.root, '触控演示标记\n无伤害与冷却结算', { x: s.x + 195, y: s.y + 180, width: 240, height: 60 }, 16, C.sub);
        this.button(this.record ? '停止采样' : '开始采样', { x: s.x + 205, y: s.y + s.height - 78, width: 144, height: 48 },
            () => this.toggleRecording());
        this.paintHudState();
    }
    private paintControl(c: KitControl): void {
        const g = this.controlGraphics.get(c.id)!; g.clear();
        const pressed = [...this.pointers.values()].some(p => p.target === c.id);
        g.fillColor = new Color().fromHEX(pressed ? '#344654' : '#19252e');
        g.strokeColor = new Color().fromHEX(pressed ? C.green : c.id === 'attack' ? C.gold : C.steel); g.lineWidth = pressed ? 3 : 2;
        if (c.circle) g.circle(c.width / 2, -c.height / 2, c.width / 2 - 1);
        else g.rect(0, -c.height, c.width, c.height);
        g.fill(); g.stroke();
    }
    private paintHudState(): void {
        for (const c of this.controls) this.paintControl(c);
        if (this.stickKnob) this.stickKnob.node.setPosition(55 + this.axis.x * 34, -55 - this.axis.y * 34);
        if (this.live?.isValid) {
            const active = [...this.pointers.values()].map(p => p.target).filter(id => id !== 'ui');
            this.live.string = '同时按住：' + (active.join(' + ') || '无') + '  /  峰值 ' + this.maxPointers + ' 指'
                + '\n摇杆 ' + this.axis.x.toFixed(2) + ', ' + this.axis.y.toFixed(2)
                + ' · 普攻 ' + (this.counts.attack ?? 0) + ' 次 · 移动＋动作 ' + (this.moveAndAction ? '已观察' : '待操作');
        }
    }

    private toggleRecording(): void {
        this.record = !this.record;
        if (this.record) {
            this.frameTimes = []; this.sampleSeconds = 0; this.maxDrawCalls = null; this.maxJsHeap = null; this.sampleLastAt = 0;
            this.samplePage = this.page; this.pageChangedDuringSample = false; this.log('开始采样：' + this.page);
        } else this.log('停止采样：' + this.sampleSeconds.toFixed(1) + 's');
        this.render();
    }
    private renderReport(): void {
        const s = this.safe, y = s.y + 114;
        const geometry = geometryReport(hudControls(s), s);
        const p95 = percentile(this.frameTimes, .95), p99 = percentile(this.frameTimes, .99);
        const text = '运行环境：' + sys.platform + ' / ' + Math.round(this.width) + '×' + Math.round(this.height)
            + '\n素材：' + this.frames.size + '/19 加载 · 安全区已换算'
            + '\nHUD 热区最小间距：' + geometry.minGap.toFixed(1) + '（候选 ≥8）'
            + '\n热区无重叠：' + (geometry.disjoint ? '通过' : '问题') + ' · 全部处于安全区：' + (geometry.insideSafe ? '是' : '否')
            + '\n真实触控峰值：' + this.maxPointers + ' 指 · 移动＋动作：' + (this.moveAndAction ? '已观察' : '待验')
            + '\n采样：' + this.samplePage + ' / ' + this.sampleSeconds.toFixed(1) + 's' + (this.sampleSeconds >= 300 ? '' : '（未满 5 分钟）')
            + '\n帧时间 P95 / P99：' + (p95?.toFixed(2) ?? '—') + ' / ' + (p99?.toFixed(2) ?? '—') + ' ms'
            + '\nDraw Calls 峰值：' + (this.maxDrawCalls ?? '—') + ' · JS 堆峰值：' + (this.maxJsHeap === null ? '接口不可用' : (this.maxJsHeap / 1048576).toFixed(1) + ' MiB')
            + '\n仅测本小样；不代表真实 8 怪战斗性能。';
        this.live = this.text(this.root, text, { x: s.x + 10, y, width: s.width / 2 + 36, height: 290 }, 17);
        const x = s.x + s.width / 2 + 60;
        ['图标轮廓与品质层次', '字号与对比度', '四角避让与完整滚动', '真机多指舒适度'].forEach((name, i) => {
            this.button(name + '：' + this.manual[i], { x, y: y + i * 58, width: s.width / 2 - 60, height: 48 },
                () => { this.manual[i] = this.manual[i] === '待验' ? '通过' : this.manual[i] === '通过' ? '问题' : '待验'; this.render(); });
        });
        this.button(this.record ? '停止采样' : '开始采样', { x: s.x + 8, y: s.y + s.height - 80, width: 150, height: 48 }, () => this.toggleRecording());
        this.button('导出记录', { x: s.x + 172, y: s.y + s.height - 80, width: 150, height: 48 }, () => this.exportReport());
    }
    private exportReport(): void {
        const values = this.frameTimes;
        const report = {
            kind: 'ui-slice-kit-prototype', generatedAt: new Date().toISOString(), loadedAt: this.loadedAt,
            platform: sys.platform, visibleSize: { width: this.width, height: this.height }, safe: this.safe,
            geometry: geometryReport(hudControls(this.safe), this.safe), loadedAssets: [...this.frames.keys()],
            touch: { maxPointers: this.maxPointers, moveAndActionObserved: this.moveAndAction, counts: this.counts },
            manual: this.manual, performance: {
                scope: 'UI sample only, not the actual town or eight-monster combat',
                page: this.samplePage, mixedPages: this.pageChangedDuringSample, durationSeconds: this.sampleSeconds,
                samples: values.length, averageFps: this.sampleSeconds ? values.length / this.sampleSeconds : null,
                medianMs: percentile(values, .5), p95Ms: percentile(values, .95), p99Ms: percentile(values, .99),
                maxDrawCalls: this.maxDrawCalls, jsHeapPeakBytes: this.maxJsHeap,
            }, events: this.events,
        };
        const data = JSON.stringify(report, null, 2);
        const wx = this.wx();
        if (wx?.setClipboardData) {
            wx.setClipboardData({ data, success: () => { this.message = '验证记录已复制'; this.refreshStatus(); },
                fail: () => { this.message = '复制失败，请查看控制台记录'; this.refreshStatus(); } });
        } else if (sys.isBrowser) {
            const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
            const a = document.createElement('a'); a.href = url; a.download = '308-ui-slice-kit-report.json'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.message = '验证记录已导出'; this.refreshStatus();
        }
        console.log('[UISliceKit report]', data);
    }

    update(dt: number): void {
        this.liveFrames++; this.liveTimer += dt;
        if (this.record && this.sampleSeconds < 600) {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const ms = this.sampleLastAt ? now - this.sampleLastAt : dt * 1000;
            this.sampleLastAt = now; this.frameTimes.push(ms); this.sampleSeconds += ms / 1000;
            const root = director.root as unknown as { device?: { numDrawCalls?: number } } | null;
            const calls = root?.device?.numDrawCalls;
            if (typeof calls === 'number') this.maxDrawCalls = Math.max(this.maxDrawCalls ?? 0, calls);
            const memory = typeof performance !== 'undefined' ? (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory : undefined;
            if (memory) this.maxJsHeap = Math.max(this.maxJsHeap ?? 0, memory.usedJSHeapSize);
        }
        if (this.liveTimer >= 1) { this.lastFps = this.liveFrames / this.liveTimer; this.liveTimer = this.liveFrames = 0; this.refreshStatus(); }
        if (this.page === 'hud') {
            const stickHeld = [...this.pointers.values()].some(p => p.target === 'stick');
            if (!stickHeld) {
                this.axis.x = Number(this.keys.has(KeyCode.KEY_D) || this.keys.has(KeyCode.ARROW_RIGHT)) - Number(this.keys.has(KeyCode.KEY_A) || this.keys.has(KeyCode.ARROW_LEFT));
                this.axis.y = Number(this.keys.has(KeyCode.KEY_S) || this.keys.has(KeyCode.ARROW_DOWN)) - Number(this.keys.has(KeyCode.KEY_W) || this.keys.has(KeyCode.ARROW_UP));
            }
            if (Math.hypot(this.axis.x, this.axis.y) > .1 && [...this.pointers.values()].some(p => !['ui', 'stick', 'scroll'].includes(p.target)))
                this.moveAndAction = true;
            this.actor.x = Math.max(this.safe.x + 170, Math.min(this.safe.x + this.safe.width - 410, this.actor.x + this.axis.x * dt * 120));
            this.actor.y = Math.max(this.safe.y + 240, Math.min(this.safe.y + this.safe.height - 110, this.actor.y + this.axis.y * dt * 120));
            this.arenaActor?.node.setPosition(this.actor.x, -this.actor.y); this.paintHudState();
        }
    }
    private refreshStatus(): void {
        if (!this.status?.isValid) return;
        this.status.string = this.message || ('FPS ' + this.lastFps.toFixed(0) + ' · ' + Math.round(this.width) + '×' + Math.round(this.height)
            + ' · ' + (this.record ? '采样中 ' + this.sampleSeconds.toFixed(0) + 's' : '未采样')
            + ' · B 背包 / H 触控 / R 记录 · Esc 关卡片');
    }
    private position(event: EventTouch | EventMouse): KitPoint {
        const p = event.getUILocation(), local = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y));
        return { x: local.x, y: -local.y };
    }
    private begin(id: number, point: KitPoint): void {
        if (this.pointers.has(id)) return;
        const buttons = this.buttons.filter(b => b.popup === !!this.popup);
        const button = buttons.find(b => b.enabled && contains(b, point));
        if (button) {
            if ([...this.pointers.values()].some(p => p.button === button)) return;
            this.pointers.set(id, { target: 'ui', start: point, last: point, button });
            button.node.getComponent(Sprite)!.spriteFrame = this.frames.get('ui/slices/button_pressed') ?? null;
            return;
        }
        if (this.popup) {
            if (this.scrollViewport && contains(this.scrollViewport, point))
                this.pointers.set(id, { target: 'scroll', start: point, last: point });
            else if (this.popupBounds && !contains(this.popupBounds, point)) this.closePopup();
            return;
        }
        if (this.page === 'bag') {
            const i = this.slots.findIndex(r => contains(r, point));
            if (ITEMS[i]) this.openCompact(ITEMS[i], this.slots[i]);
        }
        if (this.page === 'hud') {
            const control = this.controls.find(c => controlContains(c, point));
            if (!control || [...this.pointers.values()].some(p => p.target === control.id)) return;
            this.pointers.set(id, { target: control.id, start: point, last: point });
            this.counts[control.id] = (this.counts[control.id] ?? 0) + 1;
            if (id >= 0) this.maxPointers = Math.max(this.maxPointers, [...this.pointers.keys()].filter(k => k >= 0).length);
            this.move(id, point); this.paintHudState();
        }
    }
    private move(id: number, point: KitPoint): void {
        const p = this.pointers.get(id); if (!p) return;
        if (p.target === 'stick') {
            const c = this.controls.find(c => c.id === 'stick')!;
            const x = (point.x - c.x - 55) / 40, y = (point.y - c.y - 55) / 40, length = Math.max(1, Math.hypot(x, y));
            this.axis = { x: x / length, y: y / length };
        }
        if (p.target === 'scroll') this.scroll(p.last.y - point.y);
        p.last = point;
    }
    private end(id: number, point: KitPoint, cancel = false): void {
        const p = this.pointers.get(id); this.pointers.delete(id); if (!p) return;
        if (p.target === 'stick') this.axis = { x: 0, y: 0 };
        if (p.button?.node.isValid) {
            p.button.node.getComponent(Sprite)!.spriteFrame = this.frames.get('ui/slices/button_normal') ?? null;
            if (!cancel && contains(p.button, point) && Math.hypot(point.x - p.start.x, point.y - p.start.y) < 20) p.button.action();
        }
        this.paintHudState();
    }
    private clearInput(): void {
        for (const p of this.pointers.values()) if (p.button?.node.isValid)
            p.button.node.getComponent(Sprite)!.spriteFrame = this.frames.get('ui/slices/button_normal') ?? null;
        this.pointers.clear(); this.keys.clear(); this.axis = { x: 0, y: 0 };
    }
    private hide = (): void => { this.clearInput(); this.log('进入后台：清除持有输入，停止采样'); this.record = false; };
    private resize = (): void => { this.log('视口变化：关闭浮窗并重新布局'); this.render(); };
    private touchStart = (e: EventTouch): void => { const id = e.getID(); if (id === null) return; this.suppressMouseUntil = Date.now() + 500; this.begin(id, this.position(e)); };
    private touchMove = (e: EventTouch): void => { const id = e.getID(); if (id !== null) this.move(id, this.position(e)); };
    private touchEnd = (e: EventTouch): void => { const id = e.getID(); if (id !== null) this.end(id, this.position(e)); };
    private touchCancel = (e: EventTouch): void => { const id = e.getID(); if (id !== null) this.end(id, this.position(e), true); };
    private mouseDown = (e: EventMouse): void => { if (e.getButton() === 0 && Date.now() >= this.suppressMouseUntil) this.begin(-1, this.position(e)); };
    private mouseMove = (e: EventMouse): void => { this.move(-1, this.position(e)); };
    private mouseUp = (e: EventMouse): void => { this.end(-1, this.position(e)); };
    private mouseWheel = (e: EventMouse): void => {
        if (this.scrollViewport && contains(this.scrollViewport, this.position(e))) this.scroll(-e.getScrollY() / 3);
    };
    private keyDown = (e: EventKeyboard): void => {
        if (this.keys.has(e.keyCode)) return;
        this.keys.add(e.keyCode);
        if (e.keyCode === KeyCode.ESCAPE) { this.closePopup(); return; }
        if (e.keyCode === KeyCode.KEY_B) { this.changePage('bag'); return; }
        if (e.keyCode === KeyCode.KEY_H) { this.changePage('hud'); return; }
        if (e.keyCode === KeyCode.KEY_R) { this.changePage('report'); return; }
        if (this.page !== 'hud') return;
        const ids: Partial<Record<KeyCode, string>> = { [KeyCode.SPACE]: 'attack', [KeyCode.KEY_E]: 'cross',
            [KeyCode.KEY_F]: 'bengshan', [KeyCode.KEY_Q]: 'badao', [KeyCode.KEY_G]: 'earth', [KeyCode.KEY_T]: 'accessory',
            [KeyCode.DIGIT_1]: 'potion0', [KeyCode.DIGIT_2]: 'potion1', [KeyCode.DIGIT_3]: 'potion2' };
        const c = this.controls.find(c => c.id === ids[e.keyCode]);
        if (c) this.begin(-1000 - e.keyCode, { x: c.x + c.width / 2, y: c.y + c.height / 2 });
    };
    private keyUp = (e: EventKeyboard): void => { this.keys.delete(e.keyCode); this.end(-1000 - e.keyCode, { x: -1, y: -1 }); };
}
