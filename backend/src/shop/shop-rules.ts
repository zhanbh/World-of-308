import type { EquipmentEntity, ContainerSlotStack } from '../character/character-model.ts';
import type { WalletEntity, ShopOffer } from './shop-model.ts';

export class ShopRefusal extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'ShopRefusal';
  }
}

export const QUALITY_SELL_MULTIPLIERS: Record<EquipmentEntity['quality'], number> = {
  white: 1.0,
  green: 1.5,
  blue: 2.0,
  purple: 3.0,
  orange: 5.0,
};

export const GOLD_PER_POINT = 10000n;

/**
 * 校验商店购买意图与货币是否充足
 */
export function validateBuyEligibility(
  offer: ShopOffer,
  quantity: number,
  quoteRef: string,
  wallet: WalletEntity,
  catalogQuoteRef: string,
): { cost: bigint; priceCurrency: 'gold' | 'points' } {
  if (quoteRef !== offer.quoteRef || quoteRef !== catalogQuoteRef) {
    throw new ShopRefusal('QUOTE_CHANGED');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > offer.maxQuantity) {
    throw new ShopRefusal('INVALID_ARGUMENT');
  }

  const cost = BigInt(offer.unitPrice) * BigInt(quantity);
  const currentBalance = BigInt(offer.priceCurrency === 'gold' ? wallet.gold : wallet.points);

  if (currentBalance < cost) {
    throw new ShopRefusal('CURRENCY_NOT_ENOUGH');
  }

  return { cost, priceCurrency: offer.priceCurrency };
}

/**
 * 校验物品出售资格（禁止穿戴中装备直接出售、禁止商城绑定商品出售）
 */
export function validateSellEligibility(
  item: EquipmentEntity | ContainerSlotStack,
  isEquipped: boolean,
  containerKind?: string,
): void {
  if (isEquipped || containerKind !== 'backpack') {
    throw new ShopRefusal('LOCATION_NOT_ALLOWED');
  }
  if (item.binding.kind === 'account') {
    throw new ShopRefusal('BINDING_RESTRICTED');
  }
  if ('lifecycle' in item && item.lifecycle !== 'active') {
    throw new ShopRefusal('ITEM_NOT_ELIGIBLE');
  }
}

/**
 * 计算装备或道具的固定回收金币
 * 严格遵循规则：强化等级与随机词条不增加收购价
 */
export function calculateSellPrice(item: EquipmentEntity | ContainerSlotStack, quantity: number = 1): bigint {
  if ('templateRef' in item && 'slotKind' in item) {
    // Equipment
    const eq = item as EquipmentEntity;
    const mult = QUALITY_SELL_MULTIPLIERS[eq.quality] ?? 1.0;
    const basePrice = 10;
    const unitPrice = Math.max(1, Math.floor(basePrice * Math.max(1, eq.itemLevel) * mult));
    return BigInt(unitPrice);
  } else {
    // Stackable item (e.g., potion)
    const unitPrice = 10;
    return BigInt(unitPrice) * BigInt(Math.max(1, quantity));
  }
}

/**
 * 货币法定双向整数兑换计算 (10000 gold = 1 point)
 * 净资产严格守恒
 */
export function calculateExchange(
  fromCurrency: 'gold' | 'points',
  exchangeUnits: number,
  wallet: WalletEntity,
): { nextGold: string; nextPoints: string } {
  if (!Number.isInteger(exchangeUnits) || exchangeUnits < 1) {
    throw new ShopRefusal('INVALID_ARGUMENT');
  }

  const currentGold = BigInt(wallet.gold);
  const currentPoints = BigInt(wallet.points);
  const units = BigInt(exchangeUnits);

  let nextGold: bigint;
  let nextPoints: bigint;

  if (fromCurrency === 'gold') {
    const costGold = units * GOLD_PER_POINT;
    if (currentGold < costGold) {
      throw new ShopRefusal('CURRENCY_NOT_ENOUGH');
    }
    nextGold = currentGold - costGold;
    nextPoints = currentPoints + units;
  } else {
    const costPoints = units;
    if (currentPoints < costPoints) {
      throw new ShopRefusal('CURRENCY_NOT_ENOUGH');
    }
    nextPoints = currentPoints - costPoints;
    nextGold = currentGold + units * GOLD_PER_POINT;
  }

  return {
    nextGold: nextGold.toString(),
    nextPoints: nextPoints.toString(),
  };
}
