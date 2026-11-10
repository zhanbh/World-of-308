import { Node, Graphics, Color, UITransform, Label, Vec3, EventTouch, EventMouse, sys, game, Game } from 'cc';
import type { ShopCoordinator, ShopCoordinatorState } from '../net/ShopCoordinator.ts';
import { skinSprite } from './UISkin';

export interface ShopCatalogItem {
  offerId: string;
  name: string;
  desc: string;
  itemKind: 'potion' | 'equipment';
  templateId: string;
  quality: 'white' | 'green' | 'blue' | 'purple' | 'orange';
  priceCurrency: 'gold' | 'points';
  unitPrice: number;
  maxQuantity: number;
  iconPath: string;
}

export interface ShopSellableItem {
  id: string;
  name: string;
  kind: 'equipment' | 'stack';
  quality: 'white' | 'green' | 'blue' | 'purple' | 'orange';
  quantity: number;
  itemLevel: number;
  accountBound: boolean;
  equipped: boolean;
  iconPath: string;
  estimatedPrice: number;
}

export interface ShopPanelOptions {
  contextId?: string;
  quoteRef?: string;
  onVisibility?: (visible: boolean) => void;
  onSuccess?: (type: 'buy' | 'sell' | 'exchange', message: string) => void;
  catalog?: ShopCatalogItem[];
  backpackItemsProvider?: () => ShopSellableItem[];
}

interface ControlButton {
  name: string;
  node: Node;
  width: number;
  canEnable: () => boolean;
  action: () => void;
}

const DEFAULT_OFFERS: ShopCatalogItem[] = [
  {
    offerId: 'offer_hp_potion_minor',
    name: '初级生命药剂',
    desc: '恢复 150 点生命值',
    itemKind: 'potion',
    templateId: 'potion_hp_minor',
    quality: 'white',
    priceCurrency: 'gold',
    unitPrice: 50,
    maxQuantity: 20,
    iconPath: 'icons/consumable_hp_potion_48',
  },
  {
    offerId: 'offer_mp_potion_minor',
    name: '初级法力药剂',
    desc: '恢复 100 点法力值',
    itemKind: 'potion',
    templateId: 'potion_mp_minor',
    quality: 'white',
    priceCurrency: 'gold',
    unitPrice: 50,
    maxQuantity: 20,
    iconPath: 'icons/consumable_mp_potion_48',
  },
  {
    offerId: 'offer_starter_sword',
    name: '练习短剑',
    desc: '新手战士近战武器，物攻 +45',
    itemKind: 'equipment',
    templateId: 'weapon_starter_sword',
    quality: 'white',
    priceCurrency: 'gold',
    unitPrice: 100,
    maxQuantity: 20,
    iconPath: 'icons/weapon_dual_blades_48',
  },
  {
    offerId: 'offer_starter_armor',
    name: '练习轻甲',
    desc: '新手战士防具上衣，护甲 +28',
    itemKind: 'equipment',
    templateId: 'armor_starter_chest',
    quality: 'white',
    priceCurrency: 'gold',
    unitPrice: 100,
    maxQuantity: 20,
    iconPath: 'icons/armor_chest_48',
  },
  {
    offerId: 'offer_points_scroll',
    name: '经验祝福卷轴',
    desc: '商城珍品，使用后 1 小时内经验获取 +20%',
    itemKind: 'potion',
    templateId: 'scroll_exp_boost',
    quality: 'purple',
    priceCurrency: 'points',
    unitPrice: 10,
    maxQuantity: 20,
    iconPath: 'icons/special_book_48',
  },
];

function qualityColor(quality: string): Color {
  switch (quality) {
    case 'green': return new Color(80, 220, 100);
    case 'blue': return new Color(60, 150, 255);
    case 'purple': return new Color(180, 80, 255);
    case 'orange': return new Color(255, 150, 40);
    default: return new Color(220, 225, 230);
  }
}

function qualityBorderKey(quality: string): string {
  switch (quality) {
    case 'green': return 'slot_border_fine';
    case 'blue': return 'slot_border_rare';
    case 'purple': return 'slot_border_unique';
    case 'orange': return 'slot_border_legendary';
    default: return 'slot_border_rough';
  }
}

function errorLabel(code: string): string {
  switch (code) {
    case 'BAG_FULL': return '背包已满，无可用槽位容纳物品';
    case 'CURRENCY_NOT_ENOUGH': return '钱包余额不足以支付当前费用';
    case 'QUOTE_CHANGED': return '商品报价已变动，请重新确认';
    case 'LOCATION_NOT_ALLOWED': return '穿戴中装备禁止出售，请先卸入背包';
    case 'BINDING_RESTRICTED': return '账号绑定商城商品禁止向商人出售';
    case 'ITEM_NOT_ELIGIBLE': return '该道具当前生命周期不可出售';
    case 'INVALID_ARGUMENT': return '交易数量或参数无效';
    case 'RESULT_UNKNOWN': return '交易结果未决，请点击确认结果恢复';
    case 'SHOP_NOT_READY': return '商店服务加载中，请稍后重试';
    case 'IDENTITY_REQUIRED': return '请先登录并选择角色';
    case 'CONTEXT_REQUIRED': return '商人服务上下文已失效，请重新打开';
    default: return code;
  }
}

/**
 * Cocos presentation panel for Merchant Shop, Item Recycling & Currency Exchange.
 * Connects with ShopCoordinator for buy, sell and wallet.exchange transactions.
 * Follows unified 9-Patch slices, 56px slot grids, 48px icons, and pointer isolation.
 */
export class ShopPanel {
  private readonly root: Node;
  private readonly windowFrameNode: Node;
  private readonly titleLabel: Label;
  private readonly goldLabel: Label;
  private readonly pointsLabel: Label;
  private readonly closeButtonNode: Node;

  // Tabs
  private readonly buyTabNode: Node;
  private readonly sellTabNode: Node;
  private readonly exchangeTabNode: Node;

  // Tab Containers
  private readonly buyContainer: Node;
  private readonly sellContainer: Node;
  private readonly exchangeContainer: Node;

  // Buy Mode UI
  private readonly buyOfferRows: Array<{
    node: Node;
    nameLabel: Label;
    priceLabel: Label;
    slotIcon: Node;
    borderNode: Node;
    offer: ShopCatalogItem;
  }> = [];
  private selectedOfferIndex = 0;
  private buyQuantity = 1;
  private readonly buyDetailNameLabel: Label;
  private readonly buyDetailDescLabel: Label;
  private readonly buyDetailQtyLabel: Label;
  private readonly buyDetailTotalLabel: Label;
  private readonly buyActionBtnNode: Node;

  // Sell Mode UI
  private readonly sellItemRows: Array<{
    node: Node;
    nameLabel: Label;
    priceLabel: Label;
    slotIcon: Node;
    borderNode: Node;
    item: ShopSellableItem | null;
  }> = [];
  private selectedSellItemId: string | null = null;
  private readonly sellDetailNameLabel: Label;
  private readonly sellDetailDescLabel: Label;
  private readonly sellDetailPriceLabel: Label;
  private readonly sellActionBtnNode: Node;

  // Exchange Mode UI
  private exchangeDirection: 'goldToPoints' | 'pointsToGold' = 'goldToPoints';
  private exchangeUnits = 1;
  private readonly exchangeDirBtnNode: Node;
  private readonly exchangeUnitsLabel: Label;
  private readonly exchangeCostLabel: Label;
  private readonly exchangeGainLabel: Label;
  private readonly exchangeRateNoticeLabel: Label;
  private readonly exchangeActionBtnNode: Node;

  // Notification & Status Banner
  private readonly resultBannerLabel: Label;
  private readonly statusLabel: Label;
  private readonly recoverButtonNode: Node;

  private readonly controls: ControlButton[] = [];
  private visible = false;
  private state: ShopCoordinatorState;
  private currentMode: 'buy' | 'sell' | 'exchange' = 'buy';
  private currentContextId: string | null = null;
  private quoteRef = 'quote_shop_v1';
  private localNotice = '';
  private localError = '';
  private suppressMouseUntil = 0;
  private buttonResets: Array<() => void> = [];
  private offers: ShopCatalogItem[] = DEFAULT_OFFERS;
  private backpackItemsProvider: () => ShopSellableItem[];

  private cancel = (): void => {
    for (const reset of this.buttonResets) reset();
    this.buttonResets = [];
  };

  private readonly coordinator: ShopCoordinator;
  private readonly options: ShopPanelOptions;

  private onHide = (): void => {
    this.cancel();
  };

  constructor(
    parent: Node,
    coordinator: ShopCoordinator,
    options: ShopPanelOptions = {}
  ) {
    this.coordinator = coordinator;
    this.options = options;
    this.state = coordinator.state;
    this.currentContextId = options.contextId ?? 'sandbox-shop-context';
    this.quoteRef = options.quoteRef ?? 'quote_shop_v1';
    if (options.catalog && options.catalog.length > 0) {
      this.offers = options.catalog;
    }
    this.backpackItemsProvider = options.backpackItemsProvider ?? (() => this.defaultSandboxBackpack());

    game.on(Game.EVENT_HIDE, this.onHide, this);

    this.root = this.node(parent, 'ShopPanel', 0, 0, 960, 540);
    this.root.active = false;

    // Dark backdrop mask
    const bg = this.root.addComponent(Graphics);
    bg.fillColor = new Color(16, 24, 30, 240);
    bg.rect(-480, -270, 960, 540);
    bg.fill();

    // 9-Patch Window Frame (912 x 500)
    this.windowFrameNode = this.node(this.root, 'ShopWindowFrame', 0, 0, 912, 500);
    skinSprite(this.windowFrameNode, 'ui/slices/panel_window_frame', true);

    // Header Title
    this.titleLabel = this.label(this.root, '旅行商人 · 德利拉 (杂货商店)', -240, 226, 22, 400);

    // Header Currency Balances
    this.goldLabel = this.label(this.root, '金币: 0', 100, 226, 15, 180);
    this.goldLabel.color = new Color(255, 215, 60);
    this.pointsLabel = this.label(this.root, '点券: 0', 260, 226, 15, 140);
    this.pointsLabel.color = new Color(100, 220, 255);

    // Close Buttons
    this.closeButtonNode = this.button('✕ 关闭', 400, 226, () => this.close(), () => true, 76);
    this.button('✕ 关闭', -400, 226, () => this.close(), () => true, 76);

    // Mode Toggle Tabs (y = 185)
    this.buyTabNode = this.button(
      '商人货架 (购买)',
      -260,
      185,
      () => this.switchMode('buy'),
      () => this.currentMode !== 'buy' && this.state.status !== 'submitting',
      160
    );
    this.sellTabNode = this.button(
      '物品回收 (出售)',
      -80,
      185,
      () => this.switchMode('sell'),
      () => this.currentMode !== 'sell' && this.state.status !== 'submitting',
      160
    );
    this.exchangeTabNode = this.button(
      '货币兑换 (10000:1)',
      100,
      185,
      () => this.switchMode('exchange'),
      () => this.currentMode !== 'exchange' && this.state.status !== 'submitting',
      160
    );

    // --- Tab 1: Buy Mode Container ---
    this.buyContainer = this.node(this.root, 'BuyContainer', 0, -15, 870, 340);
    // Left well: Goods list
    const buyListWell = this.node(this.buyContainer, 'BuyListWell', -190, 0, 470, 320);
    skinSprite(buyListWell, 'ui/slices/panel_well_inner', true);
    this.label(buyListWell, '商品目录 (点击选择)', 0, 140, 14, 440);

    // Rows for offers
    for (let i = 0; i < 5; i++) {
      const y = 95 - i * 54;
      const rowNode = this.node(buyListWell, `BuyRow_${i}`, 0, y, 450, 48);
      const slotBase = this.node(rowNode, `Slot_${i}`, -190, 0, 44, 44);
      skinSprite(slotBase, 'ui/slices/slot_grid_base', true);
      const iconNode = this.node(slotBase, `Icon_${i}`, 0, 0, 36, 36);
      const borderNode = this.node(slotBase, `Border_${i}`, 0, 0, 44, 44);
      skinSprite(borderNode, 'ui/slices/slot_border_rough', true);

      const nameLabel = this.label(rowNode, '', -70, 6, 14, 180);
      nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      const priceLabel = this.label(rowNode, '', 140, 6, 13, 160);
      priceLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

      const offer = this.offers[i];
      if (offer) {
        skinSprite(iconNode, offer.iconPath);
        skinSprite(borderNode, `ui/slices/${qualityBorderKey(offer.quality)}`, true);
        nameLabel.string = offer.name;
        nameLabel.color = qualityColor(offer.quality);
        const curText = offer.priceCurrency === 'gold' ? '金币' : '点券';
        priceLabel.string = `${offer.unitPrice} ${curText}`;
        priceLabel.color = offer.priceCurrency === 'gold' ? new Color(255, 215, 60) : new Color(100, 220, 255);
      }

      this.interactiveButton(rowNode, 450, 48, () => {
        this.selectedOfferIndex = i;
        this.buyQuantity = 1;
        this.updateBuyDetails();
      }, () => true);

      this.buyOfferRows.push({
        node: rowNode,
        nameLabel,
        priceLabel,
        slotIcon: iconNode,
        borderNode,
        offer: offer ?? this.offers[0],
      });
    }

    // Right well: Buy item details & stepper
    const buyDetailWell = this.node(this.buyContainer, 'BuyDetailWell', 240, 0, 360, 320);
    skinSprite(buyDetailWell, 'ui/slices/panel_well_inner', true);
    this.label(buyDetailWell, '购买确认', 0, 140, 15, 330);

    this.buyDetailNameLabel = this.label(buyDetailWell, '初级生命药剂', 0, 95, 18, 330);
    this.buyDetailDescLabel = this.label(buyDetailWell, '恢复 150 点生命值', 0, 65, 13, 330);
    this.buyDetailDescLabel.color = new Color(180, 190, 200);

    // Quantity controls (y = 15)
    this.button('—', 130, 0, () => this.stepBuyQuantity(-1), () => this.buyQuantity > 1, 44);
    this.buyDetailQtyLabel = this.label(buyDetailWell, '数量: 1', 0, 15, 16, 120);
    this.button('+', 350, 0, () => this.stepBuyQuantity(1), () => this.buyQuantity < 20, 44);
    this.button('MAX', 400, 0, () => this.setBuyMax(), () => this.buyQuantity < 20, 52);

    this.buyDetailTotalLabel = this.label(buyDetailWell, '总费用: 50 金币', 0, -40, 16, 330);
    this.buyDetailTotalLabel.color = new Color(255, 215, 60);

    this.buyActionBtnNode = this.button(
      '确认购买',
      240,
      -95,
      () => void this.executeBuy(),
      () => this.canExecuteBuy(),
      200
    );

    // --- Tab 2: Sell Mode Container ---
    this.sellContainer = this.node(this.root, 'SellContainer', 0, -15, 870, 340);
    this.sellContainer.active = false;
    const sellListWell = this.node(this.sellContainer, 'SellListWell', -190, 0, 470, 320);
    skinSprite(sellListWell, 'ui/slices/panel_well_inner', true);
    this.label(sellListWell, '背包物品 (点击选择出售)', 0, 140, 14, 440);

    // Rows for sellable items
    for (let i = 0; i < 5; i++) {
      const y = 95 - i * 54;
      const rowNode = this.node(sellListWell, `SellRow_${i}`, 0, y, 450, 48);
      const slotBase = this.node(rowNode, `SellSlot_${i}`, -190, 0, 44, 44);
      skinSprite(slotBase, 'ui/slices/slot_grid_base', true);
      const iconNode = this.node(slotBase, `SellIcon_${i}`, 0, 0, 36, 36);
      const borderNode = this.node(slotBase, `SellBorder_${i}`, 0, 0, 44, 44);
      skinSprite(borderNode, 'ui/slices/slot_border_rough', true);

      const nameLabel = this.label(rowNode, '', -70, 6, 14, 180);
      nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      const priceLabel = this.label(rowNode, '', 140, 6, 13, 160);
      priceLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

      this.interactiveButton(rowNode, 450, 48, () => {
        const item = this.sellItemRows[i].item;
        if (item && !item.accountBound && !item.equipped) {
          this.selectedSellItemId = item.id;
          this.updateSellDetails();
        }
      }, () => {
        const item = this.sellItemRows[i].item;
        return item !== null && !item.accountBound && !item.equipped;
      });

      this.sellItemRows.push({
        node: rowNode,
        nameLabel,
        priceLabel,
        slotIcon: iconNode,
        borderNode,
        item: null,
      });
    }

    const sellDetailWell = this.node(this.sellContainer, 'SellDetailWell', 240, 0, 360, 320);
    skinSprite(sellDetailWell, 'ui/slices/panel_well_inner', true);
    this.label(sellDetailWell, '回收估值与出售', 0, 140, 15, 330);

    this.sellDetailNameLabel = this.label(sellDetailWell, '请选择背包物品', 0, 95, 18, 330);
    this.sellDetailDescLabel = this.label(sellDetailWell, '* 穿戴中装备与商城绑定商品禁售\n* 强化等级与随机词条不增加收购价', 0, 45, 13, 330);
    this.sellDetailDescLabel.color = new Color(200, 160, 100);

    this.sellDetailPriceLabel = this.label(sellDetailWell, '回收获得: 0 金币', 0, -25, 17, 330);
    this.sellDetailPriceLabel.color = new Color(255, 215, 60);

    this.sellActionBtnNode = this.button(
      '确认出售',
      240,
      -95,
      () => void this.executeSell(),
      () => this.canExecuteSell(),
      200
    );

    // --- Tab 3: Currency Exchange Mode Container ---
    this.exchangeContainer = this.node(this.root, 'ExchangeContainer', 0, -15, 870, 340);
    this.exchangeContainer.active = false;
    const exchWell = this.node(this.exchangeContainer, 'ExchangeWell', 0, 0, 680, 320);
    skinSprite(exchWell, 'ui/slices/panel_well_inner', true);
    this.label(exchWell, '官方货币法定双向兑换中心', 0, 140, 16, 600);

    this.exchangeDirBtnNode = this.button(
      '⇄ 切换方向: [金币 ➔ 点券]',
      0,
      85,
      () => this.toggleExchangeDirection(),
      () => this.state.status !== 'submitting',
      280
    );

    // Steppers for units
    this.button('— 1', -160, 25, () => this.stepExchangeUnits(-1), () => this.exchangeUnits > 1, 70);
    this.button('— 5', -80, 25, () => this.stepExchangeUnits(-5), () => this.exchangeUnits > 5, 70);
    this.exchangeUnitsLabel = this.label(exchWell, '兑换单位: 1 份', 0, 25, 17, 140);
    this.button('+ 1', 80, 25, () => this.stepExchangeUnits(1), () => true, 70);
    this.button('+ 5', 160, 25, () => this.stepExchangeUnits(5), () => true, 70);

    this.exchangeCostLabel = this.label(exchWell, '支付: 10,000 金币', 0, -25, 16, 400);
    this.exchangeCostLabel.color = new Color(255, 140, 100);
    this.exchangeGainLabel = this.label(exchWell, '获得: 1 点券', 0, -55, 16, 400);
    this.exchangeGainLabel.color = new Color(100, 230, 255);

    this.exchangeRateNoticeLabel = this.label(
      exchWell,
      '法定比率: 10,000 金币 ⇄ 1 点券 (双向等价，净资产严格守恒)',
      0,
      -85,
      12,
      600
    );
    this.exchangeRateNoticeLabel.color = new Color(160, 180, 200);

    this.exchangeActionBtnNode = this.button(
      '确认兑换',
      0,
      -120,
      () => void this.executeExchange(),
      () => this.canExecuteExchange(),
      220
    );

    // --- Footer Banner & Recovery ---
    this.resultBannerLabel = this.label(this.root, '', 0, -205, 15, 800);
    this.resultBannerLabel.color = new Color(120, 255, 140);

    this.statusLabel = this.label(this.root, '', 0, -228, 14, 800);
    this.statusLabel.color = new Color(255, 120, 120);

    this.recoverButtonNode = this.button(
      '确认操作结果恢复',
      260,
      -228,
      () => void this.executeRecover(),
      () => this.state.status === 'unknown',
      170
    );
    this.recoverButtonNode.active = false;

    this.updateBuyDetails();
    this.updateSellRows();
    this.updateExchangeDetails();
  }

  get isOpen(): boolean {
    return this.visible;
  }

  get mode(): 'buy' | 'sell' | 'exchange' {
    return this.currentMode;
  }

  public destroy(): void {
    this.dispose();
  }

  public async submitCurrentAction(): Promise<void> {
    if (this.currentMode === 'buy') {
      await this.executeBuy();
    } else if (this.currentMode === 'sell') {
      await this.executeSell();
    } else if (this.currentMode === 'exchange') {
      await this.executeExchange();
    }
  }

  public async recover(): Promise<void> {
    await this.executeRecover();
  }

  public async open(): Promise<void> {
    this.visible = true;
    this.root.active = true;
    this.suppressMouseUntil = Date.now() + 250;
    this.localError = '';
    this.localNotice = '';

    if (this.currentContextId) {
      await this.coordinator.open(this.currentContextId, 'shop', this.quoteRef);
    }
    this.syncFromCoordinator();
    this.options.onVisibility?.(true);
  }

  public close(): void {
    if (!this.visible) return;
    this.cancel();
    this.visible = false;
    this.root.active = false;
    this.coordinator.close();
    this.options.onVisibility?.(false);
  }

  public dispose(): void {
    this.close();
    game.off(Game.EVENT_HIDE, this.onHide, this);
    if (this.root.isValid) this.root.destroy();
  }

  public switchMode(mode: 'buy' | 'sell' | 'exchange'): void {
    if (this.state.status === 'submitting') return;
    this.currentMode = mode;
    this.localError = '';
    this.localNotice = '';

    this.buyContainer.active = mode === 'buy';
    this.sellContainer.active = mode === 'sell';
    this.exchangeContainer.active = mode === 'exchange';

    if (mode === 'buy') this.updateBuyDetails();
    if (mode === 'sell') this.updateSellRows();
    if (mode === 'exchange') this.updateExchangeDetails();
    this.updateTabStyles();
  }

  private updateTabStyles(): void {
    skinSprite(
      this.buyTabNode,
      this.currentMode === 'buy' ? 'ui/slices/button_pressed' : 'ui/slices/button_normal',
      true
    );
    skinSprite(
      this.sellTabNode,
      this.currentMode === 'sell' ? 'ui/slices/button_pressed' : 'ui/slices/button_normal',
      true
    );
    skinSprite(
      this.exchangeTabNode,
      this.currentMode === 'exchange' ? 'ui/slices/button_pressed' : 'ui/slices/button_normal',
      true
    );
  }

  // --- Buy Mode Logic ---
  private stepBuyQuantity(delta: number): void {
    this.buyQuantity = Math.max(1, Math.min(20, this.buyQuantity + delta));
    this.updateBuyDetails();
  }

  private setBuyMax(): void {
    this.buyQuantity = 20;
    this.updateBuyDetails();
  }

  private updateBuyDetails(): void {
    const offer = this.offers[this.selectedOfferIndex] ?? this.offers[0];
    if (!offer) return;

    this.buyDetailNameLabel.string = offer.name;
    this.buyDetailNameLabel.color = qualityColor(offer.quality);
    this.buyDetailDescLabel.string = offer.desc;
    this.buyDetailQtyLabel.string = `数量: ${this.buyQuantity}`;

    const total = offer.unitPrice * this.buyQuantity;
    const curName = offer.priceCurrency === 'gold' ? '金币' : '点券';
    this.buyDetailTotalLabel.string = `总费用: ${total.toLocaleString()} ${curName}`;
    this.buyDetailTotalLabel.color = offer.priceCurrency === 'gold' ? new Color(255, 215, 60) : new Color(100, 220, 255);
  }

  private canExecuteBuy(): boolean {
    if (this.state.status === 'submitting') return false;
    const offer = this.offers[this.selectedOfferIndex];
    if (!offer) return false;
    const total = BigInt(offer.unitPrice) * BigInt(this.buyQuantity);
    const balance = BigInt(offer.priceCurrency === 'gold' ? this.state.wallet.gold : this.state.wallet.points);
    return balance >= total;
  }

  private async executeBuy(): Promise<void> {
    const offer = this.offers[this.selectedOfferIndex];
    if (!offer) return;
    this.localError = '';
    this.localNotice = '';
    try {
      await this.coordinator.buy(offer.offerId, this.buyQuantity, this.quoteRef);
      if (this.coordinator.state.status === 'ready') {
        this.localNotice = `购买成功：获得 ${offer.name} × ${this.buyQuantity}`;
        this.options.onSuccess?.('buy', this.localNotice);
      }
      this.syncFromCoordinator();
    } catch (err: unknown) {
      this.localError = (err as Error).message || '购买失败';
      this.syncFromCoordinator();
    }
  }

  // --- Sell Mode Logic ---
  private updateSellRows(): void {
    const items = this.backpackItemsProvider();
    for (let i = 0; i < this.sellItemRows.length; i++) {
      const row = this.sellItemRows[i];
      const item = items[i] ?? null;
      row.item = item;
      if (item) {
        row.node.active = true;
        skinSprite(row.slotIcon, item.iconPath);
        skinSprite(row.borderNode, `ui/slices/${qualityBorderKey(item.quality)}`, true);
        row.nameLabel.string = `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
        row.nameLabel.color = item.accountBound || item.equipped ? new Color(130, 140, 150) : qualityColor(item.quality);
        if (item.equipped) {
          row.priceLabel.string = '[已穿戴]';
          row.priceLabel.color = new Color(180, 100, 100);
        } else if (item.accountBound) {
          row.priceLabel.string = '[绑定禁售]';
          row.priceLabel.color = new Color(180, 100, 100);
        } else {
          row.priceLabel.string = `+${item.estimatedPrice} 金币`;
          row.priceLabel.color = new Color(255, 215, 60);
        }
      } else {
        row.node.active = false;
      }
    }

    const currentItem = items.find(it => it.id === this.selectedSellItemId);
    if (!currentItem || currentItem.equipped || currentItem.accountBound) {
      const firstValid = items.find(it => !it.equipped && !it.accountBound);
      this.selectedSellItemId = firstValid ? firstValid.id : null;
    }
    this.updateSellDetails();
  }

  private updateSellDetails(): void {
    const items = this.backpackItemsProvider();
    const item = items.find(it => it.id === this.selectedSellItemId);
    if (!item || item.accountBound || item.equipped) {
      this.sellDetailNameLabel.string = '请选择可出售物品';
      this.sellDetailPriceLabel.string = '回收获得: 0 金币';
      return;
    }

    this.sellDetailNameLabel.string = `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
    this.sellDetailNameLabel.color = qualityColor(item.quality);
    this.sellDetailPriceLabel.string = `回收获得: +${item.estimatedPrice.toLocaleString()} 金币`;
  }

  private canExecuteSell(): boolean {
    if (this.state.status === 'submitting') return false;
    const items = this.backpackItemsProvider();
    const item = items.find(it => it.id === this.selectedSellItemId);
    return !!(item && !item.accountBound && !item.equipped);
  }

  private async executeSell(): Promise<void> {
    const items = this.backpackItemsProvider();
    const item = items.find(it => it.id === this.selectedSellItemId);
    if (!item) return;

    this.localError = '';
    this.localNotice = '';
    try {
      const target = item.kind === 'equipment'
        ? { kind: 'equipment' as const, itemId: item.id }
        : { kind: 'stack' as const, stackId: item.id };
      await this.coordinator.sell(target, item.quantity, this.quoteRef);
      if (this.coordinator.state.status === 'ready') {
        this.localNotice = `出售成功：回收获得 +${item.estimatedPrice} 金币`;
        this.selectedSellItemId = null;
        this.updateSellRows();
        this.options.onSuccess?.('sell', this.localNotice);
      }
      this.syncFromCoordinator();
    } catch (err: unknown) {
      this.localError = (err as Error).message || '出售失败';
      this.syncFromCoordinator();
    }
  }

  // --- Exchange Mode Logic ---
  private toggleExchangeDirection(): void {
    this.exchangeDirection = this.exchangeDirection === 'goldToPoints' ? 'pointsToGold' : 'goldToPoints';
    this.updateExchangeDetails();
  }

  private stepExchangeUnits(delta: number): void {
    this.exchangeUnits = Math.max(1, this.exchangeUnits + delta);
    this.updateExchangeDetails();
  }

  private updateExchangeDetails(): void {
    const label = this.exchangeDirBtnNode.getComponentInChildren(Label);
    if (label) {
      label.string = this.exchangeDirection === 'goldToPoints'
        ? '⇄ 切换方向: [金币 ➔ 点券]'
        : '⇄ 切换方向: [点券 ➔ 金币]';
    }

    this.exchangeUnitsLabel.string = `兑换单位: ${this.exchangeUnits} 份`;

    if (this.exchangeDirection === 'goldToPoints') {
      const goldCost = this.exchangeUnits * 10000;
      this.exchangeCostLabel.string = `支付: ${goldCost.toLocaleString()} 金币`;
      this.exchangeCostLabel.color = new Color(255, 140, 100);
      this.exchangeGainLabel.string = `获得: ${this.exchangeUnits} 点券`;
      this.exchangeGainLabel.color = new Color(100, 230, 255);
    } else {
      const goldGain = this.exchangeUnits * 10000;
      this.exchangeCostLabel.string = `支付: ${this.exchangeUnits} 点券`;
      this.exchangeCostLabel.color = new Color(255, 140, 100);
      this.exchangeGainLabel.string = `获得: ${goldGain.toLocaleString()} 金币`;
      this.exchangeGainLabel.color = new Color(255, 215, 60);
    }
  }

  private canExecuteExchange(): boolean {
    if (this.state.status === 'submitting') return false;
    if (this.exchangeDirection === 'goldToPoints') {
      const needGold = BigInt(this.exchangeUnits * 10000);
      return BigInt(this.state.wallet.gold) >= needGold;
    } else {
      const needPoints = BigInt(this.exchangeUnits);
      return BigInt(this.state.wallet.points) >= needPoints;
    }
  }

  private async executeExchange(): Promise<void> {
    this.localError = '';
    this.localNotice = '';
    try {
      const fromCurrency = this.exchangeDirection === 'goldToPoints' ? 'gold' : 'points';
      await this.coordinator.exchange(fromCurrency, this.exchangeUnits, this.quoteRef);
      if (this.coordinator.state.status === 'ready') {
        const gain = this.exchangeDirection === 'goldToPoints'
          ? `${this.exchangeUnits} 点券`
          : `${(this.exchangeUnits * 10000).toLocaleString()} 金币`;
        this.localNotice = `兑换成功：获得 ${gain}`;
        this.options.onSuccess?.('exchange', this.localNotice);
      }
      this.syncFromCoordinator();
    } catch (err: unknown) {
      this.localError = (err as Error).message || '兑换失败';
      this.syncFromCoordinator();
    }
  }

  // --- Recovery Logic ---
  private async executeRecover(): Promise<void> {
    try {
      await this.coordinator.recover();
      this.syncFromCoordinator();
      if (this.state.status === 'ready') {
        this.localNotice = '已恢复并同步原操作结果';
      }
    } catch (err: unknown) {
      this.syncFromCoordinator();
      this.localError = (err as Error).message || '恢复失败';
    }
  }

  public update(): void {
    if (!this.visible) return;
    this.syncFromCoordinator();
  }

  private syncFromCoordinator(): void {
    this.state = this.coordinator.state;
    this.goldLabel.string = `金币: ${Number(this.state.wallet.gold).toLocaleString()}`;
    this.pointsLabel.string = `点券: ${Number(this.state.wallet.points).toLocaleString()}`;

    this.recoverButtonNode.active = this.state.status === 'unknown';

    if (this.state.status === 'submitting') {
      this.statusLabel.string = '正在提交请求到服务端…';
      this.statusLabel.color = new Color(255, 215, 60);
    } else if (this.state.status === 'unknown') {
      this.statusLabel.string = '交易状态未决，请点击右侧确认结果恢复';
      this.statusLabel.color = new Color(255, 120, 120);
    } else if (this.state.code || this.localError) {
      this.statusLabel.string = errorLabel(this.state.code || this.localError);
      this.statusLabel.color = new Color(255, 120, 120);
    } else {
      this.statusLabel.string = '';
    }

    this.resultBannerLabel.string = this.localNotice;

    // Refresh control buttons enabling state
    for (const ctrl of this.controls) {
      const enabled = ctrl.canEnable();
      skinSprite(ctrl.node, enabled ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
    }
  }

  private defaultSandboxBackpack(): ShopSellableItem[] {
    return [
      {
        id: 'item-drop-sword-1',
        name: '破旧的生铁太刀',
        kind: 'equipment',
        quality: 'white',
        quantity: 1,
        itemLevel: 5,
        accountBound: false,
        equipped: false,
        iconPath: 'icons/weapon_dual_blades_48',
        estimatedPrice: 50,
      },
      {
        id: 'item-drop-chest-1',
        name: '精制锁子甲',
        kind: 'equipment',
        quality: 'green',
        quantity: 1,
        itemLevel: 10,
        accountBound: false,
        equipped: false,
        iconPath: 'icons/armor_chest_48',
        estimatedPrice: 150,
      },
      {
        id: 'item-potion-excess',
        name: '初级生命药剂',
        kind: 'stack',
        quality: 'white',
        quantity: 10,
        itemLevel: 1,
        accountBound: false,
        equipped: false,
        iconPath: 'icons/consumable_hp_potion_48',
        estimatedPrice: 100,
      },
      {
        id: 'item-bound-scroll',
        name: '经验祝福卷轴 (商城)',
        kind: 'stack',
        quality: 'purple',
        quantity: 1,
        itemLevel: 1,
        accountBound: true,
        equipped: false,
        iconPath: 'icons/special_book_48',
        estimatedPrice: 0,
      },
      {
        id: 'item-equipped-weapon',
        name: '无影剑-艾雷诺 (穿戴中)',
        kind: 'equipment',
        quality: 'purple',
        quantity: 1,
        itemLevel: 30,
        accountBound: false,
        equipped: true,
        iconPath: 'icons/weapon_dual_blades_48',
        estimatedPrice: 900,
      },
    ];
  }

  // --- Helper Node Creators ---
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
    lbl.color = new Color(230, 235, 240);
    parent.addChild(n);
    return lbl;
  }

  private button(
    text: string,
    x: number,
    y: number,
    action: () => void,
    canEnable: () => boolean,
    width = 120,
    height = 36
  ): Node {
    const btn = this.node(this.root, `Btn_${text.slice(0, 8)}`, x, y, width, height);
    skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
    this.label(btn, text, 0, 0, 14, width);

    this.interactiveButton(btn, width, height, action, canEnable);
    this.controls.push({ name: text, node: btn, width, canEnable, action });
    return btn;
  }

  private interactiveButton(
    btn: Node,
    _width: number,
    _height: number,
    action: () => void,
    canEnable: () => boolean
  ): void {
    let pressed = false;
    const reset = () => {
      if (pressed) {
        pressed = false;
        skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      }
    };
    this.buttonResets.push(reset);

    const onDown = () => {
      if (Date.now() < this.suppressMouseUntil) return;
      if (!canEnable()) return;
      pressed = true;
      skinSprite(btn, 'ui/slices/button_pressed', true);
    };

    const onUp = () => {
      if (Date.now() < this.suppressMouseUntil) return;
      if (!pressed) return;
      pressed = false;
      skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      action();
    };

    btn.on(Node.EventType.TOUCH_START, onDown);
    btn.on(Node.EventType.TOUCH_END, onUp);
    btn.on(Node.EventType.TOUCH_CANCEL, reset);
    btn.on(Node.EventType.MOUSE_DOWN, onDown);
    btn.on(Node.EventType.MOUSE_UP, onUp);
  }

  public hitTest(x: number, y: number): 'close' | 'buyTab' | 'sellTab' | 'exchangeTab' | 'buyAction' | 'sellAction' | 'exchangeAction' | 'recover' | null {
    if (!this.visible) return null;
    if (Math.abs(x - 400) <= 40 && Math.abs(y - 226) <= 20) return 'close';
    if (Math.abs(x - (-400)) <= 40 && Math.abs(y - 226) <= 20) return 'close';

    if (Math.abs(y - 185) <= 20) {
      if (Math.abs(x - (-260)) <= 80) return 'buyTab';
      if (Math.abs(x - (-80)) <= 80) return 'sellTab';
      if (Math.abs(x - 100) <= 80) return 'exchangeTab';
    }

    if (this.currentMode === 'buy' && Math.abs(x - 240) <= 100 && Math.abs(y - (-110)) <= 22) return 'buyAction';
    if (this.currentMode === 'sell' && Math.abs(x - 240) <= 100 && Math.abs(y - (-110)) <= 22) return 'sellAction';
    if (this.currentMode === 'exchange' && Math.abs(x) <= 110 && Math.abs(y - (-135)) <= 22) return 'exchangeAction';
    if (this.state.status === 'unknown' && Math.abs(x - 260) <= 85 && Math.abs(y - (-228)) <= 18) return 'recover';

    return null;
  }
}
